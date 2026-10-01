import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hostUrl = process.env.PI_TEST_HOST
  ? pathToFileURL(resolve(process.env.PI_TEST_HOST, "dist/index.js")).href
  : import.meta.resolve("@earendil-works/pi-coding-agent");
const require = createRequire(hostUrl);
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url, {
  moduleCache: false,
  alias: { "@earendil-works/pi-tui": require.resolve("@earendil-works/pi-tui") },
});
const { DeltaRenderer } = await jiti.import(resolve(root, "extensions/DeltaRenderer.ts"));
const managers = [];
const patch = "--- demo.ts\n+++ demo.ts\n@@ -1 +1 @@\n-old\n+new\n";
const result = (stdout, extra = {}) => ({ stdout, stderr: "", code: 0, killed: false, ...extra });

function formatted(input) {
  return (
    "demo.ts\n" +
    input
      .split("\n")
      .filter((line) => /^[+-]/.test(line) && !/^(?:---|\+\+\+) /.test(line))
      .map((line, i) => `${i + 1} │${line}`)
      .join("\n") +
    "\n"
  );
}

function fixture(render = async (_command, _args, _options, input) => result(formatted(input))) {
  const calls = [];
  const files = [];
  let redraws = 0;
  const manager = new DeltaRenderer(async (command, args, options) => {
    calls.push({ command, args, options });
    if (command === "delta") {
      return result("delta 0.19.2\n");
    }
    const path = args[2];
    files.push(path);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal((await stat(dirname(path))).mode & 0o777, 0o700);
    const input = await readFile(path, "utf8");
    return render(command, args, options, input);
  });
  managers.push(manager);
  const options = {
    width: 79,
    appearance: "dark",
    toolCallId: "call-1",
    invalidate() {
      redraws++;
    },
  };
  return { manager, calls, files, options, redraws: () => redraws };
}

async function settle(manager) {
  await Promise.allSettled([...manager.tasks]);
}

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.dispose()));
});

test("does not start a CLI until an expanded diff asks for output", () => {
  const { calls } = fixture();
  assert.equal(calls.length, 0);
});

test("returns immediately, then caches output and requests one redraw", async () => {
  const f = fixture();
  assert.equal(f.manager.get(patch, f.options), undefined);
  assert.equal(f.manager.get(patch, f.options), undefined);
  await settle(f.manager);
  assert.equal(f.manager.get(patch, f.options), formatted(patch));
  assert.equal(f.redraws(), 1);
  for (let i = 0; i < 10; i++) {
    assert.equal(f.manager.get(patch, f.options), formatted(patch));
  }
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].options.timeout, 1000);
  assert.equal(f.calls[1].options.timeout, 2000);
  assert.ok(f.calls[1].args.includes("--paging=never"));
  assert.ok(f.calls[1].args.includes("--line-numbers"));
  assert.ok(f.calls[1].args.includes("--keep-plus-minus-markers"));
  assert.ok(!f.calls[1].args.includes("--color-only"));
  assert.ok(!f.calls[1].args.includes("--side-by-side"));
  assert.ok(f.calls[1].args.includes("--no-gitconfig"));
  assert.ok(f.calls[1].args.includes("--features="));
  assert.ok(f.calls[1].args.includes("--width=79"));
  assert.ok(f.calls[1].args.includes("--dark"));
  await assert.rejects(access(f.files[0]), { code: "ENOENT" });
});

test("selects side-by-side output at 100 available columns", async () => {
  const f = fixture();
  for (const width of [99, 100, 119]) {
    const options = { ...f.options, width };
    f.manager.get(patch, options);
    await settle(f.manager);
    assert.equal(f.calls.at(-1).args.includes("--side-by-side"), width >= 100);
    assert.equal(DeltaRenderer.isSideBySide(width), width >= 100);
  }
});

test("shares output across tool rows and notifies both rows", async () => {
  const f = fixture();
  f.manager.get(patch, f.options);
  f.manager.get(patch, { ...f.options, toolCallId: "call-2" });
  await settle(f.manager);
  assert.equal(f.redraws(), 2);
  assert.equal(f.calls.length, 2);
});

test("keys the cache by source, width, and terminal appearance", async () => {
  const f = fixture();
  for (const [input, options] of [
    [patch, f.options],
    [patch, { ...f.options, width: 39 }],
    [patch, { ...f.options, appearance: "light" }],
    [patch.replace("new", "NEW"), f.options],
  ]) {
    f.manager.get(input, options);
    await settle(f.manager);
    assert.equal(f.manager.get(input, options), formatted(input));
  }
  assert.equal(f.calls.filter((call) => call.command === "delta").length, 1);
  assert.equal(f.calls.filter((call) => call.command === "sh").length, 4);
  assert.ok(f.calls.some((call) => call.args.includes("--light")));
});

for (const failure of [
  () => Promise.resolve(result("", { code: 127 })),
  () => Promise.reject(new Error("ENOENT")),
  () => {
    throw new Error("Cannot execute delta");
  },
]) {
  test("keeps the fallback when delta is missing or the probe fails", async () => {
    let probes = 0;
    const manager = new DeltaRenderer(() => {
      probes++;
      return failure();
    });
    managers.push(manager);
    const options = {
      width: 79,
      appearance: "dark",
      toolCallId: "call-1",
      invalidate() {
        assert.fail("Unexpected redraw");
      },
    };
    manager.get(patch, options);
    await settle(manager);
    manager.get(patch, { ...options, width: 39 });
    await settle(manager);
    assert.equal(probes, 1);
    assert.equal(manager.get(patch, options), undefined);
  });
}

for (const failed of [
  result("", { code: 1 }),
  result(patch, { killed: true }),
  result("invalid output\n"),
  result("x".repeat(2 * 1024 * 1024 + 1)),
]) {
  test("caches a failed, killed, invalid, or oversized render as fallback", async () => {
    const f = fixture(async () => failed);
    f.manager.get(patch, f.options);
    await settle(f.manager);
    assert.equal(f.manager.get(patch, f.options), undefined);
    assert.equal(f.calls.length, 2);
    assert.equal(f.redraws(), 0);
    await assert.rejects(access(f.files[0]), { code: "ENOENT" });
  });
}

test("preserves colors but removes cursor commands and terminal links", async () => {
  const colored = formatted(patch)
    .replace("-old", "\x1b[31m-old\x1b[0m\x1b[0K")
    .replace("+new", "\x1b]8;;https://example.test\x07\x1b[32m+new\x1b[0m\x1b]8;;\x07\x1b[2J");
  const f = fixture(async () => result(colored));
  f.manager.get(patch, f.options);
  await settle(f.manager);
  const output = f.manager.get(patch, f.options);
  assert.ok(output.includes("\x1b[31m"));
  assert.ok(output.includes("\x1b[32m"));
  assert.doesNotMatch(output, /\x1b\[(?:0K|2J)|\x1b\]8/);
});

test("uses shell arguments instead of interpolating source text", async () => {
  const input = patch.replace("+new", "+$(touch should-not-exist); `exit 1` ' \" ");
  const f = fixture();
  f.manager.get(input, f.options);
  await settle(f.manager);
  assert.equal(f.manager.get(input, f.options), formatted(input));
  assert.equal(f.calls[1].args[1], 'exec delta "$@" < "$0"');
  assert.ok(f.calls[1].args.every((arg) => !arg.includes("touch should-not-exist")));
});

test("skips oversized input and unusable terminal widths", () => {
  const f = fixture();
  f.manager.get("x".repeat(128 * 1024 + 1), f.options);
  f.manager.get(patch, { ...f.options, width: 1 });
  assert.equal(f.calls.length, 0);
});

test("runs at most two formatter jobs at once", async () => {
  let active = 0;
  let maximum = 0;
  const f = fixture(async (_command, _args, _options, input) => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setImmediate(resolve));
    active--;
    return result(formatted(input));
  });
  for (let i = 0; i < 8; i++) {
    f.manager.get(patch.replace("new", `new${i}`), f.options);
  }
  await settle(f.manager);
  assert.ok(maximum <= 2);
  assert.equal(f.calls.length, 9);
});

test("limits queued requests and keeps 32 completed cache entries", async () => {
  const f = fixture();
  for (let i = 0; i < 70; i++) {
    f.manager.get(patch.replace("new", `new${i}`), f.options);
  }
  await settle(f.manager);
  assert.equal(f.calls.filter((call) => call.command === "sh").length, 64);
  assert.equal(f.manager.cache.size, 32);
});

test("shutdown cancels jobs, clears output, and removes temporary files", async () => {
  let started;
  const running = new Promise((resolve) => {
    started = resolve;
  });
  const f = fixture(async (_command, _args, options) => {
    started();
    return new Promise((resolve) => {
      options.signal.addEventListener("abort", () => resolve(result("", { killed: true })), {
        once: true,
      });
    });
  });
  f.manager.get(patch, f.options);
  await running;
  await f.manager.dispose();
  assert.equal(f.redraws(), 0);
  assert.equal(f.manager.cache.size, 0);
  assert.equal(f.manager.get(patch, f.options), undefined);
  await assert.rejects(access(f.files[0]), { code: "ENOENT" });
});
