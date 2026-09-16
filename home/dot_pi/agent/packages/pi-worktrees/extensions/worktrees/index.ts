import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import {
  type AgentToolResult,
  CURRENT_SESSION_VERSION,
  defineTool,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadWorktreeConfig } from "../../src/config";
import {
  ActiveWorktreeLeaseError,
  LeaseStore,
  type WorktreeLease,
} from "../../src/core/lease-store";
import {
  decideWorktreePolicy,
  type WorktreePolicyDecision,
} from "../../src/core/protection-policy";
import {
  findWorktree,
  type GitWorktree,
  parseWorktreeList,
  parseWorktrunkSwitchOutput,
  summarizeStatus,
  type WorktrunkSwitchResult,
} from "../../src/core/worktrees";
import {
  buildWorktreeChoicePrompt,
  type PrimaryWriteChoice,
  resolvePrimaryWriteChoice,
} from "../../src/core/write-choice";
import {
  applyPrimaryWriteGuard,
  hasSandboxWriteDenial,
} from "../../src/core/write-guard";

const LEASE_ERROR_MUTATING_TOOLS = new Set([
  "bash",
  "edit",
  "interactive_shell",
  "mcp",
  "mcpScript",
  "multi_tool_use.parallel",
  "parallel",
  "powershell",
  "process",
  "tool_batch",
  "write",
]);
const HEARTBEAT_INTERVAL_MS = 30_000;
const WORKTREE_TOOLS = [
  "worktree_cleanup",
  "worktree_finish",
  "worktree_prepare",
  "worktree_status",
] as const;
const INTERNAL_HANDOFF_COMMAND = "worktree-handoff";
const INTERNAL_CLEANUP_COMMAND = "worktree-cleanup";
const SESSION_POLICY_ENTRY = "pi-worktrees-primary-policy";

interface GitContext {
  branch?: string;
  commonGitDir: string;
  gitDir: string;
  linked: boolean;
  primaryName: string;
  primaryPath: string;
  root: string;
  worktrees: GitWorktree[];
}

interface PendingHandoff {
  branch?: string;
  continueTask: boolean;
  path: string;
  sourceCommonGitDir: string;
}

interface PrepareRequest {
  base?: string;
  branch: string;
  mode: "create" | "join";
}

interface PrepareDetails {
  action: string;
  branch?: string;
  mode: "create" | "join";
  path: string;
}

interface CleanupDetails {
  target: string;
}

interface FinishDetails {
  queued: boolean;
}

interface StatusDetails {
  status: string;
}

interface SessionPolicyState {
  allowPrimary: boolean;
  primaryPath: string;
}

const prepareParameters = Type.Object({
  mode: StringEnum(["create", "join"] as const, {
    description:
      "Create a new branch and worktree, or join an existing worktree",
  }),
  branch: Type.String({
    description: "Branch name or existing worktree path",
    minLength: 1,
  }),
  base: Type.Optional(
    Type.String({
      description:
        "Base branch for create mode. Worktrunk uses the default branch when omitted",
      minLength: 1,
    }),
  ),
});

export default function worktreeExtension(pi: ExtensionAPI): void {
  new PiWorktrees(pi).register();
}

class PiWorktrees {
  private gitContext: GitContext | undefined;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private lease:
    | { path: string; sessionId: string; store: LeaseStore }
    | undefined;
  private readonly pendingHandoffs = new Map<string, PendingHandoff>();
  private primaryWorktreePolicy: WorktreePolicyDecision | undefined;
  private primaryWriteGuardRoot: string | undefined;
  private protectedSession = false;
  private sandboxExecutable: string | undefined;
  private sessionAllowsPrimary = false;
  private suspendedMutatingTools: string[] = [];

  public constructor(private readonly pi: ExtensionAPI) {}

  public register(): void {
    this.registerTools();
    this.registerCommands();

    this.pi.on("session_start", async (_event, ctx) => {
      await this.startSession(ctx);
    });

    this.pi.on("session_shutdown", async (_event, ctx) => {
      ctx.ui.setStatus("worktrees", undefined);
      await this.stopLease();
    });

    this.pi.on("agent_start", async () => {
      await this.heartbeat();
    });

    this.pi.on("agent_settled", async () => {
      await this.heartbeat();
    });

    this.pi.on("before_agent_start", async (event) => {
      if (!this.protectedSession) return;
      if (this.primaryWriteGuardRoot) {
        const shellPolicy = this.sandboxExecutable
          ? " Shell commands can read the repository, but macOS denies their writes inside it."
          : " Shell commands are unrestricted because the macOS sandbox is unavailable.";
        const targetPolicy =
          this.primaryWorktreePolicy?.policy === "always"
            ? "It uses the requested linked worktree without asking the user."
            : "It asks the user whether to use a linked worktree or allow primary worktree changes for this session.";
        return {
          systemPrompt: `${event.systemPrompt}\n\n## Worktree requirement\nThis session is in the protected primary Git worktree. Use all tools normally for investigation. Call worktree_prepare before you intend to change repository files. ${targetPolicy} Direct edit and write calls into the repository are blocked.${shellPolicy}`,
        };
      }
      return {
        systemPrompt: `${event.systemPrompt}\n\n## Worktree requirement\nPi could not acquire the current linked worktree lease. Do not modify files until the lease error is resolved.`,
      };
    });

    this.pi.on("tool_call", async (event, ctx) => {
      if (!this.protectedSession) return;

      if (this.primaryWriteGuardRoot) {
        const result = applyPrimaryWriteGuard(event.toolName, event.input, {
          cwd: ctx.cwd,
          primaryRoot: this.primaryWriteGuardRoot,
          sandboxExecutable: this.sandboxExecutable,
        });
        if (!result.blockReason) return;
        return { block: true, reason: result.blockReason };
      }

      if (!LEASE_ERROR_MUTATING_TOOLS.has(event.toolName)) return;
      return {
        block: true,
        reason:
          "Pi could not acquire the current linked worktree lease. Write tools remain disabled.",
        terminate: true,
      };
    });

    this.pi.on("tool_result", async (event) => {
      if (!this.primaryWriteGuardRoot) return;
      const output = event.content
        .filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("\n");
      if (!hasSandboxWriteDenial(event.toolName, event.input, output)) return;
      const nextStep =
        this.primaryWorktreePolicy?.policy === "always"
          ? "Call worktree_prepare to use the requested linked worktree, then retry."
          : "Call worktree_prepare to ask the user where to continue, then retry.";
      return {
        content: [
          ...event.content,
          {
            type: "text",
            text: `The command could not write inside the primary worktree. ${nextStep}`,
          },
        ],
      };
    });
  }

  private registerTools(): void {
    const tool = defineTool({
      name: "worktree_prepare",
      label: "Prepare Worktree",
      description:
        "Apply the repository worktree policy before changes. Create or join a Worktrunk worktree, or allow primary worktree changes for this session.",
      promptSnippet:
        "Apply repository worktree policy before modifying a protected primary worktree",
      promptGuidelines: [
        "Use worktree_prepare before modifying code in a protected primary worktree.",
        "After worktree_prepare allows the primary worktree, retry the requested change there.",
        "Use worktree_prepare with mode create by default. Use mode join only when the user wants agents to share a worktree.",
      ],
      executionMode: "sequential",
      parameters: prepareParameters,
      execute: async (
        _toolCallId,
        params,
        signal,
        onUpdate,
        ctx,
      ): Promise<AgentToolResult<PrepareDetails>> => {
        const source = await this.requireGitContext(ctx.cwd, signal);
        if (
          !source.linked &&
          this.primaryWriteGuardRoot &&
          this.primaryWorktreePolicy?.policy === "ask"
        ) {
          const choice = await this.choosePrimaryWriteTarget(params, ctx);
          if (choice === "primary") {
            this.allowPrimaryForSession(ctx, source);
            return {
              content: [
                {
                  type: "text",
                  text: `The user allowed primary worktree changes for this Pi session. No worktree was created. Retry the requested change in ${source.root}.`,
                },
              ],
              details: {
                action: "primary-allowed",
                branch: params.branch,
                mode: params.mode,
                path: source.root,
              },
            };
          }
          if (choice !== "worktree") {
            const text =
              choice === "unavailable"
                ? "Pi cannot ask where to make changes in this mode. No worktree was created."
                : "The user cancelled the worktree choice. No worktree was created.";
            return {
              content: [{ type: "text", text }],
              details: {
                action: "cancelled",
                branch: params.branch,
                mode: params.mode,
                path: source.root,
              },
              terminate: true,
            };
          }
        }

        onUpdate?.({
          content: [{ type: "text", text: "Preparing the worktree..." }],
          details: {
            action: "preparing",
            mode: params.mode,
            path: "",
          },
        });

        const prepared = await this.prepareWorktree(params, ctx.cwd, signal);
        if (prepared.path === source.root && source.linked) {
          return {
            content: [
              {
                type: "text",
                text: `This session already uses the linked worktree at ${prepared.path}.`,
              },
            ],
            details: {
              action: prepared.action,
              branch: prepared.branch,
              mode: params.mode,
              path: prepared.path,
            },
          };
        }

        const token = randomUUID();
        this.pendingHandoffs.set(token, {
          branch: prepared.branch,
          continueTask: true,
          path: prepared.path,
          sourceCommonGitDir: source.commonGitDir,
        });
        this.pi.sendUserMessage(`/${INTERNAL_HANDOFF_COMMAND} ${token}`, {
          deliverAs: "followUp",
          expandPromptTemplates: true,
        });

        return {
          content: [
            {
              type: "text",
              text: `${prepared.action === "created" ? "Created" : "Selected"} ${prepared.path}. The Pi session handoff is queued.`,
            },
          ],
          details: {
            action: prepared.action,
            branch: prepared.branch,
            mode: params.mode,
            path: prepared.path,
          },
          terminate: true,
        };
      },
    });

    this.pi.registerTool(tool);

    this.pi.registerTool(
      defineTool({
        name: "worktree_status",
        label: "Worktree Status",
        description: "List repository worktrees and active Pi leases.",
        promptSnippet: "List worktrees and active Pi leases",
        promptGuidelines: [
          "Use worktree_status when the user asks about available worktrees or active Pi sessions.",
        ],
        parameters: Type.Object({}),
        execute: async (
          _toolCallId,
          _params,
          signal,
          _onUpdate,
          ctx,
        ): Promise<AgentToolResult<StatusDetails>> => {
          const status = await this.buildStatus(ctx.cwd, signal);
          return {
            content: [{ type: "text", text: status }],
            details: { status },
          };
        },
      }),
    );

    this.pi.registerTool(
      defineTool({
        name: "worktree_finish",
        label: "Finish Worktree",
        description:
          "Move the Pi session to the primary worktree and request safe cleanup of the current linked worktree.",
        promptSnippet: "Finish and clean the current linked worktree",
        promptGuidelines: [
          "Use worktree_finish only when the user asks to finish or clean the current worktree.",
        ],
        parameters: Type.Object({}),
        execute: async (): Promise<AgentToolResult<FinishDetails>> => {
          this.pi.sendUserMessage("/worktree finish", {
            deliverAs: "followUp",
            expandPromptTemplates: true,
          });
          return {
            content: [
              {
                type: "text",
                text: "Queued the worktree finish command.",
              },
            ],
            details: { queued: true },
            terminate: true,
          };
        },
      }),
    );

    this.pi.registerTool(
      defineTool({
        name: "worktree_cleanup",
        label: "Clean Worktree",
        description:
          "Remove an inactive linked worktree when it has no tracked or untracked changes.",
        promptSnippet: "Safely remove an inactive linked worktree",
        promptGuidelines: [
          "Use worktree_cleanup only when the user asks to remove an inactive worktree.",
          "Use worktree_finish instead of worktree_cleanup for the current worktree.",
        ],
        parameters: Type.Object({
          target: Type.String({
            description: "Branch name or worktree path to remove",
            minLength: 1,
          }),
        }),
        execute: async (
          _toolCallId,
          params,
          signal,
          _onUpdate,
          ctx,
        ): Promise<AgentToolResult<CleanupDetails>> => {
          const result = await this.cleanup(ctx.cwd, params.target, signal);
          return {
            content: [{ type: "text", text: result }],
            details: { target: params.target },
          };
        },
      }),
    );
  }

  private registerCommands(): void {
    const subcommands = [
      "allow-primary",
      "cleanup",
      "finish",
      "join",
      "start",
      "status",
    ] as const;

    this.pi.registerCommand("worktree", {
      description:
        "Create, join, inspect, finish, or clean Worktrunk worktrees",
      getArgumentCompletions: (prefix) => {
        const items = subcommands
          .filter((command) => command.startsWith(prefix))
          .map((command) => ({ label: command, value: command }));
        return items.length > 0 ? items : null;
      },
      handler: async (args, ctx) => {
        try {
          const [subcommand = "status", ...rest] = args
            .trim()
            .split(/\s+/)
            .filter(Boolean);
          switch (subcommand) {
            case "allow-primary":
              await this.allowPrimary(rest, ctx);
              return;
            case "status":
              await this.showStatus(ctx);
              return;
            case "start":
              await this.startFromCommand(rest, ctx);
              return;
            case "join":
              await this.joinFromCommand(rest, ctx);
              return;
            case "finish":
              await this.finish(ctx);
              return;
            case "cleanup":
              await this.cleanupFromCommand(rest, ctx);
              return;
            default:
              this.report(
                ctx,
                "Use /worktree status, allow-primary, start <branch> [base], join <branch-or-path>, finish, or cleanup <branch-or-path>.",
                "error",
              );
          }
        } catch (error) {
          this.report(ctx, errorMessage(error), "error");
        }
      },
    });

    this.pi.registerCommand(INTERNAL_HANDOFF_COMMAND, {
      description: "Complete a queued worktree session handoff",
      handler: async (token, ctx) => {
        const pending = this.pendingHandoffs.get(token.trim());
        if (!pending) {
          this.report(
            ctx,
            "The queued worktree handoff is no longer available.",
            "error",
          );
          return;
        }
        this.pendingHandoffs.delete(token.trim());

        try {
          await ctx.waitForIdle();
          await this.handoff(ctx, pending);
        } catch (error) {
          this.report(ctx, errorMessage(error), "error");
        }
      },
    });

    this.pi.registerCommand(INTERNAL_CLEANUP_COMMAND, {
      description: "Complete cleanup after leaving a worktree",
      handler: async (encodedPath, ctx) => {
        try {
          const path = Buffer.from(encodedPath.trim(), "base64url").toString(
            "utf8",
          );
          if (path.length === 0)
            throw new Error("The cleanup path is missing.");
          const result = await this.cleanup(ctx.cwd, path, ctx.signal);
          this.report(ctx, result, "info");
        } catch (error) {
          this.report(ctx, errorMessage(error), "error");
        }
      },
    });
  }

  private async startSession(ctx: ExtensionContext): Promise<void> {
    await this.stopLease();
    this.gitContext = await this.getGitContext(ctx.cwd, ctx.signal);
    this.primaryWorktreePolicy = undefined;
    this.primaryWriteGuardRoot = undefined;
    this.protectedSession = false;
    this.sandboxExecutable = undefined;
    this.sessionAllowsPrimary = false;
    this.suspendedMutatingTools = [];

    if (!this.gitContext) {
      ctx.ui.setStatus("worktrees", undefined);
      return;
    }

    if (!this.gitContext.linked) {
      const loaded = await loadWorktreeConfig(
        join(getAgentDir(), "settings.json"),
      );
      if (loaded.warnings.length > 0) {
        this.report(
          ctx,
          [
            "Pi Worktrees config warnings:",
            ...loaded.warnings.map((warning) => `- ${warning}`),
          ].join("\n"),
          "warning",
        );
      }

      this.primaryWorktreePolicy = decideWorktreePolicy(
        loaded.config,
        this.gitContext.primaryPath,
        { repositoryName: this.gitContext.primaryName },
      );
      this.sessionAllowsPrimary = this.sessionPolicyAllowsPrimary(
        ctx,
        this.gitContext.primaryPath,
      );
      if (
        this.sessionAllowsPrimary ||
        this.primaryWorktreePolicy.policy === "never"
      ) {
        ctx.ui.setStatus("worktrees", "wt primary allowed");
        return;
      }

      if (!(await this.isWorktrunkAvailable(ctx))) {
        this.reportWorktrunkUnavailable(ctx);
        return;
      }
      this.primaryWriteGuardRoot = this.gitContext.primaryPath;
      this.protectedSession = true;
      this.sandboxExecutable = findSandboxExecutable();
      this.enableWorktreeTools();
      ctx.ui.setStatus("worktrees", `wt ${this.primaryWorktreePolicy.policy}`);
      return;
    }

    const store = new LeaseStore(this.gitContext.commonGitDir);
    const sessionId = ctx.sessionManager.getSessionId();
    try {
      await store.acquire(this.gitContext.root, sessionId);
      this.lease = { path: this.gitContext.root, sessionId, store };
      this.heartbeatTimer = setInterval(() => {
        void this.heartbeat();
      }, HEARTBEAT_INTERVAL_MS);
      this.heartbeatTimer.unref();
      const leases = await store.listActive(this.gitContext.root);
      const branch = this.gitContext.branch ?? "detached";
      ctx.ui.setStatus(
        "worktrees",
        leases.length > 1 ? `wt ${branch} (${leases.length})` : `wt ${branch}`,
      );
    } catch (error) {
      this.protectedSession = true;
      this.suspendMutatingTools();
      ctx.ui.setStatus("worktrees", "wt lease error");
      ctx.ui.notify(
        `Pi could not acquire the worktree lease. Write tools are disabled.\n${errorMessage(error)}`,
        "error",
      );
    }
  }

  private enableWorktreeTools(): void {
    const active = this.pi.getActiveTools();
    for (const tool of WORKTREE_TOOLS) {
      if (!active.includes(tool)) active.push(tool);
    }
    this.pi.setActiveTools(active);
  }

  private suspendMutatingTools(): void {
    const current = this.pi.getActiveTools();
    this.suspendedMutatingTools = current.filter((name) =>
      LEASE_ERROR_MUTATING_TOOLS.has(name),
    );
    const active = current.filter(
      (name) => !LEASE_ERROR_MUTATING_TOOLS.has(name),
    );
    for (const tool of WORKTREE_TOOLS) {
      if (!active.includes(tool)) active.push(tool);
    }
    this.pi.setActiveTools(active);
  }

  private restoreTools(): void {
    const active = this.pi.getActiveTools();
    for (const tool of this.suspendedMutatingTools) {
      if (!active.includes(tool)) active.push(tool);
    }
    this.suspendedMutatingTools = [];
    this.pi.setActiveTools(active);
  }

  private sessionPolicyAllowsPrimary(
    ctx: ExtensionContext,
    primaryPath: string,
  ): boolean {
    for (const entry of [...ctx.sessionManager.getBranch()].reverse()) {
      if (
        entry.type !== "custom" ||
        entry.customType !== SESSION_POLICY_ENTRY
      ) {
        continue;
      }
      if (
        typeof entry.data !== "object" ||
        entry.data === null ||
        Array.isArray(entry.data)
      ) {
        continue;
      }
      const state = entry.data as Partial<SessionPolicyState>;
      if (
        state.allowPrimary === true &&
        typeof state.primaryPath === "string" &&
        resolve(state.primaryPath) === resolve(primaryPath)
      ) {
        return true;
      }
    }
    return false;
  }

  private async heartbeat(): Promise<void> {
    if (!this.lease) return;
    try {
      await this.lease.store.heartbeat(this.lease.path, this.lease.sessionId);
    } catch {
      // Cleanup checks the process before it removes a stale lease.
    }
  }

  private async stopLease(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    const lease = this.lease;
    this.lease = undefined;
    if (!lease) return;

    try {
      await lease.store.release(lease.path, lease.sessionId);
    } catch {
      // A shutdown error must not stop Pi from closing the session.
    }
  }

  private async choosePrimaryWriteTarget(
    request: PrepareRequest,
    ctx: ExtensionContext,
  ): Promise<PrimaryWriteChoice> {
    if (!ctx.hasUI) return resolvePrimaryWriteChoice(undefined, false);

    const prompt = buildWorktreeChoicePrompt(request);
    const selection = await ctx.ui.select(prompt.title, prompt.options);
    return resolvePrimaryWriteChoice(selection, true);
  }

  private allowPrimaryForSession(
    ctx: ExtensionContext,
    current: GitContext,
  ): void {
    this.sessionAllowsPrimary = true;
    this.primaryWriteGuardRoot = undefined;
    this.protectedSession = false;
    this.sandboxExecutable = undefined;
    this.restoreTools();
    this.pi.appendEntry(SESSION_POLICY_ENTRY, {
      allowPrimary: true,
      primaryPath: current.primaryPath,
    } satisfies SessionPolicyState);
    ctx.ui.setStatus("worktrees", "wt primary allowed");
  }

  private async allowPrimary(
    args: string[],
    ctx: ExtensionCommandContext,
  ): Promise<void> {
    if (args.length > 0) {
      this.report(ctx, "Use /worktree allow-primary.", "error");
      return;
    }

    const current = await this.requireGitContext(ctx.cwd, ctx.signal);
    if (current.linked) {
      this.report(ctx, "This session already uses a linked worktree.", "info");
      return;
    }
    if (this.sessionAllowsPrimary) {
      this.report(
        ctx,
        "This session already allows primary worktree changes.",
        "info",
      );
      return;
    }
    if (this.primaryWorktreePolicy?.policy === "never") {
      this.report(
        ctx,
        "Configuration already allows primary worktree changes in this repository.",
        "info",
      );
      return;
    }

    this.allowPrimaryForSession(ctx, current);
    this.report(
      ctx,
      "This Pi session now allows changes in the primary worktree.",
      "warning",
    );
  }

  private async startFromCommand(
    args: string[],
    ctx: ExtensionCommandContext,
  ): Promise<void> {
    const branch = args[0];
    if (!branch) {
      this.report(ctx, "Use /worktree start <branch> [base].", "error");
      return;
    }

    const source = await this.requireGitContext(ctx.cwd, ctx.signal);
    const prepared = await this.prepareWorktree(
      { base: args[1], branch, mode: "create" },
      ctx.cwd,
      ctx.signal,
    );
    await this.handoff(ctx, {
      branch: prepared.branch,
      continueTask: false,
      path: prepared.path,
      sourceCommonGitDir: source.commonGitDir,
    });
  }

  private async joinFromCommand(
    args: string[],
    ctx: ExtensionCommandContext,
  ): Promise<void> {
    const target = args.join(" ");
    if (!target) {
      this.report(ctx, "Use /worktree join <branch-or-path>.", "error");
      return;
    }

    const source = await this.requireGitContext(ctx.cwd, ctx.signal);
    const prepared = await this.prepareWorktree(
      { branch: target, mode: "join" },
      ctx.cwd,
      ctx.signal,
    );
    if (resolve(prepared.path) === resolve(source.root) && source.linked) {
      this.report(
        ctx,
        `This session already uses the linked worktree at ${prepared.path}.`,
        "info",
      );
      return;
    }
    await this.handoff(ctx, {
      branch: prepared.branch,
      continueTask: false,
      path: prepared.path,
      sourceCommonGitDir: source.commonGitDir,
    });
  }

  private async finish(ctx: ExtensionCommandContext): Promise<void> {
    const current = await this.requireGitContext(ctx.cwd, ctx.signal);
    if (!current.linked) {
      this.report(
        ctx,
        "This session is already in the primary worktree.",
        "info",
      );
      return;
    }

    const currentPath = current.root;
    const sessionPath = await this.createForkedSession(
      ctx,
      current.primaryPath,
    );
    const encodedPath = Buffer.from(currentPath, "utf8").toString("base64url");
    const result = await ctx.switchSession(sessionPath, {
      withSession: async (replacement) => {
        await replacement.sendUserMessage(
          `/${INTERNAL_CLEANUP_COMMAND} ${encodedPath}`,
          { expandPromptTemplates: true },
        );
      },
    });

    if (result.cancelled) {
      await rm(sessionPath, { force: true });
      this.report(
        ctx,
        "The worktree finish operation was cancelled.",
        "warning",
      );
    }
  }

  private async cleanupFromCommand(
    args: string[],
    ctx: ExtensionCommandContext,
  ): Promise<void> {
    const target = args.join(" ");
    if (!target) {
      this.report(
        ctx,
        "Use /worktree cleanup <branch-or-path>. Use /worktree finish to clean the current worktree.",
        "error",
      );
      return;
    }

    const result = await this.cleanup(ctx.cwd, target, ctx.signal);
    this.report(ctx, result, "info");
  }

  private async cleanup(
    cwd: string,
    target: string,
    signal: AbortSignal | undefined,
  ): Promise<string> {
    const context = await this.requireGitContext(cwd, signal);
    const worktree = findWorktree(context.worktrees, target, cwd);
    if (!worktree) throw new Error(`No worktree matches ${target}.`);
    if (resolve(worktree.path) === resolve(context.primaryPath)) {
      throw new Error("The primary worktree cannot be removed.");
    }

    const store = new LeaseStore(context.commonGitDir);
    return store.guardCleanup(worktree.path, async () => {
      const status = await this.run(
        "git",
        [
          "-C",
          worktree.path,
          "status",
          "--porcelain=v1",
          "--untracked-files=all",
        ],
        cwd,
        signal,
      );
      if (status.stdout.trim().length > 0) {
        throw new Error(
          `The worktree has tracked or untracked changes. Cleanup stopped.\n${summarizeStatus(status.stdout)}`,
        );
      }

      const removed = await this.run(
        "wt",
        [
          "-C",
          context.primaryPath,
          "remove",
          "--foreground",
          "--format=json",
          worktree.path,
        ],
        cwd,
        signal,
      );
      const output = removed.stdout.trim();
      return output.length > 0
        ? `Removed ${worktree.path}.\n${output}`
        : `Removed ${worktree.path}.`;
    });
  }

  private async showStatus(ctx: ExtensionCommandContext): Promise<void> {
    this.report(ctx, await this.buildStatus(ctx.cwd, ctx.signal), "info");
  }

  private async buildStatus(
    cwd: string,
    signal: AbortSignal | undefined,
  ): Promise<string> {
    const context = await this.getGitContext(cwd, signal);
    if (!context) return "This directory is not in a Git repository.";

    const store = new LeaseStore(context.commonGitDir);
    const lines = [
      context.linked
        ? `Current: ${context.branch ?? "detached"} at ${context.root}`
        : `Current: primary worktree at ${context.root}`,
    ];
    if (!context.linked) {
      const protection = this.protectedSession
        ? `protected (${this.primaryWorktreePolicy?.policy ?? "unknown"})`
        : this.sessionAllowsPrimary
          ? "allowed for this session"
          : this.primaryWorktreePolicy?.policy === "never"
            ? "allowed by configuration"
            : "not active";
      lines.push(`Primary worktree: ${protection}`);
    }

    for (const worktree of context.worktrees) {
      const leases = await store.listActive(worktree.path);
      const marker =
        resolve(worktree.path) === resolve(context.root) ? "*" : " ";
      const name = worktree.branch ?? "detached";
      const leaseText = leases.length > 0 ? `, ${leases.length} active Pi` : "";
      lines.push(`${marker} ${name}: ${worktree.path}${leaseText}`);
    }

    return lines.join("\n");
  }

  private async prepareWorktree(
    request: PrepareRequest,
    cwd: string,
    signal: AbortSignal | undefined,
  ): Promise<WorktrunkSwitchResult> {
    const source = await this.requireGitContext(cwd, signal);
    if (source.linked && request.mode === "create") {
      throw new Error(
        "This session already uses a linked worktree. Finish it before you create another worktree.",
      );
    }

    if (request.mode === "join") {
      const match = findWorktree(source.worktrees, request.branch, cwd);
      if (!match) {
        throw new Error(`No worktree matches ${request.branch}.`);
      }
      return {
        action: "existing",
        branch: match.branch,
        path: resolve(match.path),
      };
    }

    const args = ["-C", cwd, "switch", "--no-cd", "--format=json", "--create"];
    if (request.base) args.push("--base", request.base);
    args.push(request.branch);

    const result = await this.run("wt", args, cwd, signal);
    const prepared = parseWorktrunkSwitchOutput(result.stdout);
    const target = await this.requireGitContext(prepared.path, signal);
    if (target.commonGitDir !== source.commonGitDir || !target.linked) {
      throw new Error(
        "Worktrunk selected a path outside the current linked worktrees.",
      );
    }
    return prepared;
  }

  private async handoff(
    ctx: ExtensionCommandContext,
    pending: PendingHandoff,
  ): Promise<void> {
    const target = await this.requireGitContext(pending.path, ctx.signal);
    if (target.commonGitDir !== pending.sourceCommonGitDir || !target.linked) {
      throw new Error(
        "The target is not a linked worktree for the current repository.",
      );
    }

    const sessionPath = await this.createForkedSession(ctx, pending.path);
    const branch = pending.branch;
    const path = pending.path;
    const continueTask = pending.continueTask;
    const result = await ctx.switchSession(sessionPath, {
      withSession: async (replacement) => {
        replacement.ui.notify(
          `Pi now uses ${branch ?? "the linked worktree"} at ${path}.`,
          "info",
        );
        if (continueTask) {
          await replacement.sendUserMessage(
            "Continue the active task in this worktree. Retry the change that required worktree isolation.",
          );
        }
      },
    });

    if (result.cancelled) {
      await rm(sessionPath, { force: true });
      this.report(
        ctx,
        "The worktree session handoff was cancelled.",
        "warning",
      );
    }
  }

  private async createForkedSession(
    ctx: ExtensionCommandContext,
    targetCwd: string,
  ): Promise<string> {
    const sourcePath = ctx.sessionManager.getSessionFile();
    if (!sourcePath) {
      throw new Error(
        "Pi cannot move an in-memory session. Start Pi with session storage enabled and try again.",
      );
    }
    const sessionDir = customSessionDirectory(ctx);
    if (existsSync(sourcePath)) {
      const manager = SessionManager.forkFrom(
        sourcePath,
        targetCwd,
        sessionDir,
      );
      const path = manager.getSessionFile();
      if (!path)
        throw new Error("Pi did not create the worktree session file.");
      return path;
    }

    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "pi-worktree-session-"),
    );
    const temporarySession = join(temporaryDirectory, "source.jsonl");
    const header = ctx.sessionManager.getHeader() ?? {
      type: "session",
      version: CURRENT_SESSION_VERSION,
      id: ctx.sessionManager.getSessionId(),
      timestamp: new Date().toISOString(),
      cwd: ctx.cwd,
    };

    try {
      const entries = [header, ...ctx.sessionManager.getEntries()];
      await writeFile(
        temporarySession,
        `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
        "utf8",
      );
      const manager = SessionManager.forkFrom(
        temporarySession,
        targetCwd,
        sessionDir,
      );
      const path = manager.getSessionFile();
      if (!path)
        throw new Error("Pi did not create the worktree session file.");

      const lines = (await readFile(path, "utf8")).split("\n");
      const newHeader = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
      newHeader.parentSession = sourcePath;
      lines[0] = JSON.stringify(newHeader);
      await writeFile(path, lines.join("\n"), "utf8");
      return path;
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  }

  private async getGitContext(
    cwd: string,
    signal: AbortSignal | undefined,
  ): Promise<GitContext | undefined> {
    const rootResult = await this.pi.exec(
      "git",
      ["rev-parse", "--show-toplevel"],
      { cwd, signal },
    );
    if (rootResult.code !== 0 || rootResult.killed) return undefined;

    const [gitDirResult, commonDirResult, branchResult, worktreesResult] =
      await Promise.all([
        this.run("git", ["rev-parse", "--absolute-git-dir"], cwd, signal),
        this.run(
          "git",
          ["rev-parse", "--path-format=absolute", "--git-common-dir"],
          cwd,
          signal,
        ),
        this.run("git", ["branch", "--show-current"], cwd, signal),
        this.run("git", ["worktree", "list", "--porcelain", "-z"], cwd, signal),
      ]);

    const worktrees = parseWorktreeList(worktreesResult.stdout);
    const primary = worktrees[0];
    if (!primary) throw new Error("Git did not report a primary worktree.");

    const gitDir = resolve(gitDirResult.stdout.trim());
    const commonGitDir = resolve(commonDirResult.stdout.trim());
    const [primaryPath, root] = await Promise.all([
      realpath(resolve(primary.path)),
      realpath(resolve(rootResult.stdout.trim())),
    ]);
    return {
      branch: branchResult.stdout.trim() || undefined,
      commonGitDir,
      gitDir,
      linked: gitDir !== commonGitDir,
      primaryName: basename(resolve(primary.path)),
      primaryPath,
      root,
      worktrees,
    };
  }

  private async requireGitContext(
    cwd: string,
    signal: AbortSignal | undefined,
  ): Promise<GitContext> {
    const context = await this.getGitContext(cwd, signal);
    if (!context) throw new Error("This directory is not in a Git repository.");
    return context;
  }

  private async run(
    command: string,
    args: string[],
    cwd: string,
    signal: AbortSignal | undefined,
  ) {
    const result = await this.pi.exec(command, args, { cwd, signal });
    if (result.killed) throw new Error(`${command} was stopped.`);
    if (result.code !== 0) {
      const output = [result.stderr.trim(), result.stdout.trim()]
        .filter(Boolean)
        .join("\n");
      throw new Error(
        output.length > 0
          ? `${command} failed.\n${output.slice(-4_000)}`
          : `${command} failed with exit code ${result.code}.`,
      );
    }
    return result;
  }

  private async isWorktrunkAvailable(ctx: ExtensionContext): Promise<boolean> {
    try {
      const worktrunk = await this.pi.exec("wt", ["--version"], {
        cwd: ctx.cwd,
        signal: ctx.signal,
      });
      return worktrunk.code === 0 && !worktrunk.killed;
    } catch {
      return false;
    }
  }

  private reportWorktrunkUnavailable(ctx: ExtensionContext): void {
    ctx.ui.setStatus("worktrees", "wt unavailable");
    ctx.ui.notify(
      "Worktrunk is not available on PATH. Worktree protection is disabled.",
      "warning",
    );
  }

  private report(
    ctx: ExtensionContext,
    message: string,
    level: "error" | "info" | "warning",
  ): void {
    if (ctx.hasUI) ctx.ui.notify(message, level);
    else console.log(message);
  }
}

function findSandboxExecutable(): string | undefined {
  const path = "/usr/bin/sandbox-exec";
  return process.platform === "darwin" && existsSync(path) ? path : undefined;
}

function customSessionDirectory(
  ctx: ExtensionCommandContext,
): string | undefined {
  const currentDirectory = resolve(ctx.sessionManager.getSessionDir());
  const sourceDefault = defaultSessionDirectory(ctx.cwd);
  if (currentDirectory === sourceDefault) return undefined;
  return currentDirectory;
}

function defaultSessionDirectory(cwd: string): string {
  const safePath = `--${resolve(cwd)
    .replace(/^[/\\]/, "")
    .replace(/[/\\:]/g, "-")}--`;
  return join(getAgentDir(), "sessions", safePath);
}

function errorMessage(error: unknown): string {
  if (error instanceof ActiveWorktreeLeaseError) {
    return [
      error.message,
      ...error.leases.map(formatLease),
      "Wait for those sessions to finish, then run cleanup again.",
    ].join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}

function formatLease(lease: WorktreeLease): string {
  return `- PID ${lease.pid}, session ${lease.sessionId}, heartbeat ${lease.heartbeatAt}`;
}
