import {
  getLanguageFromPath,
  getMarkdownTheme,
  highlightCode,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  Markdown,
  Text,
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
  type TuiMouseEvent,
} from "@earendil-works/pi-tui";

/** Format captured tool data without reading files or changing results. */
export class ExpandedView implements Component {
  public constructor(private readonly options: ViewOptions) {}

  public render(width: number): string[] {
    if (width < 2) {
      return [];
    }
    if (this.cachedWidth === width) {
      return this.cachedLines;
    }
    const available = width - 1;
    const { theme, raw } = this.options;
    const tabs = `${theme.fg(raw ? "muted" : "accent", raw ? " Formatted " : "[Formatted]")}  ${theme.fg(raw ? "accent" : "muted", raw ? "[Raw]" : " Raw ")}`;
    this.tabWidth = Math.min(visibleWidth(tabs), available);
    const body = raw ? this.raw(available) : this.formatted(available);
    this.cachedWidth = width;
    this.cachedLines = [tabs, ...body, ...this.notices(available)].map((line) =>
      truncateToWidth(line, available),
    );
    return this.cachedLines;
  }

  public handleMouse(event: TuiMouseEvent): { handled: true } | undefined {
    if (
      event.type !== "click" ||
      event.button !== "left" ||
      event.y !== 0 ||
      event.x < 0 ||
      event.x >= this.tabWidth
    ) {
      return undefined;
    }
    if (event.x < 11 || event.x >= 13) {
      this.options.setRaw(event.x >= 13);
    }
    return { handled: true };
  }

  public invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = [];
    this.options.diff?.invalidate();
  }

  private tabWidth = 0;
  private cachedWidth?: number;
  private cachedLines: string[] = [];

  private raw(width: number): string[] {
    const { args, rawOutput, details } = this.options;
    return [
      ...this.section("Arguments", this.code(serialized(args), "json", width), width),
      ...this.section(this.outputTitle(), this.outputText(rawOutput, width), width),
      ...this.section("Details", this.code(serialized(details), "json", width), width),
    ];
  }

  private formatted(width: number): string[] {
    const { name, args: input, output, details, diff, isError } = this.options;
    if (diff) {
      return diff.render(width + 1);
    }
    if (typeof input === "string") {
      return [
        ...this.section("Arguments", this.text(clean(input), width), width),
        ...this.section(this.outputTitle(), this.outputText(output, width), width),
      ];
    }
    const args = object(input);
    const path = string(args.path ?? args.file_path);
    const file = path ? this.field("File", path, width) : [];
    let lines: string[];
    switch (name) {
      case "read": {
        lines = [...file];
        if (isError || object(details).compactOutputUnavailable || this.options.images > 0) {
          lines.push(...this.section(this.outputTitle(), this.outputText(output, width), width));
          return lines;
        }
        const start =
          Number.isSafeInteger(args.offset) && Number(args.offset) > 0 ? Number(args.offset) : 1;
        const captured = readContent(output, args, object(details));
        const count = captured.content ? captured.content.split("\n").length : 0;
        if (count) {
          lines.push(
            ...this.text(
              this.options.theme.fg("muted", `Lines ${start}-${start + count - 1}`),
              width,
            ),
          );
        }
        lines.push(...this.code(captured.content, getLanguageFromPath(path), width, start));
        if (captured.notice) {
          lines.push(...this.text(this.options.theme.fg("warning", captured.notice), width));
        }
        return lines;
      }
      case "write":
        lines = [
          ...file,
          ...this.section(
            isError ? "Requested content" : "Content",
            this.code(string(args.content), getLanguageFromPath(path), width, 1),
            width,
          ),
        ];
        break;
      case "edit": {
        lines = [...file];
        const edits = Array.isArray(args.edits) ? args.edits : [args];
        for (let index = 0; index < edits.length; index++) {
          const edit = object(edits[index]);
          if (typeof edit.oldText === "string" || typeof edit.newText === "string") {
            lines.push(...this.field("Requested change", String(index + 1), width));
            lines.push(
              ...this.section(
                "Before",
                this.code(string(edit.oldText), getLanguageFromPath(path), width),
                width,
              ),
            );
            lines.push(
              ...this.section(
                "After",
                this.code(string(edit.newText), getLanguageFromPath(path), width),
                width,
              ),
            );
          }
        }
        break;
      }
      case "bash":
      case "powershell":
        lines = this.section(
          "Command",
          this.code(string(args.command), name === "bash" ? "bash" : "powershell", width),
          width,
        );
        if (args.timeout != null) {
          lines.push(...this.field("Timeout", `${args.timeout} seconds`, width));
        }
        break;
      case "codemode":
        lines = this.section("Script", this.code(string(args.code), "javascript", width), width);
        return [
          ...lines,
          ...this.section(this.outputTitle(), this.outputValue(output, width), width),
        ];
      case "grep":
        lines = [
          ...this.search(args, width),
          ...this.section(
            this.outputTitle(),
            isError ? this.outputText(output, width) : this.matches(output, width),
            width,
          ),
        ];
        return lines;
      case "find":
        lines = [
          ...this.search(args, width),
          ...this.section(
            this.outputTitle(),
            isError ? this.outputText(output, width) : this.paths(output, width),
            width,
          ),
        ];
        return lines;
      case "ls":
        lines = this.field("Directory", path || ".", width);
        if (args.limit != null) {
          lines.push(...this.field("Limit", String(args.limit), width));
        }
        return [
          ...lines,
          ...this.section(
            this.outputTitle(),
            isError ? this.outputText(output, width) : this.entries(output, width),
            width,
          ),
        ];
      case "tool_search":
        lines = this.field("Query", string(args.query), width);
        if (args.limit != null) {
          lines.push(...this.field("Limit", String(args.limit), width));
        }
        return [...lines, ...this.section(this.outputTitle(), this.tools(output, width), width)];
      default: {
        this.remaining = 2000;
        lines =
          input &&
          typeof input === "object" &&
          !Array.isArray(input) &&
          Object.keys(args).length === 0
            ? []
            : this.section("Arguments", this.value(input, width), width);
        return [
          ...lines,
          ...this.section(this.outputTitle(), this.outputValue(output, width), width),
        ];
      }
    }
    return [...lines, ...this.section(this.outputTitle(), this.outputText(output, width), width)];
  }

  private remaining = 2000;

  private text(text: string, width: number): string[] {
    return text ? new Text(text, 0, 0).render(Math.max(1, width)) : [];
  }

  private outputValue(output: string, width: number): string[] {
    const { isError, isPartial, details } = this.options;
    const parsed = !isError && !isPartial ? parsedObject(output) : undefined;
    if (parsed !== undefined) {
      this.remaining = 2000;
      return this.value(parsed, width);
    }
    if (
      !isError &&
      !isPartial &&
      (object(details).format === "markdown" || object(details).mimeType === "text/markdown")
    ) {
      return new Markdown(clean(output), 0, 0, getMarkdownTheme()).render(width);
    }
    return this.outputText(output, width);
  }

  private outputText(output: string, width: number): string[] {
    return this.text(
      this.options.theme.fg(this.options.isError ? "error" : "toolOutput", output),
      width,
    );
  }

  private section(title: string, body: string[], width: number): string[] {
    return body.length
      ? [
          ...this.text(this.options.theme.fg(title === "Error" ? "error" : "muted", title), width),
          ...body,
        ]
      : [];
  }

  private field(key: string, value: string, width: number): string[] {
    return this.text(`${this.options.theme.fg("muted", `${key}:`)} ${clean(value)}`, width);
  }

  private code(
    input: string,
    language: string | undefined,
    width: number,
    start?: number,
  ): string[] {
    if (!input) {
      return [];
    }
    const text = clean(input);
    const lines = highlightCode(text, language);
    const digits = String((start ?? 1) + lines.length - 1).length;
    if (start === undefined || width < digits + 5) {
      return this.text(lines.join("\n"), width);
    }
    return lines.flatMap((line, index) => {
      const wrapped = wrapTextWithAnsi(line, width - digits - 3);
      return (wrapped.length ? wrapped : [""]).map(
        (part, continuation) =>
          this.options.theme.fg(
            "muted",
            `${continuation ? "".padStart(digits) : String(start + index).padStart(digits)} │ `,
          ) + part,
      );
    });
  }

  private search(args: Record<string, unknown>, width: number): string[] {
    const lines = [
      ...this.field("Pattern", string(args.pattern), width),
      ...this.field("Search", string(args.path) || ".", width),
    ];
    for (const [key, label] of [
      ["glob", "Files"],
      ["literal", "Literal"],
      ["ignoreCase", "Ignore case"],
      ["context", "Context lines"],
      ["limit", "Limit"],
    ]) {
      if (args[key] != null && args[key] !== false && args[key] !== 0 && args[key] !== "") {
        lines.push(...this.field(label, String(args[key]), width));
      }
    }
    return lines;
  }

  private matches(output: string, width: number): string[] {
    const rows = clean(output)
      .split("\n")
      .map((line) => {
        const match = /^(.+?):(\d+): (.*)$/.exec(line) ?? /^(.+?)-(\d+)- (.*)$/.exec(line);
        return match
          ? {
              path: match[1],
              number: match[2],
              text: match[3],
              context: !/^(.+?):(\d+): /.test(line),
            }
          : { text: line };
      });
    const digits = rows.reduce((size, row) => Math.max(size, row.number?.length ?? 0), 1);
    const lines: string[] = [];
    let path: string | undefined;
    for (const row of rows) {
      if (row.path && row.number) {
        if (path !== row.path) {
          path = row.path;
          lines.push(...this.text(this.options.theme.fg("accent", path), width));
        }
        const gutter = `${row.number.padStart(digits)} ${row.context ? "│" : "›"} `;
        if (width <= gutter.length) {
          lines.push(...this.text(`${gutter}${row.text}`, width));
        } else {
          const body = this.options.theme.fg(row.context ? "muted" : "toolOutput", row.text);
          const parts = wrapTextWithAnsi(body, width - gutter.length);
          lines.push(
            ...(parts.length ? parts : [""]).map(
              (part, index) =>
                this.options.theme.fg(
                  row.context ? "muted" : "accent",
                  index ? " ".repeat(gutter.length) : gutter,
                ) + part,
            ),
          );
        }
      } else {
        path = undefined;
        lines.push(...this.text(row.text, width));
      }
    }
    return lines;
  }

  private paths(output: string, width: number): string[] {
    const lines: string[] = [];
    let directory = "";
    for (const path of clean(output).split("\n")) {
      if (!path || path.startsWith("[") || path === "No files found matching pattern") {
        lines.push(...this.text(path, width));
        directory = "";
        continue;
      }
      const slash = path.lastIndexOf("/");
      const group = slash < 0 ? "." : path.slice(0, slash + 1);
      if (group !== directory) {
        directory = group;
        lines.push(...this.text(this.options.theme.fg("accent", directory), width));
      }
      lines.push(...this.text(path.slice(slash + 1), width));
    }
    return lines;
  }

  private entries(output: string, width: number): string[] {
    return clean(output)
      .split("\n")
      .flatMap((entry) =>
        this.text(
          this.options.theme.fg(entry.endsWith("/") ? "accent" : "toolOutput", entry),
          width,
        ),
      );
  }

  private tools(output: string, width: number): string[] {
    return clean(output)
      .split("\n")
      .flatMap((line) => {
        const match = /^- ([^:]+): (.*)$/.exec(line);
        return match
          ? [
              ...this.text(this.options.theme.fg("accent", match[1]), width),
              ...this.text(match[2], width),
            ]
          : this.text(line, width);
      });
  }

  private value(value: unknown, width: number, depth = 0): string[] {
    if (--this.remaining < 0 || depth > 10) {
      return this.text(
        this.options.theme.fg("warning", "More fields are available in Raw view."),
        width,
      );
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return this.text("(empty list)", width);
      }
      const table = this.table(value, width);
      if (table) {
        return table;
      }
      const lines: string[] = [];
      for (let index = 0; index < value.length; index++) {
        const item = value[index];
        if (item !== null && typeof item === "object") {
          lines.push(
            ...this.text(this.options.theme.fg("muted", `Item ${index + 1}`), width),
            ...this.value(item, width, depth + 1),
          );
        } else {
          lines.push(...this.text(`• ${clean(scalar(item))}`, width));
          this.remaining--;
        }
        if (this.remaining <= 0) {
          lines.push(
            ...this.text(
              this.options.theme.fg("warning", "More fields are available in Raw view."),
              width,
            ),
          );
          break;
        }
      }
      return lines;
    }
    if (value !== null && typeof value === "object") {
      const entries = Object.entries(value);
      if (!entries.length) {
        return this.text("(no fields)", width);
      }
      const lines: string[] = [];
      for (const [key, item] of entries) {
        if (
          (item !== null && typeof item === "object") ||
          (typeof item === "string" && item.includes("\n"))
        ) {
          const indent = width > 4 ? 2 : 0;
          lines.push(
            ...this.text(this.options.theme.fg("muted", clean(key)), width),
            ...this.value(item, width - indent, depth + 1).map((line) => " ".repeat(indent) + line),
          );
        } else {
          lines.push(...this.field(clean(key), scalar(item), width));
          this.remaining--;
        }
        if (this.remaining <= 0) {
          lines.push(
            ...this.text(
              this.options.theme.fg("warning", "More fields are available in Raw view."),
              width,
            ),
          );
          break;
        }
      }
      return lines;
    }
    return value === undefined ? [] : this.text(clean(scalar(value)), width);
  }

  private table(items: unknown[], width: number): string[] | undefined {
    if (items.length < 2 || items.length > this.remaining || width < 40) {
      return undefined;
    }
    const rows = items.map(object);
    const keys = Object.keys(rows[0]);
    if (
      keys.length < 1 ||
      keys.length > 6 ||
      keys.some((key) => clean(key).includes("\n")) ||
      !rows.every(
        (row) =>
          Object.keys(row).length === keys.length &&
          keys.every(
            (key) => Object.hasOwn(row, key) && (row[key] === null || typeof row[key] !== "object"),
          ),
      )
    ) {
      return undefined;
    }
    const cells = rows.map((row) => keys.map((key) => clean(scalar(row[key]))));
    if (cells.some((row) => row.some((cell) => cell.includes("\n")))) {
      return undefined;
    }
    const sizes = keys.map((key, index) =>
      Math.max(visibleWidth(clean(key)), ...cells.map((row) => visibleWidth(row[index]))),
    );
    if (sizes.reduce((sum, size) => sum + size, 0) + (keys.length - 1) * 3 > width) {
      return undefined;
    }
    this.remaining -= items.length;
    const row = (cells: string[]): string =>
      cells.map((cell, index) => cell + " ".repeat(sizes[index] - visibleWidth(cell))).join(" │ ");
    return [
      this.options.theme.fg("muted", row(keys.map(clean))),
      this.options.theme.fg("dim", sizes.map((size) => "─".repeat(size)).join("─┼─")),
      ...cells.map(row),
    ];
  }

  private outputTitle(): string {
    return this.options.isError ? "Error" : this.options.isPartial ? "Output so far" : "Output";
  }

  private notices(width: number): string[] {
    const details = object(this.options.details);
    const lines: string[] = [];
    if (object(details.truncation).truncated) {
      lines.push(...this.text(this.options.theme.fg("warning", "Output truncated."), width));
    }
    if (details.matchLimitReached) {
      lines.push(...this.field("Match limit", scalar(details.matchLimitReached), width));
    }
    if (details.linesTruncated) {
      lines.push(
        ...this.text(this.options.theme.fg("warning", "Some lines are truncated."), width),
      );
    }
    if (typeof details.fullOutputPath === "string") {
      lines.push(...this.field("Full output", details.fullOutputPath, width));
    }
    return lines;
  }
}

type ViewOptions = {
  name: string;
  args: unknown;
  output: string;
  rawOutput: string;
  images: number;
  details: unknown;
  isError: boolean;
  isPartial: boolean;
  theme: Theme;
  raw: boolean;
  setRaw: (raw: boolean) => void;
  diff?: Component;
};

function clean(text: string): string {
  return stripTerminalSequences(text)
    .replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "")
    .replace(/\t/g, "  ");
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function scalar(value: unknown): string {
  return value === null ? "null" : String(value);
}

function serialized(value: unknown): string {
  try {
    return clean(JSON.stringify(value, null, 2) ?? "");
  } catch {
    return "Data cannot be shown as JSON.";
  }
}

function parsedObject(text: string): unknown {
  if (text.length > 1024 * 1024 || !/^[\s]*[\[{]/.test(text)) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    for (const match of text.matchAll(/"(?:[^"\\]|\\.)*"|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g)) {
      const number = match[1];
      if (number !== undefined && String(Number(number)) !== number) {
        return undefined;
      }
    }
    return parsed !== null && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readContent(
  output: string,
  args: Record<string, unknown>,
  details: Record<string, unknown>,
): { content: string; notice?: string } {
  const split =
    /\n\n(\[(?:Showing lines \d+-\d+ of \d+[^\n]*|\d+ more lines in file\. Use offset=\d+ to continue\.)\])\n?$/.exec(
      output,
    );
  const count = object(details.truncation).outputLines ?? args.limit;
  if (
    split &&
    Number.isSafeInteger(count) &&
    Number(count) === output.slice(0, split.index).split("\n").length
  ) {
    return { content: output.slice(0, split.index), notice: split[1] };
  }
  if (output.startsWith("[Line ") && object(details.truncation).firstLineExceedsLimit) {
    return { content: "", notice: output };
  }
  return { content: output };
}
