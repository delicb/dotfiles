import { readFile } from "node:fs/promises";
import { DEFAULT_WORKTREE_CONFIG } from "./defaults";
import type { LoadedWorktreeConfig, ResolvedWorktreeConfig } from "./types";

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

  if (section.protectPrimaryByDefault !== undefined) {
    if (typeof section.protectPrimaryByDefault === "boolean") {
      config.protectPrimaryByDefault = section.protectPrimaryByDefault;
    } else {
      warnings.push(
        `Set worktrees.protectPrimaryByDefault in ${source} to true or false.`,
      );
    }
  }

  config.allow = parseRepositoryList(section.allow, "allow", source, warnings);
  config.deny = parseRepositoryList(section.deny, "deny", source, warnings);

  return { config, warnings };
}

function parseRepositoryList(
  value: unknown,
  key: "allow" | "deny",
  source: string,
  warnings: string[],
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warnings.push(`Set worktrees.${key} in ${source} to an array of strings.`);
    return [];
  }

  const entries = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length !== value.length) {
    warnings.push(
      `Remove non-string or empty entries from worktrees.${key} in ${source}.`,
    );
  }
  return entries;
}

function cloneDefaults(): ResolvedWorktreeConfig {
  return {
    ...DEFAULT_WORKTREE_CONFIG,
    allow: [...DEFAULT_WORKTREE_CONFIG.allow],
    deny: [...DEFAULT_WORKTREE_CONFIG.deny],
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
