import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";

export default function preserveScrollback(pi: ExtensionAPI): void {
  let restore: ((reason?: string) => void) | undefined;

  pi.on("session_start", (_event, ctx) => {
    restore?.();
    restore = undefined;

    if (ctx.mode !== "tui") {
      return;
    }

    const manager = ctx.sessionManager;
    for (const method of ["buildContextEntries", "getBranch"] as const) {
      if (typeof manager[method] !== "function") {
        ctx.ui.notify(
          `preserve-scrollback is disabled: sessionManager.${method}() is unavailable.`,
          "warning",
        );
        return;
      }
    }

    const current: TranscriptReader = manager.buildContextEntries;
    const original = current[ORIGINAL_READER] ?? current;
    let restoreOnRead = false;

    // Tested Pi versions use this instance method for the UI, not model context.
    const fullTranscript: TranscriptReader = () => {
      if (restoreOnRead && manager.buildContextEntries === fullTranscript) {
        manager.buildContextEntries = original;
      }

      const branch = manager.getBranch();
      const latestCompaction = branch.findLast((entry) => entry.type === "compaction");

      if (!latestCompaction) {
        return branch;
      }

      // Compaction handlers require the latest summary at index zero.
      return [latestCompaction, ...branch.filter((entry) => entry.id !== latestCompaction.id)];
    };

    fullTranscript[ORIGINAL_READER] = original;
    let installed: boolean;
    try {
      manager.buildContextEntries = fullTranscript;
      installed = manager.buildContextEntries === fullTranscript;
    } catch {
      installed = false;
    }
    if (!installed) {
      ctx.ui.notify(
        "preserve-scrollback is disabled: cannot replace sessionManager.buildContextEntries().",
        "warning",
      );
      return;
    }

    restore = (reason) => {
      if (manager.buildContextEntries !== fullTranscript) {
        return;
      }

      // Reload rebuilds the UI before the next session_start event.
      if (reason === "reload") {
        restoreOnRead = true;
      } else {
        manager.buildContextEntries = original;
      }
    };
  });

  pi.on("session_shutdown", (event) => {
    restore?.(event.reason);
    restore = undefined;
  });
}

const ORIGINAL_READER = Symbol.for("pi.preserve-scrollback.originalReader");

type TranscriptReader = (() => SessionEntry[]) & {
  [ORIGINAL_READER]?: () => SessionEntry[];
};
