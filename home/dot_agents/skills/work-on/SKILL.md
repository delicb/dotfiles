---
name: work-on
description: Work on a Linear issue by ID. Fetch issue details, classify it as a bug, task, or unclear request, gather the right context, create the Linear branch from latest master, implement simple changes, and verify with tests, lint, and typecheck. Bugs require root cause analysis and production evidence when useful. Tasks require clarified requirements, acceptance criteria, constraints, and tradeoffs.
---

# work-on

Use this skill when the user asks to work on a Linear issue or invokes
`/skill:work-on <ISSUE-ID>`.

## Input

- Required argument: Linear issue ID or identifier, for example `LIN-123`.
- If the issue ID is missing or ambiguous, ask for it before doing anything else.

## Non-negotiables

- Classify the issue before implementation:
  - Bug or incident: root cause analysis is required before patching.
  - Task, feature, chore, refactor, docs, migration, or cleanup: clarify the
    goal, scope, acceptance criteria, constraints, and tradeoffs before changing
    code.
  - Unclear issue: ask for clarification or state the assumption before
    continuing.
- Do not fabricate production evidence. For bugs, use MCP or log sources when
  they may clarify the issue. For tasks, only use production or admin data when
  it is directly needed to understand scope, current behavior, or risk.
- Protect user work. If the repo has uncommitted changes before branch setup,
  stop and ask before stashing, committing, or overwriting anything.
- Do not update Linear status, comments, assignees, or labels unless the user asks.
- Prefer current project skills. Load any matching project or global skill with
  `read` before using that workflow, for example TypeScript, backend, testing,
  background processes, or git-spice.

## Workflow

### 1. Intake and Linear context

1. Parse the issue ID from the skill argument.
2. Connect to Linear MCP if needed:
   - `mcp({ connect: "linear" })`
3. Fetch complete issue details:
   - `linear_get_issue` with `id`, `includeRelations: true`,
     `includeCustomerNeeds: true`, and `includeReleases: true`.
4. Fetch comments:
   - `linear_list_comments` with `issueId` and `limit: 250`.
5. Fetch referenced attachments, documents, project resources, linked diffs, and
   customer needs when they contain technical context.
6. Extract and keep these fields in the working notes:
   - title, description, status, team, project, customer impact, priority
   - requested outcome, acceptance criteria, product requirements, constraints
   - reproduction steps, expected behavior, actual behavior
   - affected environment, time range, URLs, request IDs, user IDs, org IDs
   - affected routes, services, jobs, workers, queues, cron tasks, or APIs
   - linked PRs, previous attempts, related or blocking issues
   - deploys, releases, flags, experiments, or config changes mentioned
   - Linear git branch name, normally returned as `branchName`

### 2. Classify the issue

Decide whether the issue is a bug, task, or unclear.

Use `bug` when the issue describes:

- broken behavior
- regression
- production incident
- customer-visible failure
- unexpected errors
- mismatch between expected and actual behavior

Use `task` when the issue describes:

- feature work
- product behavior change
- refactor
- cleanup
- docs
- migration
- configuration change
- investigation without a known defect

If the issue mixes a bug and task, handle the bug path for the failing behavior
and the task path for the requested change.

If the classification is unclear, stop and ask the user or state the most likely
interpretation before continuing.

### 3. Branch setup from latest master

1. Run `git status --short`.
2. If there are local changes, stop and ask the user how to proceed.
3. Get the branch name from the Linear issue details.
   - Prefer the issue's `branchName` exactly.
   - If Linear has no branch name, propose a safe branch name from the issue key
     and title, then ask before using it.
4. Update master and create the work branch:

```bash
git fetch --prune
git checkout master
git pull --ff-only
git checkout -b <linear-branch-name>
```

If `master` does not exist, ask before using another trunk branch.
If the branch already exists, ask whether to check it out, reset it, or create a
new branch.

### 4. Load relevant local skills

Before deeper work, inspect the project context and load matching skills. Examples:

- TypeScript or JavaScript project: load any available TypeScript or JS skill.
- Long-running dev server, watcher, or log tail: load the background process skill.
- Stacked or multi-stage work: load the git-spice skill before proposing a stack.
- Domain-specific project skills: load those before editing that subsystem.

If no matching skill exists, continue and state that no matching skill was found.

### 5. Context gathering

Gather only the context needed for the issue classification.

For bugs and incidents, build a timeline before changing code. Use the issue
details to define:

- time window
- affected routes, services, jobs, workers, queues, cron tasks, or APIs
- request IDs, trace IDs, user IDs, organization IDs, team IDs, customer IDs
- deploys, releases, flags, experiments, or config changes around the incident

For tasks, gather enough context to understand:

- desired outcome
- acceptance criteria
- affected users or systems
- existing behavior
- product or technical constraints
- rollout, migration, or compatibility concerns
- current patterns that the implementation should follow

Use the MCP sources below only when they are relevant to the issue
classification.

#### Datadog MCP

Use Datadog MCP for logs, traces, metrics, RUM, dashboards, and error events when
production evidence may clarify a bug, incident, task scope, or rollout risk.

1. Connect or inspect tools:
   - `mcp({ connect: "datadog" })`
   - `mcp({ server: "datadog" })`
   - `mcp({ search: "logs", server: "datadog" })`
2. Query narrowly first by request ID, trace ID, org ID, user ID, route, service,
   status code, exception name, and the issue time window.
3. Broaden only if the narrow query returns nothing.
4. Capture exact evidence: timestamps, service names, error messages, stack
   frames, deploy version, trace links, and metric changes.

#### Cloudflare MCP

Use Cloudflare MCP for edge analytics, worker errors, WAF or rate-limit events,
cache behavior, request paths, zones, and network-level failures when they matter
for the bug or task.

1. Search for the right Cloudflare API endpoints first:
   - `cloudflare_search`
2. Execute focused API requests:
   - `cloudflare_execute`
3. Correlate Cloudflare timestamps, status codes, colo, path, host, worker route,
   firewall action, cache status, and Ray IDs with Linear and Datadog evidence.

#### linear-admin MCP

Use linear-admin only when the issue needs deeper data investigation that normal
Linear issue details cannot answer.

1. Find the organization when needed:
   - `linear_admin_find_organizations`
2. Use the organization's region for admin database questions:
   - `linear_admin_ask_database`
3. Use natural language questions. Do not write raw SQL unless explicitly asked.
4. Good questions are specific and bounded, for example:
   - "For organization <id>, what recent errors or state transitions relate to issue <key>?"
   - "For user <id>, what records changed around <timestamp> that could explain <symptom>?"
   - "For organization <id>, how many records would be affected by the requested migration?"
5. Treat database output as evidence. Cross-check it with code before deciding the
   root cause, implementation approach, or task scope.

### 6. Local codebase investigation

Inspect the codebase until the bug cause or task implementation path is supported
by evidence.

1. Identify project type and commands:
   - read `package.json`, lockfiles, build files, test configs, service configs
   - use `detect_package_manager` before package-manager commands
2. Search for issue terms and technical signals:
   - routes, component names, error strings, feature flags, config keys
   - database models, migrations, queue names, cron jobs, worker names
   - API clients, schema validators, serialization and permission checks
   - existing components, service patterns, or docs related to the requested task
3. Trace the relevant execution path end to end:
   - input boundary
   - validation and auth
   - business logic
   - persistence or external API calls
   - response, event, or job side effects
4. For bugs, reproduce locally when practical.
5. For tasks, inspect existing patterns and call sites before choosing an
   implementation.
6. Add or run targeted tests that demonstrate the bug before fixing, or validate
   the task acceptance criteria, when the project structure makes that reasonable.

### 7. Analysis gate

Before editing, write a short note for yourself and use it to decide whether to
implement now.

For bugs, the note must include:

- symptom
- affected scope
- confirmed evidence from Linear, logs, data, Cloudflare, local repro, or code
- hypotheses considered
- hypotheses eliminated and why
- most likely root cause
- why this file or subsystem is the correct fix location

For tasks, the note must include:

- requested outcome
- acceptance criteria
- affected files or subsystems
- constraints and tradeoffs
- implementation approach
- verification plan

If the bug root cause is not clear, do not patch randomly. Ask the user for
missing context or propose the next investigation step.

If the task requirements are not clear, ask for clarification before building the
wrong thing confidently.

### 8. Implementation decision

Implement immediately only when:

- the issue is understood
- the change is localized enough to review safely
- risk is low or manageable
- tests or manual checks can verify it
- no unresolved product or architecture decision remains

If the change has multiple parts or meaningful tradeoffs, stop and propose
options. For each option include:

- implementation summary
- files or subsystems touched
- risk
- verification plan
- rollback or rollout notes
- recommendation

If the work requires a multi-stage rollout, compatibility window, data migration,
API migration, or reviewable stack of changes, suggest using git-spice and load
the git-spice skill before designing the branch stack.

### 9. Implementation rules

- Make the smallest change that addresses the proven bug cause or agreed task
  scope.
- Keep existing style and architecture.
- Do not add dependencies unless necessary. Ask first if a new dependency is not
  clearly justified.
- Do not mix unrelated refactors with the change.
- For tasks, do not expand scope beyond the issue and clarified acceptance
  criteria without asking.
- Update tests, fixtures, docs, migrations, or config when the change affects
  behavior or contracts.

### 10. Verification

After implementing a change, verify it before reporting completion.

1. Run targeted tests for the changed area.
2. Run available project checks, usually:
   - tests
   - lint
   - typecheck
   - build when relevant
3. Use `detect_package_manager` and project scripts to choose commands.
4. If a check is missing, say it is missing. If a check fails for an unrelated
   pre-existing reason, show the evidence.
5. For bugs, re-run or reproduce the original failing path when practical.
6. For tasks, validate the acceptance criteria when practical.
7. Review the final diff with `git diff`.

### 11. Final response

Report concisely:

- branch created or used
- issue classification
- issue summary
- for bugs: root cause
- for tasks: requirements and implementation approach
- change made, or options if no change was applied
- verification commands and results
- remaining risks or follow-up work

Do not claim the bug is fixed or the task is complete unless verification passed
or you clearly explain what could not be verified.
