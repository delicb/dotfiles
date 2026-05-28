# git-spice Workflows

## Typical Stacking Workflow

```
# Start from trunk
git-spice trunk

# Create first feature branch
git add <files>
git-spice bc feat-auth -m "Add authentication"

# Stack second feature on top
git add <files>
git-spice bc feat-dashboard -m "Add dashboard"

# Make changes mid-stack
git-spice down                          # back to feat-auth
# edit files...
git-spice cc -m "Fix auth edge case"   # commit + auto-restack feat-dashboard

# Submit all PRs
git-spice ss --fill                     # submit entire stack

# After feat-auth merges on remote:
git-spice rs --restack                  # sync, delete merged branch, restack upstack
git-spice bs                            # update feat-dashboard PR
```

In v0.29+, `git-spice rs` retargets upstack branches without rebasing by
default. Use `--restack` when you want the rebase immediately.

## Import an Existing PR

```
gh pr checkout 123                      # or: glab mr checkout 8
git-spice btr                           # track the branch
git-spice bs                            # re-submit to associate with existing CR
```
Works even for PRs not created by git-spice, as long as the local branch name
matches the remote branch name.

## Import a Stack of PRs

```
gh pr checkout 123
gh pr checkout 124
gh pr checkout 125
git checkout <topmost-branch>
git-spice dstr                          # downstack track - walks graph and tracks all
```

## Track an Existing Manual Stack

From the topmost branch:
```
git checkout feat3
git-spice dstr                          # prompts for base of each branch
```

Or individually:
```
git checkout feat1 && git-spice btr
git checkout feat2 && git-spice btr
git checkout feat3 && git-spice btr
```

## Mid-Stack Fixup (Edit + Restack)

```
git-spice bco feat1                     # check out the branch to fix
# edit files...
git-spice cc -a -m "fixup"             # commit all changes + restack upstack

# Or amend instead of new commit:
# edit files...
git add <files>
git-spice ca --no-edit                  # amend + restack
```

For an older commit in the branch or downstack, enable experimental fixup and
use:

```
git config spice.experiment.commitFixup true
git add <files>
git-spice cf <commit>
git-spice cf --edit <commit>            # edit the commit message too
```

## Reorder Branches in a Stack

```
git-spice se                            # stack edit - opens editor with branch order
# Reorder lines in the editor, save and close
```
Only works with linear stacks (no branch has multiple upstack branches).

For downstack reordering: `git-spice dse`

## Move a Branch to a Different Base

Move branch + its upstack:
```
git-spice bco feat2
git-spice uso main                      # feat2 and everything above moves onto main
```

Move only the branch (upstack stays on old base):
```
git-spice bco feat2
git-spice bon main                      # only feat2 moves; upstack reattaches to feat1
```

In v0.29+, `git-spice bon` retargets the old upstack without rebasing. Use
`git-spice bon main --restack` to rebase affected branches immediately.

## Insert a Branch Mid-Stack

```
git-spice bco feat1
git add <files>
git-spice bc --insert feat-between -m "Intermediate work"
# feat-between is now between feat1 and feat1's former upstack
```

## Create a Branch Below Current

```
git-spice bco feat2
git add <files>
git-spice bc --below feat-prep -m "Prep work"
# feat-prep is now between feat2's base and feat2
```

## Split a Branch

Interactive:
```
git-spice bsp                           # select commit split points interactively
```

Non-interactive:
```
git-spice bsp --at HEAD~2:part1 --at HEAD~1:part2
```
If the branch had a CR, you'll be prompted to assign it to one of the splits.

## Squash and Submit

```
git-spice bsq -m "Single clean commit"
git-spice bs --fill
```

## Fork Workflow

Use fork mode when you do not have write access to the upstream repository.
Set the push remote to your fork and the upstream remote to the target repo:

```
git remote add upstream git@github.com:owner/project.git
git remote add fork git@github.com:you/project.git
git-spice repo init --remote=fork --upstream=upstream
```

In fork mode, git-spice pushes submitted branches to the fork and opens CRs
against upstream. Current docs state CRs are created only for branches based
directly on trunk; other stacked branches are still pushed to the fork.

## Working with Unsupported Remotes

For forges git-spice doesn't support, for example SourceHut:
```
git config spice.submit.publish false    # push branches only, no CRs
```
`git-spice rs` still detects merge commits and fast-forwards. For squash-merged
branches, manually delete with `git-spice bd`.

## Handling Rebase Conflicts

When any restack/rebase operation hits a conflict:
```
# 1. Resolve conflicts in your editor
# 2. Stage resolved files
git add <resolved-files>
# 3. Continue
git-spice rbc

# Or abort entirely:
git-spice rba
```

## Force-Update Submitted Branches

```
git-spice bs --force                    # force push current branch
git-spice ss --force                    # force push entire stack
```

## Submit as Draft, Then Mark Ready

```
git-spice bs --draft                    # submit as draft
# ... iterate ...
git-spice bs --no-draft                 # mark ready for review
```

Or set default: `git config spice.submit.draft true`

## Update Only Existing CRs (Skip Unsubmitted)

```
git-spice ss --update-only              # push updates to existing CRs only
```
Useful when you have in-progress branches you don't want to submit yet.

## Delete Branches and Restack

```
git-spice bd feat-old                   # delete + retarget upstack branches
git-spice bd feat-old --restack         # delete + retarget + restack all upstack branches
git-spice bd feat-old --restack=aboves  # restack only direct upstack branches
```

Set a default with:

```
git config spice.branchDelete.restack upstack
```
