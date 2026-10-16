import assert from "node:assert/strict";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { delimiter, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const extensionPath = fileURLToPath(new URL("../index.ts", import.meta.url));
const piRoot = findPiRoot();
const { VERSION } = await import(pathToFileURL(join(piRoot, "dist/config.js")));
const { SessionManager } = await import(
  pathToFileURL(join(piRoot, "dist/core/session-manager.js"))
);
const { InteractiveMode } = await import(
  pathToFileURL(join(piRoot, "dist/modes/interactive/interactive-mode.js"))
);
const { loadExtensions } = await import(
  pathToFileURL(join(piRoot, "dist/core/extensions/loader.js"))
);
const timestamp = "2026-01-01T00:00:00.000Z";

function findPiRoot() {
  if (process.env.PI_PACKAGE_DIR) {
    return process.env.PI_PACKAGE_DIR;
  }

  const executable = (process.env.PATH ?? "")
    .split(delimiter)
    .map((directory) => join(directory, "pi"))
    .find(existsSync);
  assert.ok(executable, "Set PI_PACKAGE_DIR if Pi is not on PATH.");

  const shimTarget = readFileSync(executable, "utf8").match(
    /^# aube-bin-shim .* target=(.+)$/m,
  )?.[1];
  let directory = dirname(
    realpathSync(shimTarget ? resolve(dirname(executable), shimTarget) : executable),
  );
  while (true) {
    const manifest = join(directory, "package.json");
    if (
      existsSync(manifest) &&
      JSON.parse(readFileSync(manifest, "utf8")).name === "@earendil-works/pi-coding-agent"
    ) {
      return directory;
    }
    const parent = dirname(directory);
    assert.notEqual(parent, directory, "Could not find the Pi package.");
    directory = parent;
  }
}

function message(id, parentId, role, text) {
  return {
    type: "message",
    id,
    parentId,
    timestamp,
    message: {
      role,
      content: [{ type: "text", text }],
      timestamp: Date.parse(timestamp),
    },
  };
}

function compaction(id, parentId, firstKeptEntryId) {
  return {
    type: "compaction",
    id,
    parentId,
    timestamp,
    firstKeptEntryId,
    summary: `Summary ${id}`,
    tokensBefore: 50000,
  };
}

function createManager({ compacted = true, repeated = false } = {}) {
  const entries = [
    message("first", null, "user", "Initial prompt"),
    message("answer", "first", "assistant", "Original response"),
    message("recent", "answer", "user", "Recent prompt"),
  ];
  if (compacted) {
    entries.push(compaction("compact-one", "recent", "recent"));
  }
  if (repeated) {
    entries.push(message("latest", "compact-one", "user", "Latest prompt"));
    entries.push(compaction("compact-two", "latest", "latest"));
  }
  return SessionManager.inMemory(process.cwd(), undefined, [
    { type: "session", version: 3, id: "test-session", cwd: process.cwd(), timestamp },
    ...entries,
  ]);
}

async function loadPlugin() {
  const loaded = await loadExtensions([extensionPath], process.cwd());
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  const extension = loaded.extensions[0];
  return async (name, manager, { mode = "tui", reason = "startup", notify = () => {} } = {}) => {
    for (const handler of extension.handlers.get(name) ?? []) {
      await handler({ type: name, reason }, { mode, sessionManager: manager, ui: { notify } });
    }
  };
}

function uiHarness(manager) {
  const rendered = [];
  const mock = {
    isInitialized: true,
    sessionManager: manager,
    chatContainer: {
      clear: () => {
        rendered.length = 0;
      },
    },
    renderSessionEntries: (entries) => rendered.push(...entries),
    addMessageToChat: (entry) => rendered.push({ message: entry }),
    renderProjectTrustWarningIfNeeded: () => {},
    showStatus: () => {},
    footer: { invalidate: () => {} },
    programStatus: { handleEvent: () => {} },
    settingsManager: { getShowTerminalProgress: () => false },
    clearStatusIndicator: () => {},
    addCompactionCostNotice: () => {},
    flushCompactionQueue: async () => {},
    ui: { requestRender: () => {} },
    entriesRenderedByBoundaryCompaction: new Set(),
  };
  return { mock, rendered };
}

test("supported Pi loader installs the plugin without changing model context or stored entries", async () => {
  assert.ok(
    ["1.1.0", "1.2.0", "1.3.0"].includes(VERSION),
    `Revalidate the workaround before adding support for Pi ${VERSION}.`,
  );
  const manager = createManager();
  const modelContext = manager.buildSessionContext();
  const projection = manager.buildSessionProjection();
  const rawEntries = structuredClone(manager.getEntries());
  assert.ok(!manager.buildContextEntries().some((entry) => entry.id === "first"));

  const fire = await loadPlugin();
  await fire("session_start", manager, { notify: (message) => assert.fail(message) });
  const transcript = manager.buildContextEntries();
  assert.equal(transcript[0].id, "compact-one");
  assert.ok(transcript.some((entry) => entry.id === "first"));
  assert.deepEqual(manager.buildSessionContext(), modelContext);
  assert.deepEqual(manager.buildSessionProjection(), projection);
  assert.deepEqual(manager.getEntries(), rawEntries);
  await fire("session_shutdown", manager);
});

test("all four Pi UI paths retain the initial prompt", async () => {
  const fire = await loadPlugin();
  const manager = createManager();
  await fire("session_start", manager);

  for (const method of ["renderInitialMessages", "rebuildChatFromMessages"]) {
    const { mock, rendered } = uiHarness(manager);
    InteractiveMode.prototype[method].call(mock);
    assert.ok(
      rendered.some((entry) => entry.id === "first"),
      method,
    );
  }

  const latest = manager.getLeafEntry();
  for (const event of [
    { type: "compaction_end", result: latest, reason: "threshold", willRetry: false },
    { type: "entry_appended", entry: latest },
  ]) {
    const { mock, rendered } = uiHarness(manager);
    await InteractiveMode.prototype.handleEvent.call(mock, event);
    assert.ok(
      rendered.some((entry) => entry.id === "first"),
      event.type,
    );
    assert.equal(rendered.filter((entry) => entry.message?.role === "compactionSummary").length, 1);
  }
  await fire("session_shutdown", manager);
});

test("repeated compaction retains earlier history and renders each summary once", async () => {
  const fire = await loadPlugin();
  const manager = createManager({ repeated: true });
  const modelContext = manager.buildSessionContext();
  await fire("session_start", manager);
  const transcript = manager.buildContextEntries();
  assert.deepEqual(
    transcript.map((entry) => entry.id),
    ["compact-two", "first", "answer", "recent", "compact-one", "latest"],
  );
  assert.equal(new Set(transcript.map((entry) => entry.id)).size, transcript.length);
  assert.deepEqual(manager.buildSessionContext(), modelContext);
  await fire("session_shutdown", manager);
});

test("uncompacted sessions and branch navigation use only the active branch", async () => {
  const fire = await loadPlugin();
  const manager = createManager({ compacted: false });
  const originalEntries = manager.buildContextEntries();
  await fire("session_start", manager);
  assert.deepEqual(manager.buildContextEntries(), originalEntries);
  manager.branch("answer");
  manager.appendMessage({ role: "user", content: "Alternate prompt", timestamp: Date.now() });
  assert.ok(manager.getEntries().some((entry) => entry.id === "recent"));
  assert.ok(!manager.buildContextEntries().some((entry) => entry.id === "recent"));
  assert.equal(manager.buildContextEntries().at(-1).message.content, "Alternate prompt");
  await fire("session_shutdown", manager);
});

test("shutdown, reload, and session replacement restore and reapply the override", async () => {
  const fire = await loadPlugin();
  const first = createManager();
  const second = createManager({ repeated: true });
  const original = first.buildContextEntries;
  await fire("session_start", first);
  const initialOverride = first.buildContextEntries;
  await fire("session_start", first);
  assert.notEqual(first.buildContextEntries, initialOverride);
  await fire("session_start", second);
  assert.equal(first.buildContextEntries, original);
  assert.ok(second.buildContextEntries().some((entry) => entry.id === "first"));
  await fire("session_shutdown", second);
  assert.equal(second.buildContextEntries, original);
  await fire("session_shutdown", second);

  const reloaded = await loadPlugin();
  await reloaded("session_start", first);
  assert.ok(first.buildContextEntries().some((entry) => entry.id === "first"));
  await reloaded("session_shutdown", first);
  assert.equal(first.buildContextEntries, original);
});

test("reload retains history when Pi rebuilds before session_start and restores the reader if removed", async () => {
  const manager = createManager();
  const original = manager.buildContextEntries;
  const modelContext = manager.buildSessionContext();
  let fire = await loadPlugin();
  await fire("session_start", manager);

  for (let reload = 0; reload < 2; reload += 1) {
    await fire("session_shutdown", manager, { reason: "reload" });
    const { mock, rendered } = uiHarness(manager);
    InteractiveMode.prototype.rebuildChatFromMessages.call(mock);
    assert.ok(rendered.some((entry) => entry.id === "first"));
    assert.equal(manager.buildContextEntries, original);
    fire = await loadPlugin();
    await fire("session_start", manager, { reason: "reload" });
    assert.deepEqual(manager.buildSessionContext(), modelContext);
  }

  await fire("session_shutdown", manager, { reason: "reload" });
  const { mock, rendered } = uiHarness(manager);
  InteractiveMode.prototype.rebuildChatFromMessages.call(mock);
  assert.ok(rendered.some((entry) => entry.id === "first"));
  assert.equal(manager.buildContextEntries, original);
  assert.ok(!manager.buildContextEntries().some((entry) => entry.id === "first"));
});

test("reload without an intermediate UI rebuild does not retain an old override", async () => {
  const manager = createManager();
  const original = manager.buildContextEntries;
  const fire = await loadPlugin();
  await fire("session_start", manager);
  await fire("session_shutdown", manager, { reason: "reload" });

  const reloaded = await loadPlugin();
  await reloaded("session_start", manager, { reason: "reload" });
  assert.ok(manager.buildContextEntries().some((entry) => entry.id === "first"));
  await reloaded("session_shutdown", manager);
  assert.equal(manager.buildContextEntries, original);
});

test("print, JSON, and RPC modes are not patched", async () => {
  for (const mode of ["print", "json", "rpc"]) {
    const fire = await loadPlugin();
    const manager = createManager();
    const original = manager.buildContextEntries;
    await fire("session_start", manager, { mode });
    assert.equal(manager.buildContextEntries, original, mode);
    await fire("session_shutdown", manager, { mode });
  }
});

test("shutdown does not overwrite a later plugin's method override", async () => {
  const fire = await loadPlugin();
  const manager = createManager();
  await fire("session_start", manager);
  const otherOverride = () => [];
  manager.buildContextEntries = otherOverride;
  await fire("session_shutdown", manager);
  assert.equal(manager.buildContextEntries, otherOverride);
});

for (const version of ["1.1.1", "1.2.1", "1.3.1", "1.4.0", "2.0.0", "1.2.0-rc.1", "1.3.0-rc.1"]) {
  test(`unsupported Pi ${version} warns only in TUI mode and leaves the manager unchanged`, async () => {
    const source = stripTypeScriptTypes(readFileSync(extensionPath, "utf8"));
    const dependency = `data:text/javascript,${encodeURIComponent(`export const VERSION = ${JSON.stringify(version)};`)}`;
    const mockedSource = source.replace(
      'from "@earendil-works/pi-coding-agent"',
      `from "${dependency}"`,
    );
    assert.notEqual(mockedSource, source);
    const { default: factory } = await import(
      `data:text/javascript,${encodeURIComponent(mockedSource)}`
    );
    const handlers = new Map();
    factory({ on: (name, handler) => handlers.set(name, handler) });
    const manager = createManager();
    const original = manager.buildContextEntries;
    const warnings = [];
    const ctx = {
      sessionManager: manager,
      ui: { notify: (...args) => warnings.push(args) },
    };
    for (const mode of ["print", "json", "rpc"]) {
      await handlers.get("session_start")({}, { ...ctx, mode });
      assert.equal(manager.buildContextEntries, original, mode);
    }
    assert.deepEqual(warnings, []);

    await handlers.get("session_start")({}, { ...ctx, mode: "tui" });
    assert.equal(manager.buildContextEntries, original);
    assert.deepEqual(warnings, [[
      `preserve-scrollback is disabled for Pi ${version}. Tested versions: 1.1.0, 1.2.0, 1.3.0.`,
      "warning",
    ]]);
  });
}
