import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import {
  type FooterSnapshot,
  FooterView,
} from "../extensions/footer/FooterView";

const theme = {
  fg: vi.fn((_color: string, text: string) => text),
  getThinkingBorderColor: vi.fn(
    (_level: FooterSnapshot["thinkingLevel"]) => (text: string) => text,
  ),
};
const state: FooterSnapshot = {
  cwd: "/Users/del-boy/work/linear-app",
  modelId: "gpt-6.1-sol",
  thinkingLevel: "xhigh",
  contextPercent: 23.5,
  contextWindow: 200_000,
  compacting: false,
  prompt: "Check the tests",
};

describe("FooterView", () => {
  it("shows the model, thinking level, location, branch, and context", () => {
    const line = FooterView.primary(state, "master", theme, 120)[0] ?? "";
    expect(line).toMatch(/^✦ gpt-6\.1-sol · ◈ xhigh · ⌂ linear-app · ⎇ master/);
    expect(line).toMatch(/ {2,}ctx 23\.5%$/);
    expect(visibleWidth(line)).toBe(120);
  });

  it("omits the branch outside a repository", () => {
    const line = FooterView.primary(state, null, theme, 120)[0];
    expect(line).toContain("⌂ linear-app");
    expect(line).not.toContain("⎇");
  });

  it("uses separate theme colors for the model, folder, and branch", () => {
    theme.fg.mockClear();
    FooterView.primary(state, "master", theme, 120);
    expect(theme.fg).toHaveBeenCalledWith("accent", "✦ gpt-6.1-sol");
    expect(theme.fg).toHaveBeenCalledWith("mdLink", "⌂ linear-app");
    expect(theme.fg).toHaveBeenCalledWith("syntaxType", "⎇ master");
  });

  it.each<FooterSnapshot["thinkingLevel"]>([
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ])("uses the native theme color for %s thinking", (thinkingLevel) => {
    theme.getThinkingBorderColor.mockClear();
    const line = FooterView.primary(
      { ...state, thinkingLevel },
      null,
      theme,
      120,
    )[0];
    expect(theme.getThinkingBorderColor).toHaveBeenCalledWith(thinkingLevel);
    expect(line).toContain(`◈ ${thinkingLevel}`);
  });

  it("does not report unknown usage as zero", () => {
    expect(
      FooterView.primary(
        { ...state, contextPercent: null },
        null,
        theme,
        120,
      )[0],
    ).toContain("ctx ?");
  });

  it("shows compaction without a stale percentage", () => {
    expect(
      FooterView.primary({ ...state, compacting: true }, null, theme, 120)[0],
    ).toContain("compacting");
  });

  it.each([
    [70, "dim"],
    [70.1, "warning"],
    [90, "warning"],
    [90.1, "error"],
  ])("uses the expected color at %s percent", (percent, color) => {
    theme.fg.mockClear();
    FooterView.primary({ ...state, contextPercent: percent }, null, theme, 120);
    expect(theme.fg).toHaveBeenCalledWith(color, `ctx ${percent.toFixed(1)}%`);
  });

  it("keeps context visible when the other fields do not fit", () => {
    const line = FooterView.primary(
      state,
      "a-very-long-branch-name",
      theme,
      24,
    )[0];
    expect(line).toContain("ctx 23.5%");
    expect(visibleWidth(line ?? "")).toBeLessThanOrEqual(24);
  });

  it.each([
    1, 2, 3, 5, 10, 20, 40, 80,
  ])("fits all display lines within %s columns", (width) => {
    const unicodeState = {
      ...state,
      cwd: "/work/日本語📁",
      modelId: "模型🧪".repeat(20),
    };
    const lines = [
      ...FooterView.primary(unicodeState, "分支".repeat(40), theme, width),
      ...FooterView.prompt(
        "A long prompt with 日本語 and 🧪".repeat(20),
        theme,
        width,
      ),
      ...FooterView.statuses(
        new Map([["status", "\x1b[31m日本語🧪".repeat(20)]]),
        theme,
        width,
      ),
    ];
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(width);
    }
  });

  it.each([
    1, 2, 10, 24, 80, 120,
  ])("fits themed icons and wide text within %s columns", (width) => {
    const colors = {
      fg: (_color: string, text: string) =>
        `\x1b[38;2;180;190;254m${text}\x1b[39m`,
      getThinkingBorderColor:
        (_level: FooterSnapshot["thinkingLevel"]) => (text: string) =>
          colors.fg("thinkingXhigh", text),
    };
    const line =
      FooterView.primary(
        { ...state, cwd: "/work/日本語📁", modelId: "模型🧪".repeat(20) },
        "分支".repeat(40),
        colors,
        width,
      )[0] ?? "";
    expect(visibleWidth(line)).toBeLessThanOrEqual(width);
    if (width >= 12) {
      expect(line).toContain("ctx 23.5%");
      expect(visibleWidth(line)).toBe(width);
    }
  });

  it("moves dim statuses before context when the full bar fits", () => {
    const statuses = new Map([
      ["worktrees", "\x1b[33mwt always"],
      ["rtk", "rtk on"],
    ]);
    theme.fg.mockClear();
    const layout = FooterView.layout(state, "master", theme, 120, statuses);
    expect(layout.primary[0]).toMatch(/ · rtk on · wt always · ctx 23\.5%$/);
    expect(layout.statuses).toEqual([]);
    expect(theme.fg).toHaveBeenCalledWith("dim", "rtk on · wt always");
    expect(visibleWidth(layout.primary[0] ?? "")).toBe(120);
  });

  it("keeps statuses below the editor when the bar cannot fit them", () => {
    const statuses = new Map([
      ["worktrees", "wt always"],
      ["rtk", "rtk on"],
    ]);
    const layout = FooterView.layout(state, "master", theme, 64, statuses);
    expect(layout.primary[0]).not.toContain("rtk on");
    expect(layout.primary[0]).toContain("⎇ master");
    expect(layout.primary[0]).toMatch(/ctx 23\.5%$/);
    expect(layout.statuses).toEqual(["rtk on · wt always"]);
  });

  it("uses the exact fit boundary and responds to resizing", () => {
    const statuses = new Map([
      ["worktrees", "wt always"],
      ["rtk", "rtk on"],
    ]);
    const exact =
      "✦ gpt-6.1-sol · ◈ xhigh · ⌂ linear-app · ⎇ master   · rtk on · wt always · ctx 23.5%";
    const width = visibleWidth(exact);
    expect(FooterView.layout(state, "master", theme, width, statuses)).toEqual({
      primary: [exact],
      statuses: [],
    });
    expect(
      FooterView.layout(state, "master", theme, width - 1, statuses).statuses,
    ).toEqual(["rtk on · wt always"]);
    expect(
      FooterView.layout(state, "master", theme, width + 1, statuses).statuses,
    ).toEqual([]);
  });

  it("checks content length instead of using a fixed screen threshold", () => {
    const statuses = new Map([["rtk", "rtk on"]]);
    const longState = { ...state, modelId: "model-".repeat(40) };
    const layout = FooterView.layout(longState, "master", theme, 200, statuses);
    expect(layout.primary[0]).not.toContain("rtk on");
    expect(layout.primary[0]).toMatch(/ctx 23\.5%$/);
    expect(layout.statuses).toEqual(["rtk on"]);
  });

  it("moves statuses as their content changes", () => {
    const statuses = new Map([["rtk", "rtk on"]]);
    expect(
      FooterView.layout(state, null, theme, 100, statuses).statuses,
    ).toEqual([]);
    statuses.set("notice", "Notice ".repeat(30));
    const crowded = FooterView.layout(state, null, theme, 100, statuses);
    expect(crowded.primary[0]).not.toContain("rtk on");
    expect(crowded.statuses).toHaveLength(1);
    statuses.delete("notice");
    expect(
      FooterView.layout(state, null, theme, 100, statuses).primary[0],
    ).toContain("rtk on");
  });

  it("does not add rows or separators for empty statuses", () => {
    const statuses = new Map([
      ["blank", " \n "],
      ["ansi", "\x1b[0m"],
      ["zero-width", "\u200b"],
    ]);
    expect(FooterView.layout(state, "master", theme, 120, statuses)).toEqual({
      primary: FooterView.primary(state, "master", theme, 120),
      statuses: [],
    });
    expect(FooterView.layout(state, "master", theme, 0, statuses)).toEqual({
      primary: [],
      statuses: [],
    });
  });

  it("keeps context warnings separate from dim status text", () => {
    const statuses = new Map([["rtk", "\x1b[31mrtk on\x1b[0m"]]);
    theme.fg.mockClear();
    FooterView.layout(
      { ...state, contextPercent: 95 },
      null,
      theme,
      120,
      statuses,
    );
    expect(theme.fg).toHaveBeenCalledWith("dim", "rtk on");
    expect(theme.fg).toHaveBeenCalledWith("error", "ctx 95.0%");
  });

  it.each([
    1, 2, 10, 24, 64, 100, 200,
  ])("fits responsive status lines within %s columns", (width) => {
    const colors = {
      fg: (_color: string, text: string) =>
        `\x1b[38;2;108;112;134m${text}\x1b[39m`,
      getThinkingBorderColor:
        (_level: FooterSnapshot["thinkingLevel"]) => (text: string) =>
          colors.fg("thinkingXhigh", text),
    };
    const statuses = new Map([
      ["rtk", "\x1b[32mrtk on\x1b[0m"],
      ["worktrees", "wt 日本語🧪"],
    ]);
    const layout = FooterView.layout(
      { ...state, cwd: "/work/日本語🧪" },
      "分支",
      colors,
      width,
      statuses,
    );
    const lines = [...layout.primary, ...layout.statuses];
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(width);
    }
    expect(lines.join("").match(/rtk on/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it("renders no lines at zero width", () => {
    expect(FooterView.primary(state, null, theme, 0)).toEqual([]);
    expect(FooterView.prompt("text", theme, 0)).toEqual([]);
    expect(
      FooterView.statuses(new Map([["status", "text"]]), theme, 0),
    ).toEqual([]);
  });

  it("sorts and dims every status with dot separators", () => {
    theme.fg.mockClear();
    const statuses = new Map([
      ["worktrees", "\x1b[33mwt always"],
      ["rtk", "rtk on\n"],
      ["notice", "[Processes] running"],
      ["empty", "  "],
      ["ansi", "\x1b[0m"],
    ]);
    const line = FooterView.statuses(statuses, theme, 120)[0];
    expect(line).toBe("[Processes] running · rtk on · wt always");
    expect(theme.fg).toHaveBeenCalledWith(
      "dim",
      "[Processes] running · rtk on · wt always",
    );
  });

  it("omits empty statuses and prompts", () => {
    expect(FooterView.statuses(new Map(), theme, 120)).toEqual([]);
    expect(FooterView.prompt(" \n\t ", theme, 120)).toEqual([]);
  });

  it("keeps multiline prompts on one line", () => {
    expect(FooterView.prompt("First line\n\nNext\tline", theme, 120)).toEqual([
      "last: First line Next line",
    ]);
  });

  it("does not execute terminal sequences from a prompt", () => {
    const text = "\x1b[2J\x1b[31mHello\x1b[0m\x1b]0;title\x07";
    expect(FooterView.prompt(text, theme, 120)).toEqual(["last: Hello"]);
  });

  it("uses new theme colors on the next render", () => {
    const colors = {
      fg: (_color: string, text: string) => `\x1b[31m${text}\x1b[0m`,
      getThinkingBorderColor:
        (_level: FooterSnapshot["thinkingLevel"]) => (text: string) =>
          colors.fg("thinkingXhigh", text),
    };
    const first = FooterView.primary(state, null, colors, 120)[0];
    colors.fg = (_color, text) => `\x1b[32m${text}\x1b[0m`;
    const second = FooterView.primary(state, null, colors, 120)[0];
    expect(first).toContain("\x1b[31m");
    expect(second).toContain("\x1b[32m");
    expect(second).not.toContain("\x1b[31m");
  });
});
