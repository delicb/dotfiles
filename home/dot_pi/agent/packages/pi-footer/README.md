# Pi footer

A small local footer for Pi. Tested with Pi 0.99.2.

## Display

- Model ID and thinking level.
- Directory name and Git branch above the editor.
- Context percentage, with warnings above 70% and 90%.
- The `⚡️` Fast mode indicator beside context usage, with the accent color.
- Dim extension statuses with dot separators.
- A one-line reminder of the last prompt.

The display uses your active Pi theme and monochrome Unicode icons. It needs no special font.
The model uses the accent color. Thinking uses Pi's color for the active level.
The folder uses the link color. The branch uses the syntax type color.
Context usage stays on the right. Narrow windows shorten the other fields.
The `⚡️` indicator stays beside context usage when the Fast preference is enabled.
It does not confirm model support or a response tier. Use `/fast status` for those details.
If the complete emoji cannot fit beside context usage, it moves below the editor.
Other statuses appear before Fast mode and context usage when all fields fit without shortening.
Otherwise, those statuses stay below the editor. The layout changes when you resize the window.
Unknown context usage shows `ctx ?`, including after compaction.

Run `/footer` to switch between this display and the native footer.
You can also use `/footer on` and `/footer off`. `/reload` enables it again.

Pi keeps control of the editor, autocomplete, shell commands, scrolling, and message queues.
This package has no Git polling, AI calls, startup screen, or saved prompt queue.
It does not show cost or cache totals. Use `/session` to view Pi's session data.

## Setup

Add `"./packages/pi-footer"` to `packages` in `~/.pi/agent/settings.json`.
Run `/reload` to load this footer and later changes.

## Compaction

Native `/compact <text>` uses `<text>` as compaction instructions.
It does not send `<text>` as the next prompt.
Type the next prompt during compaction to use Pi's native queue.

## Checks

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm lint
```

These live files are not yet part of the chezmoi source.
