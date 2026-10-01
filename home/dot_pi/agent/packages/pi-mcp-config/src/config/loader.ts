import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import lockfile from "proper-lockfile";
import type {
  ConfigPaths,
  LoadedConfig,
  ServerEntry,
  ServerPolicy,
} from "./types";
import { ConfigValidation } from "./validation";

export const ConfigLoader = {
  load(paths: ConfigPaths): LoadedConfig {
    const result: LoadedConfig = { servers: [], errors: [] };
    const overridesPath = join(paths.agentDir, "mcp-overrides.json");
    try {
      const overrides = existsSync(overridesPath)
        ? ConfigValidation.overrides(readJson(overridesPath))
        : {};
      const entries = new Map<string, RawEntry>();
      const globalPath = join(paths.agentDir, "mcp.json");
      if (existsSync(globalPath)) {
        const global = ConfigValidation.record(
          readJson(globalPath),
          globalPath,
        );
        if (global.autoEnableCodemode !== undefined) {
          if (typeof global.autoEnableCodemode !== "boolean") {
            throw new Error(
              `${globalPath}: autoEnableCodemode must be a boolean.`,
            );
          }
          result.autoEnableCodemode = global.autoEnableCodemode;
        }
        addEntries(entries, global, globalPath, "global");
      }
      if (paths.projectTrusted && paths.repositoryRoot) {
        const projectPath = join(paths.repositoryRoot, ".mcp.json");
        if (existsSync(projectPath)) {
          const project = ConfigValidation.record(
            readJson(projectPath),
            projectPath,
          );
          addEntries(entries, project, projectPath, "project");
        }
      }

      const namespaces = new Map<string, string[]>();
      for (const name of entries.keys()) {
        const namespace = name.replaceAll("-", "_");
        const names = namespaces.get(namespace) ?? [];
        names.push(name);
        namespaces.set(namespace, names);
      }
      for (const [name, entry] of entries) {
        try {
          ConfigValidation.serverName(name);
          if ((namespaces.get(name.replaceAll("-", "_"))?.length ?? 0) > 1) {
            throw new Error(
              "Server names conflict after replacing hyphens with underscores.",
            );
          }
          const config = ConfigValidation.server(
            entry.raw,
            entry.scope === "project",
          );
          if (
            entry.scope === "project" &&
            paths.repositoryRoot &&
            "command" in config
          ) {
            config.cwd =
              config.cwd === undefined
                ? paths.repositoryRoot
                : isAbsolute(config.cwd) ||
                    config.cwd === "~" ||
                    config.cwd.startsWith("~/")
                  ? config.cwd
                  : resolve(paths.repositoryRoot, config.cwd);
          }
          const policy =
            overrides.servers && Object.hasOwn(overrides.servers, name)
              ? overrides.servers[name]
              : undefined;
          result.servers.push({
            name,
            scope: entry.scope,
            source: overridesPath,
            config: {
              ...config,
              exposure:
                policy?.exposure ??
                config.exposure ??
                overrides.defaults?.exposure,
              toolExposure:
                policy?.toolExposure ??
                config.toolExposure ??
                overrides.defaults?.toolExposure,
              enabled:
                policy?.enabled ??
                config.enabled ??
                overrides.defaults?.enabled,
            },
          });
        } catch (error) {
          result.errors.push(
            `${entry.source}: server "${name}": ${errorMessage(error)}`,
          );
        }
      }
    } catch (error) {
      result.servers = [];
      result.errors.push(`MCP configuration: ${errorMessage(error)}`);
    }
    return result;
  },

  savePolicy(
    agentDir: string,
    name: string,
    patch: Pick<ServerPolicy, "enabled" | "exposure">,
  ): void {
    ConfigValidation.serverName(name);
    const path = join(agentDir, "mcp-overrides.json");
    mkdirSync(dirname(path), { recursive: true });
    const destination = existsSync(path) ? realpathSync(path) : path;
    const release = acquirePolicyLock(destination);
    try {
      const existing = existsSync(destination)
        ? ConfigValidation.record(readJson(destination), destination)
        : {};
      const config = ConfigValidation.overrides(existing);
      const previous =
        config.servers && Object.hasOwn(config.servers, name)
          ? config.servers[name]
          : {};
      const next = {
        ...existing,
        servers: {
          ...config.servers,
          [name]: { ...previous, ...patch },
        },
      };
      ConfigValidation.overrides(next);
      const temporaryPath = `${destination}.${randomUUID()}.tmp`;
      try {
        writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, {
          mode: 0o600,
          flag: "wx",
        });
        renameSync(temporaryPath, destination);
      } finally {
        rmSync(temporaryPath, { force: true });
      }
    } finally {
      release();
    }
  },
};

type RawEntry = {
  raw: unknown;
  source: string;
  scope: ServerEntry["scope"];
};

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${path}: Could not read valid JSON.`);
  }
}

function addEntries(
  entries: Map<string, RawEntry>,
  value: Record<string, unknown>,
  source: string,
  scope: ServerEntry["scope"],
): void {
  const servers = ConfigValidation.record(
    value.mcpServers ?? {},
    `${source}: mcpServers`,
  );
  for (const [name, raw] of Object.entries(servers)) {
    entries.set(name, { raw, source, scope });
  }
}

function acquirePolicyLock(path: string): () => void {
  const deadline = Date.now() + 2000;
  const wait = new Int32Array(new SharedArrayBuffer(4));
  for (;;) {
    try {
      return lockfile.lockSync(path, { realpath: false });
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== "ELOCKED"
      ) {
        throw error;
      }
      if (Date.now() >= deadline) {
        throw new Error("MCP override file is busy. Try again.");
      }
      Atomics.wait(wait, 0, 0, 20);
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid configuration.";
}
