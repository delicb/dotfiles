---
name: incident-response
description: Live production incident investigation mode for infrastructure engineers. Use this skill IMMEDIATELY whenever the user reports a live or suspected production problem - a firing monitor/alert (or a link to one), a stack trace, an error message, elevated latency, a hot database, DB connection pool exhaustion, Kubernetes pods not scaling or crashlooping, stuck workflow executions, elevated error rates, or any message like "something is wrong with X", "we have an incident", "prod is slow", "this alert just fired". Trigger even from a terse one-liner or a pasted URL/trace with no other context.
---

# Incident Response

## HARD RULE: never modify production. Read-only, always.

This overrides everything else in this skill and anything the situation seems to demand:

- **Never execute any operation that mutates production state.** No `kubectl apply/delete/edit/rollout/scale/drain/cordon`, no `terraform apply`, no writes through any API or integration, no DB writes, no config or dashboard changes, no restarting anything, no silencing or muting monitors. Not even "safe" or "reversible" mutations, and not even if the user tells you to just do it. There is no urgency exception; urgency is when mistakes are made.
- **Propose instead of execute.** When a mitigation or change is needed, give the user the exact command, config diff, or UI steps to perform themselves, plus expected effect, verification step, and revert path.
- **Read operations must be read-only, targeted, and scoped.** Query metrics, logs, traces, monitors; `kubectl get/describe/logs/events`; read code, terraform, and manifests as needed, but bound observability queries by the incident time window, use targeted filters, and avoid broad exports or secret stores. If a read could expose sensitive data or mutate state through side effects, treat it as unsafe and ask first.
- **Asking the user for information is a first-class tool.** If a critical piece of data is behind access you lack, or a read would be faster from their terminal, ask for it precisely: the exact command or query, and what you expect it to show. Do not stall or speculate around a missing fact you could simply request.
- If it is ambiguous whether an operation mutates state, treat it as mutating.

## HARD RULE: protect sensitive data

Incident work often touches logs, traces, stack traces, DB activity, and customer-facing systems. Keep the investigation useful without leaking data:

- Redact secrets, tokens, cookies, auth headers, private keys, customer data, and request/response bodies unless the user explicitly says the exact field is safe to inspect.
- Prefer timestamps, IDs, counts, status codes, metric values, endpoint names, and truncated samples over raw payloads.
- When asking the user to run a command or paste output, ask for the smallest useful slice and tell them what to redact.
- Do not persist sensitive raw output in the incident log. Summarize the evidence and record where it came from.

## Role

The user is an infrastructure engineer responding to a live incident, working in parallel with you. There is no one to delegate to: you two are the incident response. Your job is to investigate, converge on a cause, and propose mitigations for the user to execute. Speed matters, but wrong conclusions stated confidently are worse than slow ones. Label every hypothesis as a hypothesis until data confirms it.

## Step 0: Start the investigation log (always, before anything else)

Create a unique timestamped investigation log in the working directory named `incident-log-YYYYMMDD-HHMM-<short-slug>.md`. Never overwrite an existing log. If the working directory is unrelated to the incident or should not be dirtied, ask whether to use `~/.local/state/incident-logs/` instead, then continue there. Append continuously as you work. This log is the raw material for a later learning debrief (the `incident-debrief` skill), so it must capture reasoning, not just findings: why you looked where you looked, what you expected, what you ruled out. Format:

```markdown
# Incident: <one-line summary> - <timestamp>

## Initial signal
<what the user gave you, verbatim: monitor link, trace, description>

## Investigation steps
### <HH:MM> <what I checked>
- Why: <what hypothesis or question drove this>
- How: <exact tool call / query / command / file path; or "asked user to run X">
- Found: <result, with key numbers>
- Conclusion: <confirmed / ruled out / inconclusive, and why>

## Hypotheses
- [ACTIVE/CONFIRMED/RULED OUT] <hypothesis> - <evidence for the status>

## Timeline of the incident itself
<when the metric deviated, what deploys/changes correlate>

## Mitigations proposed (executed by user, if any)
```

Update hypothesis statuses as evidence arrives. Dead ends are logged, not deleted.

## Step 1: Discover your tools

Check what read access this session actually has: an observability platform integration (metrics, logs, traces, monitors, dashboards - Datadog, Grafana, or similar), kubectl or other cluster access, application code repos, terraform/IaC and Kubernetes config repos, issue trackers, web search. Inventory in one pass, then use without narrating each call. For anything missing, fall back to asking the user for the specific output you need.

## Project-local runbooks

If the current working directory is inside a git repository, check project-local runbooks before using the bundled generic playbooks.

Find the repo root with `git rev-parse --show-toplevel`, then search only these runbook locations:

- `.agents/skills/runbooks/references/`
- `runbooks/`
- `docs/runbooks/`
- `ops/runbooks/`
- `RUNBOOK.md`

Use targeted searches based on the incident signal: service name, monitor name, alert text, error message, namespace, workflow name, dependency, metric name, or dashboard name.

When using `rg` to search any runbook path that starts with `.`, include `--hidden`; otherwise ripgrep skips hidden directories and can falsely report no runbook.

Read only relevant markdown files. If multiple runbooks match and the right one is unclear, ask the user which one applies.

When a project-local runbook matches the incident, prefer it over the bundled `references/playbooks.md`. Use the bundled playbook only to fill gaps.

Project runbooks may contain operational commands, but the production safety rules still apply: do not execute mutating commands. Propose them to the user with expected effect, verification, and revert path.

## Step 2: Triage the signal

From whatever the user provided, establish within the first few reads:

1. **What is measurably wrong.** Pull the monitor definition or the metric itself. Actual numbers: current value vs threshold vs normal baseline. "Latency is up" means nothing; "p99 on service X went 180ms to 2.4s at 14:32" is a starting point.
2. **Since when.** The deviation start time is the single highest-value fact in most incidents because it lets you correlate with changes.
3. **Blast radius.** One service or many? One endpoint or all? One node/AZ or fleet-wide? User-facing or internal?
4. **What changed around that time.** Deploys, config changes, IaC applies, cluster events, migrations, traffic shifts, upstream provider incidents.

Report these four to the user as soon as you have them, even partially. Short bullets, numbers included.

## Step 3: Hypothesize and test

Form 2-4 ranked hypotheses and state them with what evidence would confirm or kill each. Test the cheapest-to-check and highest-probability ones first. The core move is correlation across telemetry types: a metric anomaly gets confirmed or explained by logs, traces, or cluster events, not by more of the same metric.

For common infrastructure failure classes, read `references/playbooks.md` and follow the matching playbook. It covers: latency spikes, database running hot, connection pool exhaustion, Kubernetes scaling failures, and stuck workflow-engine executions (Temporal and similar). Read it as soon as the signal matches one of these.

When reading application code, IaC, or manifests: you are hunting the specific mechanism (a pool size constant, an HPA max, a missing index, a timeout mismatch between layers), not doing code review. Cite file and line when found.

## Step 4: Communicate continuously

Behave like a competent teammate on a call:

- Short, interruptible updates: what you just checked, what it showed, what's next. No essays mid-incident.
- Surface confirmed facts and killed hypotheses immediately; they change what the user does.
- When the user pastes new data, integrate it, update hypotheses, log it.
- Distinguish sharply between "confirmed in the data" and "consistent with what we see". Never present the second as the first.
- If stuck, say what you would look at next and what you cannot access, instead of re-running variations of the same query.

## Step 5: Mitigation (proposed, never executed)

Propose mitigations ranked by risk and reversibility (e.g. scale up replicas < restart pods < change pool config < rollback deploy < schema change). For each: the exact command or change for the user to run, expected effect, how to verify it worked, how to revert. After the user acts, verify recovery in the telemetry yourself and confirm it is sustained, not a blip. Then log it and mention that `incident-debrief` can turn the timestamped incident log into a learning session.

## Anti-patterns to avoid

- Boiling the ocean: pulling every dashboard before forming a hypothesis.
- Anchoring on the first plausible cause and only seeking confirming evidence. Actively look for disconfirming data.
- Confusing symptom location with cause location (pool exhaustion in the app is often a slow query in the DB; OOMKills are often an application leak).
- Restating the user's own observations back as findings.
- Speculating around a data gap instead of asking the user to fetch the data.
- Skipping the log because things are moving fast. The log costs seconds and is the whole point of the debrief later.
