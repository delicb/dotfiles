import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./defaults";
import { loadConfig } from "./loader";

let root: string;
let agentDir: string;
let cwd: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "openai-fast-config-"));
  agentDir = join(root, "agent");
  cwd = join(root, "project");
  mkdirSync(agentDir);
  mkdirSync(join(cwd, ".pi"), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function write(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value));
}

describe("configuration", () => {
  it("uses disabled defaults without creating files", () => {
    const config = loadConfig({ agentDir, cwd, projectTrusted: true });
    expect(config).toEqual(DEFAULT_CONFIG);
    config.models["openai/*"] = 3;
    expect(DEFAULT_CONFIG.models["openai/*"]).toBe(2);
  });

  it("applies trusted project fields over user fields without modifying files", () => {
    const global = join(agentDir, "openai-fast.json");
    const project = join(cwd, ".pi", "openai-fast.json");
    write(global, { enabled: true, models: { "openai/gpt-6.1-sol": 2 } });
    write(project, { models: {} });
    const before = readFileSync(global, "utf8");
    expect(loadConfig({ agentDir, cwd, projectTrusted: true })).toEqual({
      enabled: true,
      models: {},
    });
    expect(readFileSync(global, "utf8")).toBe(before);
  });

  it("accepts provider wildcards and exact pricing overrides", () => {
    const models = {
      "openai/*": 2,
      "openai-codex/*": 2,
      "openai/gpt-4.1": 3,
    };
    write(join(agentDir, "openai-fast.json"), { models });
    expect(loadConfig({ agentDir, cwd, projectTrusted: true }).models).toEqual(
      models,
    );
  });

  it("does not read untrusted project configuration", () => {
    writeFileSync(join(cwd, ".pi", "openai-fast.json"), "invalid JSON");
    expect(loadConfig({ agentDir, cwd, projectTrusted: false })).toEqual(
      DEFAULT_CONFIG,
    );
  });

  it.each([
    null,
    [],
    { enabled: "yes" },
    { models: [] },
    { models: { "openrouter/gpt-6.1-sol": 2 } },
    { models: { "openrouter/*": 2 } },
    { models: { "openai/**": 2 } },
    { models: { "openai/gpt-*": 2 } },
    { models: { "openai/*/suffix": 2 } },
    { models: { "openai/*": 1 } },
    { models: { "openai/*": "2" } },
    { models: { "openai/gpt-6.1-sol": 0 } },
    { models: { "openai/gpt-6.1-sol": "2" } },
    { typo: true },
  ])("rejects invalid configuration %j", (value) => {
    write(join(agentDir, "openai-fast.json"), value);
    expect(() => loadConfig({ agentDir, cwd, projectTrusted: true })).toThrow();
  });

  it("reports invalid JSON without exposing its content", () => {
    writeFileSync(join(agentDir, "openai-fast.json"), "secret input");
    expect(() => loadConfig({ agentDir, cwd, projectTrusted: true })).toThrow(
      "valid JSON",
    );
  });
});
