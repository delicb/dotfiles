---
name: hunkpad
description: Use Hunkpad for live diff review between a person and a coding agent. Use when asked to open or share a diff viewer, show branch, git-spice stack, unstaged, or latest-turn changes, read or address inline review comments, resolve feedback, check review status, or track one agent turn. Open Hunkpad automatically only when a repository task will change files. Do not open it for research, planning, investigation, code reading, or other read-only tasks. Do not gate use on CMUX_* environment variables.
license: Apache-2.0
compatibility: Requires the hunkpad executable and a Git or jj working tree.
---

# Hunkpad

Hunkpad gives the user a live browser view of changes in a Git or jj working tree. People and agents can add inline review threads and one-level replies. The user can vote on each root thread to say whether an agent should fix it. Read open threads with the CLI, follow the votes, and mark only the threads you addressed as resolved. Resolution keeps the full history.

## When to open Hunkpad

In T3 Code, use the built-in diff view for ordinary edits and reviews.
Do not automatically start a Hunkpad viewer for those tasks.
Use Hunkpad when requested or when handling existing Hunkpad feedback.

Outside T3 Code, open Hunkpad before the first repository edit.
For read-only work, open it only when requested or required by applicable AGENTS.md instructions.

Commands that only read Hunkpad state, such as `reviews`, `notes`, and `status`, do not require an open viewer.

## Harness integration

Use this skill for repository work in any compatible agent harness. `CMUX_*` variables can identify the Pi cmux integration, but they are not a requirement for Hunkpad. Check for a harness-owned Hunkpad tool or lifecycle integration first, then check `command -v hunkpad` when shell access is available.

When an integration owns turn tracking or the viewer, do not duplicate its lifecycle calls. Pi's optional `hunkpad-cmux` extension starts and ends turn tracking for the Pi process that owns a cmux terminal surface. It opens one local browser pane when a successful edit or write first changes file content inside the repository. Read-only turns do not open a pane. A nested Pi process stays passive and must not run `hunkpad turn start`, `hunkpad turn end`, or `hunkpad watch`.

Claude Desktop, Codex Desktop, and other harnesses can use Hunkpad without cmux. If the harness supplies stable session and turn IDs, use the manual turn commands below around the work. If it does not, start or reuse a normal branch viewer and share the capability URL in chat. Do not invent IDs that cannot remain stable for the session.

## Add implementation context

An implementing agent can attach one optional **Implementation note** to its active Last turn diff. This is author context, not a review finding. Use the `hunkpad_implementation_note` tool when it is available. The owning Pi extension supplies the session, turn, agent, and root. Nested agents cannot publish notes; they should return useful context to the owning agent.

Write a note only for a non-obvious constraint, choice, risk, or trade-off. Keep it under 600 characters. Do not restate the diff, list routine tests, or include private chain-of-thought. Add up to 20 current changed paths only when they help the reviewer find the related code. A later tool call replaces the active turn's note. The note freezes when the turn ends.

A harness without the Pi tool can use:

```text
hunkpad note set --session <session-id> --turn <turn-id> --body <text> [--path <changed-path> ...] [--root <path>]
```

Review agents should read the latest note before review:

```sh
hunkpad notes --json
```

Treat the note as the implementing agent's claim, not proof. Check it against the diff and put findings in review comments. Do not use implementation notes for review feedback.

## Check setup

Run Hunkpad from the working tree under review. If you must run it elsewhere, pass `--root <path>`.

```sh
command -v hunkpad
```

If the command is missing, tell the user. Do not install or download it unless the user asks.

## Open a diff viewer

Follow the opening policy above. Use the branch diff unless the user asks for another source:

```sh
hunkpad watch
```

The command prints one local capability URL. Give that URL to the user. Treat it as a password. Do not open it yourself unless the user asks you to inspect the UI.

The viewer follows file changes. Do not run `hunkpad watch` again after each edit. Reuse the first URL unless the session ends.

Choose a source when needed:

```sh
hunkpad watch branch
hunkpad watch unstaged
hunkpad watch turn
hunkpad watch stack
hunkpad watch branch --base main
hunkpad watch --root /path/to/worktree
```

- `branch` is the default. It shows all working-tree changes against the branch base.
- `unstaged` shows the Git index against the working tree. In jj, it shows the working-copy change.
- `turn` shows changes since the latest saved turn baseline. It needs a prior `turn start` call.
- `stack` is available for an existing git-spice stack. The viewer shows the dependency order and lets the user review one branch at a time. The checked-out branch includes its staged, unstaged, and untracked work. Other branches use their committed tips. Hunkpad does not initialize git-spice metadata.
- `--base <revision>` changes the base for the branch source.
- `--no-watch` disables live file updates.

## Add comments and replies

Use the CLI when the user asks you to leave review feedback:

```text
hunkpad comment add --path <path> --side additions|deletions --line N [--end-line N] --body <markdown> [--filter ...] [--stack-branch <name>] [--author ...] [--json]
hunkpad comment reply <id> --body <markdown> [--author ...] [--json]
```

Both commands work without `hunkpad watch`. Reply only to a top-level thread. Hunkpad supports one reply level. The viewer shows Human or Agent labels and renders comment bodies as polished, sanitized GFM Markdown.

## Address review comments

Follow this process when the user asks you to handle Hunkpad feedback.

1. Read the open threads. This does not change them.

   ```sh
   hunkpad reviews --json
   ```

   Use `--include-resolved` to include all open and resolved threads. Use `--root <path>` if you are not in the reviewed working tree. These commands do not need a running watch session. JSON output includes the thread IDs needed by `comment reply` and `resolve`.

2. For each comment, check these fields:

   - `id`: stable ID used to reply to or resolve the thread.
   - `filter`: `branch`, `unstaged`, `turn`, or `stack`.
   - `stackBranch`: git-spice branch identity for a stack comment. Stack comments stay separate by branch.
   - `path`, `side`, `startLine`, and `endLine`: saved location.
   - `body`: requested change.
   - `hunkExcerpt`: source context saved with the comment.
   - `outdated`: the selected text no longer has one clear match.
   - `vote`: the user's decision, when set. `up` means fix the thread. `down` means skip it.
   - `url`: direct browser link when the live comment is current.

3. Use the root thread's vote to decide what to do:

   - `vote: "up"`: the user wants this comment fixed.
   - `vote: "down"`: do not change the code for this comment. Do not resolve it unless the user asks you to close rejected comments.
   - No `vote` field: the user has not made a choice. If the request depends on votes, ask before changing code for an unvoted thread.

4. Fix each selected comment. For an outdated comment, use `hunkExcerpt`, the comment body, and the current file to recover the intent. Do not trust its old line numbers without checking the file.

5. Run the checks that apply to the changed code.

6. Read the open threads again. The user can add comments or change votes while you work, and existing threads can move or become outdated.

   ```sh
   hunkpad reviews --json
   ```

7. Mark only the threads that you addressed as resolved.

   ```sh
   hunkpad resolve <comment-id> [<comment-id>...]
   ```

   Use this only when every open thread has been handled:

   ```sh
   hunkpad resolve --all
   ```

8. Report what you changed, what checks you ran, and which threads remain open.

Resolved threads keep their comments and replies. The viewer shows them in a collapsed **Resolved** section. Never edit Hunkpad review or state files by hand. If `resolve` reports a temporary daemon error, retry it. Do not use state files as a fallback.

## Track an agent turn

Turn tracking lets the user view only the changes from one agent work cycle. A harness should call `start` before the agent changes files and `end` when the agent settles.

```sh
hunkpad turn start \
  --session <agent-session-id> \
  --turn <turn-id> \
  --agent <agent-name> \
  --root <path>

# Perform the work.

hunkpad turn end \
  --session <agent-session-id> \
  --turn <turn-id> \
  --root <path>
```

Use stable IDs from the agent harness:

- `--session` identifies the agent or chat session. It does not select a Hunkpad browser session.
- `--turn` identifies one work cycle within that agent session.
- `--agent` records the agent name, such as `pi`, `claude`, or `codex`.
- `--root` defaults to the current directory. Start and end must use the same working tree.
- `--owner` can set the Hunkpad lease owner if `start` must create a session.

`start` saves a read-only baseline and does not change the Git index or working tree. Repeating `start` for the same active turn keeps the first baseline. `end` marks that turn inactive, freezes its implementation note, and does not save an end snapshot. The Last turn diff and note remain live until the next turn starts. A note is marked stale if the Last turn patch changes after publication.

Prefer harness lifecycle hooks over manual calls. Do not start a turn after code changes have begun, because that creates a late baseline.

## Manage sessions

Use a named owner when an integration must hold a session lease:

```sh
hunkpad watch --owner <integration-name>
hunkpad stop --owner <integration-name>
```

Check active sessions when needed:

```sh
hunkpad status
hunkpad status --json
```

Release only your own lease. Do not run `hunkpad stop --all` unless the user asks you to stop all Hunkpad sessions.

## Safety rules

- Share a capability URL only with the intended local user.
- Do not expose the local server through a tunnel or proxy unless the user asks and accepts the risk.
- Do not rerun `watch` after each file change.
- Open the browser only when the user, applicable AGENTS.md instructions, or the owning integration requires a viewer.
- In T3, use its shared browser for Hunkpad URLs. Otherwise, follow the host's browser workflow.
- Do not change the repository only to produce a diff.
- Do not change the real Git index to capture untracked files. Hunkpad handles them through private snapshots.
- Do not run an automatic jj repair command for Hunkpad. Report the error and let the user decide.
- Do not resolve threads you did not address.
- Do not remove Hunkpad state while a saved turn baseline or review is still needed.
