# git-spice Configuration

All options are set via `git config`. Use `--global` for user-level defaults and
`--local` for repo-level defaults.

## Branch Creation

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `spice.branchCreate.commit` | true/false | true | Whether `git-spice bc` commits staged changes |
| `spice.branchCreate.prefix` | string | (none) | Prefix for branch names, for example `username/` |
| `spice.branchCreate.generatedBranchNameLimit` | integer | 32 | Max length of auto-generated branch names |

## Branch Retargeting and Restack

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `spice.branchDelete.restack` | none/aboves/upstack | none | How `git-spice bd` restacks branches above deleted branches |
| `spice.branchOnto.restack` | none/aboves/upstack | none | How `git-spice bon` restacks branches above moved branches |
| `spice.repoSync.restack` | none/aboves/upstack | none | How `git-spice rs` restacks branches above deleted merged branches |

In v0.29+, these operations retarget affected upstack branches without rebasing
by default. Bare `--restack` selects `upstack`. Use `--restack=aboves` to
restack only direct upstack branches.

## Commit

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `spice.commit.signoff` | true/false | false | Add Signed-off-by trailer by default |

## Checkout and Navigation

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `spice.branchCheckout.showUntracked` | true/false | false | Show untracked branches in `git-spice bco` picker |
| `spice.branchCheckout.trackUntracked` | prompt/always/never | prompt | Auto-track untracked branches on checkout |
| `spice.branchPrompt.sort` | refname/committerdate/authordate | refname | Sort order in branch prompts. Prefix `-` for descending |
| `spice.checkout.verbose` | true/false | true | Print message when switching branches |

`spice.branchCheckout.trackUntrackedPrompt` is deprecated. Use
`spice.branchCheckout.trackUntracked` instead.

## Submission

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `spice.submit.draft` | true/false | false | Default draft status for new CRs |
| `spice.submit.publish` | true/false | true | Create CRs on submit. false = push only |
| `spice.submit.updateOnly` | true/false | false | Multi-branch submits only update existing CRs |
| `spice.submit.web` | true/false/created | false | Open browser after submit |
| `spice.submit.labels` | comma-separated | (none) | Default labels for all CRs in current docs |
| `spice.submit.label` | comma-separated | (none) | Older/deprecated singular label setting |
| `spice.submit.labels.addWhen` | always/create | always | When configured labels are added in current docs |
| `spice.submit.label.addWhen` | always/create | always | Older/deprecated singular label addWhen setting |
| `spice.submit.reviewers` | comma-separated | (none) | Default reviewers. Use `org/team` for GitHub teams |
| `spice.submit.reviewers.addWhen` | always/ready | always | Skip configured reviewers for drafts when `ready` |
| `spice.submit.assignees` | comma-separated | (none) | Default assignees |
| `spice.submit.template` | filename | (none) | Auto-select CR template, for example `PULL_REQUEST_TEMPLATE.md` |
| `spice.submit.listTemplatesTimeout` | duration | 1s | Timeout for fetching CR templates |
| `spice.submit.skipRestackCheck` | never/trunk/always | never | Skip restack check before submit |

## Navigation Comments

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `spice.submit.navigationComment` | true/false/multiple | true | Post stack navigation comments on CRs |
| `spice.submit.navigationCommentSync` | branch/downstack | branch | Which branches' comments to sync on submit |
| `spice.submit.navigationCommentStyle.marker` | string | `◀` | Marker for current branch in nav comments |
| `spice.submit.navigationComment.downstack` | all/open | all | Which downstack CRs to show in nav comments |

## Log

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `spice.log.all` | true/false | false | Show all stacks by default in `git-spice ls`/`git-spice ll` |
| `spice.log.crFormat` | url/id | id | Show CR URL or ID |
| `spice.logShort.crFormat` | url/id | falls back to `spice.log.crFormat` | Override short log CR display |
| `spice.logLong.crFormat` | url/id | falls back to `spice.log.crFormat` | Override long log CR display |
| `spice.log.crStatus` | true/false | false | Fetch and show CR status |
| `spice.log.crComments` | true/false | false | Fetch and show CR review comment counts |
| `spice.log.pushStatusFormat` | true/false/aheadBehind | true | Show push sync status |

## Repo Sync

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `spice.repoSync.closedChanges` | ask/ignore | ask | How to handle closed, not merged, CRs |
| `spice.repoSync.restack` | none/aboves/upstack | none | See Branch Retargeting and Restack |

## Rebase

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `spice.rebaseContinue.edit` | true/false | true | Open editor on `git-spice rbc` |

## Git and Secrets

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `spice.git.indexLockTimeout` | duration | 5s | Retry Git commands that fail due to `index.lock` contention |
| `spice.secret.backend` | auto/file/keyring | auto | Secret storage backend. Can also use `$GIT_SPICE_SECRET_BACKEND` |

Set `spice.git.indexLockTimeout` to `0` to disable retries.

## Forge URLs (for self-hosted instances)

| Option | Env Var | Description |
|--------|---------|-------------|
| `spice.forge.github.url` | `GITHUB_URL` | GitHub instance URL |
| `spice.forge.github.apiUrl` | `GITHUB_API_URL` | GitHub API URL |
| `spice.forge.gitlab.url` | `GITLAB_URL` | GitLab instance URL |
| `spice.forge.gitlab.apiUrl` | `GITLAB_API_URL` | GitLab API URL |
| `spice.forge.gitlab.oauth.clientID` | `GITLAB_OAUTH_CLIENT_ID` | OAuth client ID for self-hosted GitLab |
| `spice.forge.gitlab.removeSourceBranch` | | Remove source branch on MR merge. Default: true |
| `spice.forge.bitbucket.url` | `BITBUCKET_URL` | Bitbucket instance URL |
| `spice.forge.bitbucket.apiURL` | `BITBUCKET_API_URL` | Bitbucket API URL |

## Experiments

Enable with `git config spice.experiment.<name> true`:

| Experiment | Description |
|------------|-------------|
| `commitFixup` | Enable `git-spice cf` - amend any commit in the branch or downstack. Requires Git 2.45+ |
| `commitPick` | Enable `git-spice cp` - stack-aware cherry-pick. Requires Git 2.45+ |

## Custom Shorthands

Define custom shorthands under `spice.shorthand`:
```
git config --global spice.shorthand.ch "branch checkout"
git config --global spice.shorthand.can "commit amend --no-edit"
```

Shell command aliases (prefix with `!`):
```
git config spice.shorthand.from-up '!git checkout -p $(git-spice up -n) -- "$@"'
```
