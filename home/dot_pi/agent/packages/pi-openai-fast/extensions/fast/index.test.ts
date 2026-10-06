import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAssistantMessageEventStream,
  createProvider,
  type Model,
  type Provider,
} from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STATE_ENTRY, STATUS_KEY } from "../../src/tier";
import openAIFast from "./index";

const paths = vi.hoisted(() => ({ agentDir: "" }));
vi.mock("@earendil-works/pi-coding-agent", () => ({
  getAgentDir: () => paths.agentDir,
}));

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "openai-fast-extension-"));
  paths.agentDir = join(root, "agent");
  mkdirSync(paths.agentDir);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const model: Model<"openai-codex-responses"> = {
  id: "gpt-6.1-sol",
  provider: "openai-codex",
  api: "openai-codex-responses",
  name: "Test model",
  baseUrl: "https://chatgpt.com/backend-api",
  reasoning: true,
  input: ["text"],
  contextWindow: 10000,
  maxTokens: 1000,
  cost: { input: 2, output: 10, cacheRead: 1, cacheWrite: 0 },
};

type Entry = { type: string; customType?: string; data?: unknown };
type Command = {
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
  getArgumentCompletions: (
    prefix: string,
  ) => { value: string; label: string }[] | null;
};

function fixture(flag = false) {
  const handlers = new Map<
    string,
    (event: unknown, ctx: ExtensionContext) => unknown
  >();
  const commands = new Map<string, Command>();
  const providers = new Map<string, Provider>();
  for (const id of ["openai", "openai-codex"]) {
    const stream = () => createAssistantMessageEventStream();
    providers.set(
      id,
      createProvider({
        id,
        auth: { apiKey: { name: "Test", resolve: async () => undefined } },
        models: [],
        api: { stream, streamSimple: stream },
      }),
    );
  }
  let branch: Entry[] = [];
  const appendEntry = vi.fn((customType: string, data: unknown) => {
    branch.push({ type: "custom", customType, data });
  });
  const ui = { notify: vi.fn(), setStatus: vi.fn() };
  const ctx = {
    cwd: root,
    model,
    ui,
    isProjectTrusted: () => false,
    sessionManager: { getBranch: () => branch },
    modelRegistry: { getProvider: (id: string) => providers.get(id) },
  } as unknown as ExtensionCommandContext;
  const pi = {
    on: (
      name: string,
      handler: (event: unknown, ctx: ExtensionContext) => unknown,
    ) => handlers.set(name, handler),
    registerFlag: vi.fn(),
    getFlag: () => flag,
    registerCommand: (name: string, command: Command) =>
      commands.set(name, command),
    registerProvider: vi.fn((provider: Provider) =>
      providers.set(provider.id, provider),
    ),
    appendEntry,
  } as unknown as ExtensionAPI;
  openAIFast(pi);
  return {
    pi,
    ctx,
    ui,
    providers,
    appendEntry,
    branch: (entries: Entry[]) => {
      branch = entries;
    },
    event: (name: string) => handlers.get(name)?.({}, ctx),
    command: (args: string) => commands.get("fast")?.handler(args, ctx),
    completions: (prefix: string) =>
      commands.get("fast")?.getArgumentCompletions(prefix),
  };
}

describe("Fast mode extension", () => {
  it("starts disabled and wraps the original provider IDs", () => {
    const test = fixture();
    test.event("session_start");
    expect(test.ui.setStatus).toHaveBeenLastCalledWith(STATUS_KEY, undefined);
    expect(test.pi.registerProvider).toHaveBeenCalledTimes(2);
    expect([...test.providers.keys()]).toEqual(["openai", "openai-codex"]);
    expect(test.appendEntry).not.toHaveBeenCalled();
  });

  it("toggles only session state and reports premium processing", async () => {
    const test = fixture();
    test.event("session_start");
    await test.command("on");
    expect(test.appendEntry).toHaveBeenLastCalledWith(STATE_ENTRY, {
      enabled: true,
    });
    expect(test.ui.setStatus).toHaveBeenLastCalledWith(STATUS_KEY, "⚡️");
    expect(test.ui.notify.mock.lastCall?.[0]).toContain("premium");
    await test.command("status");
    expect(test.appendEntry).toHaveBeenCalledOnce();
    await test.command("");
    expect(test.appendEntry).toHaveBeenLastCalledWith(STATE_ENTRY, {
      enabled: false,
    });
    expect(test.ui.setStatus).toHaveBeenLastCalledWith(STATUS_KEY, undefined);
  });

  it("uses --fast only as a fallback for saved session state", () => {
    const test = fixture(true);
    test.event("session_start");
    expect(test.ui.setStatus).toHaveBeenLastCalledWith(STATUS_KEY, "⚡️");
    test.branch([
      { type: "custom", customType: STATE_ENTRY, data: { enabled: false } },
    ]);
    test.event("session_start");
    expect(test.ui.setStatus).toHaveBeenLastCalledWith(STATUS_KEY, undefined);
  });

  it("restores selected branch state after tree navigation and session changes", async () => {
    const test = fixture();
    test.event("session_start");
    await test.command("on");
    test.branch([]);
    test.event("session_tree");
    expect(test.ui.setStatus).toHaveBeenLastCalledWith(STATUS_KEY, undefined);
    test.branch([
      { type: "custom", customType: STATE_ENTRY, data: { enabled: true } },
    ]);
    test.event("session_start");
    expect(test.ui.setStatus).toHaveBeenLastCalledWith(STATUS_KEY, "⚡️");
    test.event("session_shutdown");
    expect(test.ui.setStatus).toHaveBeenLastCalledWith(STATUS_KEY, undefined);
  });

  it("requests Fast mode for gpt-6-sol and shows its estimate", async () => {
    const test = fixture(true);
    test.ctx.model = { ...model, id: "gpt-6-sol" };
    test.event("session_start");
    await test.command("status");
    expect(test.ui.notify.mock.lastCall?.[0]).toContain(
      "Requesting priority processing for openai-codex/gpt-6-sol",
    );
    expect(test.ui.notify.mock.lastCall?.[0]).toContain(
      "2x catalog Standard rates",
    );
    expect(test.ui.notify.mock.lastCall?.[0]).not.toContain("will not send");
  });

  it("shows published and fallback estimates when the model changes", async () => {
    const test = fixture(true);
    test.event("session_start");
    for (const [id, multiplier] of [
      ["gpt-5.5", 2.5],
      ["future-model", 2],
    ] as const) {
      test.ctx.model = { ...model, id };
      test.event("model_select");
      await test.command("status");
      expect(test.ui.notify.mock.lastCall?.[0]).toContain(
        `${multiplier}x catalog Standard rates`,
      );
    }
  });

  it("retains the preference across unsupported API changes", async () => {
    const test = fixture();
    test.event("session_start");
    await test.command("on");
    test.ctx.model = { ...model, api: "openai-responses" };
    test.event("model_select");
    expect(test.ui.setStatus).toHaveBeenLastCalledWith(STATUS_KEY, "⚡️");
    await test.command("status");
    expect(test.ui.notify.mock.lastCall?.[0]).toContain(
      "outside the configured models or supported APIs",
    );
    test.ctx.model = model;
    test.event("model_select");
    expect(test.ui.setStatus).toHaveBeenLastCalledWith(STATUS_KEY, "⚡️");
    expect(test.appendEntry).toHaveBeenCalledOnce();
  });

  it("fails closed on invalid configuration", async () => {
    writeFileSync(
      join(paths.agentDir, "openai-fast.json"),
      '{"enabled":"yes"}',
    );
    const test = fixture(true);
    test.event("session_start");
    await test.command("on");
    expect(test.appendEntry).not.toHaveBeenCalled();
    expect(test.ui.setStatus).toHaveBeenLastCalledWith(STATUS_KEY, undefined);
    expect(test.ui.notify.mock.lastCall?.[1]).toBe("error");
  });

  it("rejects invalid commands and provides argument completion", async () => {
    const test = fixture();
    test.event("session_start");
    await test.command("flex");
    expect(test.appendEntry).not.toHaveBeenCalled();
    expect(test.ui.notify).toHaveBeenLastCalledWith(
      "Usage: /fast [on|off|status]",
      "warning",
    );
    expect(test.completions("o")).toEqual([
      { value: "on", label: "on" },
      { value: "off", label: "off" },
    ]);
    expect(test.completions("invalid")).toBeNull();
  });
});
