import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import {
  createMcpExtension,
  type ExtensionAPI,
  type ExtensionContext,
  getAgentDir,
  hasTrustRequiringProjectResources,
  type LoadedMcpConfig,
  ProjectTrustStore,
} from "@earendil-works/pi-coding-agent";
import { ConfigLoader } from "../../src/config/loader";
import { RepositoryTrust } from "../../src/core/trust";
import { McpNotifications } from "./notifications";

export default async function mcpConfigExtension(
  pi: ExtensionAPI,
): Promise<void> {
  const agentDir = getAgentDir();
  pi.registerFlag("mcp-approve", {
    description: "Allow repository MCP servers for this invocation",
    type: "boolean",
    default: false,
  });
  let loaded: LoadedMcpConfig = { servers: [], errors: [] };
  pi.on("session_start", async (_event, ctx) => {
    loaded = { servers: [], errors: [] };
    let step = "Git worktree lookup";
    try {
      const git = await pi.exec(
        "git",
        ["-C", ctx.cwd, "rev-parse", "--show-toplevel"],
        {
          timeout: 5000,
          signal: ctx.signal,
        },
      );
      if (git.killed) {
        throw Object.assign(new Error(), { code: "ETIMEDOUT" });
      }
      if (git.code !== 0 && !git.stderr.includes("not a git repository")) {
        throw Object.assign(new Error(), { code: `EXIT_${git.code}` });
      }
      const repositoryRoot =
        git.code === 0 && isAbsolute(git.stdout.trim())
          ? git.stdout.trim()
          : undefined;
      const hasProjectConfig =
        repositoryRoot !== undefined &&
        existsSync(join(repositoryRoot, ".mcp.json"));
      step = "Repository MCP approval";
      const projectTrusted =
        hasProjectConfig && repositoryRoot !== undefined
          ? await approveRepository(
              ctx,
              repositoryRoot,
              agentDir,
              pi.getSettings().defaultProjectTrust ?? "ask",
              pi.getFlag("mcp-approve") === true,
            )
          : false;
      step = "MCP configuration loading";
      loaded = nativeConfig(
        ConfigLoader.load({ agentDir, repositoryRoot, projectTrusted }),
      );
    } catch (error) {
      loaded = nativeConfig(
        ConfigLoader.load({ agentDir, projectTrusted: false }),
      );
      loaded.errors.push(
        `${step} failed${safeErrorCause(error)}. Only global servers are available.`,
      );
    }
  });
  await createMcpExtension({
    loadConfig: () => loaded,
    updateConfig: (entry, patch) => {
      ConfigLoader.savePolicy(agentDir, entry.name, patch);
    },
  })(McpNotifications.wrap(pi));
}

function nativeConfig(config: LoadedMcpConfig): LoadedMcpConfig {
  return {
    ...config,
    servers: config.servers.map(({ name, config, source }) => ({
      name,
      config,
      source,
    })),
  };
}

async function approveRepository(
  ctx: ExtensionContext,
  repositoryRoot: string,
  agentDir: string,
  defaultTrust: "ask" | "always" | "never",
  explicitApproval: boolean,
): Promise<boolean> {
  const trustStore = new ProjectTrustStore(agentDir);
  const decision = RepositoryTrust.decide({
    nativeTrusted: ctx.isProjectTrusted(),
    explicitApproval,
    savedDecision: trustStore.get(repositoryRoot),
    nativeTrustCoversRepository:
      realpathSync(ctx.cwd) === realpathSync(repositoryRoot) &&
      hasTrustRequiringProjectResources(ctx.cwd),
    defaultTrust,
    hasUI: ctx.hasUI && ctx.mode === "tui",
  });
  if (decision === "allow") {
    return true;
  }
  if (decision === "deny") {
    ctx.ui.notify(
      "Repository MCP servers are disabled because the repository has no MCP approval. Use --mcp-approve or save approval in interactive mode.",
      "warning",
    );
    return false;
  }
  const choice = await ctx.ui.select(
    `Allow MCP servers from ${join(repositoryRoot, ".mcp.json")}? This can run repository commands.`,
    ["Allow once", "Always allow this repository", "Do not allow"],
  );
  if (choice === "Always allow this repository") {
    trustStore.set(repositoryRoot, true);
    return true;
  }
  return choice === "Allow once";
}

function safeErrorCause(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = error.code;
    if (typeof code === "string" && /^[A-Z][A-Z0-9_]{0,31}$/.test(code)) {
      return ` (${code})`;
    }
  }
  if (
    error instanceof Error &&
    (error.message.startsWith("Failed to read trust store ") ||
      error.message.startsWith("Invalid trust store "))
  ) {
    return " (invalid or unreadable trust.json)";
  }
  return "";
}
