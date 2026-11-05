# Personal dot files.

Managed using [chezmoi](https://github.com/twpayne/chezmoi).

Mostly focused on MacOS, since that is my daily driver, but I mostly keep
it up to date for various Linux distributions (Ubuntu, Debian, Alpine) which
I use in containers. 

My [old dotconfig](https://github.com/delicb/dotfiles-old) are still available
but not used or updated.

# BetterTouchTool

Chezmoi installs `~/.btt_autoload_preset.json`. BetterTouchTool loads this file
when it next starts.

After you change the tracked preset in the BetterTouchTool UI:

1. Keep BetterTouchTool running.
2. Run `btt-save`.
3. Review the Git diff before you commit it.

The script selects the preset by the UUID in the chezmoi source, not by its
master status. It exports that preset without general settings and keeps the
tracked UUID. The preset name must be unique because BTT exports by name.
If duplicate names exist, rename the other presets in BTT before saving.
The script stops without changing files if the tracked preset is missing or
its name is ambiguous.

On another Mac, pull the repository and run `chezmoi apply`. Restart
BetterTouchTool to load the updated preset immediately.

Do not enable BetterTouchTool cloud sync for the tracked preset. Two sync methods
can overwrite changes from each other.

# Agent config

Shared agent instructions and skills live under `home/dot_agents/`, rendered to
`~/.agents`. Pi reads shared skills directly. Claude Code and Codex get per-skill
symlinks from their own config directories. Pi and Claude Code use symlinked global
instruction files, while Codex uses an `AGENTS.md` wrapper that imports the shared
rules plus Codex-only RTK notes.

# Application preferences

The repo tracks portable Claude Code, editor, and terminal tool settings.
Review `chezmoi diff` before applying them.

Herdr manages its generated Claude hook. The tracked settings call it only when
it exists. Linear skill imports and their installation metadata are not part of
these preference snapshots.

# Install
```
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply delicb
```
or
```
sh -c "$(wget -qO- get.chezmoi.io)" -- init --apply delicb
```
