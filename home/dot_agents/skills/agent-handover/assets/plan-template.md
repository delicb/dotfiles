---
schema: agent-handover/v1
status: draft
created_at: <UTC timestamp>
repository: <normalized repository ID>
repository_root: <local repository root>
origin: <origin URL or none>
branch: <branch name or detached HEAD>
base_commit: <full commit>
working_tree: <clean or dirty>
source_session: <session path or none>
---

# <Handover title>

## Goal

<One implementation outcome.>

## Acceptance criteria

- **AC1:** <Observable result.>

## Current state and evidence

### Facts

- `<path>`: `<symbol>` currently <behavior>.

### Assumptions

- <Assumption or `None`.>

## Chosen design

<Design and reason.>

## Rejected options

- <Option and rejection reason, or `None`.>

## Scope

- <In-scope change.>

## Non-goals

- <Excluded change.>

## Implementation steps

1. **<Result>**
   - Files and symbols: `<path>`, `<symbol>`
   - Acceptance criteria: AC1
   - Checks: `<command or check>`

## Files and symbols

- `<path>`: `<symbol>`
- `<new path>`: new file

## Tests and verification

- `<command>`
  - Expected: <result>

## Risks and edge cases

- <Risk and control, or `None`.>

## Open questions

### Blocking

- None.

### Non-blocking

- None.

## Starting instructions

1. Confirm the repository identity and current commit.
2. Recheck the files and symbols named in this plan.
3. Start with implementation step 1.
