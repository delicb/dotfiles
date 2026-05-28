# git-spice Command Reference

## Global Flags

All commands support:
- `-h`, `--help`
- `--version`
- `-v`, `--verbose` (or `$GIT_SPICE_VERBOSE`)
- `-C`, `--dir=DIR` - change directory before running
- `--[no-]prompt` - control interactive prompts

---

## Shell

### git-spice shell completion
```
git-spice shell completion [<shell>]
```
Generate shell completion scripts for `bash`, `zsh`, or `fish`.

---

## Authentication

```
git-spice auth login [--refresh]
git-spice auth status
git-spice auth logout
```
Authenticate with GitHub, GitLab, or Bitbucket. Supports OAuth, GitHub App,
Git Credential Manager, Personal Access Token, service CLI, and env vars
(`GITHUB_TOKEN`, `GITLAB_TOKEN`, `BITBUCKET_TOKEN`).

---

## Repository

### git-spice repo init (`git-spice ri`)
```
git-spice ri [--trunk=BRANCH] [--remote=NAME] [--upstream=NAME] [--reset]
```
Initialize git-spice in a repo. Re-run to change trunk or remotes.
`--remote` sets the push remote. `--upstream` sets the remote that receives CRs.
If only `--remote` is provided, it is used for both. `--reset` discards all
stored data.

### git-spice repo sync (`git-spice rs`)
```
git-spice rs [--restack[=none|aboves|upstack]]
```
Pull trunk and delete merged branches. In v0.29+, branches above deleted
branches are retargeted without rebasing by default. Bare `--restack` restacks
all affected upstacks. `--restack=aboves` restacks only direct upstack branches.

### git-spice repo restack (`git-spice rr`)
```
git-spice rr
```
Restack all tracked branches in the repo.

---

## Branch

### git-spice branch create (`git-spice bc`)
```
git-spice bc [<name>] [-m MSG] [-F FILE] [-a] [--no-commit] [--insert]
    [--below] [-t BRANCH] [--no-verify] [--signoff]
```
Create a stacked branch. Stages and commits by default. Without a name,
generates one from the commit message.

Key flags:
- `-a` / `--all`: stage modified/deleted files (like `git commit -a`)
- `-m MSG` / `--message=MSG`: commit message (implies `--commit`)
- `-F FILE` / `--message-file=FILE`: read commit message from a file (implies `--commit`)
- `--[no-]commit`: commit staged changes or create branch without committing
- `--insert`: place between current target and its upstack
- `--below`: place below the current target branch
- `-t BRANCH` / `--target=BRANCH`: use a different target base branch
- `--signoff`: add Signed-off-by trailer

### git-spice branch track (`git-spice btr`)
```
git-spice btr [<branch>] [-b BASE]
```
Track an existing branch. Auto-guesses base unless `--base` is given.

### git-spice branch untrack (`git-spice buntr`)
```
git-spice buntr [<branch>]
```
Stop tracking a branch without deleting it.

### git-spice branch checkout (`git-spice bco`)
```
git-spice bco [<branch>] [-n] [--detach] [-u]
```
Check out a branch. Without args, shows interactive tree picker.
`-n` prints target without checking out. `-u` / `--untracked` includes untracked
branches.

### git-spice branch delete (`git-spice bd`)
```
git-spice bd [<branches>...] [--force] [--restack[=none|aboves|upstack]]
```
Delete branch(es) and retarget upstack branches onto the next available base.
In v0.29+, deleted branches' upstacks are not rebased unless `--restack` is used.

### git-spice branch rename (`git-spice brn`)
```
git-spice brn [<old> [<new>]]
```
Rename a branch. With one arg, renames current branch. No args = interactive.

### git-spice branch edit (`git-spice be`)
```
git-spice be
```
Interactive rebase scoped to current branch's commits. Auto-restacks upstack.

### git-spice branch restack (`git-spice br`)
```
git-spice br [--branch=NAME]
```
Rebase current branch onto its base.

### git-spice branch onto (`git-spice bon`)
```
git-spice bon [<onto>] [--branch=NAME] [--restack[=none|aboves|upstack]]
```
Move only the current branch to a new base. Upstack branches are retargeted to
the moved branch's old base. In v0.29+, retargeted upstack branches are not
rebased unless `--restack` is used.

### git-spice branch submit (`git-spice bs`)
```
git-spice bs [--branch=NAME] [--title=T] [--body=B] [-c/--fill]
    [--draft/--no-draft] [--force] [--no-publish] [--update-only]
    [--label=L] [--reviewer=R] [--assign=A] [-w/--web] [--no-web]
    [--nav-comment=true|false|multiple] [-n/--dry-run] [--no-verify]
```
Create or update a CR for a single branch.

### git-spice branch split (`git-spice bsp`)
```
git-spice bsp [--at COMMIT:NAME ...] [--branch=NAME]
```
Split a branch at commit boundaries. Interactive by default.
Non-interactive: `git-spice bsp --at HEAD~2:part1 --at HEAD~1:part2`

### git-spice branch squash (`git-spice bsq`)
```
git-spice bsq [-m MSG] [-F FILE] [--no-edit] [--branch=NAME] [--no-verify]
```
Squash all commits in a branch into one.

### git-spice branch fold (`git-spice bfo`)
```
git-spice bfo [--branch=NAME]
```
Merge current branch's commits into its base, then delete the branch.

### git-spice branch diff (`git-spice bdi`)
```
git-spice bdi [--branch=NAME]
```
Show diff between a branch and its base (equivalent to `git diff base...branch`).

---

## Stack

### git-spice stack submit (`git-spice ss`)
```
git-spice ss [-c/--fill] [--draft/--no-draft] [--force] [--update-only]
    [--no-publish] [--label=L] [--reviewer=R] [--assign=A] [-n/--dry-run]
    [-w/--web] [--no-web] [--nav-comment=true|false|multiple] [--no-verify]
```
Submit all branches in the current stack.

### git-spice stack restack (`git-spice sr`)
```
git-spice sr [--branch=NAME]
```
Restack all branches in the current stack.

### git-spice stack edit (`git-spice se`)
```
git-spice se [--branch=NAME] [--editor=STRING]
```
Reorder branches in a stack via editor. Requires a linear stack.

### git-spice stack delete (`git-spice sd`)
```
git-spice sd --force
```
Delete all branches in the stack. Requires `--force`.

---

## Upstack

### git-spice upstack submit (`git-spice uss`)
```
git-spice uss [--branch=NAME] [same flags as git-spice ss]
```
Submit current branch and all upstack branches.

### git-spice upstack restack (`git-spice usr`)
```
git-spice usr [--branch=NAME] [--skip-start]
```
Restack current branch and everything above it.

### git-spice upstack onto (`git-spice uso`)
```
git-spice uso [<onto>] [--branch=NAME]
```
Move current branch + upstack onto a new base.

### git-spice upstack delete (`git-spice usd`)
```
git-spice usd --force
```
Delete all branches above current. Requires `--force`.

---

## Downstack

### git-spice downstack submit (`git-spice dss`)
```
git-spice dss [--branch=NAME] [same flags as git-spice ss]
```
Submit current branch and all downstack branches.

### git-spice downstack edit (`git-spice dse`)
```
git-spice dse [--branch=NAME] [--editor=STRING]
```
Reorder downstack branches via editor.

### git-spice downstack restack (`git-spice dsr`)
```
git-spice dsr [--branch=NAME]
```
Restack current branch and all downstack branches.

### git-spice downstack track (`git-spice dstr`)
```
git-spice dstr [<branch>]
```
Track all untracked branches below a branch. Walks the commit graph downward.

---

## Commit

### git-spice commit create (`git-spice cc`)
```
git-spice cc [-a] [-m MSG] [-F FILE] [--allow-empty] [--fixup=COMMIT]
    [--no-verify] [--signoff]
```
Commit + auto-restack upstack.

### git-spice commit amend (`git-spice ca`)
```
git-spice ca [-a] [-m MSG] [-F FILE] [--no-edit] [--allow-empty]
    [--no-verify] [--signoff]
```
Amend last commit + auto-restack upstack.

### git-spice commit split (`git-spice csp`)
```
git-spice csp [-m MSG] [-F FILE] [--no-verify]
```
Interactively split the last commit into two.

### git-spice commit fixup (`git-spice cf`) [experimental]
```
git-spice cf [<commit>] [-e/--edit] [--no-verify]
```
Apply staged changes to an older commit in the branch. Enable with:
`git config spice.experiment.commitFixup true`. Requires Git 2.45+.

### git-spice commit pick (`git-spice cp`) [experimental]
```
git-spice cp [<commit>] [--from=NAME]
```
Stack-aware cherry-pick. Enable with:
`git config spice.experiment.commitPick true`. Requires Git 2.45+.

---

## Navigation

| Command | Short | Description |
|---------|-------|-------------|
| `git-spice up [N]` | | Move up N branches (default 1) |
| `git-spice down [N]` | `git-spice d` | Move down N branches |
| `git-spice top` | | Move to topmost branch |
| `git-spice bottom` | | Move to bottommost branch (above trunk) |
| `git-spice trunk` | | Check out trunk |

All support `-n` (dry-run: print target without checking out) and `--detach`.

---

## Rebase

### git-spice rebase continue (`git-spice rbc`)
```
git-spice rbc [--edit|--no-edit]
```
Continue an interrupted rebase. Replaces `git rebase --continue`.

### git-spice rebase abort (`git-spice rba`)
```
git-spice rba
```
Abort an interrupted rebase. Replaces `git rebase --abort`.

---

## Log

### git-spice log short (`git-spice ls`)
```
git-spice ls [-a] [-S/--cr-status] [-c/--cr-comments] [--json]
```
List branches in current stack. `-a` for all tracked branches.

### git-spice log long (`git-spice ll`)
```
git-spice ll [-a] [-S/--cr-status] [-c/--cr-comments] [--json]
```
List branches + commits.

---

## Version

```
git-spice version [--short]
```
Print version information.
