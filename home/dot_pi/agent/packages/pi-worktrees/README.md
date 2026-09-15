# Pi Worktrees

This private Pi package uses Worktrunk to isolate agent changes in linked Git worktrees.

## Behavior

Pi keeps all tools available in a protected primary Git worktree. It blocks `edit` and `write` calls that target files inside that worktree.

On macOS, Pi runs direct and batched `bash` commands in a sandbox. Commands can read the repository, but write attempts fail. The tool result tells the agent to call `worktree_prepare`. If `sandbox-exec` is unavailable, shell commands run without this limit.

Other tools, including MCP tools, remain unrestricted. Before intended code changes, the agent calls `worktree_prepare` to ask where it should continue.

The user can select the requested worktree or allow primary worktree changes for the current Pi session. Cancellation creates no worktree. Modes without UI also create no worktree.

Global settings can protect or allow primary worktrees by default. Repository rules can override that default.

The package copies the Pi session to the selected worktree. Pi then reloads its tools, settings, skills, and context files for that directory.

Each Pi session in a linked worktree owns a lease. Cleanup stops while any lease remains.

## Agent tools

```text
worktree_prepare
worktree_status
worktree_finish
worktree_cleanup
```

The finish and cleanup tools run only after a direct user request.

## Commands

```text
/worktree status
/worktree allow-primary
/worktree start <branch> [base]
/worktree join <branch-or-path>
/worktree finish
/worktree cleanup <branch-or-path>
```

`allow-primary` allows changes in the primary worktree for the current saved Pi session. It overrides the configured repository policy.

`finish` returns the Pi session to the primary worktree before cleanup. This prevents Pi from holding the directory that Worktrunk removes.

## Configuration

Set `worktrees` in `~/.pi/agent/settings.json`:

```json
{
  "worktrees": {
    "protectPrimaryByDefault": true,
    "allow": [
      "dotfiles",
      "~/src/github.com/example/scratch"
    ],
    "deny": [
      "linear-app",
      "/Users/example/work/github.com/linear/linear-app"
    ]
  }
}
```

Each entry must contain a repository folder name or an absolute repository root path. Paths can start with `~`.

The extension applies policy in this order:

1. `/worktree allow-primary` allows the current session.
2. A matching `deny` entry protects the primary worktree.
3. A matching `allow` entry allows primary worktree changes.
4. `protectPrimaryByDefault` supplies the result when neither list matches.

A `deny` entry wins when both lists match. A folder name matches all repositories with that root folder name.

## Cleanup safety

Cleanup blocks on active Pi leases and non-ignored working tree changes. Worktrunk removes Git-ignored generated files and keeps unmerged branches.

The extension never passes `--force` or `--force-delete` to Worktrunk.

## Requirements

- Pi 0.85.1 or newer
- Worktrunk available as `wt`
- Git with `--path-format=absolute` support

Shell write protection also needs macOS `sandbox-exec`. Without it, direct `edit` and `write` protection still works.
