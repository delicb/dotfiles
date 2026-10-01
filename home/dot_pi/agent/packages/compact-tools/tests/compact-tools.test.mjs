import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hostUrl = process.env.PI_TEST_HOST
  ? pathToFileURL(resolve(process.env.PI_TEST_HOST, "dist/index.js")).href
  : import.meta.resolve("@earendil-works/pi-coding-agent");
const hostRoot = resolve(dirname(fileURLToPath(hostUrl)), "..");
process.env.FORCE_COLOR = "3";
const host = await import(hostUrl);
const require = createRequire(hostUrl);
const tui = await import(pathToFileURL(require.resolve("@earendil-works/pi-tui")).href);
const { loadExtensions } = await import(
  pathToFileURL(resolve(hostRoot, "dist/core/extensions/loader.js")).href
);
const { execCommand } = await import(pathToFileURL(resolve(hostRoot, "dist/core/exec.js")).href);
const deltaProbe = await execCommand("delta", ["--version"], root, { timeout: 1000 });
const methods = [
  "hasRendererDefinition",
  "getRenderShell",
  "getCallRenderer",
  "getResultRenderer",
  "render",
  "handleMouse",
];
const prototype = host.ToolExecutionComponent.prototype;
const originals = Object.fromEntries(methods.map((name) => [name, prototype[name]]));
const loaded = await loadExtensions([resolve(root, "extensions/compact-tools.ts")], root);
assert.deepEqual(loaded.errors, []);
assert.equal(loaded.extensions.length, 1);
const extension = loaded.extensions[0];
host.initTheme("dark", false);

async function fire(event, mode = "tui") {
  const value = typeof event === "string" ? { type: event } : event;
  for (const handler of extension.handlers.get(value.type) ?? []) {
    await handler(value, { mode, hasUI: mode === "tui", cwd: root });
  }
}

async function child(parent, name, args, text, options = {}) {
  const id = options.id ?? `${parent.toolCallId}/${name}`;
  await fire({
    type: "tool_execution_start",
    toolCallId: id,
    parentToolCallId: parent.toolCallId,
    toolName: name,
    args,
  });
  if (text !== undefined) {
    await fire({
      type: "tool_execution_end",
      toolCallId: id,
      parentToolCallId: parent.toolCallId,
      toolName: name,
      result: { content: [{ type: "text", text }], details: options.details },
      isError: options.isError ?? false,
    });
  }
  return id;
}

function click(component, y, width = 120) {
  const height = component.render(width).length;
  return component.handleMouse({
    type: "click",
    button: "left",
    x: 0,
    y,
    screenX: 0,
    screenY: y,
    width,
    height,
  });
}

let nextToolId = 0;

function tool(name, args = {}, definition, ui = { requestRender() {} }) {
  return new host.ToolExecutionComponent(
    name,
    `call-${name}-${++nextToolId}`,
    args,
    { showImages: false },
    definition,
    ui,
    root,
  );
}

function output(component, width = 120) {
  return component
    .render(width)
    .map((line) => tui.stripTerminalSequences(line).trimEnd())
    .filter((line) => line.trim())
    .join("\n");
}

async function deltaOutput(component, width = 120) {
  const ready = new Promise((resolve) => {
    component.ui = { requestRender: resolve };
  });
  assert.match(output(component, width), /\nPi\n/);
  await ready;
  return output(component, width);
}

function finish(component, text, options = {}) {
  const { details, isError = false, isPartial = false } = options;
  component.markExecutionStarted();
  component.setArgsComplete();
  component.updateResult({ content: [{ type: "text", text }], details, isError }, isPartial);
}

beforeEach(async () => {
  await fire("session_start");
});
afterEach(async () => {
  await fire("session_shutdown");
});

test("loads display observers without registering or wrapping tools", () => {
  assert.equal(extension.tools.size, 0);
  assert.equal(extension.commands.size, 0);
  assert.deepEqual([...extension.handlers.keys()].sort(), [
    "session_shutdown",
    "session_start",
    "tool_execution_end",
    "tool_execution_start",
    "tool_execution_update",
  ]);
});

for (const [name, args] of [
  ["read", { path: "src/index.ts", offset: 20 }],
  ["bash", { command: "printf hello" }],
  ["powershell", { command: "Write-Output hello" }],
  ["edit", { path: "src/index.ts", oldText: "a", newText: "b" }],
  ["write", { path: "src/index.ts", content: "hello" }],
  ["grep", { pattern: "hello", path: "src" }],
  ["find", { pattern: "*.ts" }],
  ["ls", { path: "src" }],
  ["mcp__example__search", { query: "hello" }],
  ["process", { action: "start", name: "checks", command: "npm test" }],
  ["web_search", { queries: ["first query", "second query"] }],
  ["new_tool", { ticketId: 123 }],
]) {
  test(`${name} has one compact row and expandable output`, () => {
    const component = tool(name, args);
    finish(component, "line one\nline two");
    const collapsed = output(component);
    assert.equal(collapsed.split("\n").length, 1);
    assert.match(collapsed, /done/);
    assert.match(collapsed, /2 lines/);
    assert.doesNotMatch(collapsed, /line one/);
    component.setExpanded(true);
    const expanded = output(component);
    assert.match(expanded, /\[Formatted\]/);
    assert.match(expanded, /line one/);
    assert.match(expanded, /line two/);
  });
}

test("keeps execution, schemas, and structured output unchanged", () => {
  const definition = host.createBashToolDefinition(root);
  const before = {
    execute: definition.execute,
    parameters: definition.parameters,
    outputSchema: definition.outputSchema,
    prepareLoadout: definition.prepareLoadout,
  };
  const component = tool("bash", { command: "true" }, definition);
  finish(component, "hello");
  for (const [key, value] of Object.entries(before)) {
    assert.equal(definition[key], value);
  }
});

test("replaces existing custom renderers without calling them", () => {
  const definition = {
    label: "Custom tool",
    renderCall() {
      throw new Error("Custom call renderer must not run");
    },
    renderResult() {
      throw new Error("Custom result renderer must not run");
    },
    renderShell: "default",
  };
  const component = tool("custom_tool", { action: "inspect" }, definition);
  finish(component, "result");
  assert.match(output(component), /Custom tool done inspect/);
  component.setExpanded(true);
  assert.match(output(component), /result/);
});

test("shows pending and running status without streaming output while collapsed", () => {
  const component = tool("bash", { command: "slow command" });
  assert.match(output(component), /pending/);
  finish(component, "partial output", { isPartial: true });
  assert.match(output(component), /running/);
  assert.doesNotMatch(output(component), /partial output/);
  component.setExpanded(true);
  assert.match(output(component), /Output so far/);
  assert.match(output(component), /partial output/);
  component.setExpanded(false);
  component.updateResult({ content: [{ type: "text", text: "final output" }], isError: false });
  assert.match(output(component), /done/);
  assert.doesNotMatch(output(component), /final output/);
});

test("shows failures, including errors with missing details", () => {
  const component = tool("bash", { command: "false" });
  finish(component, "Command failed with exit code 1", { isError: true });
  assert.match(output(component), /failed/);
  assert.match(output(component), /exit code 1/);
});

test("renders actual edit metadata without changing execution or results", async () => {
  let content = 'const mode = "old";\n';
  let writes = 0;
  const definition = host.createEditToolDefinition(root, {
    operations: {
      access: async () => {},
      readFile: async () => Buffer.from(content),
      writeFile: async (_path, text) => {
        content = text;
        writes++;
      },
    },
  });
  const args = { path: "demo.ts", edits: [{ oldText: '"old"', newText: '"new"' }] };
  const result = await definition.execute("edit-test", args);
  const before = structuredClone(result);
  const component = tool("edit", args, definition);
  component.markExecutionStarted();
  component.setArgsComplete();
  component.updateResult(result);
  assert.match(output(component), /✓ edit demo\.ts · \+1 -1/);
  assert.doesNotMatch(output(component), /done|1 line/);
  component.setExpanded(true);
  const expanded = output(component);
  assert.match(expanded, /-1 const mode = "old";/);
  assert.match(expanded, /\+1 const mode = "new";/);
  assert.doesNotMatch(expanded, /Arguments|oldText|Successfully replaced/);
  const styled = component.render(120).join("\n");
  for (const line of host.renderDiff(result.details.diff).split("\n")) {
    assert.ok(styled.includes(line));
  }
  assert.match(styled, /\u001b\[7m/);
  assert.deepEqual(result, before);
  assert.equal(content, 'const mode = "new";\n');
  assert.equal(writes, 1);
});

test("shows two context lines around each edit and folds the rest", () => {
  const before = Array.from({ length: 35 }, (_, i) => `context ${i + 1}`).join("\n") + "\n";
  const after = before
    .replace("context 11\n", "changed 11\n")
    .replace("context 25\n", "changed 25\n");
  const component = tool("edit", { path: "demo.txt", edits: [] });
  finish(component, "success", { details: host.generateDiffString(before, after) });
  assert.match(output(component), /\+2 -2/);
  component.setExpanded(true);
  const expanded = output(component);
  for (const number of [9, 10, 12, 13, 23, 24, 26, 27]) {
    assert.match(expanded, new RegExp(`context ${number}(?:\\n|$)`));
  }
  for (const number of [8, 14, 22, 28]) {
    assert.doesNotMatch(expanded, new RegExp(`context ${number}(?:\\n|$)`));
  }
  assert.match(expanded, /\.\.\./);
});

test("renders shell patches with file counts, line numbers, and word highlights", () => {
  const component = tool("bash", { command: "git diff" });
  const patch = host.generateUnifiedPatch(
    "demo.ts",
    'const mode = "old";\n',
    'const mode = "new";\n',
  );
  finish(component, patch);
  assert.match(output(component), /✓ bash git diff · 1 file · \+1 -1/);
  component.setExpanded(true);
  const expanded = output(component);
  assert.match(expanded, /Command\ngit diff/);
  assert.match(expanded, /demo\.ts/);
  assert.match(expanded, /-1 const mode = "old";/);
  assert.match(expanded, /\+1 const mode = "new";/);
  assert.doesNotMatch(expanded, /Arguments|Index:|@@|--- demo/);
  assert.match(component.render(120).join("\n"), /\u001b\[7m/);
});

test("renders actual Bash output without changing its result", async () => {
  const definition = host.createBashToolDefinition(root);
  const patch = host.generateUnifiedPatch("demo.txt", "old\n", "new\n");
  const args = { command: `printf '%s' '${patch}'` };
  const result = await definition.execute("bash-test", args);
  const before = structuredClone(result);
  const component = tool("bash", args, definition);
  component.markExecutionStarted();
  component.setArgsComplete();
  component.updateResult(result);
  assert.match(output(component), /1 file · \+1 -1/);
  component.setExpanded(true);
  assert.match(output(component), /\+1 new/);
  assert.deepEqual(result, before);
});

test(
  "labels installed delta and shows old and new code on the same row",
  { skip: deltaProbe.code !== 0 || deltaProbe.killed, timeout: 8000 },
  async () => {
    let notify;
    let redraws = 0;
    const ready = new Promise((resolve) => {
      notify = resolve;
    });
    const ui = {
      requestRender() {
        redraws++;
        notify();
      },
    };
    const component = tool("edit", { path: "demo.ts", edits: [] });
    const patch = host.generateUnifiedPatch(
      "demo.ts",
      'const mode = "old";\n',
      'const mode = "new";\n',
    );
    finish(component, "success", {
      details: {
        patch,
        ...host.generateDiffString('const mode = "old";\n', 'const mode = "new";\n'),
      },
    });
    component.ui = ui;
    const before = structuredClone(component.result);
    component.setExpanded(true);
    const initial = output(component);
    assert.doesNotMatch(component.render(120).join("\n"), /\u001b\[48;/);
    await ready;
    const expanded = output(component);
    assert.match(initial, /\nPi\n/);
    assert.match(expanded, /\ndelta · side by side\n/);
    assert.match(expanded, /-const mode = "old";[^\n]*\+const mode = "new";/);
    assert.match(component.render(120).join("\n"), /\u001b\[48;/);
    assert.doesNotMatch(component.render(120).join("\n"), /\u001b\[(?:0K|2J)/);
    assert.deepEqual(component.result, before);
    const count = redraws;
    component.setExpanded(false);
    assert.equal(component.render(120).length, 1);
    component.setExpanded(true);
    assert.equal(output(component), expanded);
    assert.equal(redraws, count);
  },
);

test(
  "uses delta for multiple shell hunks and keeps captured context",
  { skip: deltaProbe.code !== 0 || deltaProbe.killed, timeout: 8000 },
  async () => {
    let notify;
    const ready = new Promise((resolve) => {
      notify = resolve;
    });
    const before = Array.from({ length: 40 }, (_, i) => `context ${i + 1}`).join("\n") + "\n";
    const after = before
      .replace("context 10\n", "changed 10\n")
      .replace("context 30\n", "changed 30\n");
    const component = tool("bash", { command: "git diff" });
    finish(component, host.generateUnifiedPatch("demo.txt", before, after));
    component.ui = {
      requestRender() {
        notify();
      },
    };
    component.setExpanded(true);
    const initial = output(component);
    await ready;
    assert.match(initial, /\nPi\n/);
    assert.match(output(component), /\ndelta · side by side\n/);
    assert.match(component.render(120).join("\n"), /\u001b\[48;/);
    assert.match(output(component), /10 │\+changed 10/);
    assert.match(output(component), /30 │\+changed 30/);
    assert.match(output(component), /context 7/);
    assert.match(output(component), /context 13/);
    assert.doesNotMatch(output(component), /context 5\n|context 15\n/);
    for (const width of [12, 40, 80]) {
      for (const line of component.render(width)) {
        assert.ok(tui.visibleWidth(line) <= width);
      }
    }
  },
);

test(
  "formats many files in one delta job and keeps messages outside the patches",
  { skip: deltaProbe.code !== 0 || deltaProbe.killed, timeout: 8000 },
  async () => {
    let notify;
    let redraws = 0;
    const ready = new Promise((resolve) => {
      notify = resolve;
    });
    const patch = Array.from({ length: 40 }, (_, i) =>
      host.generateUnifiedPatch(`demo-${i}.ts`, "old\n", "new\n"),
    ).join("");
    const component = tool("bash", { command: "git diff" });
    finish(component, `Before patches\n${patch}After patches\n`);
    component.ui = {
      requestRender() {
        redraws++;
        notify();
      },
    };
    component.setExpanded(true);
    const initial = output(component);
    await ready;
    const expanded = output(component);
    assert.match(initial, /\nPi\n/);
    assert.match(expanded, /\ndelta · side by side\n/);
    assert.match(component.render(120).join("\n"), /\u001b\[48;/);
    assert.match(expanded, /Before patches/);
    assert.match(expanded, /After patches/);
    assert.match(expanded, /40 files · \+40 -40/);
    const paths = [...expanded.matchAll(/^demo-(\d+)\.ts$/gm)].map((match) => Number(match[1]));
    assert.deepEqual(
      paths,
      Array.from({ length: 40 }, (_, i) => i),
    );
    assert.equal(redraws, 1);
    component.invalidate();
    assert.equal(output(component), expanded);
    assert.equal(redraws, 1);
  },
);

test(
  "switches delta columns on resize and refreshes colors after a theme change",
  { skip: deltaProbe.code !== 0 || deltaProbe.killed, timeout: 8000 },
  async () => {
    const component = tool("bash", { command: "git diff" });
    finish(
      component,
      host.generateUnifiedPatch("demo.ts", 'const mode = "old";\n', 'const mode = "new";\n'),
    );
    const before = structuredClone(component.result);
    component.setExpanded(true);
    const wide = await deltaOutput(component);
    assert.match(wide, /delta · side by side/);
    assert.match(wide, /-const mode = "old";[^\n]*\+const mode = "new";/);
    const narrow = await deltaOutput(component, 80);
    assert.match(narrow, /delta · single column/);
    assert.doesNotMatch(narrow, /-const mode = "old";[^\n]*\+const mode = "new";/);
    assert.match(narrow, /-const mode = "old";/);
    assert.match(narrow, /\+const mode = "new";/);
    assert.equal(output(component), wide);
    const dark = component.render(120).join("\n");
    try {
      host.initTheme("light", false);
      component.invalidate();
      const light = await deltaOutput(component);
      assert.equal(light, wide);
      assert.notEqual(component.render(120).join("\n"), dark);
    } finally {
      host.initTheme("dark", false);
      component.invalidate();
    }
    assert.equal(output(component), wide);
    assert.deepEqual(component.result, before);
    for (const width of [80, 120]) {
      for (const line of component.render(width)) {
        assert.ok(tui.visibleWidth(line) <= width);
      }
    }
  },
);

test(
  "keeps long Unicode side-by-side rows within the terminal width",
  { skip: deltaProbe.code !== 0 || deltaProbe.killed, timeout: 8000 },
  async () => {
    const component = tool("edit", { path: "你好/😀.ts" });
    const before = `const message = "old ${"你好 😀 ".repeat(40)}";\n`;
    finish(component, "success", {
      details: {
        patch: host.generateUnifiedPatch("你好/😀.ts", before, before.replace("old", "new")),
      },
    });
    component.setExpanded(true);
    const expanded = await deltaOutput(component);
    assert.match(expanded, /delta · side by side/);
    assert.match(expanded, /old/);
    assert.match(expanded, /new/);
    for (const line of component.render(120)) {
      assert.ok(tui.visibleWidth(line) <= 120);
    }
  },
);

for (const [name, patch, expected] of [
  [
    "changed text",
    host.generateUnifiedPatch("demo.txt", "gamma\n", "GAMMA\n"),
    /-gamma[^\n]*\+GAMMA/,
  ],
  ["added files", "--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+new\n", /│\+new/],
  ["deleted files", "--- a/old.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n", /│-old/],
  [
    "quoted paths",
    'diff --git "a/a b.txt" "b/a b.txt"\n--- "a/a b.txt"\n+++ "b/a b.txt"\n@@ -1 +1 @@\n-old\n+new\n',
    /a b\.txt/,
  ],
]) {
  test(
    `renders ${name} with installed delta`,
    { skip: deltaProbe.code !== 0 || deltaProbe.killed, timeout: 8000 },
    async () => {
      const component = tool("bash", { command: "git diff" });
      finish(component, patch);
      component.setExpanded(true);
      const expanded = await deltaOutput(component);
      assert.match(expanded, /delta · side by side/);
      assert.match(expanded, expected);
      for (const line of component.render(120)) {
        assert.ok(tui.visibleWidth(line) <= 120);
      }
    },
  );
}

test(
  "keeps shell messages in order between delta file sections",
  { skip: deltaProbe.code !== 0 || deltaProbe.killed, timeout: 8000 },
  async () => {
    const component = tool("bash", { command: "git diff" });
    const patch = `Before first\n${host.generateUnifiedPatch("first.txt", "old\n", "new\n")}Between files\n${host.generateUnifiedPatch("second.txt", "old\n", "new\n")}After second\n`;
    finish(component, patch);
    component.setExpanded(true);
    const expanded = await deltaOutput(component);
    assert.match(
      expanded,
      /Before first[^]*first\.txt[^]*Between files[^]*second\.txt[^]*After second/,
    );
  },
);

test("labels Pi when edit metadata has no usable patch", () => {
  const component = tool("edit", { path: "demo.txt" });
  finish(component, "success", {
    details: { patch: "unsupported format", ...host.generateDiffString("old\n", "new\n") },
  });
  assert.match(output(component), /\+1 -1/);
  component.setExpanded(true);
  assert.match(output(component), /\nPi\n/);
  assert.doesNotMatch(output(component), /delta/);
  assert.match(output(component), /-1 old/);
  assert.match(output(component), /\+1 new/);
});

test("keeps timestamps out of paths and preserves real a and b directories", () => {
  const patch =
    "--- b/demo.txt\t2026-06-01 12:00:00 +0000\n+++ b/demo.txt\t2026-06-01 12:01:00 +0000\n@@ -1 +1 @@\n-old\n+new\n";
  const component = tool("bash", { command: "diff -u before after" });
  finish(component, patch);
  assert.match(output(component), /1 file · \+1 -1/);
  component.setExpanded(true);
  assert.match(output(component), /b\/demo\.txt/);
  assert.doesNotMatch(output(component), /2026-06-01/);
});

test("keeps binary directory output as text when it also contains a valid patch", () => {
  const patch =
    host.generateUnifiedPatch("demo.txt", "old\n", "new\n") +
    "Binary files before/image.png and after/image.png differ\n";
  const component = tool("bash", { command: "diff -ru before after" });
  finish(component, patch);
  assert.doesNotMatch(output(component), /✓|1 file/);
  component.setExpanded(true);
  assert.ok(output(component).includes(patch.trimEnd()));
});

test("counts multiple files without counting file headers or header-like content", () => {
  const first = host.generateUnifiedPatch("first.txt", "--- old\n+++ old\n", "--- new\n+++ new\n");
  const second = host.generateUnifiedPatch("second.txt", "before\n", "after\n");
  const component = tool("bash", { command: "git diff" });
  finish(component, first + second);
  assert.match(output(component), /2 files · \+3 -3/);
  component.setExpanded(true);
  const expanded = output(component);
  assert.match(expanded, /first\.txt/);
  assert.match(expanded, /second\.txt/);
  assert.match(expanded, /-1 --- old/);
  assert.match(expanded, /\+2 \+\+\+ new/);
});

test("keeps messages before and after a shell patch", () => {
  const patch = host.generateUnifiedPatch("demo.txt", "old\n", "new\n");
  const component = tool("bash", { command: "git diff" });
  finish(component, `Starting check\n${patch}Finished check\n`);
  component.setExpanded(true);
  const expanded = output(component);
  assert.match(expanded, /Starting check/);
  assert.match(expanded, /Finished check/);
  assert.match(expanded, /\+1 new/);
});

for (const [description, patch, expected] of [
  ["added files", "--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+new\n", /1 file · \+1 -0/],
  ["deleted files", "--- a/old.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n", /1 file · \+0 -1/],
  [
    "missing final newlines",
    host.generateUnifiedPatch("demo.txt", "old", "new"),
    /1 file · \+1 -1/,
  ],
  [
    "multiple hunks",
    "--- a/demo.txt\n+++ b/demo.txt\n@@ -2 +2 @@\n-old\n+new\n@@ -40 +40 @@\n-old\n+new\n",
    /1 file · \+2 -2/,
  ],
]) {
  test(`renders ${description}`, () => {
    const component = tool("bash", { command: "git diff" });
    finish(component, patch);
    assert.match(output(component), expected);
    component.setExpanded(true);
    assert.doesNotMatch(output(component), /Arguments/);
    if (description === "missing final newlines") {
      assert.match(output(component), /No newline at end of file/);
    }
    if (description === "multiple hunks") {
      assert.match(output(component), /\+40 new/);
    }
  });
}

test("supports colored shell patches and quoted paths without terminal controls", () => {
  const patch =
    'diff --git "a/a b.txt" "b/a b.txt"\nindex abc123..def456 100644\n--- "a/a b.txt"\n+++ "b/a b.txt"\n@@ -1 +1 @@\n\u001b[31m-old\u001b[0m\n\u001b[32m+new\u001b[0m\u001b[2J\n';
  const component = tool("powershell", { command: "git diff" });
  finish(component, patch);
  assert.match(output(component), /1 file · \+1 -1/);
  component.setExpanded(true);
  assert.match(output(component), /a b\.txt/);
  assert.doesNotMatch(output(component), /diff --git|index abc/);
  assert.doesNotMatch(component.render(120).join("\n"), /\u001b\[2J/);
});

for (const [description, options] of [
  ["streaming", { isPartial: true }],
  ["failed", { isError: true }],
  [
    "truncated",
    { details: { truncation: { truncated: true }, fullOutputPath: "/tmp/full-diff.txt" } },
  ],
]) {
  test(`keeps ${description} patches as original text`, () => {
    const component = tool("bash", { command: "git diff" });
    const patch = host.generateUnifiedPatch("demo.txt", "old\n", "new\n");
    finish(component, patch, options);
    assert.doesNotMatch(output(component), /✓|\+1 -1/);
    component.setExpanded(true);
    assert.match(output(component), /Command/);
    assert.match(output(component), /@@ -1/);
    if (description === "truncated") {
      assert.match(output(component), /Full output: \/tmp\/full-diff\.txt/);
    }
  });
}

for (const patch of [
  "--- a/demo.txt\n+++ b/demo.txt\n@@ -1,2 +1,2 @@\n-old\n+new\n",
  "--- a/demo.txt\n+++ b/demo.txt\n@@ -1 +1 @@\n-old\n+new\n+unexpected\n",
  "--- not a diff\n+++ not a diff\nnormal text\n",
  "diff --git a/demo.bin b/demo.bin\nBinary files a/demo.bin and b/demo.bin differ\n",
  "diff --cc demo.txt\n@@@ -1,1 -1,1 +1,1 @@@\n++new\n",
]) {
  test(`keeps unsupported or incomplete output as text: ${patch.split("\n")[0]}`, () => {
    const component = tool("bash", { command: "git diff" });
    finish(component, patch);
    assert.doesNotMatch(output(component), /✓|files? · \+/);
    component.setExpanded(true);
    assert.ok(output(component).includes(patch.trimEnd()));
  });
}

test("does not omit unsupported files from mixed patch output", () => {
  const patch =
    host.generateUnifiedPatch("demo.txt", "old\n", "new\n") +
    "diff --git a/demo.bin b/demo.bin\nBinary files a/demo.bin and b/demo.bin differ\n";
  const component = tool("bash", { command: "git diff" });
  finish(component, patch);
  assert.doesNotMatch(output(component), /✓|1 file/);
  component.setExpanded(true);
  assert.ok(output(component).includes(patch.trimEnd()));
});

test("keeps diff counts visible for long paths and fits narrow terminals", () => {
  const component = tool("edit", { path: "你好/".repeat(100) + "demo.txt" });
  const details = host.generateDiffString("old\n", "new\n");
  finish(component, "success", { details });
  for (const width of [20, 40, 80, 120]) {
    assert.match(output(component, width), /\+1 -1/);
  }
  for (const expanded of [false, true]) {
    component.setExpanded(expanded);
    for (const width of [2, 12, 20, 80, 120]) {
      for (const line of component.render(width)) {
        assert.ok(tui.visibleWidth(line) <= width);
      }
      component.invalidate();
    }
  }
});

test("updates diff colors after a theme change and keeps expansion clicks", () => {
  const component = tool("bash", { command: "git diff" });
  finish(component, host.generateUnifiedPatch("demo.txt", "old\n", "new\n"));
  component.render(120);
  assert.equal(
    component.handleMouse({ type: "click", button: "left", x: 0, y: 0, width: 120, height: 1 })
      .handled,
    true,
  );
  const before = component.render(120).join("\n");
  try {
    host.initTheme("light", false);
    component.invalidate();
    assert.notEqual(component.render(120).join("\n"), before);
    assert.match(output(component), /\+1 new/);
  } finally {
    host.initTheme("dark", false);
  }
  const lines = component.render(120);
  assert.equal(
    component.handleMouse({
      type: "click",
      button: "left",
      x: 0,
      y: lines.length - 1,
      width: 120,
      height: lines.length,
    }).handled,
    true,
  );
  assert.equal(component.render(120).length, 1);
});

test("keeps child rows visible while the codemode script stays collapsed", () => {
  const component = tool("codemode", { code: 'text(await tools.read({ path: "file.ts" }));' });
  const details = {
    calls: [
      { name: "read", args: '{"path":"file.ts"}', status: "ok", durationMs: 100 },
      {
        name: "mcp__example__search",
        args: '{"query":"x"}',
        status: "error",
        error: "Permission denied",
        durationMs: 200,
      },
      { name: "models.classify", args: "{}", status: "ok", cost: 0.0003 },
    ],
  };
  finish(component, "script output", { details });
  assert.match(output(component), /3 calls/);
  assert.match(output(component), /1 failed/);
  assert.match(output(component), /├─ ▸.*read/);
  assert.match(output(component), /├─ ▸.*example\/search/);
  assert.match(output(component), /└─ ▸.*models.classify/);
  assert.doesNotMatch(output(component), /tools.read|script output/);
  assert.match(output(component), /Permission denied/);
  component.setExpanded(true);
  const expanded = output(component);
  assert.match(expanded, /Script/);
  assert.match(expanded, /tools.read/);
  assert.match(expanded, /read done/);
  assert.match(expanded, /0.10s/);
  assert.match(expanded, /Permission denied/);
  assert.equal(click(component, 2).handled, true);
  assert.match(output(component), /Permission denied/);
  assert.match(expanded, /\$0.00030/);
  assert.match(expanded, /script output/);
});

test("captures real child results and expands each child separately", async () => {
  const component = tool("codemode", {
    code: "await Promise.all([tools.read({path:'first'}), tools.read({path:'second'})]);",
  });
  finish(component, "script output");
  await child(component, "read", { path: "first" }, "first content", {
    id: `${component.toolCallId}/1`,
  });
  await child(component, "read", { path: "second" }, "second content", {
    id: `${component.toolCallId}/2`,
  });
  const result = structuredClone(component.result);
  assert.equal(component.render(120).length, 3);
  assert.match(output(component), /├─ ▸.*read done first/);
  assert.match(output(component), /└─ ▸.*read done second/);
  assert.doesNotMatch(output(component), /first content|second content|script output/);
  assert.equal(click(component, 1).handled, true);
  assert.match(output(component), /├─ ▾/);
  assert.match(output(component), /first content/);
  assert.doesNotMatch(output(component), /second content|script output/);
  const secondRow = component
    .render(120)
    .findIndex((line) => tui.stripTerminalSequences(line).includes("└─ ▸"));
  assert.equal(click(component, secondRow).handled, true);
  assert.match(output(component), /second content/);
  assert.equal(click(component, 0).handled, true);
  assert.match(output(component), /Script/);
  assert.match(output(component), /script output/);
  assert.equal(click(component, 0).handled, true);
  assert.doesNotMatch(output(component), /Script|script output/);
  assert.match(output(component), /first content/);
  assert.match(output(component), /second content/);
  component.invalidate();
  assert.match(output(component), /first content/);
  assert.deepEqual(component.result, result);
});

test("shows child calls before codemode publishes a result and preserves streaming expansion", async () => {
  const component = tool("codemode", { code: "await tools.bash({command:'run'});" });
  component.markExecutionStarted();
  const id = await child(component, "bash", { command: "run" });
  assert.match(output(component), /└─ ▸.*bash running run/);
  assert.equal(click(component, 1).handled, true);
  assert.match(output(component), /Command/);
  await fire({
    type: "tool_execution_update",
    parentToolCallId: component.toolCallId,
    toolCallId: id,
    toolName: "bash",
    args: { command: "run" },
    partialResult: { content: [{ type: "text", text: "partial output" }] },
  });
  assert.match(output(component), /Output so far/);
  assert.match(output(component), /partial output/);
  await fire({
    type: "tool_execution_end",
    parentToolCallId: component.toolCallId,
    toolCallId: id,
    toolName: "bash",
    result: { content: [{ type: "text", text: "final output" }] },
    isError: false,
  });
  assert.match(output(component), /bash done run/);
  assert.match(output(component), /final output/);
  assert.doesNotMatch(output(component), /partial output/);
});

test("streaming keeps completed sibling views cached and still refreshes themes", async () => {
  let redraws = 0;
  const component = tool("codemode", { code: "await Promise.all(...)" }, undefined, {
    requestRender() {
      redraws++;
    },
  });
  finish(component, "summary", { isPartial: true });
  const ids = [];
  for (let i = 0; i < 4; i++) {
    ids.push(
      await child(
        component,
        "read",
        { path: `file-${i}.ts` },
        i === 0 ? undefined : "const done = true;",
        {
          id: `${component.toolCallId}/${i}`,
        },
      ),
    );
  }
  for (let i = 0; i < 4; i++) {
    const row = component
      .render(120)
      .findIndex((line) =>
        tui
          .stripTerminalSequences(line)
          .includes(`read ${i === 0 ? "running" : "done"} file-${i}.ts`),
      );
    assert.ok(row > 0);
    assert.equal(click(component, row).handled, true);
  }
  const children = new Map();
  const render = prototype.render;
  prototype.render = function (width) {
    if (ids.includes(this.toolCallId)) children.set(this.toolCallId, this);
    return render.call(this, width);
  };
  try {
    output(component);
  } finally {
    prototype.render = render;
  }
  assert.equal(children.size, 4);
  const views = ids.slice(1).map((id) => children.get(id).resultRendererComponent);
  const before = redraws;
  await fire({
    type: "tool_execution_update",
    parentToolCallId: component.toolCallId,
    toolCallId: ids[0],
    toolName: "read",
    args: { path: "file-0.ts" },
    partialResult: { content: [{ type: "text", text: "const partial = true;" }] },
  });
  assert.ok(redraws > before);
  const streamed = output(component);
  assert.match(streamed, /const partial = true;/);
  for (let i = 1; i < ids.length; i++) {
    assert.equal(children.get(ids[i]).resultRendererComponent, views[i - 1]);
  }
  const dark = component.render(120).join("\n");
  host.initTheme("light", false);
  try {
    component.invalidate();
    assert.notEqual(component.render(120).join("\n"), dark);
    for (let i = 1; i < ids.length; i++) {
      assert.notEqual(children.get(ids[i]).resultRendererComponent, views[i - 1]);
    }
    assert.match(output(component), /const done = true;/);
  } finally {
    host.initTheme("dark", false);
    component.invalidate();
  }
});

for (const saved of [true, false]) {
  test(`late child completion ${saved ? "uses saved arguments" : "reports missing arguments"} after eviction`, async () => {
    let redraws = 0;
    const parent = tool("codemode", { code: "await tools.read(...)" }, undefined, {
      requestRender() {
        redraws++;
      },
    });
    const args = { path: "config.ts", offset: 100 };
    const id = await child(parent, "read", args);
    finish(parent, "", {
      isPartial: true,
      details: saved
        ? { calls: [{ id, name: "read", args: JSON.stringify(args), status: "running" }] }
        : undefined,
    });
    assert.equal(click(parent, 1).handled, true);
    for (let i = 0; i < 128; i++) {
      await fire({
        type: "tool_execution_start",
        parentToolCallId: `eviction-${i}`,
        toolCallId: `eviction-${i}/1`,
        toolName: "read",
        args: { path: "other.ts" },
      });
    }
    const before = redraws;
    await fire({
      type: "tool_execution_end",
      parentToolCallId: parent.toolCallId,
      toolCallId: id,
      toolName: "read",
      result: { content: [{ type: "text", text: "captured line\nsecond line" }] },
      isError: false,
    });
    assert.ok(redraws > before);
    if (output(parent).includes("└─ ▸")) {
      assert.equal(click(parent, 1).handled, true);
    }
    const text = output(parent);
    assert.match(text, /captured line/);
    if (saved) {
      assert.match(text, /File: config.ts/);
      assert.match(text, /Lines 100-101/);
    } else {
      assert.match(text, /Arguments are not available\./);
      assert.doesNotMatch(text, /Lines \d+-\d+|\d+ │/);
    }
    assert.doesNotMatch(text, /Lines 1-2/);
  });
}

test("redraw removes evicted child components, even at narrow widths", async () => {
  const parent = tool("codemode", { code: "await tools.read(...)" });
  await child(parent, "read", { path: "config.ts" }, "captured content");
  assert.equal(click(parent, 1).handled, true);
  const tree = parent.callRendererComponent.children[1];
  assert.equal(tree.entries.size, 1);
  for (let i = 0; i < 128; i++) {
    await fire({
      type: "tool_execution_start",
      parentToolCallId: `eviction-${i}`,
      toolCallId: `eviction-${i}/1`,
      toolName: "read",
      args: { path: "other.ts" },
    });
  }
  parent.render(7);
  assert.equal(tree.entries.size, 0);
  assert.equal(tree.frames.length, 0);
  assert.doesNotMatch(output(parent), /captured content|read done/);
});

test("streaming stays fresh when a child returns to the cache between redraws", async () => {
  const parent = tool("codemode", { code: "await tools.read(...)" });
  const args = { path: "config.ts", offset: 100 };
  const id = await child(parent, "read", args);
  finish(parent, "", {
    isPartial: true,
    details: { calls: [{ id, name: "read", args: JSON.stringify(args), status: "running" }] },
  });
  const update = (text) =>
    fire({
      type: "tool_execution_update",
      parentToolCallId: parent.toolCallId,
      toolCallId: id,
      toolName: "read",
      args,
      partialResult: { content: [{ type: "text", text }] },
    });
  await update("old output");
  assert.equal(click(parent, 1).handled, true);
  assert.match(output(parent), /old output/);
  for (let i = 0; i < 128; i++) {
    await fire({
      type: "tool_execution_start",
      parentToolCallId: `eviction-${i}`,
      toolCallId: `eviction-${i}/1`,
      toolName: "read",
      args: { path: "other.ts" },
    });
  }
  await update("first new output");
  await update("latest output");
  assert.match(output(parent), /latest output/);
  assert.doesNotMatch(output(parent), /old output|first new output/);
  assert.match(output(parent), /Lines 100-100/);
});

test("child events update cached headings without a parent result", async () => {
  const component = tool("codemode", { code: "await tools.inspect()" });
  component.markExecutionStarted();
  assert.doesNotMatch(output(component), /calls?/);
  await child(component, "read", { path: "first" }, "first content", {
    id: `${component.toolCallId}/1`,
  });
  assert.match(output(component).split("\n")[0], /1 call/);
  await child(component, "read", { path: "second" }, "Denied", {
    id: `${component.toolCallId}/2`,
    isError: true,
  });
  assert.match(output(component).split("\n")[0], /2 calls · 1 failed/);
});

test("merges codemode metadata with live rows without duplicating calls", async () => {
  const component = tool("codemode", { code: "await tools.read({path:'first'});" });
  const id = await child(component, "read", { path: "first" }, "child output");
  finish(component, "", {
    details: { calls: [{ id, name: "read", args: '{"path":"first"}', status: "ok" }] },
  });
  assert.equal(component.render(120).length, 2);
  assert.equal(click(component, 1).handled, true);
  assert.match(output(component), /child output/);
  finish(component, "", {
    details: { calls: [{ id, name: "read", args: '{"path":"first"}', status: "ok" }] },
  });
  assert.match(output(component), /child output/);
});

test("uses the same diff view for child edit results", async () => {
  const component = tool("codemode", { code: "await tools.edit({path:'demo.txt', edits:[]});" });
  const details = host.generateDiffString("old\n", "new\n");
  await child(component, "edit", { path: "demo.txt", edits: [] }, "success", { details });
  assert.match(output(component), /└─ ▸.*edit demo.txt · \+1 -1/);
  assert.equal(click(component, 1).handled, true);
  assert.match(output(component), /Pi/);
  assert.match(output(component), /\+1 new/);
  assert.doesNotMatch(output(component), /success|Arguments/);
});

test(
  "uses installed delta for an expanded child edit",
  { skip: deltaProbe.code !== 0 || deltaProbe.killed, timeout: 8000 },
  async () => {
    let notify;
    const ui = {
      requestRender() {
        notify?.();
      },
    };
    const component = tool(
      "codemode",
      { code: "await tools.edit({path:'demo.ts', edits:[]});" },
      undefined,
      ui,
    );
    await child(component, "edit", { path: "demo.ts" }, "success", {
      details: {
        patch: host.generateUnifiedPatch(
          "demo.ts",
          'const mode = "old";\n',
          'const mode = "new";\n',
        ),
      },
    });
    assert.equal(click(component, 1).handled, true);
    const ready = new Promise((resolve) => {
      notify = resolve;
    });
    assert.match(output(component), /Pi/);
    await ready;
    assert.match(output(component), /delta · side by side/);
    assert.match(output(component), /-const mode = "old";[^\n]*\+const mode = "new";/);
    assert.doesNotMatch(output(component), /Script/);
  },
);

test("keeps child image rows compact until expansion and preserves image controls", async () => {
  const capabilities = { ...tui.getCapabilities() };
  try {
    tui.setCapabilities({ ...capabilities, images: "kitty" });
    const component = tool("codemode", { code: "await tools.read({path:'demo.png'});" });
    component.setShowImages(true);
    const id = await child(component, "read", { path: "demo.png" });
    await fire({
      type: "tool_execution_end",
      toolCallId: id,
      parentToolCallId: component.toolCallId,
      toolName: "read",
      result: {
        content: [
          {
            type: "image",
            data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=",
            mimeType: "image/png",
          },
        ],
      },
      isError: false,
    });
    assert.equal(component.render(120).length, 2);
    assert.match(output(component), /1 image/);
    assert.equal(click(component, 1).handled, true);
    assert.ok(component.render(120).some((line) => line.startsWith("\u001b_G")));
    assert.equal(click(component, 1).handled, true);
    assert.equal(component.render(120).length, 2);
  } finally {
    tui.setCapabilities(capabilities);
  }
});

test("keeps nested child groups visible and routes clicks to the right level", async () => {
  const component = tool("codemode", { code: "await tools.custom();" });
  const id = await child(component, "custom", {}, "outer result");
  await child({ toolCallId: id }, "read", { path: "nested.txt" }, "nested result");
  assert.match(output(component), /custom done/);
  assert.match(output(component), /read done nested.txt/);
  const row = component
    .render(120)
    .findIndex((line) => tui.stripTerminalSequences(line).includes("read done"));
  assert.equal(click(component, row).handled, true);
  assert.match(output(component), /nested result/);
  assert.doesNotMatch(output(component), /outer result/);
});

test("preserves expansion when preview rows receive real call IDs", async () => {
  const component = tool("codemode", { code: "await tools.read({path:'first'});" });
  finish(component, "", {
    isPartial: true,
    details: {
      calls: [
        {
          id: `${component.toolCallId}/?`,
          name: "read",
          args: '{"path":"first"}',
          status: "running",
        },
      ],
    },
  });
  assert.equal(click(component, 1).handled, true);
  const id = await child(component, "read", { path: "first" }, "child output", {
    id: `${component.toolCallId}/1`,
  });
  assert.match(output(component), /child output/);
  finish(component, "", {
    details: { calls: [{ id, name: "read", args: '{"path":"first"}', status: "ok" }] },
  });
  assert.match(output(component), /child output/);
  assert.match(output(component), /└─ ▾/);
});

test("does not expand an outer child when its nested child expands", async () => {
  const component = tool("codemode", { code: "await tools.custom();" });
  const id = await child(component, "custom", {}, "outer result");
  await child({ toolCallId: id }, "read", { path: "nested.txt" }, "nested result");
  const row = component
    .render(120)
    .findIndex((line) => tui.stripTerminalSequences(line).includes("read done"));
  const response = click(component, row);
  assert.equal(response.handled, true);
  assert.equal(response.target.originY, row);
  assert.match(output(component), /└─ ▸.*custom/);
  assert.match(output(component), /└─ ▾.*read/);
  assert.doesNotMatch(output(component), /outer result/);
});

test("keeps child rows safe during resize and theme changes", async () => {
  const component = tool("codemode", { code: "await tools.read({path:'你好/😀'});" });
  await child(component, "read", { path: "你好/😀" }, "你好\u001b[2J\n😀");
  assert.equal(click(component, 1).handled, true);
  for (const width of [2, 8, 12, 40, 120]) {
    for (const line of component.render(width)) {
      assert.ok(tui.visibleWidth(line) <= width);
    }
  }
  const before = component.render(120).join("\n");
  try {
    host.initTheme("light", false);
    component.invalidate();
    assert.notEqual(component.render(120).join("\n"), before);
    assert.match(output(component), /你好/);
    assert.match(output(component), /└─ ▾/);
    assert.doesNotMatch(component.render(120).join("\n"), /\u001b\[2J/);
  } finally {
    host.initTheme("dark", false);
  }
});

test(
  "captures real codemode calls without adding child output to the script result",
  { timeout: 10000 },
  async () => {
    const { createCodemodeToolDefinition } = await import(
      pathToFileURL(resolve(hostRoot, "dist/extensions/codemode/tool.js")).href
    );
    const { NestedToolCallRunner } = await import(
      pathToFileURL(resolve(hostRoot, "dist/core/nested-tool-calls.js")).href
    );
    const tools = [host.createBashTool(root)];
    const args = {
      code: 'await Promise.all([tools.bash({command: "printf child-one"}), tools.bash({command: "printf child-two"})]); text("script summary");',
    };
    const component = tool("codemode", args);
    const runner = new NestedToolCallRunner({
      getTools: () => tools,
      isSequential: () => false,
      emit: fire,
      async runToolCall(toolCall, _parent, signal, onUpdate) {
        const result = await tools[0].execute(toolCall.id, toolCall.arguments, signal, onUpdate);
        return { toolCall, result, isError: Boolean(result.isError) };
      },
    });
    const result = await createCodemodeToolDefinition().execute(
      component.toolCallId,
      args,
      undefined,
      (partial) => component.updateResult({ ...partial, isError: false }, true),
      {
        tools,
        sessionManager: { getBranch: () => [] },
        executeTool: (name, args, options) =>
          runner.execute(component.toolCallId, name, args, options),
      },
    );
    const before = structuredClone(result);
    component.updateResult({ ...result, isError: Boolean(result.isError) });
    assert.equal(component.render(120).length, 3);
    assert.match(output(component), /2 calls/);
    assert.doesNotMatch(output(component), /script summary/);
    assert.equal(click(component, 1).handled, true);
    assert.equal(
      click(
        component,
        component
          .render(120)
          .findIndex((line) => tui.stripTerminalSequences(line).includes("└─ ▸")),
      ).handled,
      true,
    );
    assert.match(output(component), /Output[^]*child-one/);
    assert.match(output(component), /Output[^]*child-two/);
    assert.deepEqual(result, before);
    const text = result.content.map((block) => block.text ?? "").join("\n");
    assert.match(text, /script summary/);
    assert.doesNotMatch(text, /child-one|child-two/);
  },
);

test("replaces expired child results with a display notice", async () => {
  const component = tool("codemode", { code: "await tools.read({path:'first'});" });
  const id = await child(
    component,
    "read",
    { path: "first" },
    `first content ${"x".repeat(900000)}`,
  );
  finish(component, "", {
    details: { calls: [{ id, name: "read", args: '{"path":"first"}', status: "ok" }] },
  });
  assert.equal(click(component, 1).handled, true);
  assert.match(output(component), /first content/);
  for (let i = 0; i < 10; i++) {
    await child({ toolCallId: `other-${i}` }, "read", { path: "other" }, "x".repeat(900000));
  }
  assert.match(output(component), /expired/);
  assert.doesNotMatch(output(component), /first content/);
});

test("supports child expansion and collapse by mouse", async () => {
  const component = tool("codemode", { code: "await tools.read({path:'first'});" });
  await child(component, "read", { path: "first" }, "child output");
  assert.equal(click(component, 1).handled, true);
  assert.match(output(component), /child output/);
  assert.equal(click(component, 1).handled, true);
  assert.doesNotMatch(output(component), /child output/);
});

test("shows live and cancelled codemode calls", () => {
  const component = tool("codemode", { code: "await tools.read({path: 'file.ts'})" });
  finish(component, "", {
    details: { calls: [{ name: "read", args: "{}", status: "running" }] },
    isPartial: true,
  });
  assert.match(output(component), /running/);
  assert.match(output(component), /1 call/);
  component.setExpanded(true);
  assert.match(output(component), /read running/);
  component.updateResult({
    content: [],
    details: { calls: [{ name: "read", status: "cancelled" }] },
    isError: true,
  });
  assert.match(output(component), /failed/);
  assert.match(output(component), /read failed/);
  assert.match(output(component), /cancelled/);
});

test("handles codemode parser errors without call metadata", () => {
  const component = tool("codemode", { code: "invalid code" });
  finish(component, "SyntaxError: invalid code", { isError: true });
  assert.match(output(component), /failed/);
  assert.match(output(component), /SyntaxError/);
});

test("keeps MCP namespace names readable", () => {
  const component = tool("mcp__github__list_issues", { query: "bug" });
  finish(component, "[]");
  assert.match(output(component), /github\/list_issues/);
});

test("handles image-only results without changing Pi image handling", () => {
  const component = tool("read", { path: "image.png" });
  component.updateResult({
    content: [{ type: "image", data: "image fixture", mimeType: "image/png" }],
    isError: false,
  });
  assert.match(output(component), /1 image/);
});

test("reports truncation and preserves the full output path", () => {
  const component = tool("codemode", { code: "return data" });
  finish(component, "partial output", {
    details: { calls: [], fullOutputPath: "/tmp/full-output.txt" },
  });
  assert.match(output(component), /truncated/);
  component.setExpanded(true);
  assert.match(output(component), /Full output: \/tmp\/full-output.txt/);
});

test("shows native truncation notices", () => {
  const component = tool("read", { path: "file.ts" });
  finish(component, "preview", { details: { truncation: { truncated: true } } });
  assert.match(output(component), /truncated/);
});

test("limits collapsed minified JSON to one visual line", () => {
  const component = tool("mcp__example__search", { query: "x" });
  finish(component, JSON.stringify({ data: "x".repeat(20_000) }));
  assert.equal(output(component, 35).split("\n").length, 1);
});

test("fits narrow terminals, wide characters, resize, and invalidation", () => {
  const component = tool("read", { path: "你好/😀.ts" });
  finish(component, "你好\n😀");
  for (const width of [12, 80, 20, 2, 100]) {
    for (const line of component.render(width)) {
      assert.ok(tui.visibleWidth(line) <= width, `${width}: ${line}`);
    }
    component.invalidate();
  }
  component.setExpanded(true);
  for (const width of [12, 80, 20]) {
    for (const line of component.render(width)) {
      assert.ok(tui.visibleWidth(line) <= width);
    }
  }
});

test("removes terminal control sequences from arguments and output", () => {
  const component = tool("new_tool", { path: "a\u001b[2J\nb" });
  finish(component, "first\u001b[31m red\u001b[0m\u001b[2J\nsecond");
  assert.match(output(component), /a b/);
  component.setExpanded(true);
  assert.match(output(component), /first red\nsecond/);
  assert.doesNotMatch(component.render(120).join("\n"), /\u001b\[2J/);
});

test("places consecutive tool rows next to each other without blank lines", () => {
  const first = tool("read", { path: "file.ts" });
  const second = tool("bash", { command: "true" });
  finish(first, "file content");
  finish(second, "");
  const lines = [...first.render(120), ...second.render(120)];
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => tui.stripTerminalSequences(line).trim()));
});

test("does not add a blank row before expanded output", () => {
  const component = tool("read", { path: "file.ts" });
  finish(component, "file content");
  component.setExpanded(true);
  assert.match(tui.stripTerminalSequences(component.render(120)[0]), /read done/);
});

test("keeps click-to-expand behavior", () => {
  const component = tool("read", { path: "file.ts" });
  finish(component, "file content");
  component.render(120);
  const response = component.handleMouse({
    type: "click",
    button: "left",
    x: 5,
    y: 0,
    width: 120,
    height: 1,
  });
  assert.equal(response.handled, true);
  assert.match(output(component), /file content/);
});

test("keeps click-to-collapse behavior on the last output row", () => {
  const component = tool("read", { path: "file.ts" });
  finish(component, "file content");
  component.setExpanded(true);
  const lines = component.render(120);
  const outside = component.handleMouse({
    type: "click",
    button: "left",
    x: 5,
    y: lines.length,
    width: 120,
    height: lines.length,
  });
  assert.notEqual(outside?.handled, true);
  const response = component.handleMouse({
    type: "click",
    button: "left",
    x: 5,
    y: lines.length - 1,
    width: 120,
    height: lines.length,
  });
  assert.equal(response.handled, true);
  assert.equal(component.render(120).length, 1);
});

test("updates colors after a theme change", () => {
  const component = tool("read", { path: "file.ts" });
  finish(component, "content");
  const before = component.render(120).join("\n");
  try {
    host.initTheme("light", false);
    component.invalidate();
    assert.notEqual(component.render(120).join("\n"), before);
    assert.match(output(component), /read done/);
  } finally {
    host.initTheme("dark", false);
  }
});

test("drops the native codemode header without changing its result", () => {
  const component = tool("codemode", { code: "return 'hello'" });
  const result = {
    content: [
      { type: "text", text: "Script completed\nWall time 0.2 seconds\nOutput:\n" },
      { type: "text", text: "hello" },
    ],
    details: { calls: [] },
    isError: false,
  };
  component.updateResult(result);
  assert.match(output(component), /1 line/);
  component.setExpanded(true);
  assert.doesNotMatch(output(component), /Script completed/);
  assert.match(output(component), /hello/);
  assert.match(result.content[0].text, /Script completed/);
});

test("does not install twice and restores host methods on shutdown", async () => {
  const installed = prototype.getCallRenderer;
  await fire("session_start");
  assert.equal(prototype.getCallRenderer, installed);
  await fire("session_shutdown");
  for (const name of methods) {
    assert.equal(prototype[name], originals[name]);
  }
  await fire("session_start");
  assert.notEqual(prototype.getCallRenderer, originals.getCallRenderer);
});

for (const mode of ["print", "rpc", "json"]) {
  test(`does not patch host rendering in ${mode} mode`, async () => {
    await fire("session_shutdown");
    await fire("session_start", mode);
    for (const name of methods) {
      assert.equal(prototype[name], originals[name]);
    }
  });
}
