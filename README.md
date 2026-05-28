# Personal dot files.

Managed using [chezmoi](https://github.com/twpayne/chezmoi).

Mostly focused on MacOS, since that is my daily driver, but I mostly keep
it up to date for various Linux distributions (Ubuntu, Debian, Alpine) which
I use in containers. 

My [old dotconfig](https://github.com/delicb/dotfiles-old) are still available
but not used or updated.

# Agent config

Shared agent instructions and skills live under `home/dot_agents/`, rendered to
`~/.agents`. Pi reads shared skills directly. Claude Code and Codex get per-skill
symlinks from their own config directories. Pi and Claude Code use symlinked global
instruction files, while Codex uses an `AGENTS.md` wrapper that imports the shared
rules plus Codex-only RTK notes.

# Install
```
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply delicb
```
or
```
sh -c "$(wget -qO- get.chezmoi.io)" -- init --apply delicb
```
