---
name: agent-handover
description: Create, review, start, and finish durable implementation handovers. Use only through an explicit skill or handover command.
disable-model-invocation: true
---

# Agent handover

Use a Markdown handover as the contract between the planning agent and the implementation agent.
Do not use the old session as the contract.

The command arguments select one mode:

- `create`: Write a draft implementation plan from the current session.
- `review`: Check a draft plan in a fresh, read-only session.
- `start`: Implement a ready plan in a fresh session.
- `finish`: Record the implementation result.

Read [references/plan-format.md](references/plan-format.md) before writing a handover file.
Use [assets/plan-template.md](assets/plan-template.md) as the plan structure.

## General rules

- Use the exact plan path from the command arguments.
- Treat repository files as facts. Treat conversation claims as leads that require checks.
- Do not copy the full transcript into a handover.
- Do not include secrets, credentials, personal data, or unrelated conversation content.
- Reference file paths and symbols. Do not depend on line numbers.
- Keep requirements, decisions, assumptions, and findings separate.
- Mark unknown information as unknown. Do not invent it.
- A receiving agent must understand the plan without the source session.

## Create mode

1. Read all repository instructions that apply to the current directory.
2. Read the repository metadata supplied by `/handover create`.
3. If no exact path is supplied, derive one under the default storage root.
4. Inspect the files, symbols, tests, and configuration that support the plan.
5. Extract only decisions and findings that affect implementation.
6. Ask the user about blocking requirements that the conversation did not resolve.
7. Write `plan.md` with `status: draft`.
8. Keep the plan in draft state until a fresh review passes.
9. Tell the user the exact path and the review command.

Use this default storage root:

```text
${AGENT_HANDOVER_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/agent-handoffs}
```

Use this path structure:

```text
<root>/<normalized-repository>/<UTC-date>/<UTC-time>-<slug>/plan.md
```

Normalize an origin such as `git@github.com:owner/repo.git` to `github.com/owner/repo`.
If no origin exists, use `local/<repo-name>-<short-path-hash>`.

A dirty worktree is a transfer risk. Record it in the plan and keep the plan as draft.
Do not commit, stash, reset, or copy dirty changes without user approval.

## Review mode

Do not change product code in review mode.

1. Read the plan and all applicable repository instructions.
2. Confirm that the repository identity matches the plan.
3. Confirm that the base commit exists.
4. Compare the current repository state with the recorded state.
5. Verify every referenced file and symbol.
6. Check each implementation step against an acceptance criterion.
7. Check the proposed test commands and expected results.
8. Check risks, compatibility needs, migration needs, and rollback needs.
9. Write `review.md` beside `plan.md`.
10. Set `review.md` to `status: pass` only when no blocker remains.
11. Change `plan.md` from `status: draft` to `status: ready` only after a passing review.
12. Keep `plan.md` as draft when the review finds a blocker.

A review fails when required dirty changes exist only in another worktree or session.
A review also fails when the plan depends on unverified conversation context.

## Start mode

1. Read `plan.md` and `review.md`.
2. Stop unless the plan status is `ready` and the review status is `pass`.
3. Read all applicable repository instructions and skills.
4. Confirm that the repository identity matches the plan.
5. Confirm that the base commit is an ancestor of the current commit.
6. If the repository changed, recheck all affected assumptions before editing.
7. Stop and ask the user when a blocking question or stale decision remains.
8. Follow the repository worktree rules before the first code change.
9. Implement only the approved scope.
10. Run the listed checks and report exact results.
11. Do not change `plan.md` or `review.md` during implementation.
12. Tell the user to run `/handover finish <plan-path>` when the work is ready.

The plan is not proof that the code still matches it. Recheck the repository before each important change.

## Finish mode

1. Read the plan and review.
2. Inspect the current branch, commit, status, and diff.
3. Collect exact test, lint, typecheck, and build results from the current session.
4. Compare the implementation with the acceptance criteria.
5. Record all plan changes and remaining work.
6. Write `result.md` beside `plan.md`.
7. Use `status: complete` only when all acceptance criteria pass.
8. Use `status: partial` or `status: blocked` when work remains.
9. Do not change the approved plan.

Do not claim that a check passed unless the current session ran it successfully.
