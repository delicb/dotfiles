#!/usr/bin/env python3
"""PreToolUse guard for git worktree sessions.

Blocks Edit/Write/NotebookEdit whose target file lives in a *sibling* working
tree of the same repo (most importantly the main checkout) while the session is
running inside a worktree. Editing the main checkout from a worktree silently
lands changes on the wrong branch.

Fails OPEN: any error, ambiguity, or non-worktree session allows the edit. The
only outcome that ever blocks is a target provably inside the same repo but
outside the active worktree.
"""

import json
import os
import subprocess
import sys


def allow():
    sys.exit(0)


def deny(reason):
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            }
        )
    )
    sys.exit(0)


def git(cwd, *args):
    try:
        result = subprocess.run(
            ["git", "-C", cwd, *args],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except Exception:
        return None
    if result.returncode != 0:
        return None
    return result.stdout


def worktree_roots(cwd):
    # Git lists the primary worktree first.
    out = git(cwd, "worktree", "list", "--porcelain")
    if not out:
        return []
    return [
        line[len("worktree ") :].strip()
        for line in out.splitlines()
        if line.startswith("worktree ")
    ]


def is_within(path, root):
    path = os.path.normpath(path)
    root = os.path.normpath(root)
    return path == root or path.startswith(root + os.sep)


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        allow()

    if payload.get("tool_name") not in ("Edit", "Write", "NotebookEdit"):
        allow()

    tool_input = payload.get("tool_input") or {}
    target = tool_input.get("file_path") or tool_input.get("notebook_path")
    if not isinstance(target, str) or not os.path.isabs(target):
        allow()

    cwd = payload.get("cwd") or os.getcwd()

    worktree_root = git(cwd, "rev-parse", "--show-toplevel")
    if not worktree_root:
        allow()  # not inside a git repo
    worktree_root = worktree_root.strip()

    roots = worktree_roots(cwd)
    if not roots:
        allow()

    # Main-checkout session: the user works there legitimately, nothing to guard.
    if os.path.normpath(worktree_root) == os.path.normpath(roots[0]):
        allow()

    # Inside a worktree. Edits within this worktree are fine.
    if is_within(target, worktree_root):
        allow()

    # Edits entirely outside the repo (memory, /tmp, other projects) are fine.
    if not any(is_within(target, root) for root in roots):
        allow()

    deny(
        "Edit blocked by worktree guard.\n"
        "  active worktree: {wt}\n"
        "  target file:     {target}\n"
        "The target is in the main checkout or a sibling working tree, not the "
        "active worktree. This session runs inside a linked worktree. "
        "Editing another worktree changes files outside the active branch. "
        "Re-target the file under the worktree path above. If editing outside the "
        "worktree is genuinely intended, ask the user to do it or to lift the "
        "guard.".format(wt=worktree_root, target=target)
    )


if __name__ == "__main__":
    main()
