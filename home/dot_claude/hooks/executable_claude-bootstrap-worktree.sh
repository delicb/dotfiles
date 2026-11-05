#!/usr/bin/env bash
# Run the repo's worktree setup on Claude Code session start,
# but only inside a not-yet-bootstrapped linked git worktree.
set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}" || exit 0
[ -n "$root" ] || exit 0

# Linked worktree only: main checkout has --git-dir == --git-common-dir.
git_dir=$(git -C "$root" rev-parse --git-dir 2>/dev/null)           || exit 0
common_dir=$(git -C "$root" rev-parse --git-common-dir 2>/dev/null)  || exit 0
[ "$git_dir" = "$common_dir" ] && exit 0

[ -f "$root/bootstrap-worktree.sh" ] || exit 0
[ -d "$root/node_modules" ] && exit 0   # already bootstrapped -> no-op

log="$git_dir/worktree-bootstrap.log"
if ( cd "$root" && bash ./bootstrap-worktree.sh ) >"$log" 2>&1; then
  echo "Worktree bootstrapped via bootstrap-worktree.sh (log: $log)"
else
  echo "bootstrap-worktree.sh failed; see $log" >&2
  exit 2
fi
