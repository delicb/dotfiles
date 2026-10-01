import { fork } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import lockfile from "proper-lockfile";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigLoader } from "./loader";
import type { ConfigPaths } from "./types";

describe("ConfigLoader", () => {
  let agentDir: string;
  let repositoryRoot: string;
  let paths: ConfigPaths;

  beforeEach(() => {
    agentDir = mkdtempSync(join(tmpdir(), "pi-mcp-agent-"));
    repositoryRoot = mkdtempSync(join(tmpdir(), "pi-mcp-repo-"));
    paths = { agentDir, repositoryRoot, projectTrusted: true };
  });

  afterEach(() => {
    rmSync(agentDir, { recursive: true, force: true });
    rmSync(repositoryRoot, { recursive: true, force: true });
  });

  function globalConfig(value: unknown): void {
    writeFileSync(join(agentDir, "mcp.json"), JSON.stringify(value));
  }

  function projectConfig(value: unknown): void {
    writeFileSync(join(repositoryRoot, ".mcp.json"), JSON.stringify(value));
  }

  function overrides(value: unknown): void {
    writeFileSync(join(agentDir, "mcp-overrides.json"), JSON.stringify(value));
  }

  it("allows missing configuration files", () => {
    expect(ConfigLoader.load(paths)).toEqual({ servers: [], errors: [] });
  });

  it("combines global and repository servers without deep-merging duplicate names", () => {
    globalConfig({
      autoEnableCodemode: false,
      mcpServers: {
        shared: {
          url: "https://global.example/mcp",
          headers: { Authorization: "secret" },
        },
        personal: { command: "personal" },
      },
    });
    projectConfig({
      mcpServers: {
        shared: { command: "project", args: ["."] },
        repository: { url: "https://repo.example/mcp" },
      },
    });
    const result = ConfigLoader.load(paths);
    expect(result.errors).toEqual([]);
    expect(result.autoEnableCodemode).toBe(false);
    expect(result.servers.map((server) => server.name)).toEqual([
      "shared",
      "personal",
      "repository",
    ]);
    const shared = result.servers[0];
    expect(shared?.scope).toBe("project");
    expect(shared?.config).toMatchObject({ command: "project", args: ["."] });
    expect(shared?.config).not.toHaveProperty("url");
    expect(shared?.config).not.toHaveProperty("headers");
  });

  it("applies defaults only to missing fields and applies overrides to both sources", () => {
    globalConfig({
      mcpServers: { global: { command: "global", exposure: "direct" } },
    });
    projectConfig({
      mcpServers: {
        shared: { command: "shared", enabled: false, exposure: "hidden" },
        plain: { command: "plain" },
      },
    });
    overrides({
      defaults: { exposure: "codemode", enabled: true },
      servers: {
        global: { exposure: "deferred" },
        shared: { exposure: "direct", enabled: true },
        absent: { exposure: "hidden" },
      },
    });
    const result = ConfigLoader.load(paths);
    expect(result.errors).toEqual([]);
    expect(
      result.servers.map(({ name, config }) => [
        name,
        config.exposure,
        config.enabled,
      ]),
    ).toEqual([
      ["global", "deferred", true],
      ["shared", "direct", true],
      ["plain", "codemode", true],
    ]);
  });

  it("replaces tool exposure maps and preserves pattern order", () => {
    projectConfig({
      mcpServers: {
        tools: { command: "tools", toolExposure: { old: "direct" } },
      },
    });
    overrides({
      servers: {
        tools: {
          toolExposure: { "get_*": "hidden", "*": "codemode", exact: "direct" },
        },
      },
    });
    const map = ConfigLoader.load(paths).servers[0]?.config.toolExposure;
    expect(map).toEqual({
      "get_*": "hidden",
      "*": "codemode",
      exact: "direct",
    });
    expect(Object.keys(map ?? {})).toEqual(["get_*", "*", "exact"]);
  });

  it("starts repository stdio servers from the worktree root", () => {
    projectConfig({
      mcpServers: {
        plain: { command: "node", args: ["scripts/mcp.js"] },
        relative: { command: "node", cwd: "tools" },
        absolute: { command: "node", cwd: "/tmp" },
        home: { command: "node", cwd: "~/tools" },
        bareHome: { command: "node", cwd: "~" },
      },
    });
    globalConfig({
      mcpServers: { personal: { command: "node", cwd: "global-tools" } },
    });
    const entries = ConfigLoader.load(paths).servers;
    expect(
      entries.map(({ name, config }) => [
        name,
        "cwd" in config ? config.cwd : undefined,
      ]),
    ).toEqual([
      ["personal", "global-tools"],
      ["plain", repositoryRoot],
      ["relative", join(repositoryRoot, "tools")],
      ["absolute", "/tmp"],
      ["home", "~/tools"],
      ["bareHome", "~"],
    ]);
  });

  it("does not import an untrusted repository", () => {
    globalConfig({ mcpServers: { personal: { command: "personal" } } });
    projectConfig({ mcpServers: { project: { command: "project" } } });
    expect(
      ConfigLoader.load({ ...paths, projectTrusted: false }).servers.map(
        (entry) => entry.name,
      ),
    ).toEqual(["personal"]);
  });

  it("does not fall back to a global server when its repository replacement is invalid", () => {
    globalConfig({
      mcpServers: {
        shared: { command: "global" },
        valid: { command: "valid" },
      },
    });
    projectConfig({ mcpServers: { shared: { command: ["invalid"] } } });
    const result = ConfigLoader.load(paths);
    expect(result.servers.map((entry) => entry.name)).toEqual(["valid"]);
    expect(result.errors).toHaveLength(1);
  });

  it("does not expose configured servers when the override file is invalid", () => {
    globalConfig({ mcpServers: { tools: { command: "tools" } } });
    overrides({ servers: { tools: { exposure: "typo" } } });
    const result = ConfigLoader.load(paths);
    expect(result.servers).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  it.each([
    { defaults: { command: "unexpected" } },
    { servers: { tools: { headers: { Authorization: "unexpected" } } } },
    { default: { exposure: "direct" } },
    { servers: [] },
    { $schema: 42 },
    { servers: { tools: { enabled: "false" } } },
    { servers: { tools: { toolExposure: { "*": "typo" } } } },
  ])("rejects invalid policies: %j", (value) => {
    globalConfig({ mcpServers: { tools: { command: "tools" } } });
    overrides(value);
    expect(ConfigLoader.load(paths).servers).toEqual([]);
    expect(ConfigLoader.load(paths).errors).toHaveLength(1);
  });

  it("reports JSON errors without returning file contents or credentials", () => {
    writeFileSync(join(agentDir, "mcp.json"), '{"secret": "never-print-this",');
    const result = ConfigLoader.load(paths);
    expect(result.errors.join()).not.toContain("never-print-this");
    expect(result.servers).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  it("rejects conflicting tool namespaces", () => {
    projectConfig({
      mcpServers: {
        "one-two": { command: "one" },
        one_two: { command: "two" },
      },
    });
    const result = ConfigLoader.load(paths);
    expect(result.servers).toEqual([]);
    expect(result.errors).toHaveLength(2);
  });

  it("rejects project provider auth but supports global provider auth", () => {
    globalConfig({
      mcpServers: {
        global: {
          url: "https://global.example/mcp",
          auth: { provider: "openai" },
        },
      },
    });
    projectConfig({
      mcpServers: {
        project: {
          url: "https://project.example/mcp",
          auth: { provider: "openai" },
        },
      },
    });
    const result = ConfigLoader.load(paths);
    expect(result.servers.map((entry) => entry.name)).toEqual(["global"]);
    expect(result.errors).toHaveLength(1);
  });

  it("uses native transport aliases, OAuth settings, and unresolved environment values", () => {
    globalConfig({
      mcpServers: {
        remote: {
          type: "streamable-http",
          url: "https://remote.example/mcp",
          oauth: {
            clientId: "client",
            callbackUrl: "http://localhost:8765/callback",
            callbackPort: 8765,
            clientSecret: `\${SECRET}`,
            clientName: "Claude Code",
          },
          headers: { Custom: `\${TOKEN}` },
          exposure: "codemode-deferred",
        },
      },
    });
    const result = ConfigLoader.load(paths);
    expect(result.errors).toEqual([]);
    expect(result.servers[0]?.config).toMatchObject({
      type: "http",
      exposure: "codemode",
      oauth: { clientSecret: `\${SECRET}` },
      headers: { Custom: `\${TOKEN}` },
    });
  });

  it.each([
    { type: "sse", url: "https://example.com" },
    { url: "file:///tmp/secret" },
    { url: "https://example.com", command: "also-stdio" },
    { command: "test", args: [1] },
    { command: "test", env: { TOKEN: 1 } },
    { command: "test", timeout: -1 },
    { command: "test", toolExposure: { "*": "typo" } },
    {
      url: "https://example.com",
      oauth: { callbackUrl: "https://localhost/callback" },
    },
    { url: "https://example.com", oauth: { callbackPort: 65536 } },
    {
      url: "https://example.com",
      oauth: {
        callbackUrl: "http://localhost:8765/callback",
        callbackPort: 8766,
      },
    },
    { url: "http://example.com", auth: { provider: "openai" } },
  ])("rejects invalid server definitions: %j", (config) => {
    globalConfig({ mcpServers: { bad: config } });
    const result = ConfigLoader.load(paths);
    expect(result.servers).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  it("saves Pi controls without changing either definitions file", () => {
    globalConfig({ mcpServers: { tools: { command: "global" } } });
    projectConfig({ mcpServers: { tools: { command: "project" } } });
    overrides({
      defaults: { exposure: "hidden", enabled: false },
      servers: {
        other: { enabled: false },
        tools: { toolExposure: { "*": "deferred" } },
      },
    });
    const globalBefore = readFileSync(join(agentDir, "mcp.json"), "utf8");
    const projectBefore = readFileSync(
      join(repositoryRoot, ".mcp.json"),
      "utf8",
    );
    ConfigLoader.savePolicy(agentDir, "tools", {
      enabled: true,
      exposure: "codemode",
    });
    expect(readFileSync(join(agentDir, "mcp.json"), "utf8")).toBe(globalBefore);
    expect(readFileSync(join(repositoryRoot, ".mcp.json"), "utf8")).toBe(
      projectBefore,
    );
    expect(
      JSON.parse(readFileSync(join(agentDir, "mcp-overrides.json"), "utf8")),
    ).toMatchObject({
      defaults: { exposure: "hidden", enabled: false },
      servers: {
        other: { enabled: false },
        tools: {
          enabled: true,
          exposure: "codemode",
          toolExposure: { "*": "deferred" },
        },
      },
    });
    expect(ConfigLoader.load(paths).servers[0]?.config.enabled).toBe(true);
  });

  it("preserves the schema reference when saving", () => {
    overrides({ $schema: "./mcp-overrides.schema.json" });
    ConfigLoader.savePolicy(agentDir, "tools", { enabled: false });
    expect(
      JSON.parse(readFileSync(join(agentDir, "mcp-overrides.json"), "utf8")),
    ).toEqual({
      $schema: "./mcp-overrides.schema.json",
      servers: { tools: { enabled: false } },
    });
  });

  it("locks before reading and retains updates from separate processes", async () => {
    overrides({ defaults: { exposure: "codemode" } });
    const path = join(agentDir, "mcp-overrides.json");
    const moduleUrl = compileConfigModules(agentDir);
    const reads: string[] = [];
    const children = ["one", "two"].map((name) => {
      const child = fork(
        fileURLToPath(new URL("./fixtures/policy-writer.mjs", import.meta.url)),
        [moduleUrl, agentDir, name],
        { execArgv: [], stdio: ["ignore", "ignore", "pipe", "ipc"] },
      );
      let stderr = "";
      child.stderr?.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("message", (message: unknown) => {
        if (message === "read") {
          reads.push(name);
        }
      });
      const closed = once(child, "close");
      const ready = once(child, "message");
      return { child, closed, ready, getStderr: () => stderr };
    });
    try {
      const release = lockfile.lockSync(path, { realpath: false });
      try {
        const ready = await Promise.all(children.map(({ ready }) => ready));
        expect(ready.map(([message]) => message)).toEqual(["ready", "ready"]);
        const started = children.map(({ child }) => once(child, "message"));
        for (const { child } of children) {
          child.send("save");
        }
        const messages = await Promise.all(started);
        expect(messages.map(([message]) => message)).toEqual([
          "started",
          "started",
        ]);
        await delay(100);
        expect(reads).toEqual([]);
        overrides({
          defaults: { exposure: "codemode" },
          servers: { existing: { enabled: true } },
        });
      } finally {
        release();
      }
      const exits = await Promise.all(children.map(({ closed }) => closed));
      expect(children.map(({ getStderr }) => getStderr())).toEqual(["", ""]);
      expect(exits).toEqual([
        [0, null],
        [0, null],
      ]);
      expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
        defaults: { exposure: "codemode" },
        servers: {
          existing: { enabled: true },
          one: { enabled: false },
          two: { enabled: false },
        },
      });
      expect(reads.sort()).toEqual(["one", "two"]);
      expect(existsSync(`${path}.lock`)).toBe(false);
    } finally {
      for (const { child } of children) {
        if (child.exitCode === null) {
          child.kill();
        }
      }
      await Promise.allSettled(children.map(({ closed }) => closed));
    }
  }, 10000);

  it("does not overwrite a file when its lock remains busy", () => {
    overrides({ defaults: { enabled: true } });
    const path = join(agentDir, "mcp-overrides.json");
    const before = readFileSync(path, "utf8");
    const release = lockfile.lockSync(path, { realpath: false });
    try {
      expect(() =>
        ConfigLoader.savePolicy(agentDir, "tools", { enabled: false }),
      ).toThrow("MCP override file is busy. Try again.");
      expect(readFileSync(path, "utf8")).toBe(before);
    } finally {
      release();
    }
  });

  it("does not overwrite invalid override files", () => {
    const path = join(agentDir, "mcp-overrides.json");
    writeFileSync(path, "invalid");
    expect(() =>
      ConfigLoader.savePolicy(agentDir, "tools", { enabled: false }),
    ).toThrow();
    expect(readFileSync(path, "utf8")).toBe("invalid");
    expect(existsSync(`${path}.lock`)).toBe(false);
    overrides({});
    ConfigLoader.savePolicy(agentDir, "tools", { enabled: false });
  });

  it("supports server names that match JavaScript object keys", () => {
    projectConfig({
      mcpServers: {
        constructor: { command: "test" },
        toString: { command: "test" },
      },
    });
    ConfigLoader.savePolicy(agentDir, "constructor", { enabled: false });
    expect(
      ConfigLoader.load(paths).servers.map(({ name, config }) => [
        name,
        config.enabled,
      ]),
    ).toEqual([
      ["constructor", false],
      ["toString", undefined],
    ]);
  });

  it("preserves an override file symlink when saving", () => {
    const target = join(agentDir, "policy.json");
    writeFileSync(target, "{}");
    symlinkSync("policy.json", join(agentDir, "mcp-overrides.json"));
    ConfigLoader.savePolicy(agentDir, "tools", { enabled: false });
    expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({
      servers: { tools: { enabled: false } },
    });
  });
});

function compileConfigModules(agentDir: string): string {
  const directory = join(agentDir, "modules");
  mkdirSync(directory);
  const dependency = pathToFileURL(
    createRequire(import.meta.url).resolve("proper-lockfile"),
  ).href;
  for (const name of ["loader", "validation"]) {
    const source = readFileSync(
      new URL(`./${name}.ts`, import.meta.url),
      "utf8",
    )
      .replace('from "./validation"', 'from "./validation.mjs"')
      .replace('from "proper-lockfile"', `from ${JSON.stringify(dependency)}`);
    const compiled = transpileModule(source, {
      compilerOptions: {
        module: ModuleKind.ESNext,
        target: ScriptTarget.ES2022,
      },
    });
    writeFileSync(join(directory, `${name}.mjs`), compiled.outputText);
  }
  return pathToFileURL(join(directory, "loader.mjs")).href;
}
