---
name: git-spice
description: >
  Manage stacked Git branches with git-spice. Use when the user wants to
  create, navigate, restack, or submit stacked branches and Change Requests
  (PRs/MRs). Triggers on: stacking branches, git-spice commands, submitting
  stacked PRs, restacking, navigating branch stacks, syncing with trunk.
---

# git-spice

git-spice manages stacks of Git branches. It tracks branch relationships,
rebases dependents when requested, and submits stacked PRs/MRs to GitHub,
GitLab, or Bitbucket.

Use the canonical binary name `git-spice`. Built-in command shorthands are
still valid after the binary name, for example `git-spice bc` instead of
`git-spice branch create`.

## Core Workflow

```
# 1. Initialize (auto-inits on first use, so optional)
git-spice repo init

# 2. Create a stacked branch (stages + commits + tracks)
git add <files>
git-spice bc feat1 -m "Add feature 1"

# 3. Stack another branch on top
git add <files>
git-spice bc feat2 -m "Add feature 2"

# 4. Navigate the stack
git-spice down          # move to branch below
git-spice up            # move to branch above
git-spice top
git-spice bottom
git-spice bco           # interactive branch picker (tree view)
git-spice trunk         # check out trunk

# 5. Commit and restack upstack branches
git-spice cc -m "msg"   # commit create + restack
git-spice ca            # commit amend + restack
git-spice ca --no-edit  # amend without editing message

# 6. Submit Change Requests
git-spice bs            # submit current branch
git-spice ss            # submit entire stack
git-spice uss           # submit current + upstack
git-spice dss           # submit current + downstack

# Use --fill / -c to auto-fill title/body from commits
git-spice ss --fill

# 7. Sync with remote (pulls trunk, deletes merged branches)
git-spice rs

# Restack retargeted upstack branches after sync when needed
git-spice rs --restack
```

## Key Concepts

- **Stack**: branches stacked on each other; each has a base branch
- **Trunk**: the default branch (main/master) - has no base
- **Upstack**: branches above the current branch
- **Downstack**: branches below, down to (but not including) trunk
- **Restack**: rebase a branch onto its base to maintain linear history
- **Change Request (CR)**: PR (GitHub/Bitbucket) or MR (GitLab)
- **Upstream remote**: hosts trunk and receives CRs
- **Push remote**: receives submitted branch pushes
- **Fork mode**: upstream and push remotes differ; trunk-based CRs are opened
  against upstream while branches are pushed to the fork

## Shorthands

| Short | Command | Short | Command |
|-------|---------|-------|---------|
| `git-spice bc` | `git-spice branch create` | `git-spice cc` | `git-spice commit create` |
| `git-spice bco` | `git-spice branch checkout` | `git-spice ca` | `git-spice commit amend` |
| `git-spice bd` | `git-spice branch delete` | `git-spice csp` | `git-spice commit split` |
| `git-spice bdi` | `git-spice branch diff` | `git-spice cf` | `git-spice commit fixup` |
| `git-spice be` | `git-spice branch edit` | `git-spice cp` | `git-spice commit pick` |
| `git-spice bfo` | `git-spice branch fold` | `git-spice ss` | `git-spice stack submit` |
| `git-spice bon` | `git-spice branch onto` | `git-spice sr` | `git-spice stack restack` |
| `git-spice br` | `git-spice branch restack` | `git-spice se` | `git-spice stack edit` |
| `git-spice brn` | `git-spice branch rename` | `git-spice sd` | `git-spice stack delete` |
| `git-spice bs` | `git-spice branch submit` | `git-spice uss` | `git-spice upstack submit` |
| `git-spice bsp` | `git-spice branch split` | `git-spice usr` | `git-spice upstack restack` |
| `git-spice bsq` | `git-spice branch squash` | `git-spice uso` | `git-spice upstack onto` |
| `git-spice btr` | `git-spice branch track` | `git-spice usd` | `git-spice upstack delete` |
| `git-spice buntr` | `git-spice branch untrack` | `git-spice dss` | `git-spice downstack submit` |
| `git-spice dse` | `git-spice downstack edit` | `git-spice dsr` | `git-spice downstack restack` |
| `git-spice dstr` | `git-spice downstack track` | `git-spice rs` | `git-spice repo sync` |
| `git-spice ri` | `git-spice repo init` | `git-spice rr` | `git-spice repo restack` |
| `git-spice ls` | `git-spice log short` | `git-spice ll` | `git-spice log long` |
| `git-spice rbc` | `git-spice rebase continue` | `git-spice rba` | `git-spice rebase abort` |

## Common Operations

### Create branch without committing
```
git-spice bc feat --no-commit
```
Or set globally: `git config --global spice.branchCreate.commit false`

### Insert branch mid-stack
```
git-spice bco feat1
git-spice bc --insert feat-between
```
This places the new branch between feat1 and its upstack branches.

### Create branch below current
```
git-spice bc --below feat-below
```

### Move branch to different base
```
git-spice uso main           # move current + upstack onto main
git-spice bon main           # move only current branch onto main
```
`git-spice bon` retargets the moved branch's old upstack without rebasing by
default in v0.29+. Add `--restack` to rebase those branches immediately.

### Edit commits in a branch (interactive rebase scoped to branch)
```
git-spice be                 # opens rebase -i for just this branch's commits
```

### Split a branch into multiple
```
git-spice bsp                # interactive: pick split points
git-spice bsp --at HEAD~2:part1 --at HEAD~1:part2   # non-interactive
```

### Squash branch commits
```
git-spice bsq -m "Single commit message"
```

### Fold branch into its base
```
git-spice bfo                # merges current into base, deletes current
```

### Handle rebase conflicts
```
# resolve conflicts, then:
git-spice rbc                # rebase continue
# or:
git-spice rba                # rebase abort
```

### Restack everything
```
git-spice rr                 # repo restack - all tracked branches
git-spice sr                 # stack restack - current stack only
git-spice usr                # upstack restack - current + above
git-spice dsr                # downstack restack - current + below
```

### Submit with options
```
git-spice bs --draft         # submit as draft
git-spice bs --no-draft      # mark ready for review
git-spice bs --fill          # auto-fill from commit messages
git-spice ss --update-only   # only update existing CRs, skip new
git-spice bs --label bug --label urgent
git-spice bs --reviewer alice --reviewer org/team
git-spice bs --assign alice
git-spice bs --force         # force push
```

### View the stack
```
git-spice ls                 # short log (branch names)
git-spice ll                 # long log (branches + commits)
git-spice ls -a              # all tracked branches, not just current stack
git-spice ls --cr-comments   # include CR review comment counts
```

### Delete branches
```
git-spice bd feat2           # delete + retarget upstack onto base
git-spice bd --restack feat2 # delete + retarget + restack upstack
git-spice bd --force feat2   # force delete even with unmerged changes
```

## Reference Files

- **Commands & flags**: See [references/commands.md](references/commands.md) for full
  command details and all flags
- **Configuration**: See [references/config.md](references/config.md) for `git config`
  options that customize git-spice behavior
- **Workflows**: See [references/workflows.md](references/workflows.md) for advanced
  patterns like importing PRs, tracking existing stacks, fork mode, and working
  with unsupported remotes

<!-- Last synced with git-spice docs: 2026-05-28. Latest release checked: v0.29.2. Source: https://abhinav.github.io/git-spice/llms-full.txt, https://abhinav.github.io/git-spice/cli/reference/, https://abhinav.github.io/git-spice/cli/config/, https://abhinav.github.io/git-spice/changelog/ -->
