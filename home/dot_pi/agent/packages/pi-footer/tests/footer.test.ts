import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import footerExtension from "../extensions/footer";

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;
type Widget = Component & { dispose?(): void };
type WidgetFactory = (tui: TUI, theme: Theme) => Widget;
type FooterFactory = NonNullable<
  Parameters<ExtensionContext["ui"]["setFooter"]>[0]
>;
type FooterCommand = Parameters<ExtensionAPI["registerCommand"]>[1];

function createFixture(mode: ExtensionContext["mode"] = "tui") {
  const handlers = new Map<string, Handler>();
  const commands = new Map<string, FooterCommand>();
  const widgets = new Map<string, Widget>();
  const requestRender = vi.fn();
  const unsubscribe = vi.fn();
  const statuses = new Map([["worktrees", "wt always"]]);
  const theme = {
    fg: (_color: string, text: string) => text,
    getThinkingBorderColor: (_level: string) => (text: string) => text,
  } as Theme;
  const tui = { requestRender } as unknown as TUI;
  let footer: Widget | undefined;
  let branchChanged: (() => void) | undefined;
  let thinkingLevel = "xhigh";
  const usage = { tokens: 47_000, contextWindow: 200_000, percent: 23.5 };
  const getContextUsage = vi.fn(
    (): ReturnType<ExtensionContext["getContextUsage"]> => usage,
  );
  const getBranch = vi.fn(() => [
    { type: "message", message: { role: "user", content: "Previous prompt" } },
  ]);
  const setWidget = vi.fn((key: string, factory: WidgetFactory | undefined) => {
    widgets.get(key)?.dispose?.();
    if (factory) {
      widgets.set(key, factory(tui, theme));
    } else {
      widgets.delete(key);
    }
  });
  const setFooter = vi.fn((factory: FooterFactory | undefined) => {
    footer?.dispose?.();
    footer = factory?.(tui, theme, {
      getGitBranch: () => "master",
      getExtensionStatuses: () => statuses,
      getAvailableProviderCount: () => 1,
      onBranchChange: (callback) => {
        branchChanged = callback;
        return unsubscribe;
      },
    });
  });
  const ui = {
    setWidget,
    setFooter,
    notify: vi.fn(),
    setEditorComponent: vi.fn(),
    onTerminalInput: vi.fn(),
    setWorkingMessage: vi.fn(),
    setHeader: vi.fn(),
  };
  const ctx = {
    mode,
    cwd: "/Users/del-boy/work/linear-app",
    model: { id: "gpt-6.1-sol" },
    getContextUsage,
    sessionManager: { getBranch },
    ui,
  } as unknown as ExtensionContext;
  const on = vi.fn((name: string, handler: Handler) => {
    handlers.set(name, handler);
  });
  const pi = {
    on,
    getThinkingLevel: () => thinkingLevel,
    registerCommand: (name: string, command: FooterCommand) =>
      commands.set(name, command),
    registerTool: vi.fn(),
    registerShortcut: vi.fn(),
    sendUserMessage: vi.fn(),
  };
  footerExtension(pi as unknown as ExtensionAPI);

  return {
    ctx,
    pi,
    ui,
    widgets,
    statuses,
    requestRender,
    unsubscribe,
    getContextUsage,
    getBranch,
    usage,
    primary: (width = 120) => widgets.get("pi-footer-primary")?.render(width),
    prompt: () => widgets.get("pi-footer-prompt")?.render(120),
    status: (width = 120) => footer?.render(width),
    branchChanged: () => branchChanged?.(),
    setThinking: (level: string) => {
      thinkingLevel = level;
    },
    emit: async (name: string, event: unknown = {}) => {
      await handlers.get(name)?.(event, ctx);
    },
    command: async (text: string) => {
      await commands
        .get("footer")
        ?.handler(text, ctx as Parameters<FooterCommand["handler"]>[1]);
    },
    handlers,
  };
}

describe("footer extension", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("installs the bar above the editor and the prompt below it", async () => {
    const fixture = createFixture();
    await fixture.emit("session_start");
    expect(fixture.ui.setWidget).toHaveBeenCalledWith(
      "pi-footer-primary",
      expect.any(Function),
      { placement: "aboveEditor" },
    );
    expect(fixture.ui.setWidget).toHaveBeenCalledWith(
      "pi-footer-prompt",
      expect.any(Function),
      { placement: "belowEditor" },
    );
    expect(fixture.primary()?.[0]).toContain(
      "✦ gpt-6.1-sol · ◈ xhigh · ⌂ linear-app · ⎇ master",
    );
    expect(fixture.prompt()).toEqual(["last: Previous prompt"]);
  });

  it.each([
    "rpc",
    "json",
    "print",
  ] as const)("does not install terminal UI in %s mode", async (mode) => {
    const fixture = createFixture(mode);
    await fixture.emit("session_start");
    await fixture.emit("before_agent_start", { prompt: "New prompt" });
    await fixture.emit("message_update", { message: { role: "assistant" } });
    await fixture.emit("session_before_compact");
    await fixture.emit("session_compact");
    await fixture.emit("session_compact_failed");
    await fixture.emit("session_tree");
    await fixture.emit("session_shutdown");
    await fixture.command("");
    expect(fixture.ui.setWidget).not.toHaveBeenCalled();
    expect(fixture.ui.setFooter).not.toHaveBeenCalled();
    expect(fixture.getContextUsage).not.toHaveBeenCalled();
  });

  it("keeps the native editor, shortcuts, message delivery, and compaction commands", async () => {
    const fixture = createFixture();
    await fixture.emit("session_start");
    expect(fixture.ui.setEditorComponent).not.toHaveBeenCalled();
    expect(fixture.ui.onTerminalInput).not.toHaveBeenCalled();
    expect(fixture.ui.setWorkingMessage).not.toHaveBeenCalled();
    expect(fixture.ui.setHeader).not.toHaveBeenCalled();
    expect(fixture.pi.registerTool).not.toHaveBeenCalled();
    expect(fixture.pi.registerShortcut).not.toHaveBeenCalled();
    expect(fixture.pi.sendUserMessage).not.toHaveBeenCalled();
    expect(fixture.handlers.has("input")).toBe(false);
  });

  it("does not scan session history while rendering", async () => {
    const fixture = createFixture();
    await fixture.emit("session_start");
    fixture.getContextUsage.mockClear();
    fixture.getBranch.mockClear();
    for (let i = 0; i < 100; i++) {
      fixture.primary();
      fixture.prompt();
      fixture.status();
    }
    expect(fixture.getContextUsage).not.toHaveBeenCalled();
    expect(fixture.getBranch).not.toHaveBeenCalled();
  });

  it("reads extension statuses at render time", async () => {
    const fixture = createFixture();
    await fixture.emit("session_start");
    fixture.statuses.set("rtk", "rtk on");
    expect(fixture.primary()?.[0]).toContain("rtk on");
    expect(fixture.status()).toEqual([]);
    expect(fixture.status(40)?.[0]).toContain("rtk on");
    fixture.statuses.delete("rtk");
    expect(fixture.primary()?.[0]).not.toContain("rtk on");
    expect(fixture.status(40)?.[0]).not.toContain("rtk on");
    fixture.branchChanged();
    expect(fixture.requestRender).toHaveBeenCalled();
  });

  it("moves statuses on resize without depending on render order", async () => {
    const fixture = createFixture();
    await fixture.emit("session_start");
    fixture.statuses.set("rtk", "rtk on");
    expect(fixture.status(40)).toEqual(["rtk on · wt always"]);
    expect(fixture.primary(40)?.[0]).not.toContain("rtk on");
    expect(fixture.status(120)).toEqual([]);
    expect(fixture.primary(120)?.[0]).toContain("rtk on · wt always · ctx");
    expect(fixture.primary(40)?.[0]).not.toContain("rtk on");
    expect(fixture.status(40)).toEqual(["rtk on · wt always"]);
  });

  it("refreshes the prompt, thinking level, and model", async () => {
    const fixture = createFixture();
    await fixture.emit("session_start");
    await fixture.emit("before_agent_start", { prompt: "New\nprompt" });
    fixture.setThinking("low");
    await fixture.emit("thinking_level_select");
    expect(fixture.primary()?.[0]).toContain("low");
    expect(fixture.prompt()).toEqual(["last: New prompt"]);
    if (fixture.ctx.model) {
      fixture.ctx.model.id = "other-model";
    }
    await fixture.emit("model_select");
    expect(fixture.primary()?.[0]).toContain("other-model");
  });

  it("coalesces streaming refreshes and returns to native usage at turn end", async () => {
    const fixture = createFixture();
    await fixture.emit("session_start");
    fixture.requestRender.mockClear();
    const event = {
      message: {
        role: "assistant",
        stopReason: "stop",
        usage: {
          input: 10_000,
          output: 2_000,
          cacheRead: 4_000,
          cacheWrite: 0,
        },
      },
    };
    await fixture.emit("message_update", event);
    await fixture.emit("message_update", event);
    expect(fixture.primary()?.[0]).toContain("ctx 8.0%");
    expect(fixture.requestRender).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(fixture.requestRender).toHaveBeenCalledTimes(1);
    await fixture.emit("turn_end");
    expect(fixture.primary()?.[0]).toContain("ctx 23.5%");
  });

  it.each([
    "error",
    "aborted",
  ])("does not use %s assistant usage", async (stopReason) => {
    const fixture = createFixture();
    await fixture.emit("session_start");
    await fixture.emit("message_update", {
      message: {
        role: "assistant",
        stopReason,
        usage: { input: 199_000, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    });
    expect(fixture.primary()?.[0]).toContain("ctx 23.5%");
  });

  it("shows unknown context after compaction and restores context on failure", async () => {
    const fixture = createFixture();
    await fixture.emit("session_start");
    await fixture.emit("session_before_compact");
    expect(fixture.primary()?.[0]).toContain("compacting");
    fixture.getContextUsage.mockReturnValue({
      tokens: null,
      contextWindow: 200_000,
      percent: null,
    });
    await fixture.emit("session_compact");
    expect(fixture.primary()?.[0]).toContain("ctx ?");
    fixture.getContextUsage.mockReturnValue(fixture.usage);
    await fixture.emit("session_before_compact");
    await fixture.emit("session_compact_failed");
    expect(fixture.primary()?.[0]).toContain("ctx 23.5%");
  });

  it("restores the prompt from the current branch after tree navigation", async () => {
    const fixture = createFixture();
    await fixture.emit("session_start");
    fixture.getBranch.mockReturnValue([
      {
        type: "message",
        message: { role: "user", content: "Other branch prompt" },
      },
    ]);
    await fixture.emit("session_tree");
    expect(fixture.prompt()).toEqual(["last: Other branch prompt"]);
  });

  it("restores the native footer when disabled and can re-enable", async () => {
    const fixture = createFixture();
    await fixture.emit("session_start");
    await fixture.command("off");
    expect(fixture.widgets.size).toBe(0);
    expect(fixture.status()).toBeUndefined();
    expect(fixture.ui.setFooter).toHaveBeenLastCalledWith(undefined);
    expect(fixture.unsubscribe).toHaveBeenCalledTimes(1);
    await fixture.command("on");
    expect(fixture.primary()?.[0]).toContain("ctx 23.5%");
    await fixture.command("");
    expect(fixture.widgets.size).toBe(0);
  });

  it("keeps compaction state while disabled", async () => {
    const fixture = createFixture();
    await fixture.emit("session_start");
    await fixture.command("off");
    await fixture.emit("session_before_compact");
    await fixture.command("on");
    expect(fixture.primary()?.[0]).toContain("compacting");
  });

  it("does not change the display for invalid command arguments", async () => {
    const fixture = createFixture();
    await fixture.emit("session_start");
    await fixture.command("invalid");
    expect(fixture.ui.notify).toHaveBeenCalled();
    expect(fixture.primary()).toBeDefined();
  });

  it("clears widgets, branch subscriptions, and pending renders on shutdown", async () => {
    const fixture = createFixture();
    await fixture.emit("session_start");
    await fixture.emit("message_update", {
      message: {
        role: "assistant",
        stopReason: "stop",
        usage: { input: 10_000, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    });
    await fixture.emit("session_shutdown");
    fixture.requestRender.mockClear();
    vi.advanceTimersByTime(1_000);
    expect(fixture.requestRender).not.toHaveBeenCalled();
    expect(fixture.widgets.size).toBe(0);
    expect(fixture.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
