import {
  ToolExecutionComponent,
  renderDiff,
  truncateToVisualLines,
  type ExtensionAPI,
  type ExtensionContext,
  type ToolExecutionStartEvent,
  type ToolExecutionUpdateEvent,
  type ToolExecutionEndEvent,
  type Theme,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth,
  type Component,
} from "@earendil-works/pi-tui";

import { DeltaRenderer } from "./DeltaRenderer";
import { NestedCalls, type ChildCall } from "./NestedCalls";
import { ToolTree } from "./ToolTree";
import { ExpandedView } from "./ExpandedView";

/** Change tool presentation without changing execution. */
export default function compactTools(pi: ExtensionAPI): void {
  let restore: (() => Promise<void>) | undefined;
  let calls: NestedCalls | undefined;

  const observe = (
    event: ToolExecutionStartEvent | ToolExecutionUpdateEvent | ToolExecutionEndEvent,
    ctx: ExtensionContext,
  ): void => {
    if (ctx.mode === "tui") {
      calls?.observe(event);
    }
  };
  pi.on("tool_execution_start", observe);
  pi.on("tool_execution_update", observe);
  pi.on("tool_execution_end", observe);
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode === "tui" && !restore) {
      const delta = new DeltaRenderer(pi.exec.bind(pi));
      calls = new NestedCalls();
      const reset = installRenderers(delta, calls);
      restore = async () => {
        reset();
        calls?.clear();
        calls = undefined;
        await delta.dispose();
      };
    }
  });
  pi.on("session_shutdown", async () => {
    await restore?.();
    restore = undefined;
  });
}

type CallRenderer = NonNullable<ToolDefinition["renderCall"]>;
type ResultRenderer = NonNullable<ToolDefinition["renderResult"]>;
type RenderContext = Parameters<CallRenderer>[2];
type ToolResult = {
  content: Array<{ type: string; text?: string }>;
  details?: unknown;
};
type ToolHost = RendererMethods & {
  toolName: string;
  ui: ConstructorParameters<typeof ToolExecutionComponent>[5];
  invalidate: () => void;
  treeImagesAllowed?: () => boolean;
  compactRaw?: boolean;
  toolDefinition?: { label?: string };
  result?: ToolResult;
};
type RendererMethods = {
  getCallRenderer: (this: ToolHost) => CallRenderer | undefined;
  getResultRenderer: (this: ToolHost) => ResultRenderer | undefined;
  hasRendererDefinition: (this: ToolHost) => boolean;
  getRenderShell: (this: ToolHost) => "default" | "self";
  render: (this: ToolHost, width: number) => string[];
  handleMouse: (
    this: ToolHost,
    event: Parameters<ToolExecutionComponent["handleMouse"]>[0],
  ) => ReturnType<ToolExecutionComponent["handleMouse"]>;
};
type NestedCall = {
  id?: string;
  name: string;
  args: string;
  status: string;
  error: string;
  durationMs?: number;
  cost?: number;
};

type DiffFile = { path: string; lines: string[]; patch?: string };
type DiffPart = string | DiffFile;
type TextOptions = { preserveTabs?: boolean };

const CHANGE_LINE = /^([+-])\s*\d+ /;
const PATCH = Symbol.for("del-boy.compact-tools.renderers");
const EMPTY: Component = { render: () => [], invalidate: () => {} };

// Pi has no renderer-only registration API for all tools. Keep this patch limited to presentation.
function installRenderers(delta: DeltaRenderer, calls: NestedCalls): () => void {
  const trees = new WeakMap<ToolHost, ToolTree>();
  const prototype = ToolExecutionComponent.prototype as unknown as RendererMethods & {
    [PATCH]?: RendererMethods;
  };
  if (prototype[PATCH]) {
    return () => {};
  }
  const original: RendererMethods = {
    getCallRenderer: prototype.getCallRenderer,
    getResultRenderer: prototype.getResultRenderer,
    hasRendererDefinition: prototype.hasRendererDefinition,
    getRenderShell: prototype.getRenderShell,
    render: prototype.render,
    handleMouse: prototype.handleMouse,
  };
  if (Object.values(original).some((method) => typeof method !== "function")) {
    throw new Error("Compact tools cannot find Pi's tool renderer methods. Check the Pi version.");
  }

  prototype.hasRendererDefinition = () => true;
  prototype.getRenderShell = () => "self";
  prototype.getCallRenderer = function () {
    return (args, theme, context) => {
      let tree = trees.get(this);
      if (!tree) {
        tree = new ToolTree(context.toolCallId, calls, this.ui, context.cwd);
        trees.set(this, tree);
        calls.subscribe(this.ui);
      }
      const metadata =
        this.toolName === "codemode"
          ? nestedCalls(this.result?.details).map((call, index): ChildCall => ({
              ...call,
              id:
                call.id && !call.id.endsWith("/?")
                  ? call.id
                  : `${context.toolCallId}/preview/${index}`,
              args: parseArguments(call.args),
              revision: 0,
              startedAt: 0,
            }))
          : [];
      tree.update(metadata, theme, this.treeImagesAllowed?.() ?? context.showImages);
      const component = new Container();
      let header: Component | undefined;
      let stamp = "";
      component.addChild({
        render: (width) => {
          const observed = calls.get(context.toolCallId);
          const revision = observed.map((call) => `${call.id}:${call.revision}`).join(";");
          if (!header || stamp !== revision) {
            header = renderHeader(this, args, theme, context, observed);
            stamp = revision;
          }
          return header.render(width);
        },
        invalidate: () => {
          header = undefined;
        },
      });
      component.addChild(tree);
      return component;
    };
  };
  prototype.getResultRenderer = function () {
    return (result, options, theme, context) => {
      if (!options.expanded) {
        return EMPTY;
      }
      return renderDetails(
        this.toolName,
        result,
        theme,
        context,
        delta,
        this.compactRaw ?? false,
        (raw) => {
          this.compactRaw = raw;
          context.invalidate();
        },
      );
    };
  };
  prototype.render = function (width) {
    const lines = original.render.call(this, width);
    return lines[0] === "" ? lines.slice(1) : lines;
  };
  prototype.handleMouse = function (event) {
    const response = trees.get(this)?.handleMouse({ ...event, y: event.y - 1 });
    if (response?.handled) {
      return response;
    }
    // Pi's mouse handling still counts the removed blank row.
    return original.handleMouse.call(this, { ...event, y: event.y + 1 });
  };
  prototype[PATCH] = original;

  return () => {
    if (prototype[PATCH] === original) {
      Object.assign(prototype, original);
      delete prototype[PATCH];
    }
  };
}

function renderHeader(
  host: ToolHost,
  args: unknown,
  theme: Theme,
  context: RenderContext,
  observed: readonly ChildCall[],
): Component {
  const status = context.isError
    ? "failed"
    : context.isPartial
      ? context.executionStarted
        ? "running"
        : "pending"
      : "done";
  const color = context.isError ? "error" : context.isPartial ? "warning" : "success";
  const label = host.toolName.startsWith("mcp__")
    ? host.toolName.slice(5).replaceAll("__", "/")
    : host.toolDefinition?.label || host.toolName;
  const argument = summarizeArguments(host.toolName, args);
  const result = host.result;
  const diff = toolDiff(host.toolName, result, context);
  const calls = host.toolName === "codemode" ? nestedCalls(result?.details) : [];
  const summary: string[] = [];
  const counted = host.toolName === "codemode" && calls.length === 0 ? observed : calls;
  if (counted.length > 0) {
    summary.push(`${counted.length} call${counted.length === 1 ? "" : "s"}`);
    const failed = counted.filter(
      (call) => call.status === "error" || call.status === "cancelled",
    ).length;
    if (failed > 0) {
      summary.push(`${failed} failed`);
    }
  }
  if (context.isError) {
    const first = resultText(result, host.toolName)
      .split("\n")
      .find((line) => line.trim());
    if (first) {
      summary.push(oneLine(first));
    }
  } else if (diff) {
    const stats = diffStats(diff);
    if (host.toolName !== "edit") {
      summary.push(`${stats.files} file${stats.files === 1 ? "" : "s"}`);
    }
    summary.push(
      `${theme.fg("toolDiffAdded", `+${stats.added}`)} ${theme.fg("toolDiffRemoved", `-${stats.removed}`)}`,
    );
  } else if (record(result?.details).compactOutputUnavailable) {
    summary.push("output unavailable");
  } else if (result && !context.isPartial) {
    const text = resultText(result, host.toolName);
    if (text) {
      const count = text.trimEnd().split("\n").length;
      summary.push(`${count} line${count === 1 ? "" : "s"}`);
    }
  }
  const images = result?.content.filter((block) => block.type === "image").length ?? 0;
  if (images > 0) {
    summary.push(`${images} image${images === 1 ? "" : "s"}`);
  }
  const details = record(result?.details);
  if (record(details.truncation).truncated || details.fullOutputPath) {
    summary.push("truncated");
  }
  if (diff) {
    const title = `${theme.fg("success", "✓")} ${theme.fg("toolTitle", theme.bold(oneLine(label)))}`;
    const suffix = theme.fg("muted", ` · ${summary.join(" · ")}`);
    return new CompactLines((width) => {
      const available = width - 2 - visibleWidth(title) - visibleWidth(suffix);
      const main =
        argument && available > 0
          ? ` ${theme.fg("accent", truncateToWidth(argument, available))}`
          : "";
      return `${title}${main}${suffix}`;
    }, 1);
  }
  let text = `${theme.fg(color, "●")} ${theme.fg("toolTitle", theme.bold(oneLine(label)))} ${theme.fg(color, status)}`;
  if (argument) {
    text += ` ${theme.fg("accent", argument)}`;
  }
  if (summary.length > 0) {
    text += theme.fg(context.isError ? "error" : "muted", ` · ${summary.join(" · ")}`);
  }
  return new CompactLines(text, 1);
}

function renderDetails(
  name: string,
  result: ToolResult,
  theme: Theme,
  context: RenderContext,
  delta: DeltaRenderer,
  raw: boolean,
  setRaw: (raw: boolean) => void,
): Component {
  const args = record(context.args);
  let diffView: Component | undefined;
  const diff = toolDiff(name, result, context);
  if (diff) {
    const files = diff.filter((part): part is DiffFile => typeof part !== "string");
    const patch = files.every((file) => file.patch !== undefined)
      ? diff
          .map((part) => (typeof part === "string" ? `${cleanText(part)}\n` : part.patch))
          .join("")
      : undefined;
    diffView = new CompactLines((width) => {
      const formatted =
        patch === undefined
          ? undefined
          : delta.get(patch, {
              width: width - 1,
              appearance: theme.appearance,
              toolCallId: context.toolCallId,
              invalidate: context.invalidate,
            });
      const renderer = formatted
        ? `delta · ${DeltaRenderer.isSideBySide(width - 1) ? "side by side" : "single column"}`
        : "Pi";
      const header = [theme.fg("muted", renderer)];
      if (name !== "edit" && typeof args.command === "string") {
        header.push(theme.fg("muted", "Command"), cleanText(args.command));
      }
      const lines = new CompactLines(header.join("\n")).render(width);
      if (formatted) {
        return [...lines, ...formatted.replace(/^\n+|\n+$/g, "").split("\n")];
      }
      const parts: string[] = [];
      for (const part of diff) {
        if (typeof part === "string") {
          parts.push(theme.fg("toolOutput", cleanText(part)));
        } else {
          parts.push(theme.fg("accent", oneLine(part.path)), renderDiff(compactDiff(part.lines)));
        }
      }
      return [...lines, ...new CompactLines(parts.join("\n")).render(width)];
    });
  }
  return new ExpandedView({
    name,
    args: context.args,
    output: resultText(result, name),
    rawOutput: resultText(result, ""),
    images: result.content.filter((block) => block.type === "image").length,
    details: result.details,
    isError: context.isError,
    isPartial: context.isPartial,
    theme,
    raw,
    setRaw,
    diff: diffView,
  });
}

class CompactLines implements Component {
  public constructor(text: string | ((width: number) => string | string[]), maxLines?: number) {
    this.text = text;
    this.maxLines = maxLines;
  }

  public render(width: number): string[] {
    if (width < 2 || !this.text) {
      return [];
    }
    if (this.cachedWidth === width) {
      return this.cachedLines;
    }
    this.cachedWidth = width;
    const text = typeof this.text === "string" ? this.text : this.text(width);
    if (Array.isArray(text)) {
      this.cachedLines = text.map((line) => truncateToWidth(line, width - 1));
    } else if (this.maxLines === 1) {
      this.cachedLines = [truncateToWidth(text, width - 1)];
    } else {
      this.cachedLines = truncateToVisualLines(
        text,
        Number.MAX_SAFE_INTEGER,
        width - 1,
        0,
        "start",
      ).visualLines;
    }
    return this.cachedLines;
  }

  public invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = [];
  }

  private readonly text: string | ((width: number) => string | string[]);
  private readonly maxLines: number | undefined;
  private cachedWidth?: number;
  private cachedLines: string[] = [];
}

function summarizeArguments(name: string, input: unknown): string {
  if (name === "codemode") {
    return "";
  }
  if (typeof input === "string") {
    return oneLine(input);
  }
  const args = record(input);
  const values: string[] = [];
  if (typeof args.action === "string") {
    values.push(args.action);
  }
  for (const key of [
    "command",
    "query",
    "pattern",
    "path",
    "file_path",
    "url",
    "name",
    "subject",
    "description",
    "prompt",
    "id",
  ]) {
    const value = args[key];
    if (typeof value === "string" && value) {
      values.push(value);
      break;
    }
  }
  if (values.length === 0) {
    for (const key of ["queries", "urls", "paths"]) {
      const values = args[key];
      if (Array.isArray(values) && typeof values[0] === "string") {
        return oneLine(`${values[0]}${values.length > 1 ? ` (+${values.length - 1})` : ""}`);
      }
    }
  }
  if (name === "read" && args.offset !== undefined) {
    values.push(`offset=${args.offset}`);
  }
  return oneLine(values.join(" "));
}

function resultText(
  result: ToolResult | undefined,
  name: string,
  options: TextOptions = {},
): string {
  const content = result?.content ?? [];
  const first = content[0];
  const hasScriptHeader =
    name === "codemode" &&
    first?.type === "text" &&
    /^Script (completed|failed)\nWall time [\d.]+ seconds\nOutput:\n$/.test(first.text ?? "");
  const output = hasScriptHeader ? content.slice(1) : content;
  return cleanText(
    output
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n"),
    options,
  );
}

function cleanText(text: string, options: TextOptions = {}): string {
  const cleaned = stripTerminalSequences(text)
    .replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "");
  return options.preserveTabs ? cleaned : cleaned.replace(/\t/g, "  ");
}

function toolDiff(
  name: string,
  result: ToolResult | undefined,
  context: RenderContext,
): DiffPart[] | undefined {
  const details = record(result?.details);
  if (
    !result ||
    context.isError ||
    context.isPartial ||
    record(details.truncation).truncated ||
    details.fullOutputPath
  ) {
    return undefined;
  }
  let parts: DiffPart[] | undefined;
  if (name === "edit") {
    if (typeof details.patch === "string") {
      parts = parseUnifiedDiff(cleanText(details.patch, { preserveTabs: true }));
    }
    if (!parts && typeof details.diff === "string") {
      const args = record(context.args);
      const path = typeof args.path === "string" ? args.path : "Diff";
      parts = [{ path, lines: cleanText(details.diff).split("\n") }];
    }
  } else if (name === "bash" || name === "powershell") {
    parts = parseUnifiedDiff(resultText(result, name, { preserveTabs: true }));
  }
  return parts?.some(
    (part) => typeof part !== "string" && part.lines.some((line) => CHANGE_LINE.test(line)),
  )
    ? parts
    : undefined;
}

function diffStats(parts: DiffPart[]): { files: number; added: number; removed: number } {
  const paths = new Set<string>();
  let added = 0;
  let removed = 0;
  for (const part of parts) {
    if (typeof part === "string") {
      continue;
    }
    paths.add(part.path);
    for (const line of part.lines) {
      const change = CHANGE_LINE.exec(line)?.[1];
      added += change === "+" ? 1 : 0;
      removed += change === "-" ? 1 : 0;
    }
  }
  return { files: paths.size, added, removed };
}

function compactDiff(lines: string[]): string {
  const numberWidth = lines.reduce(
    (width, line) => Math.max(width, /^[-+ ]\s*(\d+) /.exec(line)?.[1].length ?? 0),
    0,
  );
  const shown = new Set<number>();
  for (let index = 0; index < lines.length; index++) {
    if (CHANGE_LINE.test(lines[index])) {
      for (
        let near = Math.max(0, index - 2);
        near <= Math.min(lines.length - 1, index + 2);
        near++
      ) {
        shown.add(near);
      }
    }
  }
  return lines
    .flatMap((line, index) => {
      if (shown.has(index)) {
        return [
          line.replace(
            /^([-+ ])\s*(\d+) /,
            (_match: string, prefix: string, number: string) =>
              `${prefix}${number.padStart(numberWidth)} `,
          ),
        ];
      }
      return index === 0 || shown.has(index - 1) ? [" ..."] : [];
    })
    .join("\n");
}

function parseUnifiedDiff(text: string): DiffPart[] | undefined {
  const lines = text.split("\n");
  const parts: DiffPart[] = [];
  let cursor = 0;
  let index = 0;
  while (index < lines.length) {
    if (
      !lines[index].startsWith("--- ") ||
      !lines[index + 1]?.startsWith("+++ ") ||
      !lines[index + 2]?.startsWith("@@ ")
    ) {
      index++;
      continue;
    }
    const header = index;
    const oldPath = diffPath(lines[index]);
    const newPath = diffPath(lines[index + 1]);
    const path = newPath === "/dev/null" ? oldPath : newPath;
    const gitPaths =
      (oldPath.startsWith("a/") && newPath.startsWith("b/")) ||
      oldPath === "/dev/null" ||
      newPath === "/dev/null";
    const file: DiffFile = { path: gitPaths ? path.replace(/^[ab]\//, "") : path, lines: [] };
    index += 2;
    while (lines[index]?.startsWith("@@ ")) {
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/.exec(lines[index]);
      if (!match) {
        return undefined;
      }
      let oldNumber = Number(match[1]);
      let oldLeft = Number(match[2] ?? 1);
      let newNumber = Number(match[3]);
      let newLeft = Number(match[4] ?? 1);
      if (![oldNumber, oldLeft, newNumber, newLeft].every(Number.isSafeInteger)) {
        return undefined;
      }
      if (file.lines.length > 0) {
        file.lines.push(" ...");
      }
      index++;
      while (oldLeft > 0 || newLeft > 0) {
        const line = lines[index++];
        const prefix = line?.[0];
        if (line === "\\ No newline at end of file" && file.lines.length > 0) {
          file.lines.push(line);
        } else if (prefix === " " && oldLeft > 0 && newLeft > 0) {
          file.lines.push(` ${oldNumber++} ${line.slice(1)}`);
          newNumber++;
          oldLeft--;
          newLeft--;
        } else if (prefix === "-" && oldLeft > 0) {
          file.lines.push(`-${oldNumber++} ${line.slice(1)}`);
          oldLeft--;
        } else if (prefix === "+" && newLeft > 0) {
          file.lines.push(`+${newNumber++} ${line.slice(1)}`);
          newLeft--;
        } else {
          return undefined;
        }
      }
      if (lines[index] === "\\ No newline at end of file") {
        file.lines.push(lines[index++]);
      }
      const next = lines[index] ?? "";
      if (
        /^[+ -]/.test(next) &&
        !(next.startsWith("--- ") && lines[index + 1]?.startsWith("+++ "))
      ) {
        return undefined;
      }
    }
    // Delta needs Git headers to keep separate files in order.
    const separator = `diff --git ${JSON.stringify(`a/${file.path}`)} ${JSON.stringify(`b/${file.path}`)}\n`;
    file.patch = separator + lines.slice(header, index).join("\n") + "\n";
    if (!file.lines.some((line) => CHANGE_LINE.test(line))) {
      return undefined;
    }
    let prefixEnd = header;
    while (
      prefixEnd > cursor &&
      /^(?:index [\da-f]+\.\.[\da-f]+(?: \d+)?|(?:new file|deleted file) mode \d+|=+)$/.test(
        lines[prefixEnd - 1],
      )
    ) {
      prefixEnd--;
    }
    if (prefixEnd > cursor && /^(?:diff --git |Index: )/.test(lines[prefixEnd - 1])) {
      prefixEnd--;
    }
    const before = lines.slice(cursor, prefixEnd).join("\n").trimEnd();
    if (before) {
      parts.push(before);
    }
    parts.push(file);
    cursor = index;
  }
  const after = lines.slice(cursor).join("\n").trimEnd();
  if (after) {
    parts.push(after);
  }
  // Do not report partial file counts for unsupported patch sections.
  if (
    parts.some(
      (part) =>
        typeof part === "string" &&
        /^(?:diff --(?:git|cc|combined) |@@@|Binary files |GIT binary patch|Only in )/m.test(part),
    )
  ) {
    return undefined;
  }
  return parts.some((part) => typeof part !== "string") ? parts : undefined;
}

function diffPath(header: string): string {
  return header
    .slice(4)
    .split("\t")[0]
    .replace(/^"(.*)"$/, "$1");
}

function oneLine(text: string): string {
  return cleanText(text).replace(/\s+/g, " ").trim().slice(0, 200);
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseArguments(args: string): unknown {
  try {
    return JSON.parse(args);
  } catch {
    return args;
  }
}

function nestedCalls(details: unknown): NestedCall[] {
  const calls = record(details).calls;
  if (!Array.isArray(calls)) {
    return [];
  }
  return calls.flatMap((value) => {
    const call = record(value);
    if (typeof call.name !== "string") {
      return [];
    }
    return [
      {
        id: typeof call.id === "string" ? call.id : undefined,
        name: call.name,
        args: typeof call.args === "string" ? call.args : "",
        status: typeof call.status === "string" ? call.status : "unknown",
        error: typeof call.error === "string" ? call.error : "",
        durationMs: typeof call.durationMs === "number" ? call.durationMs : undefined,
        cost: typeof call.cost === "number" ? call.cost : undefined,
      },
    ];
  });
}
