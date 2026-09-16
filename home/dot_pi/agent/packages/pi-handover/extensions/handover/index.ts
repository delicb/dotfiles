import { dirname, join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
  HANDOVER_SUBCOMMANDS,
  handoverUsage,
  parseHandoverCommand,
} from "../../src/core/command";
import { buildCreatePrompt, buildModePrompt } from "../../src/core/prompts";
import {
  formatHandoverList,
  getStorageRoot,
  listHandovers,
  readPlanStatus,
  repositoryId,
  reserveHandoverDirectory,
  resolvePlanReference,
  slugify,
} from "../../src/core/store";

interface GitContext {
  baseCommit: string;
  branch: string;
  dirtyStatus: string;
  origin: string;
  repository: string;
  root: string;
}

const GIT_TIMEOUT_MS = 5_000;
const MAX_STATUS_LENGTH = 4_000;

export default function handoverExtension(pi: ExtensionAPI): void {
  pi.registerCommand("handover", {
    description: "Create, review, start, and finish implementation handovers",
    getArgumentCompletions: (prefix) => {
      const value = prefix.trimStart();
      if (/\s/.test(value)) return null;
      const items = HANDOVER_SUBCOMMANDS.filter((item) =>
        item.startsWith(value),
      ).map((item) => ({ label: item, value: item }));
      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      const parsed = parseHandoverCommand(args);
      if (!parsed.subcommand) {
        show(ctx, handoverUsage(), "error");
        return;
      }

      try {
        switch (parsed.subcommand) {
          case "create":
            await createHandover(pi, ctx, parsed.value);
            return;
          case "list":
            await showHandovers(pi, ctx);
            return;
          case "review":
            await runHandoverMode(pi, ctx, "review", parsed.value, true);
            return;
          case "start":
            await startHandover(pi, ctx, parsed.value);
            return;
          case "finish":
            await runHandoverMode(pi, ctx, "finish", parsed.value, false);
            return;
        }
      } catch (error) {
        show(ctx, errorMessage(error), "error");
      }
    },
  });
}

async function createHandover(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  name: string,
): Promise<void> {
  requireAgentMode(ctx);
  const slug = slugify(name);
  const git = await readGitContext(pi, ctx);
  const storageRoot = getStorageRoot(process.env);
  const reserved = await reserveHandoverDirectory(
    storageRoot,
    git.repository,
    new Date(),
    slug,
  );
  const sourceSession = ctx.sessionManager.getSessionFile() ?? "";

  show(ctx, `Reserved handover ${reserved.id}.`, "info");
  pi.sendUserMessage(
    buildCreatePrompt({
      baseCommit: git.baseCommit,
      branch: git.branch,
      dirtyStatus: git.dirtyStatus,
      origin: git.origin,
      planPath: reserved.planPath,
      repository: git.repository,
      repositoryRoot: git.root,
      sourceSession,
    }),
    { expandPromptTemplates: true },
  );
}

async function showHandovers(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const git = await readGitContext(pi, ctx);
  const records = await listHandovers(
    getStorageRoot(process.env),
    git.repository,
  );
  show(ctx, formatHandoverList(git.repository, records.slice(0, 20)), "info");
}

async function startHandover(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  reference: string,
): Promise<void> {
  requireAgentMode(ctx);
  const planPath = await resolveReference(pi, ctx, reference);
  const planStatus = await readPlanStatus(planPath);
  const reviewStatus = await readOptionalStatus(
    join(dirname(planPath), "review.md"),
  );

  if (planStatus !== "ready" || reviewStatus !== "pass") {
    throw new Error(
      "The handover is not ready. Run /handover review before /handover start.",
    );
  }

  await runInNewSession(ctx, "start", planPath);
}

async function runHandoverMode(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  mode: "finish" | "review",
  reference: string,
  freshSession: boolean,
): Promise<void> {
  requireAgentMode(ctx);
  const planPath = await resolveReference(pi, ctx, reference);
  if (freshSession) {
    if (mode !== "review") {
      throw new Error("Only review mode can start through this path.");
    }
    await runInNewSession(ctx, mode, planPath);
    return;
  }

  pi.sendUserMessage(buildModePrompt(mode, planPath), {
    expandPromptTemplates: true,
  });
}

async function runInNewSession(
  ctx: ExtensionCommandContext,
  mode: "review" | "start",
  planPath: string,
): Promise<void> {
  const parentSession = ctx.sessionManager.getSessionFile();
  const result = await ctx.newSession({
    parentSession,
    withSession: async (replacement) => {
      replacement.ui.notify(
        `${mode === "review" ? "Reviewing" : "Starting"} handover ${planPath}.`,
        "info",
      );
      await replacement.sendUserMessage(buildModePrompt(mode, planPath), {
        expandPromptTemplates: true,
      });
    },
  });

  if (result.cancelled) {
    show(ctx, "The new handover session was cancelled.", "info");
  }
}

async function resolveReference(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  reference: string,
): Promise<string> {
  const git = await readGitContext(pi, ctx);
  return resolvePlanReference(
    reference,
    ctx.cwd,
    getStorageRoot(process.env),
    git.repository,
  );
}

async function readGitContext(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): Promise<GitContext> {
  const root = await runGit(pi, ctx, ["rev-parse", "--show-toplevel"]);
  const baseCommit = await runGit(pi, ctx, ["rev-parse", "HEAD"]);
  const branchResult = await runGitOptional(pi, ctx, [
    "symbolic-ref",
    "--short",
    "-q",
    "HEAD",
  ]);
  const origin = await runGitOptional(pi, ctx, [
    "config",
    "--get",
    "remote.origin.url",
  ]);
  const dirtyStatus = await runGit(pi, ctx, ["status", "--short"]);

  return {
    baseCommit,
    branch: branchResult || "detached HEAD",
    dirtyStatus:
      dirtyStatus.length > MAX_STATUS_LENGTH
        ? `${dirtyStatus.slice(0, MAX_STATUS_LENGTH)}\n[status truncated]`
        : dirtyStatus || "clean",
    origin,
    repository: repositoryId(origin, root),
    root,
  };
}

async function runGit(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  args: string[],
): Promise<string> {
  const result = await pi.exec("git", args, {
    cwd: ctx.cwd,
    signal: ctx.signal,
    timeout: GIT_TIMEOUT_MS,
  });
  if (result.killed || result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(detail || "Run this command inside a Git repository.");
  }
  return result.stdout.trim();
}

async function runGitOptional(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  args: string[],
): Promise<string> {
  const result = await pi.exec("git", args, {
    cwd: ctx.cwd,
    signal: ctx.signal,
    timeout: GIT_TIMEOUT_MS,
  });
  return result.killed || result.code !== 0 ? "" : result.stdout.trim();
}

async function readOptionalStatus(path: string): Promise<string | undefined> {
  try {
    return await readPlanStatus(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function requireAgentMode(ctx: ExtensionCommandContext): void {
  if (!ctx.hasUI) {
    throw new Error(
      "Create, review, start, and finish require interactive or RPC mode.",
    );
  }
}

function show(
  ctx: ExtensionCommandContext,
  message: string,
  level: "error" | "info",
): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, level);
    return;
  }

  const output = level === "error" ? console.error : console.log;
  output(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
