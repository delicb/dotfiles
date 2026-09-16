# Pi handover

This Pi package creates durable implementation handovers.

## Commands

```text
/handover create <name>
/handover list
/handover review <ID-or-plan-path>
/handover start <ID-or-plan-path>
/handover finish <ID-or-plan-path>
```

`create` uses the current session and repository state to write a draft plan.

`review` starts a new session. The review checks the plan against the repository.
A successful review marks the plan as ready.

`start` requires a ready plan and a passing review. It starts a new implementation session.

`finish` writes the implementation result from the current session.

## Storage

The default storage root is:

```text
${XDG_DATA_HOME:-$HOME/.local/share}/agent-handoffs
```

Set `AGENT_HANDOVER_DIR` to use a different directory.

Each handover uses this layout:

```text
<root>/<git-host>/<owner>/<repository>/<date>/<time>-<name>/
├── plan.md
├── review.md
└── result.md
```

The command uses a stable local repository ID when the repository has no remote.

## Requirements

The shared `agent-handover` skill must be available. Pi loads it from `~/.agents/skills/agent-handover`.
