import { isAbsolute, relative, resolve, sep } from "node:path";

const SANDBOX_MARKER = "PI_WORKTREE_READ_ONLY=1";
const PARALLEL_TOOLS = new Set(["multi_tool_use.parallel", "parallel"]);

export interface PrimaryWriteGuardOptions {
  cwd: string;
  primaryRoot: string;
  sandboxExecutable?: string;
}

export interface PrimaryWriteGuardResult {
  blockReason?: string;
  sandboxedCommands: number;
}

export function applyPrimaryWriteGuard(
  toolName: string,
  input: unknown,
  options: PrimaryWriteGuardOptions,
): PrimaryWriteGuardResult {
  return inspectToolCall(toolName, input, options, new Set());
}

export function hasSandboxWriteDenial(
  toolName: string,
  input: unknown,
  output: string,
): boolean {
  return (
    hasSandboxedCommand(toolName, input, new Set()) &&
    /operation not permitted|permission denied|read-only file system/i.test(
      output,
    )
  );
}

export function isPathInside(
  root: string,
  cwd: string,
  candidate: string,
): boolean {
  const path = candidate.startsWith("@") ? candidate.slice(1) : candidate;
  const relativePath = relative(resolve(root), resolve(cwd, path));
  return (
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`) &&
      !isAbsolute(relativePath))
  );
}

export function sandboxBashCommand(
  command: string,
  primaryRoot: string,
  sandboxExecutable: string,
): string {
  if (command.includes(SANDBOX_MARKER)) return command;

  const profile = [
    "(version 1)",
    "(allow default)",
    `(deny file-write* (subpath ${JSON.stringify(resolve(primaryRoot))}))`,
  ].join(" ");

  return [
    SANDBOX_MARKER,
    "GIT_OPTIONAL_LOCKS=0",
    shellQuote(sandboxExecutable),
    "-p",
    shellQuote(profile),
    "/bin/bash",
    "-c",
    shellQuote(command),
  ].join(" ");
}

function inspectToolCall(
  toolName: string,
  input: unknown,
  options: PrimaryWriteGuardOptions,
  visited: Set<object>,
): PrimaryWriteGuardResult {
  if (!isRecord(input) || visited.has(input)) return { sandboxedCommands: 0 };
  visited.add(input);

  const normalizedName = normalizeToolName(toolName);
  if (normalizedName === "edit" || normalizedName === "write") {
    const path = stringField(input, "path") ?? stringField(input, "file_path");
    if (path && isPathInside(options.primaryRoot, options.cwd, path)) {
      return {
        blockReason:
          "This write targets the primary worktree. Call worktree_prepare and retry.",
        sandboxedCommands: 0,
      };
    }
    return { sandboxedCommands: 0 };
  }

  if (normalizedName === "bash") {
    const command = stringField(input, "command");
    if (!command || !options.sandboxExecutable) {
      return { sandboxedCommands: 0 };
    }
    input.command = sandboxBashCommand(
      command,
      options.primaryRoot,
      options.sandboxExecutable,
    );
    return { sandboxedCommands: input.command === command ? 0 : 1 };
  }

  if (normalizedName === "tool_batch") {
    return inspectNestedCalls(input.calls, options, visited, "batch");
  }

  if (PARALLEL_TOOLS.has(normalizedName)) {
    return inspectNestedCalls(
      input.tool_uses ?? input.calls,
      options,
      visited,
      "parallel",
    );
  }

  return { sandboxedCommands: 0 };
}

function inspectNestedCalls(
  value: unknown,
  options: PrimaryWriteGuardOptions,
  visited: Set<object>,
  shape: "batch" | "parallel",
): PrimaryWriteGuardResult {
  if (!Array.isArray(value)) return { sandboxedCommands: 0 };

  let sandboxedCommands = 0;
  for (const item of value) {
    if (!isRecord(item)) continue;
    const toolName =
      stringField(item, shape === "parallel" ? "recipient_name" : "tool") ??
      stringField(item, "name") ??
      stringField(item, "tool");
    if (!toolName) continue;

    const nestedInput = nestedCallInput(item, toolName, shape);
    const result = inspectToolCall(toolName, nestedInput, options, visited);
    sandboxedCommands += result.sandboxedCommands;
    if (result.blockReason) {
      return { blockReason: result.blockReason, sandboxedCommands };
    }
  }

  return { sandboxedCommands };
}

function hasSandboxedCommand(
  toolName: string,
  input: unknown,
  visited: Set<object>,
): boolean {
  if (!isRecord(input) || visited.has(input)) return false;
  visited.add(input);

  const normalizedName = normalizeToolName(toolName);
  if (normalizedName === "bash") {
    return stringField(input, "command")?.includes(SANDBOX_MARKER) === true;
  }

  const shape = normalizedName === "tool_batch" ? "batch" : "parallel";
  if (shape === "parallel" && !PARALLEL_TOOLS.has(normalizedName)) return false;
  const calls =
    shape === "batch" ? input.calls : (input.tool_uses ?? input.calls);
  if (!Array.isArray(calls)) return false;

  return calls.some((item) => {
    if (!isRecord(item)) return false;
    const nestedName =
      stringField(item, shape === "parallel" ? "recipient_name" : "tool") ??
      stringField(item, "name") ??
      stringField(item, "tool");
    if (!nestedName) return false;
    const nestedInput = nestedCallInput(item, nestedName, shape);
    return hasSandboxedCommand(nestedName, nestedInput, visited);
  });
}

function nestedCallInput(
  item: Record<string, unknown>,
  toolName: string,
  shape: "batch" | "parallel",
): Record<string, unknown> {
  const nested =
    recordField(item, shape === "parallel" ? "parameters" : "args") ??
    recordField(item, "arguments") ??
    recordField(item, "args");
  if (!nested) return item;
  return hasToolInput(nested, toolName) || !hasToolInput(item, toolName)
    ? nested
    : item;
}

function hasToolInput(
  input: Record<string, unknown>,
  toolName: string,
): boolean {
  switch (normalizeToolName(toolName)) {
    case "bash":
      return typeof input.command === "string";
    case "edit":
    case "write":
      return (
        typeof input.path === "string" || typeof input.file_path === "string"
      );
    case "tool_batch":
      return Array.isArray(input.calls);
    case "multi_tool_use.parallel":
    case "parallel":
      return Array.isArray(input.tool_uses) || Array.isArray(input.calls);
    default:
      return true;
  }
}

function normalizeToolName(toolName: string): string {
  return toolName.startsWith("functions.")
    ? toolName.slice("functions.".length)
    : toolName;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function stringField(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  return typeof value[key] === "string" ? value[key] : undefined;
}

function recordField(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  return isRecord(value[key]) ? value[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
