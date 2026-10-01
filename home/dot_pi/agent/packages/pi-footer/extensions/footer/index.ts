import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { type FooterSnapshot, FooterView } from "./FooterView";

export default function footerExtension(pi: ExtensionAPI): void {
  let enabled = true;
  let state: FooterSnapshot;
  let requestRender: (() => void) | undefined;
  let renderTimer: ReturnType<typeof setTimeout> | undefined;

  function cancelRender(): void {
    clearTimeout(renderTimer);
    renderTimer = undefined;
  }

  function refresh(ctx: ExtensionContext): void {
    if (ctx.mode !== "tui" || !enabled) {
      return;
    }
    const usage = ctx.getContextUsage();
    state.cwd = ctx.cwd;
    state.modelId = ctx.model?.id ?? "no model";
    state.thinkingLevel = pi.getThinkingLevel();
    state.contextPercent = usage?.percent ?? null;
    state.contextWindow = usage?.contextWindow ?? 0;
    cancelRender();
    requestRender?.();
  }

  function install(ctx: ExtensionContext): void {
    refresh(ctx);
    ctx.ui.setFooter((tui, theme, footerData) => {
      requestRender = () => tui.requestRender();
      const unsubscribe = footerData.onBranchChange(() => requestRender?.());

      ctx.ui.setWidget(
        "pi-footer-primary",
        (_tui, widgetTheme) => ({
          render: (width) =>
            FooterView.layout(
              state,
              footerData.getGitBranch(),
              widgetTheme,
              width,
              footerData.getExtensionStatuses(),
            ).primary,
          invalidate() {},
        }),
        { placement: "aboveEditor" },
      );

      ctx.ui.setWidget(
        "pi-footer-prompt",
        (_tui, widgetTheme) => ({
          render: (width) =>
            FooterView.prompt(state.prompt, widgetTheme, width),
          invalidate() {},
        }),
        { placement: "belowEditor" },
      );

      return {
        render: (width) =>
          FooterView.layout(
            state,
            footerData.getGitBranch(),
            theme,
            width,
            footerData.getExtensionStatuses(),
          ).statuses,
        invalidate() {},
        dispose() {
          unsubscribe();
          cancelRender();
          requestRender = undefined;
        },
      };
    });
  }

  function remove(ctx: ExtensionContext): void {
    cancelRender();
    requestRender = undefined;
    ctx.ui.setWidget("pi-footer-primary", undefined);
    ctx.ui.setWidget("pi-footer-prompt", undefined);
    ctx.ui.setFooter(undefined);
  }

  function restorePrompt(ctx: ExtensionContext): void {
    state.prompt = "";
    const branch = ctx.sessionManager.getBranch();
    for (let i = branch.length - 1; i >= 0; i--) {
      const entry = branch[i];
      if (entry?.type === "message" && entry.message.role === "user") {
        const content = entry.message.content;
        state.prompt =
          typeof content === "string"
            ? content
            : content
                .filter((block) => block.type === "text")
                .map((block) => block.text)
                .join("\n");
        return;
      }
    }
  }

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") {
      return;
    }
    state = {
      cwd: ctx.cwd,
      modelId: "no model",
      thinkingLevel: "off",
      contextPercent: null,
      contextWindow: 0,
      compacting: false,
      prompt: "",
    };
    restorePrompt(ctx);
    if (enabled) {
      install(ctx);
    }
  });

  pi.on("before_agent_start", (event, ctx) => {
    if (ctx.mode !== "tui") {
      return;
    }
    state.prompt = event.prompt;
    refresh(ctx);
  });

  pi.on("message_update", (event, ctx) => {
    if (
      ctx.mode !== "tui" ||
      !enabled ||
      state.compacting ||
      event.message.role !== "assistant"
    ) {
      return;
    }
    const message = event.message;
    if (
      message.stopReason === "error" ||
      message.stopReason === "aborted" ||
      state.contextWindow <= 0
    ) {
      return;
    }
    const usage = message.usage;
    const tokens =
      usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
    if (tokens <= 0) {
      return;
    }
    state.contextPercent = (tokens / state.contextWindow) * 100;
    renderTimer ??= setTimeout(() => {
      renderTimer = undefined;
      requestRender?.();
    }, 250);
  });

  pi.on("message_end", (_event, ctx) => refresh(ctx));
  pi.on("turn_end", (_event, ctx) => refresh(ctx));
  pi.on("agent_end", (_event, ctx) => refresh(ctx));
  pi.on("model_select", (_event, ctx) => refresh(ctx));
  pi.on("thinking_level_select", (_event, ctx) => refresh(ctx));

  pi.on("session_tree", (_event, ctx) => {
    if (ctx.mode !== "tui") {
      return;
    }
    restorePrompt(ctx);
    refresh(ctx);
  });

  pi.on("session_before_compact", (_event, ctx) => {
    if (ctx.mode !== "tui") {
      return;
    }
    state.compacting = true;
    refresh(ctx);
  });

  pi.on("session_compact", (_event, ctx) => {
    if (ctx.mode !== "tui") {
      return;
    }
    state.compacting = false;
    refresh(ctx);
  });

  pi.on("session_compact_failed", (_event, ctx) => {
    if (ctx.mode !== "tui") {
      return;
    }
    state.compacting = false;
    refresh(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.mode === "tui") {
      remove(ctx);
    }
  });

  pi.registerCommand("footer", {
    description: "Toggle the simple footer",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("The footer needs terminal mode", "info");
        return;
      }
      const mode = args.trim().toLowerCase();
      if (mode && mode !== "on" && mode !== "off") {
        ctx.ui.notify("Use /footer, /footer on, or /footer off", "info");
        return;
      }
      enabled = mode ? mode === "on" : !enabled;
      if (enabled) {
        restorePrompt(ctx);
        install(ctx);
      } else {
        remove(ctx);
      }
    },
  });
}
