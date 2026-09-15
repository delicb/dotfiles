import { resolve } from "node:path";

export interface GitWorktree {
  branch?: string;
  detached: boolean;
  path: string;
}

export interface WorktrunkSwitchResult {
  action: string;
  branch?: string;
  path: string;
}

export function parseWorktreeList(output: string): GitWorktree[] {
  const worktrees: GitWorktree[] = [];
  let current: GitWorktree | undefined;

  for (const field of output.split("\0")) {
    if (field.startsWith("worktree ")) {
      if (current) worktrees.push(current);
      current = {
        detached: false,
        path: field.slice("worktree ".length),
      };
      continue;
    }

    if (!current) continue;

    if (field.startsWith("branch refs/heads/")) {
      current.branch = field.slice("branch refs/heads/".length);
    } else if (field === "detached") {
      current.detached = true;
    }
  }

  if (current) worktrees.push(current);
  return worktrees;
}

export function parseWorktrunkSwitchOutput(
  output: string,
): WorktrunkSwitchResult {
  for (const line of output.trim().split("\n").reverse()) {
    try {
      const value = JSON.parse(line) as Partial<WorktrunkSwitchResult>;
      if (typeof value.action === "string" && typeof value.path === "string") {
        return {
          action: value.action,
          branch: typeof value.branch === "string" ? value.branch : undefined,
          path: resolve(value.path),
        };
      }
    } catch {
      // Worktrunk can print progress around its JSON result.
    }
  }

  throw new Error("Worktrunk did not return a valid switch result.");
}

export function findWorktree(
  worktrees: GitWorktree[],
  target: string,
  cwd: string,
): GitWorktree | undefined {
  const branchMatch = worktrees.find((worktree) => worktree.branch === target);
  if (branchMatch) return branchMatch;

  const targetPath = resolve(cwd, target);
  return worktrees.find((worktree) => resolve(worktree.path) === targetPath);
}

export function summarizeStatus(output: string, limit = 20): string {
  const lines = output.trim().split("\n").filter(Boolean);
  if (lines.length <= limit) return lines.join("\n");

  return `${lines.slice(0, limit).join("\n")}\n... ${lines.length - limit} more`;
}
