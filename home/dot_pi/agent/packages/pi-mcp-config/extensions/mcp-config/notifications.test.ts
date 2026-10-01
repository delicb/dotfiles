import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createMcpExtension,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
  type ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { McpNotifications } from "./notifications";

describe("McpNotifications", () => {
  const message =
    "MCP servers need attention:\n  figma: needs sign-in\nRun /mcp to fix.";
  const compact = "MCP sign-in needed for figma";

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function setup() {
    const handlers = new Map<
      string,
      (event: never, ctx: ExtensionContext) => unknown
    >();
    const commands = new Map<
      string,
      Parameters<ExtensionAPI["registerCommand"]>[1]
    >();
    const unsubscribe = vi.fn();
    const on = vi.fn(
      (
        name: string,
        handler: (event: never, ctx: ExtensionContext) => unknown,
      ) => {
        handlers.set(name, handler);
        return unsubscribe;
      },
    );
    const registerCommand = vi.fn(
      (
        name: string,
        command: Parameters<ExtensionAPI["registerCommand"]>[1],
      ) => {
        commands.set(name, command);
      },
    );
    const pi = {
      on,
      registerCommand,
      getMcpServers: () => [],
      getAllTools: () => [],
      getActiveTools: () => [],
      setActiveTools: vi.fn(),
      registerTool: vi.fn(),
    } as unknown as ExtensionAPI;
    const notify = vi.fn();
    const select = vi.fn();
    const ui = { notify, select } as unknown as ExtensionUIContext;
    const ctx = {
      cwd: "/tmp",
      ui,
      mode: "rpc",
      modelRegistry: {},
    } as ExtensionContext;
    return {
      pi,
      api: McpNotifications.wrap(pi),
      ctx,
      notify,
      select,
      on,
      handlers,
      commands,
      registerCommand,
      unsubscribe,
    };
  }

  it.each([
    "session_start",
    "mcp_servers_change",
  ] as const)("compacts warnings from the MCP %s handler without changing the shared UI", async (event) => {
    const { api, handlers, ctx, notify, unsubscribe } = setup();
    const handler = async (_event: unknown, ctx: ExtensionContext) => {
      await Promise.resolve();
      ctx.ui.notify(message, "warning");
    };
    const detached =
      event === "session_start"
        ? api.on("session_start", handler)
        : api.on("mcp_servers_change", handler);
    expect(detached).toBe(unsubscribe);
    await handlers.get(event)?.({ type: event } as never, ctx);
    expect(notify).toHaveBeenCalledWith(compact, "warning");
    expect(ctx.ui.notify).toBe(notify);
    ctx.ui.notify(message, "warning");
    expect(notify).toHaveBeenLastCalledWith(message, "warning");
  });

  it.each([
    "info",
    "error",
    undefined,
  ] as const)("preserves notifications with severity %s", async (type) => {
    const { api, handlers, ctx, notify } = setup();
    api.on("session_start", (_event, ctx) => ctx.ui.notify(message, type));
    await handlers.get("session_start")?.(
      { type: "session_start" } as never,
      ctx,
    );
    expect(notify).toHaveBeenCalledWith(message, type);
  });

  it("preserves unrelated warnings and dialog methods", async () => {
    const { api, handlers, ctx, notify, select } = setup();
    api.on("session_start", async (_event, ctx) => {
      ctx.ui.notify("MCP tools are unavailable.", "warning");
      await ctx.ui.select("Choose a server", ["figma"]);
    });
    await handlers.get("session_start")?.(
      { type: "session_start" } as never,
      ctx,
    );
    expect(notify).toHaveBeenCalledWith(
      "MCP tools are unavailable.",
      "warning",
    );
    expect(select).toHaveBeenCalledWith("Choose a server", ["figma"]);
  });

  it("keeps UI rebinding and stale-context checks lazy", async () => {
    const { api, handlers, ctx, notify } = setup();
    let captured: ExtensionContext | undefined;
    let currentUI = ctx.ui;
    let stale = false;
    Object.defineProperties(ctx, {
      ui: {
        get: () => {
          if (stale) {
            throw new Error("stale context");
          }
          return currentUI;
        },
      },
      cwd: {
        get: () => {
          if (stale) {
            throw new Error("stale context");
          }
          return "/tmp";
        },
      },
    });
    api.on("session_start", (_event, ctx) => {
      captured = ctx;
    });
    await handlers.get("session_start")?.(
      { type: "session_start" } as never,
      ctx,
    );
    const rebound = vi.fn();
    currentUI = { ...currentUI, notify: rebound };
    captured?.ui.notify(message, "warning");
    expect(rebound).toHaveBeenCalledWith(compact, "warning");
    expect(notify).not.toHaveBeenCalled();
    stale = true;
    expect(() => captured?.ui).toThrow("stale context");
    expect(() => captured?.cwd).toThrow("stale context");
  });

  it("leaves other event handlers and command handlers unchanged", () => {
    const { api, pi, on, registerCommand } = setup();
    const handler = vi.fn();
    api.on("session_shutdown", handler);
    expect(on).toHaveBeenCalledWith("session_shutdown", handler);
    const command = { handler: vi.fn() };
    api.registerCommand("mcp", command);
    expect(registerCommand).toHaveBeenCalledWith("mcp", command);
    expect(api.registerCommand).toBe(pi.registerCommand);
  });

  it("compacts real MCP connection warnings but keeps /mcp details", async () => {
    const directory = mkdtempSync(join(tmpdir(), "pi-mcp-notifications-"));
    vi.stubEnv("PI_CODING_AGENT_DIR", directory);
    const { api, handlers, commands, ctx, notify } = setup();
    const failure =
      "gcloud auth print-access-token failed - run `gcloud auth login` (Command failed: gcloud auth print-access-token)";
    try {
      await createMcpExtension({
        loadConfig: () => ({
          errors: [],
          servers: [
            {
              name: "gke",
              source: "test.json",
              scope: "global",
              config: { command: "never-run" },
            },
            {
              name: "gcs",
              source: "test.json",
              scope: "global",
              config: { command: "never-run" },
            },
          ],
        }),
        createTransport: () => {
          throw new Error(failure);
        },
      })(api);
      await handlers.get("session_start")?.(
        { type: "session_start" } as never,
        ctx,
      );
      await vi.waitFor(
        () => {
          expect(notify).toHaveBeenCalledWith(
            "gcloud auth failed for gke, gcs",
            "warning",
          );
        },
        { timeout: 5000 },
      );
      notify.mockClear();
      await commands.get("mcp")?.handler("", ctx as ExtensionCommandContext);
      const status = notify.mock.calls.map(([message]) => message).join("\n");
      expect(status).toContain("gke");
      expect(status).toContain("gcs");
      expect(status.split(failure)).toHaveLength(3);
      expect(notify.mock.calls[0]?.[1]).toBe("info");
    } finally {
      await handlers.get("session_shutdown")?.(
        { type: "session_shutdown" } as never,
        ctx,
      );
      rmSync(directory, { recursive: true, force: true });
    }
  }, 10000);
});
