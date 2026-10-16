import { type ExtensionAPI, type SessionEntry, VERSION } from "@earendil-works/pi-coding-agent";

const SUPPORTED_PI_VERSIONS = ["1.1.0", "1.2.0", "1.3.0"];

export default function preserveScrollback(pi: ExtensionAPI): void {
  let restore: ((reason?: string) => void) | undefined;

  pi.on("session_start", (_event, ctx) => {
    restore?.();
    restore = undefined;

    if (ctx.mode !== "tui") {
      return;
    }

    if (!SUPPORTED_PI_VERSIONS.includes(VERSION)) {
      ctx.ui.notify(
        `preserve-scrollback is disabled for Pi ${VERSION}. Tested versions: ${SUPPORTED_PI_VERSIONS.join(", ")}.`,
        "warning",
      );
      return;
    }

    const manager = ctx.sessionManager;
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
    manager.buildContextEntries = fullTranscript;
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
