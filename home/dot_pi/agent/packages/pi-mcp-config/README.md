# Pi MCP configuration

Load shared MCP server definitions without copying them into `.pi/mcp.json`.

This package requires Pi 0.99.2 or later. It reuses Pi's MCP extension with a custom configuration loader and save callback. It does not replace the MCP transport, OAuth, resources, codemode, or tool search.

## Files

- `~/.pi/agent/mcp.json`: global server definitions in the native `mcpServers` format.
- `<Git worktree root>/.mcp.json`: repository server definitions in the same format.
- `~/.pi/agent/mcp-overrides.json`: global Pi defaults and per-server overrides.

The package uses Pi's agent directory. If you set `PI_CODING_AGENT_DIR`, the global files use that directory.

It finds the Git worktree root when Pi starts in a subdirectory. Linked worktrees use their own root. Outside a Git repository, it loads only global definitions.

The package ignores `.pi/mcp.json` and `mcp-adapter.json`. Existing symlinks do not cause duplicate connections.

## Global overrides

```json
{
  "$schema": "./packages/pi-mcp-config/mcp-overrides.schema.json",
  "defaults": {
    "exposure": "codemode"
  },
  "servers": {
    "linear": {
      "exposure": "deferred"
    },
    "sentry": {
      "exposure": "codemode",
      "toolExposure": {
        "get_*": "direct"
      }
    },
    "chrome-devtools": {
      "enabled": false
    }
  }
}
```

The package includes `mcp-overrides.schema.json` for editor completion and validation. The example path assumes this package lives under `~/.pi/agent/packages/`. If you install it elsewhere, change the schema path.

Both `defaults` and `servers` are optional. Each policy accepts only:

- `exposure`: `codemode`, `deferred`, `direct`, or `hidden`.
- `toolExposure`: a map from exact tool names or wildcard patterns to exposure values.
- `enabled`: whether Pi connects to the server.

Server names match exactly. Overrides apply to global and repository servers in every repository. An override does not create a server.

Keep codemode mode, inline budget, and default tool selection in Pi's `settings.json`.

## Merge rules

1. Load global definitions.
2. Add repository definitions. A repository definition replaces a global definition with the same name.
3. Apply defaults only to missing settings.
4. Apply per-server overrides last.

Connection definitions do not deep-merge. Repository entries cannot inherit global credentials or transport fields. Policy `toolExposure` maps replace complete maps. Native exact-name and wildcard precedence still applies.

Repository stdio servers start from the worktree root. Their relative `cwd` values use that root. Absolute paths, bare `~`, and `~/` paths keep their meaning. Global servers keep Pi's session-directory behavior.

Global `mcp.json` can set `autoEnableCodemode`. The package does not read that setting from shared repository files.

Invalid configuration files stop configuration loading. An invalid server entry is skipped. It never falls back to a global definition that the repository replaced.

## Project trust

Repository MCP configuration can run commands. The package checks approval before loading repository servers.

It respects native project denial, saved repository trust, and global `defaultProjectTrust`. Use `--mcp-approve` to allow repository MCP servers for one invocation. Native denial, including `--no-approve`, still blocks them.

The package reads its registered flag through Pi's parsed flag API. It does not treat flag values or prompt text as approval.

Native `--approve` and `-a` control Pi's project resources. The package reuses native approval only when Pi starts at the configuration root and finds protected project resources. Approval for a subdirectory does not approve a parent configuration. Saved trust must cover the configuration root.

Pi does not recognize a root `.mcp.json` as a protected resource. When that is the only project configuration, the package asks for approval in interactive mode.

You can allow it once or save approval in Pi's `trust.json`. RPC startup never waits for an approval dialog. With the default `ask` setting, RPC, JSON, and print modes need saved approval or `--mcp-approve`. Global servers remain available.

For an automated run that must also load Pi's protected project resources, use both flags:

```fish
pi --approve --mcp-approve --mode rpc
```

Startup errors identify the failed step and a safe cause when available. Diagnostics do not include raw command errors or trust-file contents.

## Use

Add `./packages/pi-mcp-config` to the `packages` array in `~/.pi/agent/settings.json`.
Add `-builtin:mcp` to its `extensions` array. This prevents Pi from loading a second MCP manager or showing a replacement warning.

Run `/reload` to load the package or reread configuration.

Use `/mcp` to inspect connections and manage OAuth. Exposure and enabled-state changes save to `mcp-overrides.json`. These changes apply to matching servers across repositories. The package never changes shared definitions.

Policy saves lock the full read-modify-write operation across Pi processes. They preserve file symlinks and write the result with an atomic rename. A busy lock waits up to two seconds, then reports an error without changing the file.

The source path in `/mcp` points to the override file, where control changes are saved.

Shell-level `pi mcp` commands do not load extensions. They still manage native global definitions, but do not read shared repository definitions or this override file. Use the in-session `/mcp` interface to inspect the effective configuration.

To restore native configuration handling, remove the package entry and the `-builtin:mcp` entry from settings.

## Startup warnings

The package groups sign-in warnings and repeated `gcloud` authentication failures:

```text
MCP sign-in needed for linear-admin, notion, figma; gcloud auth failed for gke, gcs, pubsub, alloydb, memorystore
```

Grouped warnings use one line and omit the `/mcp` hint. Configuration errors and other connection errors keep all details, with line breaks replaced by spaces. Unrecognized messages stay unchanged. Run `/mcp` to see full server errors and sign-in options.

The package changes only native MCP connection warnings at startup or when extensions add servers. It does not change other notifications, server state, or tool access.

## Checks

RPC tests start an offline Pi process and send `get_state` and `/mcp` commands. They do not connect MCP servers or call a model. Policy tests use separate processes to check locking before the first read and retention of concurrent updates.

```fish
cd ~/.pi/agent/packages/pi-mcp-config
pnpm install --ignore-scripts
pnpm run typecheck
pnpm run lint
pnpm run test --reporter=agent
```
