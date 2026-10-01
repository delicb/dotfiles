import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hostUrl = process.env.PI_TEST_HOST
  ? pathToFileURL(resolve(process.env.PI_TEST_HOST, "dist/index.js")).href
  : import.meta.resolve("@earendil-works/pi-coding-agent");
const require = createRequire(hostUrl);
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url, { moduleCache: false });
const { NestedCalls } = await jiti.import(resolve(root, "extensions/NestedCalls.ts"));

function start(store, id = "parent/1", parent = "parent", args = { path: "demo.txt" }) {
  store.observe({
    type: "tool_execution_start",
    parentToolCallId: parent,
    toolCallId: id,
    toolName: "read",
    args,
  });
}

function end(store, id = "parent/1", parent = "parent", text = "content") {
  const event = {
    type: "tool_execution_end",
    parentToolCallId: parent,
    toolCallId: id,
    toolName: "read",
    result: { content: [{ type: "text", text }] },
    isError: false,
  };
  store.observe(event);
  return event;
}

test("ignores top-level events and never changes child events or results", () => {
  const store = new NestedCalls();
  store.observe({
    type: "tool_execution_start",
    toolCallId: "root",
    toolName: "codemode",
    args: {},
  });
  assert.deepEqual(store.get("root"), []);
  start(store);
  const event = end(store);
  const before = structuredClone(event);
  const call = store.get("parent")[0];
  assert.equal(call.status, "ok");
  assert.equal(call.result.content[0].text, "content");
  assert.deepEqual(event, before);
});

test("keeps concurrent calls in start order and isolates parents", () => {
  const store = new NestedCalls();
  start(store, "parent/1");
  start(store, "parent/2");
  start(store, "other/1", "other");
  end(store, "parent/2");
  end(store, "parent/1");
  assert.deepEqual(
    store.get("parent").map((call) => call.id),
    ["parent/1", "parent/2"],
  );
  assert.equal(store.get("other")[0].status, "running");
});

test("copies arguments and rejects oversized or cyclic arguments", () => {
  const store = new NestedCalls();
  const args = { path: "original" };
  start(store, "parent/1", "parent", args);
  args.path = "changed";
  assert.deepEqual(store.get("parent")[0].args, { path: "original" });
  start(store, "parent/2", "parent", { content: "x".repeat(9000) });
  assert.match(store.get("parent")[1].args, /display limit/);
  const cyclic = {};
  cyclic.self = cyclic;
  start(store, "parent/3", "parent", cyclic);
  assert.match(store.get("parent")[2].args, /not available/);
});

test("late completion does not invent arguments after cache eviction", () => {
  const store = new NestedCalls();
  start(store, "slow/1", "slow", { path: "config.ts", offset: 100 });
  for (let i = 0; i < 128; i++) {
    start(store, `new-${i}/1`, `new-${i}`);
  }
  assert.deepEqual(store.get("slow"), []);
  end(store, "slow/1", "slow", "captured line\nsecond line");
  assert.equal(store.get("slow")[0].args, undefined);
  assert.equal(store.get("slow")[0].status, "ok");
});

test("a later start event supplies missing arguments", () => {
  const store = new NestedCalls();
  end(store);
  start(store, "parent/1", "parent", { path: "config.ts", offset: 100 });
  assert.deepEqual(store.get("parent")[0].args, { path: "config.ts", offset: 100 });
});

test("shares a weak terminal listener across cached and evicted parent groups", () => {
  const store = new NestedCalls();
  let redraws = 0;
  const ui = {
    requestRender() {
      redraws++;
    },
  };
  for (let i = 0; i < 1000; i++) {
    store.subscribe(ui);
    start(store, `parent-${i}/1`, `parent-${i}`);
  }
  assert.equal(store.parents.size, 128);
  assert.equal(store.listeners.size, 1);
  assert.ok(redraws >= 1000);
  const before = redraws;
  end(store, "parent-0/1", "parent-0");
  assert.ok(redraws > before);
  store.listeners.add({
    deref() {
      return undefined;
    },
  });
  start(store, "latest/1", "latest");
  assert.equal(store.listeners.size, 1);
  store.clear();
  assert.equal(store.listeners.size, 0);
});

test("limits results and notifies rows when cached output expires", () => {
  const store = new NestedCalls();
  let updates = 0;
  const ui = {
    requestRender() {
      updates++;
    },
  };
  store.subscribe(ui);
  for (let i = 0; i < 10; i++) {
    const id = `parent/${i}`;
    start(store, id);
    end(store, id, "parent", "x".repeat(900000));
  }
  assert.match(store.get("parent")[0].unavailable, /expired/);
  assert.equal(store.get("parent")[0].result, undefined);
  assert.ok(store.bytes <= 8 * 1024 * 1024);
  assert.ok(updates > 20);
  start(store, "parent/oversized");
  end(store, "parent/oversized", "parent", "x".repeat(1024 * 1024 + 1));
  assert.match(store.get("parent").at(-1).unavailable, /display limit/);
});

test("limits parent groups and calls, then clears all session state", () => {
  const store = new NestedCalls();
  for (let i = 0; i < 130; i++) {
    start(store, `parent-${i}/1`, `parent-${i}`);
  }
  assert.equal(store.parents.size, 128);
  assert.deepEqual(store.get("parent-0"), []);
  for (let i = 0; i < 300; i++) {
    start(store, `limited/${i}`, "limited");
  }
  assert.equal(store.get("limited").length, 256);
  store.clear();
  assert.equal(store.parents.size, 0);
  assert.equal(store.results.size, 0);
  assert.equal(store.listeners.size, 0);
  assert.equal(store.bytes, 0);
});
