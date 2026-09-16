import { readFile } from "node:fs/promises";
import { DEFAULT_WORKTREE_CONFIG } from "./defaults";
import {
  type LoadedWorktreeConfig,
  type ResolvedWorktreeConfig,
  WORKTREE_POLICIES,
  type WorktreePolicy,
} from "./types";

export async function loadWorktreeConfig(
  settingsPath: string,
): Promise<LoadedWorktreeConfig> {
  let contents: string;
  try {
    contents = await readFile(settingsPath, "utf8");
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) {
      return { config: cloneDefaults(), warnings: [] };
    }
    return {
      config: cloneDefaults(),
      warnings: [
        `Pi Worktrees cannot read ${settingsPath}: ${errorMessage(error)}`,
      ],
    };
  }

  let settings: unknown;
  try {
    settings = JSON.parse(contents);
  } catch (error) {
    return {
      config: cloneDefaults(),
      warnings: [
        `Pi Worktrees cannot parse ${settingsPath}: ${errorMessage(error)}`,
      ],
    };
  }

  return parseWorktreeSettings(settings, settingsPath);
}

export function parseWorktreeSettings(
  settings: unknown,
  source = "settings.json",
): LoadedWorktreeConfig {
  const config = cloneDefaults();
  const warnings: string[] = [];

  if (!isRecord(settings)) {
    warnings.push(`Set the root value in ${source} to an object.`);
    return { config, warnings };
  }

  const section = settings.worktrees;
  if (section === undefined) return { config, warnings };
  if (!isRecord(section)) {
    warnings.push(`Set worktrees in ${source} to an object.`);
    return { config, warnings };
  }

  if (section.default !== undefined) {
    if (isWorktreePolicy(section.default)) {
      config.default = section.default;
    } else {
      warnings.push(
        `Set worktrees.default in ${source} to "always", "never", or "ask".`,
      );
    }
  }

  config.repositories = parseRepositoryPolicies(
    section.repositories,
    source,
    warnings,
  );

  return { config, warnings };
}

function parseRepositoryPolicies(
  value: unknown,
  source: string,
  warnings: string[],
): Record<string, WorktreePolicy> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    warnings.push(`Set worktrees.repositories in ${source} to an object.`);
    return {};
  }

  const entries: Array<[string, WorktreePolicy]> = [];
  let hasInvalidEntry = false;
  for (const [rawRepository, policy] of Object.entries(value)) {
    const repository = rawRepository.trim();
    if (repository.length === 0 || !isWorktreePolicy(policy)) {
      hasInvalidEntry = true;
      continue;
    }
    entries.push([repository, policy]);
  }

  if (hasInvalidEntry) {
    warnings.push(
      `Use non-empty repository names and valid policies in worktrees.repositories in ${source}.`,
    );
  }
  return Object.fromEntries(entries);
}

function isWorktreePolicy(value: unknown): value is WorktreePolicy {
  return WORKTREE_POLICIES.some((policy) => policy === value);
}

function cloneDefaults(): ResolvedWorktreeConfig {
  return {
    ...DEFAULT_WORKTREE_CONFIG,
    repositories: { ...DEFAULT_WORKTREE_CONFIG.repositories },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
