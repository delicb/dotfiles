import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


GUARD = (
    Path(__file__).resolve().parents[1]
    / "home/dot_claude/hooks/claude-guard-worktree-edits.py"
)


class WorktreeGuardTests(unittest.TestCase):
    def test_blocks_other_worktrees_but_allows_active_and_unrelated_files(self):
        with tempfile.TemporaryDirectory(prefix="test-worktree-guard-") as directory:
            root = Path(directory).resolve()
            main = root / "main"
            active = root / "active"
            sibling = root / "sibling"
            env = {
                **os.environ,
                "GIT_CONFIG_GLOBAL": os.devnull,
                "GIT_CONFIG_NOSYSTEM": "1",
            }

            def git(*args):
                subprocess.run(
                    ["git", *map(str, args)],
                    env=env, capture_output=True, text=True, check=True, timeout=10,
                )

            git("init", "--quiet", "--initial-branch=main", main)
            for worktree in (active, sibling):
                git("-C", main, "worktree", "add", "--quiet", "--orphan", worktree)

            for target_root, expected in (
                (main, "deny"),
                (sibling, "deny"),
                (active, "allow"),
                (root / "unrelated", "allow"),
            ):
                with self.subTest(target=target_root.name):
                    payload = {
                        "tool_name": "Write",
                        "tool_input": {"file_path": str(target_root / "file.txt")},
                        "cwd": str(active),
                    }
                    result = subprocess.run(
                        [sys.executable, "-B", str(GUARD)],
                        input=json.dumps(payload), env=env,
                        capture_output=True, text=True, check=True, timeout=10,
                    )
                    response = json.loads(result.stdout) if result.stdout else {}
                    decision = response.get("hookSpecificOutput", {}).get(
                        "permissionDecision", "allow"
                    )
                    self.assertEqual(decision, expected)


if __name__ == "__main__":
    unittest.main()
