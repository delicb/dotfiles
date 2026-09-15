import { describe, expect, it } from "vitest";
import {
  applyPrimaryWriteGuard,
  hasSandboxWriteDenial,
  isPathInside,
  sandboxBashCommand,
} from "./write-guard";

const options = {
  cwd: "/repos/example/packages/app",
  primaryRoot: "/repos/example",
  sandboxExecutable: "/usr/bin/sandbox-exec",
};

describe("isPathInside", () => {
  it("matches relative and absolute paths inside the repository", () => {
    expect(isPathInside("/repos/example", "/repos/example", "src/app.ts")).toBe(
      true,
    );
    expect(
      isPathInside("/repos/example", "/tmp", "/repos/example/README.md"),
    ).toBe(true);
    expect(
      isPathInside("/repos/example", "/repos/example", "@src/app.ts"),
    ).toBe(true);
  });

  it("does not match a sibling path", () => {
    expect(
      isPathInside("/repos/example", "/repos/example", "../other/app.ts"),
    ).toBe(false);
  });
});

describe("applyPrimaryWriteGuard", () => {
  it("blocks edit and write calls inside the primary worktree", () => {
    expect(
      applyPrimaryWriteGuard("edit", { path: "../../src/app.ts" }, options),
    ).toEqual({
      blockReason:
        "This write targets the primary worktree. Call worktree_prepare to ask the user where to continue, then retry.",
      sandboxedCommands: 0,
    });
    expect(
      applyPrimaryWriteGuard(
        "write",
        { path: "/repos/example/README.md" },
        options,
      ),
    ).toEqual({
      blockReason:
        "This write targets the primary worktree. Call worktree_prepare to ask the user where to continue, then retry.",
      sandboxedCommands: 0,
    });
  });

  it("allows edit and write calls outside the primary worktree", () => {
    expect(
      applyPrimaryWriteGuard("write", { path: "/tmp/notes.md" }, options),
    ).toEqual({ sandboxedCommands: 0 });
  });

  it("wraps bash commands with the macOS sandbox", () => {
    const input = { command: "rg 'needle' src" };

    expect(applyPrimaryWriteGuard("bash", input, options)).toEqual({
      sandboxedCommands: 1,
    });
    expect(input.command).toContain("PI_WORKTREE_READ_ONLY=1");
    expect(input.command).toContain("'/usr/bin/sandbox-exec'");
    expect(input.command).toContain(
      '(deny file-write* (subpath "/repos/example"))',
    );
    expect(input.command).toContain("'rg '\"'\"'needle'\"'\"' src'");
  });

  it("does not wrap bash when the sandbox is unavailable", () => {
    const input = { command: "rg needle src" };

    expect(
      applyPrimaryWriteGuard("bash", input, {
        ...options,
        sandboxExecutable: undefined,
      }),
    ).toEqual({ sandboxedCommands: 0 });
    expect(input.command).toBe("rg needle src");
  });

  it("wraps bash calls inside tool_batch", () => {
    const input = {
      calls: [
        { tool: "read", args: { path: "README.md" } },
        { tool: "bash", args: { command: "rg needle src" } },
        { name: "bash", command: "git status --short" },
        { tool: "bash", command: "pwd", args: { timeout: 5 } },
      ],
    };

    expect(applyPrimaryWriteGuard("tool_batch", input, options)).toEqual({
      sandboxedCommands: 3,
    });
    expect(input.calls[0]).toEqual({
      tool: "read",
      args: { path: "README.md" },
    });
    expect(input.calls[1]?.args?.command).toContain("PI_WORKTREE_READ_ONLY=1");
    expect(input.calls[2]?.command).toContain("PI_WORKTREE_READ_ONLY=1");
    expect(input.calls[3]?.command).toContain("PI_WORKTREE_READ_ONLY=1");
  });

  it("checks calls inside a parallel tool", () => {
    const input = {
      tool_uses: [
        {
          recipient_name: "functions.bash",
          parameters: { command: "rg needle src" },
        },
        {
          recipient_name: "functions.edit",
          parameters: { path: "/repos/example/src/app.ts" },
        },
      ],
    };

    expect(
      applyPrimaryWriteGuard("multi_tool_use.parallel", input, options),
    ).toEqual({
      blockReason:
        "This write targets the primary worktree. Call worktree_prepare to ask the user where to continue, then retry.",
      sandboxedCommands: 1,
    });
  });

  it("allows MCP tools without inspection", () => {
    const input = { tool: "linear_get_issue", args: { id: "INF-2601" } };

    expect(applyPrimaryWriteGuard("mcp", input, options)).toEqual({
      sandboxedCommands: 0,
    });
    expect(input).toEqual({
      tool: "linear_get_issue",
      args: { id: "INF-2601" },
    });
  });
});

describe("hasSandboxWriteDenial", () => {
  it("detects a write denial from a sandboxed command", () => {
    const input = {
      command: sandboxBashCommand(
        "printf text > README.md",
        options.primaryRoot,
        options.sandboxExecutable,
      ),
    };

    expect(
      hasSandboxWriteDenial("bash", input, "Operation not permitted"),
    ).toBe(true);
    expect(hasSandboxWriteDenial("bash", input, "No matches found")).toBe(
      false,
    );
  });
});
