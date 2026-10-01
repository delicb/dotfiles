import assert from "node:assert/strict";
import { beforeEach, afterEach, test } from "node:test";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hostUrl = process.env.PI_TEST_HOST
  ? pathToFileURL(resolve(process.env.PI_TEST_HOST, "dist/index.js")).href
  : import.meta.resolve("@earendil-works/pi-coding-agent");
process.env.FORCE_COLOR = "3";
const host = await import(hostUrl);
const require = createRequire(hostUrl);
const tui = await import(pathToFileURL(require.resolve("@earendil-works/pi-tui")).href);
const { loadExtensions } = await import(
  pathToFileURL(resolve(dirname(fileURLToPath(hostUrl)), "core/extensions/loader.js")).href
);
const loaded = await loadExtensions([resolve(root, "extensions/compact-tools.ts")], root);
assert.deepEqual(loaded.errors, []);
const extension = loaded.extensions[0];
host.initTheme("dark", false);
let nextId = 0;
let temporary;

async function fire(event) {
  const value = typeof event === "string" ? { type: event } : event;
  for (const handler of extension.handlers.get(value.type) ?? []) {
    await handler(value, { mode: "tui", hasUI: true, cwd: root });
  }
}

function tool(name, args = {}, text = "", options = {}) {
  const component = new host.ToolExecutionComponent(
    name,
    `view-${++nextId}`,
    args,
    { showImages: false },
    undefined,
    { requestRender() {} },
    root,
  );
  component.markExecutionStarted();
  component.setArgsComplete();
  component.updateResult(
    {
      content: [{ type: "text", text }],
      details: options.details,
      isError: options.isError ?? false,
    },
    options.partial ?? false,
  );
  component.setExpanded(options.expanded ?? true);
  return component;
}

function output(component, width = 120) {
  return component
    .render(width)
    .map((line) => tui.stripTerminalSequences(line).trimEnd())
    .join("\n");
}

function click(component, x, y, width = 120) {
  return component.handleMouse({
    type: "click",
    button: "left",
    x,
    y,
    screenX: x + 10,
    screenY: y + 20,
    width,
    height: component.render(width).length,
  });
}

function view(component, mode) {
  component.setExpanded(true);
  const row = component
    .render(120)
    .findLastIndex((line) => /Formatted.*Raw/.test(tui.stripTerminalSequences(line)));
  assert.ok(row > 0);
  assert.equal(click(component, mode === "raw" ? 15 : 2, row).handled, true);
}

function viewChild(parent, mode) {
  let row = parent
    .render(120)
    .findIndex((line) => /[├└]─ [▸▾]/.test(tui.stripTerminalSequences(line)));
  assert.ok(row > 0);
  if (tui.stripTerminalSequences(parent.render(120)[row]).includes("▸")) {
    assert.equal(click(parent, 6, row).handled, true);
  }
  assert.equal(click(parent, mode === "raw" ? 21 : 8, row + 1).handled, true);
}

beforeEach(async () => {
  await fire("session_start");
});
afterEach(async () => {
  await fire("session_shutdown");
  if (temporary) {
    await rm(temporary, { recursive: true, force: true });
    temporary = undefined;
  }
});

test("read formats real captured content and separates the continuation notice", async () => {
  temporary = await mkdtemp(resolve(tmpdir(), "compact-view-"));
  const path = resolve(temporary, "config.ts");
  await writeFile(path, "const zero = 0;\nconst one = 1;\nconst two = 2;\nconst three = 3;\n");
  const args = { path, offset: 2, limit: 2 };
  const result = await host.createReadToolDefinition(root).execute("read-view", args);
  const before = structuredClone(result);
  const component = tool("read", args);
  component.updateResult({ ...result, isError: false });
  const text = output(component);
  assert.match(text, /Lines 2-3/);
  assert.match(text, /2 │ const one = 1;/);
  assert.match(text, /3 │ const two = 2;/);
  assert.match(text, /\[2 more lines in file/);
  assert.doesNotMatch(text, /4 │|"offset"|"path"/);
  assert.match(component.render(120).join("\n"), /\x1b\[[\d;]*m/);
  await writeFile(path, "changed after execution");
  component.invalidate();
  assert.doesNotMatch(output(component), /changed after execution/);
  assert.deepEqual(result, before);
});

test("JSON source files stay numbered source, not object fields", () => {
  const component = tool(
    "read",
    { path: "config.json", offset: 8 },
    '{"timeout":3000,"enabled":true}',
  );
  assert.match(output(component), /8 │ \{"timeout":3000,"enabled":true\}/);
  assert.doesNotMatch(output(component), /timeout: 3000/);
});

test("write displays captured content without escaping newlines", async () => {
  temporary = await mkdtemp(resolve(tmpdir(), "compact-view-"));
  const args = { path: resolve(temporary, "new.ts"), content: "const one = 1;\nconst two = 2;" };
  const result = await host.createWriteToolDefinition(root).execute("write-view", args);
  const component = tool("write", args);
  component.updateResult({ ...result, isError: false });
  assert.match(output(component), /1 │ const one = 1;\n2 │ const two = 2;/);
  assert.doesNotMatch(output(component), /"content"|\\n/);
  assert.equal(await readFile(args.path, "utf8"), args.content);
  const failed = tool("write", args, "Permission denied", { isError: true });
  assert.match(output(failed), /Requested content[^]*Error\nPermission denied/);
});

for (const [name, command] of [
  ["bash", "printf '%s\\n' hello"],
  ["powershell", "Write-Output 'hello'"],
]) {
  test(`${name} shows the command and timeout without argument JSON`, () => {
    const component = tool(name, { command, timeout: 10 }, "hello");
    const text = output(component);
    assert.match(text, /Command/);
    assert.ok(text.includes(command));
    assert.match(text, /Timeout: 10 seconds\nOutput\nhello/);
    assert.doesNotMatch(text, /"command"|Arguments/);
  });
}

test("edit errors show requested changes, not an executed diff", () => {
  const component = tool(
    "edit",
    { path: "a.ts", edits: [{ oldText: "before", newText: "after" }] },
    "Text not found",
    { isError: true },
  );
  assert.match(
    output(component),
    /Requested change: 1\nBefore\nbefore\nAfter\nafter\nError\nText not found/,
  );
  assert.doesNotMatch(output(component), /delta|"oldText"/);
});

test("grep groups real matches and distinguishes context lines", async () => {
  temporary = await mkdtemp(resolve(tmpdir(), "compact-view-"));
  await writeFile(resolve(temporary, "a.ts"), "first\nconst timeout = 10;\nlast\n");
  await writeFile(resolve(temporary, "b.ts"), "const timeout = 20;\n");
  const args = { pattern: "timeout", path: temporary, context: 1, glob: "*.ts" };
  const result = await host.createGrepToolDefinition(root).execute("grep-view", args);
  const component = tool("grep", args);
  component.updateResult({ ...result, isError: false });
  const text = output(component);
  assert.match(text, /Pattern: timeout/);
  assert.match(text, /Files: \*\.ts\nContext lines: 1/);
  assert.match(text, /a\.ts\n1 │ first\n2 › const timeout = 10;\n3 │ last/);
  assert.match(text, /b\.ts\n1 › const timeout = 20;/);
});

test("find groups paths without dropping duplicate names or surrounding notices", () => {
  const component = tool(
    "find",
    { path: "src", pattern: "*.ts" },
    "one/a.ts\none/b.ts\ntwo/a.ts\n[limit reached]",
  );
  assert.match(output(component), /one\/\na.ts\nb.ts\ntwo\/\na.ts\n\[limit reached\]/);
  assert.doesNotMatch(output(component), /"pattern"/);
});

test("ls keeps the real directory listing and colors folders", async () => {
  temporary = await mkdtemp(resolve(tmpdir(), "compact-view-"));
  await mkdir(resolve(temporary, "folder"));
  await writeFile(resolve(temporary, "a.txt"), "a");
  const args = { path: temporary };
  const result = await host.createLsToolDefinition(root).execute("ls-view", args);
  const component = tool("ls", args);
  component.updateResult({ ...result, isError: false });
  assert.match(output(component), /Directory:/);
  assert.match(output(component), /a.txt\nfolder\//);
  assert.doesNotMatch(output(component), /permission|bytes/);
});

test("tool_search formats loaded tool names and descriptions", async () => {
  const { createToolSearchToolDefinition } = await import(
    pathToFileURL(resolve(dirname(fileURLToPath(hostUrl)), "extensions/tool-search/tool.js")).href
  );
  const definition = createToolSearchToolDefinition({
    tools: {
      getActiveTools: () => [],
      getAllTools: () => [
        { name: "mcp__example__search", exposure: "deferred", description: "Search issue titles." },
      ],
      setActiveTools() {},
    },
  });
  const result = await definition.execute("search-view", { query: "issue" });
  const component = tool("tool_search", { query: "issue" });
  component.updateResult({ ...result, isError: false });
  assert.match(output(component), /Query: issue/);
  assert.match(output(component), /mcp__example__search\nSearch issue titles\./);
});

test("MCP formats nested objects, lists, nulls, and multiline fields", () => {
  const result = {
    title: "Example",
    owner: { name: "Ada", id: null },
    tags: ["first", "second"],
    note: "line one\nline two",
  };
  const component = tool(
    "mcp__example__get",
    { id: "abc", options: { archived: false } },
    JSON.stringify(result),
  );
  const text = output(component);
  assert.match(text, /id: abc/);
  assert.match(text, /title: Example\nowner\n  name: Ada\n  id: null/);
  assert.match(text, /tags\n  • first\n  • second/);
  assert.match(text, /line one\n.*line two/);
  assert.doesNotMatch(text, /"title"|\\n/);
});

test("JSON number text stays exact in Formatted and Raw views", () => {
  for (const value of [
    "9007199254740993",
    "-9007199254740993",
    "0.123456789012345678901",
    "1e309",
    "-0",
  ]) {
    for (const name of ["mcp__example__get", "codemode"]) {
      const result = `{"id":${value},"nested":[{"value":${value}}]}`;
      const component = tool(name, name === "codemode" ? { code: "text(result)" } : {}, result);
      assert.ok(output(component).includes(result));
      view(component, "raw");
      assert.ok(output(component).includes(result));
      assert.equal(component.result.content[0].text, result);
    }
  }
});

test("safe numbers and quoted numeric text still use structured views", () => {
  const result = {
    id: Number.MAX_SAFE_INTEGER,
    ratio: 0.125,
    label: '9007199254740993 and "id":0.123456789012345678901',
  };
  const text = output(tool("custom", {}, JSON.stringify(result)));
  assert.match(text, /id: 9007199254740991/);
  assert.match(text, /ratio: 0.125/);
  assert.ok(text.includes(`label: ${result.label}`));
});

test("record tables become complete stacked entries on narrow terminals", () => {
  const component = tool(
    "mcp__example__list",
    {},
    '[{"id":1,"title":"One"},{"id":2,"title":"Two"}]',
  );
  assert.match(output(component), /id │ title/);
  const narrow = output(component, 30);
  assert.match(narrow, /Item 1\nid: 1\ntitle: One\nItem 2\nid: 2\ntitle: Two/);
  assert.doesNotMatch(narrow, /─┼─/);
});

test("mixed and multiline records fall back without losing keys or values", () => {
  const component = tool(
    "unknown",
    {},
    JSON.stringify([{ a: "first\nsecond" }, { a: "third", extra: "fourth" }]),
  );
  assert.match(output(component), /first[^]*second[^]*third[^]*extra: fourth/);
});

test("multiline keys use stacked fields and decoded control bytes cannot reach the terminal", () => {
  const result = JSON.stringify([{ "line\nbreak": "first\u009b[2J" }, { "line\nbreak": "second" }]);
  const component = tool("custom", { path: "bad\u009b[2J" }, result);
  assert.match(output(component), /Item 1[^]*line\nbreak: first[^]*Item 2/);
  for (const line of component.render(120)) {
    assert.doesNotMatch(line, /\n|\u009b/);
  }
});

test("partial and failed JSON output stays literal text", () => {
  for (const options of [{ partial: true }, { isError: true }]) {
    const component = tool("unknown", {}, '{"ok":true}', options);
    assert.match(output(component), /\{"ok":true\}/);
    assert.doesNotMatch(output(component), /ok: true/);
  }
  assert.match(output(tool("unknown", {}, '{"partial":')), /\{"partial":/);
});

test("Markdown uses the explicit output format but never renders file source as Markdown", () => {
  const result = "# Heading\n\n**bold**";
  const component = tool("custom", {}, result, { details: { format: "markdown" } });
  assert.match(output(component), /Heading/);
  assert.doesNotMatch(output(component), /\*\*bold\*\*/);
  const source = tool("read", { path: "README.md" }, result, { details: { format: "markdown" } });
  assert.match(output(source), /1 │ # Heading/);
  assert.match(output(source), /3 │ \*\*bold\*\*/);
});

test("raw mode keeps captured arguments and unformatted output through streaming and collapse", async () => {
  const args = { command: "printf hello", timeout: 3 };
  const component = tool("bash", args, "first", { partial: true });
  view(component, "raw");
  assert.match(output(component), /\[Raw\][^]*Arguments[^]*"command": "printf hello"/);
  assert.match(output(component), /Output so far\nfirst/);
  component.updateResult({ content: [{ type: "text", text: "second" }], isError: false });
  component.setExpanded(false);
  assert.equal(component.render(120).length, 1);
  component.setExpanded(true);
  assert.match(output(component), /\[Raw\][^]*Output\nsecond/);
  view(component, "formatted");
  assert.match(output(component), /\[Formatted\][^]*Command\nprintf hello/);
  assert.deepEqual(args, { command: "printf hello", timeout: 3 });
});

test("toolbar selects a view without collapsing the direct tool", () => {
  const component = tool("bash", { command: "true" }, "result");
  assert.equal(click(component, 15, 1).handled, true);
  assert.match(output(component), /\[Raw\]/);
  assert.equal(click(component, 2, 1).handled, true);
  assert.match(output(component), /\[Formatted\]/);
  assert.match(output(component), /Output\nresult/);
});

test("codemode child views keep their own mode and parent expansion state", async () => {
  const parent = tool("codemode", { code: "await tools.read({path:'a.ts'})" }, "summary", {
    expanded: false,
  });
  await fire({
    type: "tool_execution_start",
    toolCallId: `${parent.toolCallId}/read`,
    parentToolCallId: parent.toolCallId,
    toolName: "read",
    args: { path: "a.ts" },
  });
  await fire({
    type: "tool_execution_end",
    toolCallId: `${parent.toolCallId}/read`,
    parentToolCallId: parent.toolCallId,
    toolName: "read",
    result: { content: [{ type: "text", text: "const answer = 42;" }] },
    isError: false,
  });
  viewChild(parent, "raw");
  assert.match(output(parent), /└─ ▾[^]*\[Raw\][^]*"path": "a.ts"/);
  assert.doesNotMatch(output(parent), /Script\n/);
  view(parent, "formatted");
  assert.match(output(parent), /Script[^]*await tools.read/);
  assert.match(output(parent), /\[Raw\]/);
  const toolbar = parent
    .render(120)
    .findIndex((line) => tui.stripTerminalSequences(line).includes("[Raw]"));
  assert.equal(click(parent, 8, toolbar).handled, true);
  assert.doesNotMatch(output(parent), /\[Raw\]/);
  assert.match(output(parent), /1 │ const answer = 42;/);
  assert.match(output(parent), /Script/);
});

test("codemode formats a complete JSON result without changing the script output", () => {
  const result = '[{"name":"first","ok":true},{"name":"second","ok":false}]';
  const component = tool("codemode", { code: "text(await tools.inspect())" }, result);
  assert.match(output(component), /Script[^]*text\(await tools.inspect\(\)\)/);
  assert.match(output(component), /name   │ ok/);
  assert.doesNotMatch(output(component), /"name"/);
  assert.equal(component.result.content[0].text, result);
});

test("raw view survives a preview ID change and later child results", async () => {
  const parent = tool("codemode", { code: "await tools.read({path:'first'})" }, "", {
    expanded: false,
    partial: true,
    details: {
      calls: [{ id: "preview/?", name: "read", args: '{"path":"first"}', status: "running" }],
    },
  });
  viewChild(parent, "raw");
  assert.match(output(parent), /\[Raw\]/);
  const id = `${parent.toolCallId}/1`;
  await fire({
    type: "tool_execution_start",
    parentToolCallId: parent.toolCallId,
    toolCallId: id,
    toolName: "read",
    args: { path: "first" },
  });
  await fire({
    type: "tool_execution_end",
    parentToolCallId: parent.toolCallId,
    toolCallId: id,
    toolName: "read",
    result: { content: [{ type: "text", text: "captured output" }] },
    isError: false,
  });
  parent.updateResult({
    content: [],
    details: { calls: [{ id, name: "read", args: '{"path":"first"}', status: "ok" }] },
    isError: false,
  });
  assert.match(output(parent), /└─ ▾[^]*\[Raw\][^]*captured output/);
  assert.doesNotMatch(output(parent), /Lines 1-/);
});

test("raw codemode output retains Pi's script status header", async () => {
  const parent = tool("codemode", { code: "text('answer')" });
  parent.updateResult({
    content: [
      { type: "text", text: "Script completed\nWall time 0.2 seconds\nOutput:\n" },
      { type: "text", text: "answer" },
    ],
    isError: false,
  });
  assert.doesNotMatch(output(parent), /Script completed/);
  view(parent, "raw");
  assert.match(output(parent), /Script completed\nWall time 0.2 seconds\nOutput:/);
});

test("raw diff mode does not start delta and keeps both replacements and result text", async () => {
  const component = tool(
    "edit",
    { path: "a.ts", edits: [{ oldText: "old", newText: "new" }] },
    "Successfully replaced",
    { expanded: false, details: { diff: "-1 old\n+1 new" } },
  );
  view(component, "raw");
  assert.match(output(component), /"oldText": "old"[^]*"newText": "new"[^]*Successfully replaced/);
  assert.doesNotMatch(output(component), /\nPi\n|delta/);
  view(component, "formatted");
  assert.match(output(component), /\nPi\n/);
  assert.doesNotMatch(output(component), /Successfully replaced|"oldText"/);
});

test("does not register slash commands", () => {
  assert.equal(extension.commands.size, 0);
});

test("deep and large objects bound the formatted view and keep full captured data in Raw", async () => {
  let nested = "final value";
  for (let index = 0; index < 20; index++) nested = { child: nested };
  const component = tool(
    "unknown",
    {},
    JSON.stringify({ nested, values: Array.from({ length: 2500 }, (_, index) => index) }),
  );
  assert.match(output(component), /More fields are available in Raw view/);
  view(component, "raw");
  assert.match(output(component), /final\s+value/);
  assert.match(output(component).replace(/\n/g, ""), /2499/);
});

test("Unicode, control bytes, long fields, and theme changes stay safe at every width", async () => {
  const component = tool(
    "custom",
    { path: "你好/😀", nested: { key: "a\x1b[2J\x00b" } },
    JSON.stringify([
      { name: "你好😀", value: "x".repeat(80) },
      { name: "second", value: "last" },
    ]),
  );
  for (const mode of ["formatted", "raw"]) {
    view(component, mode);
    for (const width of [2, 3, 8, 12, 40, 120]) {
      for (const line of component.render(width)) {
        assert.ok(tui.visibleWidth(line) <= width);
        assert.doesNotMatch(line, /\x1b\[2J|\x00/);
      }
    }
  }
  view(component, "formatted");
  const dark = component.render(120).join("\n");
  host.initTheme("light", false);
  try {
    component.invalidate();
    assert.notEqual(component.render(120).join("\n"), dark);
  } finally {
    host.initTheme("dark", false);
  }
});

test("saved argument previews stay visible when the full arguments are not available", () => {
  for (const name of ["read", "write", "bash", "codemode"]) {
    const component = tool(name, "Arguments exceed the display limit.", "captured output");
    assert.match(output(component), /Arguments exceed the display limit\./);
    assert.match(output(component), /captured output/);
    assert.doesNotMatch(output(component), /Lines 1-/);
  }
});

test("formatted and raw views preserve truncation notices and the full output path", async () => {
  const details = {
    truncation: { truncated: true, outputLines: 2 },
    fullOutputPath: "/tmp/full.txt",
    matchLimitReached: 100,
    linesTruncated: true,
  };
  const component = tool("custom", {}, '[{"id":1},{"id":2}]', { details });
  for (const mode of ["formatted", "raw"]) {
    view(component, mode);
    assert.match(output(component), /Output truncated\./);
    assert.match(output(component), /Match limit: 100/);
    assert.match(output(component), /Some lines are truncated\./);
    assert.match(output(component), /Full output: \/tmp\/full.txt/);
  }
  assert.match(output(component), /Details[^]*"outputLines": 2/);
  assert.deepEqual(component.result.details, details);
});

test("read images and unavailable child output do not receive source line numbers", () => {
  const component = tool("read", { path: "image.png" });
  component.updateResult({
    content: [
      { type: "text", text: "Read image file [image/png]" },
      { type: "image", data: "", mimeType: "image/png" },
    ],
    isError: false,
  });
  assert.match(output(component), /Read image file/);
  assert.doesNotMatch(output(component), /Lines 1-|1 │/);
  const missing = tool("read", { path: "a.ts" }, "Child output was not saved.", {
    details: { compactOutputUnavailable: true },
  });
  assert.match(output(missing), /Child output was not saved/);
  assert.doesNotMatch(output(missing), /Lines 1-|1 │/);
});
