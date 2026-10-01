import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProjectTrustStore } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigValidation } from "../../src/config/validation";

describe("RPC startup", () => {
  let root: string;
  let agentDir: string;
  let repositoryRoot: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "pi-mcp-rpc-"));
    agentDir = join(root, "agent");
    repositoryRoot = join(root, "repository");
    mkdirSync(agentDir);
    mkdirSync(repositoryRoot);
    execFileSync("git", ["init", "-q", repositoryRoot]);
    writeFileSync(
      join(repositoryRoot, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          repository_server: { command: "never-run", enabled: false },
        },
      }),
    );
    writeFileSync(
      join(agentDir, "mcp.json"),
      JSON.stringify({
        mcpServers: { global_server: { command: "never-run", enabled: false } },
      }),
    );
    writeFileSync(join(agentDir, "settings.json"), "{}");
    writeFileSync(
      join(agentDir, "models.json"),
      JSON.stringify({
        providers: {
          test: {
            baseUrl: "http://127.0.0.1:9/v1",
            api: "openai-completions",
            apiKey: "unused-test-value",
            models: [
              {
                id: "test-model",
                name: "Test model",
                input: ["text"],
                contextWindow: 100000,
                maxTokens: 8192,
              },
            ],
          },
        },
      }),
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  async function start(flags: string[] = [], cwd = repositoryRoot) {
    const cli = fileURLToPath(
      new URL(
        "./cli.js",
        import.meta.resolve("@earendil-works/pi-coding-agent"),
      ),
    );
    const extension = fileURLToPath(new URL("./index.ts", import.meta.url));
    const child = spawn(
      process.execPath,
      [
        cli,
        "--offline",
        "--no-session",
        "--mode",
        "rpc",
        "--provider",
        "test",
        "--model",
        "test-model",
        "--no-extensions",
        "--no-skills",
        "--no-prompt-templates",
        "--no-themes",
        "--no-context-files",
        "--extension",
        extension,
        ...flags,
      ],
      {
        cwd,
        env: { ...process.env, PI_CODING_AGENT_DIR: agentDir },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const closed = once(child, "close");
    const events: Array<Record<string, unknown>> = [];
    let buffer = "";
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      for (;;) {
        const newline = buffer.indexOf("\n");
        if (newline < 0) {
          break;
        }
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) {
          continue;
        }
        const event = ConfigValidation.record(JSON.parse(line), "RPC event");
        events.push(event);
        if (event.type === "response" && event.id === "status") {
          child.stdin.end();
        }
      }
    });
    child.stdin.write(
      [
        JSON.stringify({ type: "get_state", id: "state" }),
        JSON.stringify({ type: "prompt", id: "status", message: "/mcp" }),
        "",
      ].join("\n"),
    );
    const timeout = setTimeout(() => child.kill("SIGKILL"), 12000);
    try {
      const [code, signal] = await closed;
      expect({ code, signal, stderr }).toEqual({
        code: 0,
        signal: null,
        stderr: "",
      });
      expect(events.find((event) => event.id === "state")).toMatchObject({
        type: "response",
        command: "get_state",
        success: true,
      });
      expect(events.find((event) => event.id === "status")).toMatchObject({
        type: "response",
        command: "prompt",
        success: true,
      });
      expect(events.some((event) => event.method === "select")).toBe(false);
      return events
        .filter((event) => typeof event.message === "string")
        .map((event) => event.message)
        .join("\n");
    } finally {
      clearTimeout(timeout);
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
      await closed;
    }
  }

  it.each([
    { flags: [], allowed: false },
    { flags: ["--mcp-approve"], allowed: true },
    { flags: ["--name", "-a"], allowed: false },
    { flags: ["--name", "--approve"], allowed: false },
    { flags: ["--name", "--mcp-approve"], allowed: false },
    { flags: ["--mcp-approve", "--no-approve"], allowed: false },
  ])("processes RPC commands with flags $flags", async ({ flags, allowed }) => {
    const status = await start(flags);
    expect(status).toContain("global_server");
    if (allowed) {
      expect(status).toContain("repository_server");
    } else {
      expect(status).not.toContain("repository_server");
    }
  }, 15000);

  it("loads saved root approval without a startup dialog", async () => {
    new ProjectTrustStore(agentDir).set(repositoryRoot, true);
    expect(await start()).toContain("repository_server");
  }, 15000);

  it("does not extend saved subdirectory approval to the root", async () => {
    const subdirectory = join(repositoryRoot, "subdirectory");
    mkdirSync(join(subdirectory, ".pi"), { recursive: true });
    writeFileSync(join(subdirectory, ".pi", "settings.json"), "{}");
    new ProjectTrustStore(agentDir).set(subdirectory, true);
    const status = await start([], subdirectory);
    expect(status).toContain("global_server");
    expect(status).not.toContain("repository_server");
  }, 15000);
});
