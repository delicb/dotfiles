---
name: worktree-management
description: Create, join, finish, inspect, and clean Git worktrees through Worktrunk. Use before an agent modifies code, when several agents must share a worktree, or when worktree cleanup is required.
---

# Worktree management

The Pi extension protects direct file writes in the primary Git worktree. On macOS, it also blocks shell writes inside that worktree.

Read-only investigation does not require a worktree. You can use shell commands, MCP tools, and other tools normally.

## Start isolated work

Call `worktree_prepare` before you intend to modify code in a protected primary worktree. If a write attempt is blocked, call `worktree_prepare`.

The repository policy controls the tool. It can use the requested worktree automatically or ask the user where to continue.

The `never` policy permits changes in the primary worktree, so `worktree_prepare` is not required.

Use `mode: "create"` unless the user asks you to use an existing worktree. Choose a short branch name that describes the task.

If the user selects the requested worktree, the tool runs Worktrunk setup hooks and moves the Pi session into it.

If the tool allows the primary worktree, retry the requested change there. Do not call `worktree_prepare` again for that session.

The `always` policy uses the requested worktree without a prompt. The `ask` policy asks before it changes the session.

Use `mode: "join"` only in these cases:

- The user asks agents to share one worktree.
- The task must continue in an existing worktree.
- A prior cleanup failed and the worktree still contains required changes.

Concurrent agents can overwrite each other's changes. Share a worktree only when the task has clear file ownership or one agent only reviews.

## Agent tools

- `worktree_status` lists worktrees and active Pi leases.
- `worktree_finish` leaves and cleans the current worktree after a direct user request.
- `worktree_cleanup` cleans the current worktree or a selected inactive worktree after a direct user request.
- `worktree_gc` finds clean, inactive, integrated worktrees and requests confirmation before removal.

## User commands

- `/worktree status` lists worktrees and active Pi leases.
- `/worktree allow-primary` allows primary worktree changes for the current saved Pi session.
- `/worktree start <branch> [base]` creates a worktree and moves the session.
- `/worktree join <branch-or-path>` moves the session into an existing worktree.
- `/worktree finish` moves the session to the primary worktree and requests cleanup.
- `/worktree cleanup` finishes the current linked worktree or shows an inactive-worktree picker from the primary worktree.
- `/worktree cleanup <branch-or-path>` removes the named clean worktree.
- `/worktree gc` requests confirmation before it removes clean, inactive, integrated worktrees.

For the `always` and `ask` policies, only the user can allow primary worktree changes. Do not infer this choice.

## Cleanup rules

Cleanup stops when another Pi session holds a lease.

Cleanup also stops for staged changes, tracked changes, or untracked files. Git-ignored generated files do not block Worktrunk removal.

Garbage collection excludes the primary worktree, the current worktree, active leases, dirty worktrees, and unmerged worktrees.

Worktrunk keeps an unmerged branch unless the user explicitly requests branch deletion. Do not use `wt remove --force` or `wt remove --force-delete` without direct user approval.

If cleanup stops because files remain, inspect the worktree. Keep useful changes or remove confirmed generated files. Then run cleanup again.

A stopped or killed Pi process can leave a lease file. The extension removes the lease after it confirms that its process no longer exists.
