# AGENTS.md

Personal dotfiles for macOS and Linux, managed with [chezmoi](https://www.chezmoi.io/).
Shared across personal and work machines. Personal config is the baseline; work-specific
config is toggled via independent include flags (`include_Linear`).

## Repository Layout

The repo root is a standard chezmoi source directory with `.chezmoiroot` set to `home/`.

```
.chezmoiroot          # points to home/
home/                 # chezmoi source root
  .chezmoi.toml.tmpl  # chezmoi config template (prompts for env vars on init)
  .chezmoidata/       # data files consumed by templates
    packages.yaml     # all brew, cask, uv tool lists (per-OS, per-host)
  .chezmoiignore      # OS-conditional ignores (e.g. skip macOS-only files on Linux)
  .chezmoiscripts/    # run_once / run_onchange lifecycle scripts
  .chezmoitemplates/  # reusable Go template partials
  dot_config/         # -> ~/.config (fish, ghostty, kitty, starship, mise, etc.)
  dot_ssh/            # -> ~/.ssh
  dot_local/          # -> ~/.local (bin symlinks, CLI externals)
  private_dot_gnupg/  # -> ~/.gnupg
  private_Library/    # -> ~/Library (lazygit, lazydocker configs)
  bin/                # -> ~/bin (helper scripts)
  src/                # -> ~/src (personal gitconfig include)
  remove_work/        # -> ~/work (work gitconfig include, removed on personal machines)
scripts/              # OS bootstrap helpers (alpine.sh, debian.sh, ubuntu.sh)
install.sh            # one-shot bootstrap: installs chezmoi + runs init --apply
README.md
```

## Chezmoi Concepts You Must Know

### File naming conventions

Chezmoi source files use prefixes to control target behavior. The most important ones used here:

| Prefix | Meaning |
|---|---|
| `dot_` | Target starts with `.` (e.g. `dot_config` -> `.config`) |
| `private_` | Target file/dir gets `0700`/`0600` permissions |
| `executable_` | Target file gets `0755` permissions |
| `symlink_` | Target is a symlink; file content is the link target |
| `empty_` | Create an empty file if it does not exist |
| `remove_` | Remove the target from the home directory (not managed, just deleted) |
| `.tmpl` suffix | File is a Go text/template, rendered before writing |

When adding new files, use `chezmoi add <target-path>` instead of manually creating source files.
If you must create source files by hand, follow the naming conventions above precisely.

### Template data

Templates use Go `text/template` syntax. Data comes from three sources:

1. **`home/.chezmoi.toml.tmpl`** - generates `~/.config/chezmoi/chezmoi.toml` on `chezmoi init`.
   Defines these data keys (under `[data]`):

   | Key | Type | Description |
   |---|---|---|
   | `ephemeral` | bool | `true` for containers, codespaces, vagrant. Skips most config. |
   | `secure_env` | bool | Whether secrets (1Password) are available |
   | `personal` | bool | `true` on personal machine (hostname `mentat`) |
   | `include_Linear` | bool | `true` on Linear machine (no hostname mapped yet) |
   | `git_author_name` | string | Name for git commits |
   | `git_author_email` | string | Email for git commits |

2. **`home/.chezmoidata/packages.yaml`** - package lists structured as:
   - `packages.darwin.brews.always` / `packages.darwin.brews.per_host.<hostname>`
   - `packages.darwin.casks.always` / `packages.darwin.casks.per_host.<hostname>`
   - `packages.darwin.uv_tools.always` / `packages.darwin.uv_tools.per_host.<hostname>`
   - `linux_tool_versions` - pinned versions for tools installed via `.chezmoiexternal.toml` on Linux

3. **Built-in chezmoi variables** - `.chezmoi.os`, `.chezmoi.hostname`, `.chezmoi.arch`, `.chezmoi.username`, etc.

### Conditional branching pattern

Most templates branch on `personal` / `include_Linear` / `ephemeral` / `.chezmoi.os`.
`personal` is the baseline profile. `include_Linear` is independent flags that
layer work-specific config on top. 

```
{{ if .personal -}}
...personal-only content...
{{ end -}}

{{ if eq .chezmoi.os "darwin" -}}
...macOS-only content...
{{ end -}}
```

### Scripts

Scripts in `.chezmoiscripts/` follow chezmoi naming conventions:

- `run_once_after-*` - runs once after first apply
- `run_onchange_after-*` - re-runs when a watched hash changes (e.g. packages.yaml hash in a comment)
- Numeric prefix (10, 15, 20, 30, 50) controls execution order
- `.tmpl` suffix means the script itself is templated (usually to skip on wrong OS)

### External tools (`.chezmoiexternal.toml`)

Used in `dot_local/cli/` and `dot_config/fish/completions/` to pull binaries/files from GitHub releases.
On Linux, this is how delta, starship, eza, ripgrep, bat, jless, jump, and direnv get installed.
On macOS, these come from Homebrew instead.

### Reusable templates

`home/.chezmoitemplates/` contains partials included via `{{ template "name" . }}`:

- `system/install-brew` - installs Homebrew if missing
- `system/activate-brew` - activates Homebrew in current shell
- `system/brew-bundle` - generates and runs a Brewfile from packages.yaml data
- `system/uv-tool-install` - installs uv tools from packages.yaml
- `finicky/common`, `finicky/personal`, `finicky/work` - browser routing rules
- `lazytools/theme` - shared Catppuccin theme for lazygit/lazydocker

## Key Tools and Their Config Locations

| Tool | Source path | Notes |
|---|---|---|
| Fish shell | `dot_config/fish/` | Primary shell. `conf.d/` files load in numeric order. |
| Starship prompt | `dot_config/starship.toml` | Two-line prompt with right-side modules |
| Git | `dot_gitconfig.tmpl` | Includes `~/work/gitconfig` and `~/src/gitconfig` conditionally |
| Ghostty | `dot_config/ghostty/config` | Primary terminal emulator, Catppuccin Mocha theme |
| Kitty | `dot_config/kitty/` | Secondary terminal |
| Vim | `dot_vimrc`, `dot_vim/` | Uses vim-plug, Catppuccin Mocha theme |
| Mise | `dot_config/mise/` | Runtime version manager (node, go, python, uv, etc.) |
| Hammerspoon | `dot_hammerspoon/` | macOS automation (terminal toggle via Alt+backtick, mouse highlight) |
| Karabiner | `dot_config/private_karabiner/` | Keyboard remapping (macOS) |
| Finicky | `dot_finicky.js.tmpl` | URL routing to different browsers (personal vs CA) |
| Zellij | `dot_config/zellij/` | Terminal multiplexer, Catppuccin Mocha theme |
| SSH | `dot_ssh/private_config.tmpl` | 1Password agent, connection reuse |
| GnuPG | `private_dot_gnupg/` | GPG config, agent using 1Password |
| direnv | `dot_config/direnv/` | Per-directory env management |
| bat | `dot_config/bat/config` | cat replacement |
| ripgrep | `dot_ripgreprc` | grep replacement |
| lazygit/lazydocker | `private_Library/private_Application Support/` | Catppuccin theme |

## How to Make Changes

### Adding a new package

1. Edit `home/.chezmoidata/packages.yaml`
2. Add to the appropriate section (`brews.always`, `casks.always`, `uv_tools.always`, or under `per_host.<hostname>`)
3. The `run_onchange_after-10-darwin-install-packages.sh.tmpl` script will re-run on next `chezmoi apply` because it hashes `packages.yaml`

### Adding a new dotfile

Prefer `chezmoi add <target>` when possible. If creating manually:

1. Place it under `home/` with correct chezmoi prefixes
2. If it needs template data, add `.tmpl` suffix and use Go template syntax
3. If it is OS-specific, either guard with template conditionals or add to `.chezmoiignore`

### Adding a new fish function

Create `home/dot_config/fish/functions/<name>.fish`. If it needs template data (e.g. OS checks), add `.tmpl` suffix.

### Adding a fish conf.d snippet

Create `home/dot_config/fish/conf.d/<NN>-<name>.fish` where NN is a two-digit number controlling load order:
- 10-19: basics (env vars, locale)
- 20-29: package managers (brew, fisher)
- 30-39: PATH setup
- 40-49: aliases and abbreviations
- 50-59: dev tool setup (mise, direnv, language-specific)
- 80-89: interactive UX (autols)
- 90-99: prompt

### Adding a new chezmoi lifecycle script

1. Place in `home/.chezmoiscripts/`
2. Follow naming: `run_once_after-<NN>-<description>.sh` or `run_onchange_after-<NN>-<description>.sh.tmpl`
3. If it should only run on a specific OS, make it a `.tmpl` and wrap the entire body in `{{ if eq .chezmoi.os "darwin" }}...{{ end }}`
4. For `run_onchange` scripts, include a hash comment of the watched file: `# hash: {{ include "path" | sha256sum }}`

### Adding per-host configuration

The pattern for per-host packages is already established:
```yaml
per_host:
  hostname-here:
    - package-name
```
For per-host config in templates, prefer the include flags (`{{ if .include_Linear }}`) over raw hostname checks.

## Design Principles

- **Catppuccin Mocha** is the universal color theme (Ghostty, Vim, Zellij, lazygit, lazydocker, kitty)
- **1Password** is the secrets backend (SSH agent, GPG signing keys, accessed via `op://` URIs and `onepasswordRead`)
- **Fish** is the shell everywhere. Do not add bash/zsh profile config
- **mise** manages runtime versions (not asdf, nvm, pyenv, etc.)
- **uv** is the Python package installer
- **Homebrew** manages system packages on macOS; `.chezmoiexternal.toml` handles Linux binaries
- Minimal comments in config files. If something needs explaining, it is probably the "why" not the "how"

## Safety Rules

- **Never** commit secrets, tokens, or private keys. Secrets come from 1Password at template render time
- **Never** `chezmoi apply` from within an agent session. Applying changes the live system. Only edit source files
- Template expressions like `{{ onepasswordRead "op://..." }}` will fail outside a secure env. Do not add new 1Password references without the `{{ if .secure_env }}` guard
- The `.chezmoiignore` ensures macOS-only dirs (Hammerspoon, Karabiner, Library) are skipped on Linux. Respect this pattern for new OS-specific files
- The `remove_work/` directory uses chezmoi's `remove_` prefix to delete `~/work/gitconfig` on non-CA machines. Be careful with this prefix as it deletes real files from the home directory
- Do not modify vendored files: `dot_vim/autoload/plug.vim`, `dot_config/fish/plugins/`, `dot_hammerspoon/Spoons/`

## Testing Changes

To preview what chezmoi would do without writing anything:

```fish
chezmoi diff          # show diff of what would change
chezmoi cat <target>  # render a template and print to stdout
chezmoi data          # show all template data
chezmoi doctor        # health check
```

## Git

- Default branch is `master`
- Remote: `git@github.com:delicb/dotfiles.git`
