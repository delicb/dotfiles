import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "./defaults";
import type { ConfigPaths, FastConfig } from "./types";

export function loadConfig(paths: ConfigPaths): FastConfig {
  const global = readConfig(join(paths.agentDir, "openai-fast.json"));
  const project = paths.projectTrusted
    ? readConfig(join(paths.cwd, ".pi", "openai-fast.json"))
    : {};
  return {
    enabled: project.enabled ?? global.enabled ?? DEFAULT_CONFIG.enabled,
    models: {
      ...(project.models ?? global.models ?? DEFAULT_CONFIG.models),
    },
  };
}

function readConfig(path: string): Partial<FastConfig> {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw new Error(`${path}: Could not read configuration.`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${path}: Configuration must contain valid JSON.`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}: Configuration must be an object.`);
  }
  const config: Partial<FastConfig> = {};
  for (const [key, field] of Object.entries(value)) {
    if (key === "enabled" && typeof field === "boolean") {
      config.enabled = field;
    } else if (
      key === "models" &&
      field !== null &&
      typeof field === "object" &&
      !Array.isArray(field)
    ) {
      const models: Record<string, number> = {};
      for (const [model, multiplier] of Object.entries(field)) {
        if (
          !/^(openai|openai-codex)\/(?:\*|[^*\s]+)$/.test(model) ||
          typeof multiplier !== "number" ||
          !Number.isFinite(multiplier) ||
          multiplier <= 1
        ) {
          throw new Error(
            `${path}: Use provider/model or provider/* with a multiplier above 1.`,
          );
        }
        models[model] = multiplier;
      }
      config.models = models;
    } else {
      throw new Error(`${path}: Invalid configuration field "${key}".`);
    }
  }
  return config;
}
