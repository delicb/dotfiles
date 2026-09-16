import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import type { ResolvedWorktreeConfig, WorktreePolicy } from "../config";

export interface WorktreePolicyDecision {
  policy: WorktreePolicy;
  source: "default" | "repository";
  match?: string;
}

interface WorktreePolicyMatchOptions {
  homeDirectory?: string;
  repositoryName?: string;
}

export function decideWorktreePolicy(
  config: ResolvedWorktreeConfig,
  repositoryRoot: string,
  options: WorktreePolicyMatchOptions = {},
): WorktreePolicyDecision {
  const canonicalRoot = canonicalizePath(repositoryRoot);
  const folderName = options.repositoryName ?? basename(canonicalRoot);
  const homeDirectory = options.homeDirectory ?? homedir();
  const repositories = Object.entries(config.repositories);

  const pathMatch = repositories.find(([entry]) =>
    matchesRepositoryPath(entry, canonicalRoot, homeDirectory),
  );
  if (pathMatch) {
    return {
      policy: pathMatch[1],
      source: "repository",
      match: pathMatch[0],
    };
  }

  const nameMatch = repositories.find(
    ([entry]) => isRepositoryName(entry) && entry === folderName,
  );
  if (nameMatch) {
    return {
      policy: nameMatch[1],
      source: "repository",
      match: nameMatch[0],
    };
  }

  return { policy: config.default, source: "default" };
}

function matchesRepositoryPath(
  entry: string,
  canonicalRoot: string,
  homeDirectory: string,
): boolean {
  if (isRepositoryName(entry)) return false;
  const expanded = expandHome(entry, homeDirectory);
  return isAbsolute(expanded) && canonicalizePath(expanded) === canonicalRoot;
}

function isRepositoryName(entry: string): boolean {
  return !entry.includes("/") && !entry.includes("\\");
}

function canonicalizePath(path: string): string {
  const resolved = resolve(path);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function expandHome(path: string, homeDirectory: string): string {
  if (path === "~") return homeDirectory;
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return join(homeDirectory, path.slice(2));
  }
  return path;
}
