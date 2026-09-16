# Handover file format

A handover directory contains these Markdown files:

```text
plan.md
review.md
result.md
```

`plan.md` is required. `review.md` and `result.md` appear later in the workflow.

## Plan metadata

Use this YAML frontmatter:

```yaml
---
schema: agent-handover/v1
status: draft
created_at: 2026-03-23T15:30:12Z
repository: github.com/owner/repository
repository_root: /local/repository/path
origin: git@github.com:owner/repository.git
branch: feature/example
base_commit: abc1234
working_tree: clean
source_session: /local/pi/session.jsonl
---
```

Allowed plan states:

- `draft`: The plan needs review or has blockers.
- `ready`: A fresh review passed.

`repository` is the stable identity. `repository_root` is a local hint and can change.
`source_session` is local evidence. The receiving agent must not require it.

Set `working_tree` to `dirty` when `git status --short` returns output.
List relevant dirty files in the Current state section.

## Required plan sections

### Goal

State one implementation outcome.

### Acceptance criteria

Use observable and testable conditions. Give each criterion a stable ID such as `AC1`.

### Current state and evidence

Describe the current behavior. Reference files, symbols, tests, commands, and observed output.

Separate facts from assumptions.

### Chosen design

State the selected design and why it fits the requirements.

### Rejected options

Record only alternatives that help the receiving agent avoid repeated work.

### Scope

List code, tests, configuration, migrations, and documentation that can change.

### Non-goals

List nearby work that the implementation must not include.

### Implementation steps

For each ordered step, include:

- Intended result
- Files or symbols
- Related acceptance criteria
- Required checks

### Files and symbols

List existing files and symbols. Mark new files as new.

### Tests and verification

Give exact commands when known. State the expected result for each command.

### Risks and edge cases

Include compatibility, migration, security, performance, rollback, and concurrent change risks when relevant.

### Open questions

Label each question as blocking or non-blocking. A ready plan cannot contain a blocking question.

### Starting instructions

Give the receiving agent the first repository checks and the first implementation step.

## Review format

Use this frontmatter in `review.md`:

```yaml
---
schema: agent-handover-review/v1
status: pass
reviewed_at: 2026-03-23T16:00:00Z
plan: /absolute/path/to/plan.md
repository_head: def5678
---
```

Allowed review states:

- `pass`: No blocker remains.
- `needs-changes`: The plan needs changes.

Use these sections:

- Result
- Repository checks
- Requirement checks
- Step checks
- Test checks
- Risks
- Blockers

## Result format

Use this frontmatter in `result.md`:

```yaml
---
schema: agent-handover-result/v1
status: complete
finished_at: 2026-03-23T18:00:00Z
plan: /absolute/path/to/plan.md
branch: feature/example
head_commit: def5678
---
```

Allowed result states:

- `complete`: All acceptance criteria pass.
- `partial`: Some work or checks remain.
- `blocked`: Work cannot continue without a decision or external change.

Use these sections:

- Summary
- Files changed
- Acceptance criteria
- Checks run
- Plan changes
- Remaining work
