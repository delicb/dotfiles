import { basename } from "node:path";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";

export const FooterView = {
  layout(
    state: FooterSnapshot,
    branch: string | null,
    theme: Pick<Theme, "fg" | "getThinkingBorderColor">,
    width: number,
    statuses: ReadonlyMap<string, string> = emptyStatuses,
  ): FooterLayout {
    if (width <= 0) {
      return { primary: [], statuses: [] };
    }
    const contextText = state.compacting
      ? "compacting"
      : state.contextPercent === null
        ? "ctx ?"
        : `ctx ${state.contextPercent.toFixed(1)}%`;
    const color = state.compacting
      ? "warning"
      : contextColor(state.contextPercent);
    const context = theme.fg(color, contextText);
    const separator = theme.fg("dim", " · ");
    const directory = singleLine(basename(state.cwd) || state.cwd);
    const segments = [
      theme.fg("accent", `✦ ${singleLine(state.modelId)}`),
      theme.getThinkingBorderColor(state.thinkingLevel)(
        `◈ ${state.thinkingLevel}`,
      ),
      theme.fg("mdLink", `⌂ ${directory}`),
    ];
    if (branch) {
      segments.push(theme.fg("syntaxType", `⎇ ${singleLine(branch)}`));
    }
    const left = segments.join(separator);
    const status = statusText(statuses);
    const inline =
      status.length > 0 &&
      visibleWidth(left) +
        2 +
        visibleWidth(status) +
        2 * visibleWidth(separator) +
        visibleWidth(context) <=
        width;
    const right = inline
      ? `${separator}${theme.fg("dim", status)}${separator}${context}`
      : context;
    const statusLines = inline ? [] : renderStatuses(status, theme, width);
    const available = width - visibleWidth(right) - 2;
    if (available < 1) {
      return {
        primary: [truncateToWidth(right, width, "...")],
        statuses: statusLines,
      };
    }
    const clipped = truncateToWidth(left, available, "...");
    const gap = " ".repeat(width - visibleWidth(clipped) - visibleWidth(right));
    return { primary: [`${clipped}${gap}${right}`], statuses: statusLines };
  },

  primary(
    state: FooterSnapshot,
    branch: string | null,
    theme: Pick<Theme, "fg" | "getThinkingBorderColor">,
    width: number,
  ): string[] {
    return FooterView.layout(state, branch, theme, width).primary;
  },

  statuses(
    statuses: ReadonlyMap<string, string>,
    theme: Pick<Theme, "fg">,
    width: number,
  ): string[] {
    return renderStatuses(statusText(statuses), theme, width);
  },

  prompt(text: string, theme: Pick<Theme, "fg">, width: number): string[] {
    const prompt = singleLine(stripTerminalSequences(text));
    if (!prompt || width <= 0) {
      return [];
    }
    return [theme.fg("dim", truncateToWidth(`last: ${prompt}`, width, "..."))];
  },
};

export type FooterSnapshot = {
  cwd: string;
  modelId: string;
  thinkingLevel: Parameters<Theme["getThinkingBorderColor"]>[0];
  contextPercent: number | null;
  contextWindow: number;
  compacting: boolean;
  prompt: string;
};

export type FooterLayout = {
  primary: string[];
  statuses: string[];
};

const emptyStatuses: ReadonlyMap<string, string> = new Map();

function statusText(statuses: ReadonlyMap<string, string>): string {
  return Array.from(statuses.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => singleLine(stripTerminalSequences(value)))
    .filter((value) => visibleWidth(value) > 0)
    .join(" · ");
}

function renderStatuses(
  text: string,
  theme: Pick<Theme, "fg">,
  width: number,
): string[] {
  if (!text || width <= 0) {
    return [];
  }
  return [theme.fg("dim", truncateToWidth(text, width, "..."))];
}

function contextColor(percent: number | null): "dim" | "warning" | "error" {
  if (percent !== null && percent > 90) {
    return "error";
  }
  if (percent !== null && percent > 70) {
    return "warning";
  }
  return "dim";
}

function singleLine(text: string): string {
  return text
    .replace(/[\r\n\t]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}
