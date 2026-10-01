import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  createMcpExtension,
  DefaultResourceLoader,
  ProjectTrustStore,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mcpConfigExtension from "./index";

describe("MCP extension", () => {
  let root: string;
  let agentDir: string;
  let repositoryRoot: string;
  let cwd: string;
  let shutdown: Array<(event: never, ctx: ExtensionContext) => unknown>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "pi-mcp-extension-"));
    agentDir = join(root, "agent");
    repositoryRoot = join(root, "repository");
    cwd = join(repositoryRoot, "subdirectory");
    mkdirSync(agentDir);
    mkdirSync(cwd, { recursive: true });
    vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
    shutdown = [];
  });

  afterEach(async () => {
    for (const handler of shutdown) {
      await handler(
        { type: "session_shutdown" } as never,
        {} as ExtensionContext,
      );
    }
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  async function start(
    options: {
      savedTrust?: boolean;
      nativeTrust?: boolean;
      defaultTrust?: "ask" | "always" | "never";
      mode?: ExtensionContext["mode"];
      explicitApproval?: boolean;
      choice?: string;
      gitResult?: {
        code: number;
        stdout: string;
        stderr: string;
        killed: boolean;
      };
      gitError?: Error;
    } = {},
  ) {
    const handlers: Array<(event: never, ctx: ExtensionContext) => unknown> =
      [];
    const commands = new Map<
      string,
      Parameters<ExtensionAPI["registerCommand"]>[1]
    >();
    const notify = vi.fn();
    const select = vi.fn().mockResolvedValue(options.choice);
    const registerFlag = vi.fn();
    const git = vi.fn().mockResolvedValue(
      options.gitResult ?? {
        code: 0,
        stdout: `${repositoryRoot}\n`,
        stderr: "",
        killed: false,
      },
    );
    if (options.gitError) {
      git.mockRejectedValue(options.gitError);
    }
    const pi = {
      on: (
        name: string,
        handler: (event: never, ctx: ExtensionContext) => unknown,
      ) => {
        if (name === "session_start") {
          handlers.push(handler);
        }
        if (name === "session_shutdown") {
          shutdown.push(handler);
        }
        return () => {};
      },
      registerCommand: (
        name: string,
        command: Parameters<ExtensionAPI["registerCommand"]>[1],
      ) => {
        expect(commands.has(name)).toBe(false);
        commands.set(name, command);
      },
      exec: git,
      registerFlag,
      getFlag: (name: string) => {
        expect(name).toBe("mcp-approve");
        return options.explicitApproval ?? false;
      },
      getSettings: () => ({
        defaultProjectTrust: options.defaultTrust ?? "ask",
      }),
      getMcpServers: () => [],
      getAllTools: () => [],
      getActiveTools: () => [],
      setActiveTools: vi.fn(),
    } as unknown as ExtensionAPI;
    const ctx = {
      cwd,
      mode: options.mode ?? "print",
      hasUI: options.mode === "tui" || options.mode === "rpc",
      signal: undefined,
      isProjectTrusted: () => options.nativeTrust ?? true,
      ui: { notify, select },
      modelRegistry: {},
    } as unknown as ExtensionContext;
    if (options.savedTrust !== undefined) {
      new ProjectTrustStore(agentDir).set(repositoryRoot, options.savedTrust);
    }
    await mcpConfigExtension(pi);
    for (const handler of handlers) {
      await handler({ type: "session_start" } as never, ctx);
    }
    const command = commands.get("mcp");
    expect(command).toBeDefined();
    await command?.handler("", {
      ...ctx,
      mode: "print",
      hasUI: false,
    } as ExtensionCommandContext);
    return {
      git,
      notify,
      select,
      registerFlag,
      status: notify.mock.calls.map(([message]) => message).join("\n"),
    };
  }

  it("replaces the built-in MCP extension without a command conflict", async () => {
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      additionalExtensionPaths: [
        fileURLToPath(new URL("./index.ts", import.meta.url)),
      ],
      extensionFactories: [
        {
          factory: createMcpExtension(),
          name: "mcp",
          builtin: true,
          replaceable: true,
        },
      ],
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await loader.reload();
    const extensions = loader.getExtensions();
    expect(extensions.errors).toEqual([]);
    expect(
      extensions.extensions.filter((extension) =>
        extension.commands.has("mcp"),
      ),
    ).toHaveLength(1);
  });

  it("loads global and root repository definitions from a subdirectory with the real MCP manager", async () => {
    writeFileSync(
      join(agentDir, "mcp.json"),
      JSON.stringify({ mcpServers: { personal: { command: "global" } } }),
    );
    writeFileSync(
      join(repositoryRoot, ".mcp.json"),
      JSON.stringify({ mcpServers: { repository: { command: "repository" } } }),
    );
    writeFileSync(
      join(agentDir, "mcp-overrides.json"),
      JSON.stringify({ defaults: { enabled: false } }),
    );
    const { git, status } = await start({ savedTrust: true });
    expect(git).toHaveBeenCalledWith(
      "git",
      ["-C", cwd, "rev-parse", "--show-toplevel"],
      { timeout: 5000, signal: undefined },
    );
    expect(status).toContain("personal");
    expect(status).toContain("repository");
    expect(status).toContain("disabled");
    expect(status).not.toContain("MCP configuration:");
  });

  it("does not load project definitions without explicit trust in print mode", async () => {
    writeFileSync(
      join(repositoryRoot, ".mcp.json"),
      JSON.stringify({ mcpServers: { unapproved: { command: "unapproved" } } }),
    );
    const { status } = await start();
    expect(status).toContain("no MCP approval");
    expect(status).not.toContain("unapproved");
  });

  it("honors global defaultProjectTrust and native denial", async () => {
    writeFileSync(
      join(repositoryRoot, ".mcp.json"),
      JSON.stringify({
        mcpServers: { approved: { command: "approved", enabled: false } },
      }),
    );
    expect((await start({ defaultTrust: "always" })).status).toContain(
      "approved",
    );
    expect(
      (await start({ defaultTrust: "always", nativeTrust: false })).status,
    ).not.toContain("approved");
  });

  it("does not ask for startup approval in RPC mode", async () => {
    writeFileSync(
      join(repositoryRoot, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          blocked_server: { command: "never-run", enabled: false },
        },
      }),
    );
    const { select, status } = await start({ mode: "rpc" });
    expect(select).not.toHaveBeenCalled();
    expect(status).toContain("--mcp-approve");
    expect(status).not.toContain("blocked_server");
  });

  it.each([
    "print",
    "rpc",
  ] as const)("loads explicitly approved servers in %s mode", async (mode) => {
    writeFileSync(
      join(repositoryRoot, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          approved_server: { command: "never-run", enabled: false },
        },
      }),
    );
    const { registerFlag, select, status } = await start({
      mode,
      explicitApproval: true,
    });
    expect(registerFlag).toHaveBeenCalledWith("mcp-approve", {
      description: "Allow repository MCP servers for this invocation",
      type: "boolean",
      default: false,
    });
    expect(select).not.toHaveBeenCalled();
    expect(status).toContain("approved_server");
  });

  it("does not load a parent configuration through saved subdirectory trust", async () => {
    mkdirSync(join(cwd, ".pi"));
    writeFileSync(join(cwd, ".pi", "settings.json"), "{}");
    new ProjectTrustStore(agentDir).set(cwd, true);
    writeFileSync(
      join(repositoryRoot, ".mcp.json"),
      JSON.stringify({
        mcpServers: { parent_server: { command: "never-run", enabled: false } },
      }),
    );
    const { select, status } = await start({ mode: "tui" });
    expect(select).toHaveBeenCalledOnce();
    expect(status).not.toContain("parent_server");
  });

  it("reuses native approval only when Pi starts at the configuration root", async () => {
    cwd = repositoryRoot;
    mkdirSync(join(cwd, ".pi"));
    writeFileSync(join(cwd, ".pi", "settings.json"), "{}");
    writeFileSync(
      join(repositoryRoot, ".mcp.json"),
      JSON.stringify({
        mcpServers: { root_server: { command: "never-run", enabled: false } },
      }),
    );
    const { select, status } = await start({ mode: "tui" });
    expect(select).not.toHaveBeenCalled();
    expect(status).toContain("root_server");
  });

  it("reuses native root approval through a directory symlink", async () => {
    const alias = join(root, "alias");
    symlinkSync(repositoryRoot, alias);
    cwd = alias;
    mkdirSync(join(repositoryRoot, ".pi"));
    writeFileSync(join(repositoryRoot, ".pi", "settings.json"), "{}");
    writeFileSync(
      join(repositoryRoot, ".mcp.json"),
      JSON.stringify({
        mcpServers: { root_server: { command: "never-run", enabled: false } },
      }),
    );
    const { select, status } = await start();
    expect(select).not.toHaveBeenCalled();
    expect(status).toContain("root_server");
  });

  it.each([
    "Allow once",
    "Always allow this repository",
  ])("honors the interactive choice %s", async (choice) => {
    writeFileSync(
      join(repositoryRoot, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          allowed_server: { command: "never-run", enabled: false },
        },
      }),
    );
    const { select, status } = await start({ mode: "tui", choice });
    expect(select).toHaveBeenCalledOnce();
    expect(status).toContain("allowed_server");
    expect(new ProjectTrustStore(agentDir).get(repositoryRoot)).toBe(
      choice === "Allow once" ? null : true,
    );
  });

  it("reports a failed Git lookup with a safe error code and keeps global servers", async () => {
    writeFileSync(
      join(agentDir, "mcp.json"),
      JSON.stringify({
        mcpServers: { global_server: { command: "never-run", enabled: false } },
      }),
    );
    const { status } = await start({
      gitError: Object.assign(new Error("never-print-this-secret"), {
        code: "ENOENT",
      }),
    });
    expect(status).toContain("Git worktree lookup failed (ENOENT)");
    expect(status).toContain("global_server");
    expect(status).not.toContain("never-print-this-secret");
  });

  it.each([
    {
      code: 128,
      stdout: "",
      stderr: "fatal: not a git repository",
      killed: false,
      cause: undefined,
    },
    {
      code: 1,
      stdout: "",
      stderr: "never-print-this-secret",
      killed: false,
      cause: "EXIT_1",
    },
    {
      code: 0,
      stdout: "",
      stderr: "never-print-this-secret",
      killed: true,
      cause: "ETIMEDOUT",
    },
  ])("handles Git results without exposing stderr: $cause", async ({
    cause,
    ...gitResult
  }) => {
    const { status } = await start({ gitResult });
    if (cause) {
      expect(status).toContain(`Git worktree lookup failed (${cause})`);
    } else {
      expect(status).not.toContain("failed");
    }
    expect(status).not.toContain("never-print-this-secret");
  });

  it("reports a broken trust file without exposing its contents", async () => {
    writeFileSync(join(repositoryRoot, ".mcp.json"), "{}");
    writeFileSync(join(agentDir, "trust.json"), '{"never-print-this-secret":');
    const { status } = await start();
    expect(status).toContain(
      "Repository MCP approval failed (invalid or unreadable trust.json)",
    );
    expect(status).not.toContain("never-print-this-secret");
  });

  it("ignores .pi/mcp.json instead of connecting a second set of definitions", async () => {
    mkdirSync(join(cwd, ".pi"));
    writeFileSync(
      join(cwd, ".pi", "mcp.json"),
      JSON.stringify({
        mcpServers: { ignored: { command: "ignored", enabled: false } },
      }),
    );
    const { status } = await start();
    expect(status).not.toContain("ignored");
  });

  it("leaves repository definitions unchanged during startup", async () => {
    writeFileSync(
      join(repositoryRoot, ".mcp.json"),
      JSON.stringify({
        mcpServers: { tools: { command: "tools", enabled: false } },
      }),
    );
    const before = readFileSync(join(repositoryRoot, ".mcp.json"), "utf8");
    await start({ savedTrust: true });
    expect(readFileSync(join(repositoryRoot, ".mcp.json"), "utf8")).toBe(
      before,
    );
  });
});
