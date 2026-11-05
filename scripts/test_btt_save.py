import copy
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class BttSaveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="test-btt-save-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.home = self.root / "home"
        self.home.mkdir()
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.source = self.root / "source.json"
        self.target = self.home / ".btt_autoload_preset.json"
        self.state = self.home / ".local/state/btt-save/last-synced.sha256"
        self.presets = self.root / "presets.json"
        self.export = self.root / "export.json"
        self.request = self.root / "export-request.txt"
        self.script = self.root / "btt-save"
        template = (ROOT / "home/bin/executable_btt-save.tmpl").read_text()
        self.script.write_text("\n".join(template.splitlines()[1:-1]) + "\n")
        self.env = {
            **os.environ,
            "HOME": str(self.home),
            "PATH": f"{self.bin}:{os.environ['PATH']}",
            "XDG_STATE_HOME": str(self.home / ".local/state"),
            "TEST_ROOT": str(self.root),
        }
        self.preset = {
            "BTTPresetName": "Default",
            "BTTPresetUUID": "tracked-uuid",
            "BTTPresetContent": [{
                "BTTAppName": "Global",
                "BTTTriggers": [
                    {"BTTUUID": "changed", "BTTShortcutToSend": "55,1", "BTTLastUpdatedAt": 10},
                    {"BTTUUID": "unchanged", "BTTShortcutToSend": "55,2", "BTTLastUpdatedAt": 10},
                ],
            }],
        }
        self.save_json(self.source, self.preset)
        self.save_json(self.target, self.preset)
        self.save_json(self.presets, [
            {"uuid": "empty-uuid", "name": "Empty Default", "activated": 2},
            {"uuid": "tracked-uuid", "name": "Default", "activated": 1},
        ])
        self.exported = copy.deepcopy(self.preset)
        self.exported["BTTPresetUUID"] = "fresh-export-uuid"
        for trigger in self.exported["BTTPresetContent"][0]["BTTTriggers"]:
            trigger["BTTLastUpdatedAt"] = 99
        self.exported["BTTPresetContent"][0]["BTTTriggers"][0]["BTTShortcutToSend"] = "55,3"
        self.save_json(self.export, self.exported)
        self.mock("pgrep", "exit 0\n")
        self.mock("git", "exit 1\n")
        self.mock("chezmoi", '''case "$1" in
    cat) cat "$TEST_ROOT/source.json" ;;
    add) cp "$2" "$TEST_ROOT/source.json" ;;
    source-path)
        if [ "$#" -eq 1 ]; then
            printf '%s\\n' "$TEST_ROOT"
        else
            printf '%s\\n' "$TEST_ROOT/source.json"
        fi ;;
    *) exit 1 ;;
esac
''')
        self.mock("osascript", '''if [ "$1" = "-l" ]; then
    shift 3
    node -e '
        const fs = require("node:fs");
        global.Application = () => ({
            get_preset_details: () => fs.readFileSync(process.env.TEST_ROOT + "/presets.json", "utf8")
        });
        eval(fs.readFileSync(0, "utf8"));
        console.log(run(process.argv.slice(1)));
    ' "$@"
else
    printf '%s\\n' "$2" > "$TEST_ROOT/export-request.txt"
    cp "$TEST_ROOT/export.json" "$3"
fi
''')

    @staticmethod
    def save_json(path, value):
        path.write_text(json.dumps(value))

    def mock(self, name, body):
        path = self.bin / name
        path.write_text("#!/bin/sh\nset -eu\n" + body)
        path.chmod(0o755)

    def run_save(self, *args):
        return subprocess.run(
            ["sh", str(self.script), *args],
            env=self.env, capture_output=True, text=True, timeout=20,
        )

    def saved_files(self):
        return [path.read_bytes() if path.exists() else None
                for path in (self.source, self.target, self.state)]

    def test_exports_tracked_non_master_and_preserves_uuid_and_unchanged_timestamp(self):
        target = copy.deepcopy(self.preset)
        target["BTTPresetUUID"] = "empty-uuid"
        self.save_json(self.target, target)
        result = self.run_save()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.request.read_text().strip(), "Default")
        saved = json.loads(self.source.read_text())
        self.assertEqual(saved["BTTPresetUUID"], "tracked-uuid")
        changed, unchanged = saved["BTTPresetContent"][0]["BTTTriggers"]
        self.assertEqual(changed["BTTShortcutToSend"], "55,3")
        self.assertEqual(changed["BTTLastUpdatedAt"], 99)
        self.assertEqual(unchanged["BTTLastUpdatedAt"], 10)
        self.assertEqual(self.source.read_bytes(), self.target.read_bytes())
        self.assertTrue(self.state.exists())

    def test_duplicate_names_abort_before_export_even_with_identical_colors(self):
        self.save_json(self.presets, [
            {"uuid": "empty-uuid", "name": "Default", "activated": 2},
            {"uuid": "tracked-uuid", "name": "Default", "activated": 1},
        ])
        before = self.saved_files()
        for args in ((), ("--scheduled",)):
            with self.subTest(args=args):
                result = self.run_save(*args)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("Multiple presets", result.stderr)
                self.assertFalse(self.request.exists())
                self.assertEqual(self.saved_files(), before)

    def test_missing_tracked_preset_does_not_fall_back_to_master(self):
        self.save_json(self.presets, [
            {"uuid": "empty-uuid", "name": "Default", "activated": 2},
        ])
        before = self.saved_files()
        result = self.run_save()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("found 0", result.stderr)
        self.assertFalse(self.request.exists())
        self.assertEqual(self.saved_files(), before)

    def test_missing_source_uuid_aborts_before_export(self):
        del self.preset["BTTPresetUUID"]
        self.save_json(self.source, self.preset)
        before = self.saved_files()
        result = self.run_save()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("no UUID", result.stderr)
        self.assertFalse(self.request.exists())
        self.assertEqual(self.saved_files(), before)

    def test_wrong_or_invalid_export_does_not_overwrite_files(self):
        for update in (
            {"BTTPresetName": "Other"},
            {"BTTPresetColor": "wrong"},
            {"BTTGeneralSettings": {}},
            {"BTTPresetUUID": None},
        ):
            with self.subTest(update=update):
                self.save_json(self.export, {**self.exported, **update})
                before = self.saved_files()
                result = self.run_save()
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.saved_files(), before)

    def test_scheduled_export_skips_source_target_conflict(self):
        self.save_json(self.target, self.exported)
        before = self.saved_files()
        result = self.run_save("--scheduled")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("source and target differ", result.stderr)
        self.assertEqual(self.saved_files(), before)

    def test_scheduled_export_requires_sync_state_for_changes(self):
        before = self.saved_files()
        result = self.run_save("--scheduled")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("no prior sync state", result.stderr)
        self.assertEqual(self.saved_files(), before)

    def test_scheduled_export_saves_changes_after_initial_sync(self):
        self.save_json(self.export, self.preset)
        result = self.run_save("--scheduled")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(self.state.exists())
        self.assertEqual(json.loads(self.source.read_text()), self.preset)
        self.save_json(self.export, self.exported)
        result = self.run_save("--scheduled")
        self.assertEqual(result.returncode, 0, result.stderr)
        saved = json.loads(self.source.read_text())
        self.assertEqual(saved["BTTPresetContent"][0]["BTTTriggers"][0]["BTTShortcutToSend"], "55,3")

    def test_scheduled_export_skips_external_changes_since_last_sync(self):
        result = self.run_save()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.save_json(self.source, self.preset)
        self.save_json(self.target, self.preset)
        before = self.saved_files()
        result = self.run_save("--scheduled")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("changed outside BetterTouchTool", result.stderr)
        self.assertEqual(self.saved_files(), before)


if __name__ == "__main__":
    unittest.main()
