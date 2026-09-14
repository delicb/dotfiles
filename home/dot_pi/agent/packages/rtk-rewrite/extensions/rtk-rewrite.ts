import {
  createLocalBashOperations,
  isToolCallEventType,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";

// Load this package after pi-guardrails so guardrails check the original command.
// Do not register a bash tool because pi-tool-renderer owns that tool.
export default function rtkRewriteExtension(pi: ExtensionAPI): void {
  new RtkRewriter(pi).register();
}

type Availability = "available" | "unavailable" | "unknown";
type RtkSubcommand = "disable" | "enable" | "status";

interface RewriteStats {
  attempted: number;
  bypassed: number;
  failed: number;
  rewritten: number;
  unchanged: number;
}

class RtkRewriter {
  private static readonly rewriteTimeoutMs = 5_000;
  private static readonly subcommands: readonly RtkSubcommand[] = [
    "enable",
    "disable",
    "status",
  ];

  private readonly localBashOperations = createLocalBashOperations();
  private readonly stats: RewriteStats = {
    attempted: 0,
    bypassed: 0,
    failed: 0,
    rewritten: 0,
    unchanged: 0,
  };

  private availability: Availability = "unknown";
  private enabled = true;
  private unavailableWarningShown = false;
  private version: string | undefined;

  public constructor(private readonly pi: ExtensionAPI) {}

  public register(): void {
    this.registerCommand();

    this.pi.on("tool_call", async (event, ctx) => {
      if (!isToolCallEventType("bash", event)) return;

      if (!this.enabled) {
        this.stats.bypassed += 1;
        return;
      }

      const rewritten = await this.rewrite(
        event.input.command,
        ctx.cwd,
        ctx.signal,
      );
      if (rewritten !== undefined) event.input.command = rewritten;
    });

    this.pi.on("user_bash", async (event, ctx) => {
      if (event.excludeFromContext || !this.enabled) {
        this.stats.bypassed += 1;
        return;
      }

      const rewritten = await this.rewrite(
        event.command,
        event.cwd,
        ctx.signal,
      );
      if (rewritten === undefined) return;

      return {
        operations: {
          exec: (_command, cwd, options) =>
            this.localBashOperations.exec(rewritten, cwd, options),
        },
      };
    });

    this.pi.on("session_start", async (_event, ctx) => {
      this.updateStatus(ctx);
      await this.refreshAvailability(ctx, true);
    });
  }

  private registerCommand(): void {
    this.pi.registerCommand("rtk", {
      description: "Control RTK shell command rewriting",
      getArgumentCompletions: (prefix) => {
        const completions = RtkRewriter.subcommands
          .filter((subcommand) => subcommand.startsWith(prefix))
          .map((subcommand) => ({ label: subcommand, value: subcommand }));

        return completions.length > 0 ? completions : null;
      },
      handler: async (args, ctx) => {
        const subcommand = args.trim();

        if (subcommand.length === 0 || subcommand === "status") {
          await this.showStatus(ctx);
          return;
        }

        if (!this.isSubcommand(subcommand)) {
          ctx.ui.notify(
            "Unknown /rtk command. Use enable, disable, or status.",
            "error",
          );
          return;
        }

        this.enabled = subcommand === "enable";
        this.updateStatus(ctx);
        ctx.ui.notify(
          `RTK command rewriting is ${this.enabled ? "enabled" : "disabled"} for this Pi process.`,
          "info",
        );
      },
    });
  }

  private isSubcommand(value: string): value is RtkSubcommand {
    return RtkRewriter.subcommands.includes(value as RtkSubcommand);
  }

  private async refreshAvailability(
    ctx: ExtensionContext,
    notifyWhenUnavailable: boolean,
  ): Promise<void> {
    try {
      const result = await this.pi.exec("rtk", ["--version"], {
        cwd: ctx.cwd,
        signal: ctx.signal,
        timeout: RtkRewriter.rewriteTimeoutMs,
      });

      if (!result.killed && result.code === 0) {
        this.availability = "available";
        this.version = result.stdout.trim() || "version unknown";
        this.unavailableWarningShown = false;
        return;
      }
    } catch {
      // An availability check must not stop Pi startup.
    }

    this.availability = "unavailable";
    this.version = undefined;

    if (notifyWhenUnavailable && !this.unavailableWarningShown) {
      this.unavailableWarningShown = true;
      ctx.ui.notify(
        "RTK is not available on PATH. Pi will run shell commands without RTK rewrites.",
        "warning",
      );
    }
  }

  private async rewrite(
    command: string,
    cwd: string,
    signal: AbortSignal | undefined,
  ): Promise<string | undefined> {
    this.stats.attempted += 1;

    try {
      const result = await this.pi.exec("rtk", ["rewrite", command], {
        cwd,
        signal,
        timeout: RtkRewriter.rewriteTimeoutMs,
      });

      if (result.killed) {
        this.stats.failed += 1;
        return undefined;
      }

      const rewritten = result.stdout.trimEnd();
      if (rewritten.length === 0) {
        if (this.availability === "unavailable") {
          this.stats.failed += 1;
        } else {
          this.stats.unchanged += 1;
        }
        return undefined;
      }

      this.availability = "available";
      this.unavailableWarningShown = false;

      if (rewritten === command) {
        this.stats.unchanged += 1;
        return undefined;
      }

      this.stats.rewritten += 1;
      return rewritten;
    } catch {
      this.availability = "unavailable";
      this.stats.failed += 1;
      return undefined;
    }
  }

  private async showStatus(ctx: ExtensionContext): Promise<void> {
    await this.refreshAvailability(ctx, false);

    const binary =
      this.availability === "available"
        ? (this.version ?? "available")
        : "not available on PATH";

    ctx.ui.notify(
      [
        `State: ${this.enabled ? "enabled" : "disabled"}`,
        `Binary: ${binary}`,
        `Rewritten: ${this.stats.rewritten} of ${this.stats.attempted} attempts`,
        `Unchanged: ${this.stats.unchanged}`,
        `Failed: ${this.stats.failed}`,
        `Bypassed: ${this.stats.bypassed}`,
        "Use RTK_DISABLED=1 before a command to bypass one rewrite.",
      ].join("\n"),
      "info",
    );
  }

  private updateStatus(ctx: ExtensionContext): void {
    ctx.ui.setStatus("rtk-rewrite", this.enabled ? "rtk on" : "rtk off");
  }
}
