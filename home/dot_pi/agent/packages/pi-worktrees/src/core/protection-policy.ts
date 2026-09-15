import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import type { ResolvedWorktreeConfig } from "../config";

export interface ProtectionDecision {
  protect: boolean;
  source: "allow" | "default" | "deny";
  match?: string;
}

interface ProtectionMatchOptions {
  homeDirectory?: string;
  repositoryName?: string;
}

export function decidePrimaryProtection(
  config: ResolvedWorktreeConfig,
  repositoryRoot: string,
  options: ProtectionMatchOptions = {},
): ProtectionDecision {
  const canonicalRoot = canonicalizePath(repositoryRoot);
  const folderName = options.repositoryName ?? basename(canonicalRoot);
  const homeDirectory = options.homeDirectory ?? homedir();

  const denied = config.deny.find((entry) =>
    matchesRepository(entry, canonicalRoot, folderName, homeDirectory),
  );
  if (denied !== undefined) {
    return { protect: true, source: "deny", match: denied };
  }

  const allowed = config.allow.find((entry) =>
    matchesRepository(entry, canonicalRoot, folderName, homeDirectory),
  );
  if (allowed !== undefined) {
    return { protect: false, source: "allow", match: allowed };
  }

  return {
    protect: config.protectPrimaryByDefault,
    source: "default",
  };
}

function matchesRepository(
  entry: string,
  canonicalRoot: string,
  folderName: string,
  homeDirectory: string,
): boolean {
  if (!entry.includes("/") && !entry.includes("\\")) {
    return entry === folderName;
  }

  const expanded = expandHome(entry, homeDirectory);
  return isAbsolute(expanded) && canonicalizePath(expanded) === canonicalRoot;
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
