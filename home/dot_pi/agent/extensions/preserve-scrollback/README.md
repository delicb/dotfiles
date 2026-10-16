# Preserve Pi scrollback

This extension keeps the full active branch in Pi's transcript after compaction.
It also preserves history when you reload, resume, or switch worktrees.
Model context and session files do not change.

## Activation

Pi loads `index.ts` from this directory automatically.
Run `/reload` in an existing session, or start a new Pi session.
No settings change is required.

## Compatibility

Pi 1.1.0, 1.2.0, and 1.3.0 are supported.
The extension runs only in TUI mode, including fullscreen and regular mode.
It leaves print, JSON, and RPC modes unchanged.

Other Pi versions show a warning and keep the original behavior.
Run the tests against a new version before changing the version check.
Remove this extension when Pi provides a core fix.

## Limitations

This is a runtime workaround, not a supported transcript customization API.
It overrides the active session manager's `buildContextEntries()` method.
All tested Pi versions use that instance method for rendering, while model context uses a separate implementation.
Other extensions that call this method will also receive the full branch.

Pi requires the latest compaction entry first in its rendering input.
When you reload a compacted session, its latest summary appears before the original messages.
The original messages remain in branch order.

The extension restores the original method on shutdown.
On reload, it preserves one pre-start redraw before restoring the original method.
The new runtime installs its own override.
It does not replace a method that another extension changed after installation.
Full history can increase rendering time in long sessions.

## Tests

Node.js 22.19 or newer and the Pi npm package are required.

```fish
node --test ~/.pi/agent/extensions/preserve-scrollback/tests/index.test.mjs
```

The test runner finds Pi on `PATH`, including its aube installer shim.
To test another Pi installation, set `PI_PACKAGE_DIR` to the directory containing its `package.json`.
Run the suite once per supported version.

Tests use in-memory sessions and make no model requests.
They cover all four affected UI paths, branch isolation, repeated compaction, lifecycle cleanup, and version checks.
