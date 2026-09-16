# Pi Worktrees

This private Pi package uses Worktrunk to isolate agent changes in linked Git worktrees.

## Behavior

Pi keeps all tools available in a protected primary Git worktree. It blocks `edit` and `write` calls that target files inside that worktree.

On macOS, Pi runs direct and batched `bash` commands in a sandbox. Commands can read the repository, but write attempts fail. The tool result tells the agent to call `worktree_prepare`. If `sandbox-exec` is unavailable, shell commands run without this limit.

Other tools, including MCP tools, remain unrestricted. Before code changes, the agent calls `worktree_prepare` to apply the repository policy.

The `always` policy uses the requested worktree without a prompt. The `never` policy permits primary worktree changes. The `ask` policy prompts the user.

If the `ask` prompt is cancelled, Pi creates no worktree. Modes without UI cannot use the `ask` prompt.

A global policy applies by default. Repository entries can override that policy.

The package copies the Pi session to the selected worktree. Pi then reloads its tools, settings, skills, and context files for that directory.

Each Pi session in a linked worktree owns a lease. Cleanup stops while any lease remains.

## Agent tools

```text
worktree_prepare
worktree_status
worktree_finish
worktree_cleanup
worktree_gc
```

The finish and cleanup tools run only after a direct user request.

## Commands

```text
/worktree status
/worktree allow-primary
/worktree start <branch> [base]
/worktree join <branch-or-path>
/worktree finish
/worktree cleanup [branch-or-path]
/worktree gc
```

`allow-primary` allows changes in the primary worktree for the current saved Pi session. It overrides the configured repository policy.

`finish` returns the Pi session to the primary worktree before cleanup. This prevents Pi from holding the directory that Worktrunk removes.

`cleanup` without a target finishes the current linked worktree. From the primary worktree, it shows a picker of inactive clean worktrees.

`gc` finds clean, inactive, integrated worktrees. It shows all candidates and requests confirmation before removal.

## Configuration

Set `worktrees` in `~/.pi/agent/settings.json`:

```json
{
  "worktrees": {
    "default": "ask",
    "repositories": {
      "dotfiles": "never",
      "~/src/github.com/example/scratch": "always",
      "/Users/example/work/github.com/linear/linear-app": "ask"
    }
  }
}
```

Use one of these policies:

- `always`: Use the requested linked worktree without a prompt.
- `never`: Allow changes in the primary worktree.
- `ask`: Ask whether to use the requested worktree or the primary worktree.

Each repository key must be a root folder name or an absolute repository root path. Paths can start with `~`.

The extension applies policy in this order:

1. `/worktree allow-primary` allows the current session.
2. An exact repository path match sets the policy.
3. A repository folder name match sets the policy.
4. `default` sets the policy when no repository entry matches.

An exact path match takes priority over a folder name match.

## Cleanup safety

Cleanup blocks on active Pi leases and non-ignored working tree changes. Worktrunk removes Git-ignored generated files and keeps unmerged branches.

Garbage collection excludes the primary worktree, the current worktree, active leases, dirty worktrees, and unmerged worktrees.

The extension never passes `--force` or `--force-delete` to Worktrunk.

## Requirements

- Pi 0.85.1 or newer
- Worktrunk available as `wt`
- Git with `--path-format=absolute` support

Shell write protection also needs macOS `sandbox-exec`. Without it, direct `edit` and `write` protection still works.
