# Failure-class playbooks

Each playbook: what to check, in what order, and what distinguishes the common causes. Observability-platform-first (metrics, logs, APM/traces), with cluster state and code/IaC as follow-ups. Metric names vary by platform and setup; discover what exists via metric search rather than assuming. Everything here is read-only; any fix is proposed to the user, never executed.

## 1. Increased latency

Goal: localize the latency before explaining it.

1. **Which percentile moved?** p50 up = systemic (everything slower: CPU saturation, GC, DB). p99 up with flat p50 = tail problem (lock contention, retries, one slow dependency, one bad node).
2. **Localize with traces.** Pull traces from the slow window, compare against baseline traces. Where does the extra time live: app CPU, DB spans, external calls, queue wait? A trace diff answers this faster than any metric.
3. **One endpoint or all?** All endpoints = shared resource (DB, pool, CPU, network). One endpoint = specific query/code path; check recent changes to it.
4. **Correlate with:** deploy markers, DB metrics (playbook 2), container CPU throttling (CFS throttling causes latency with LOW average CPU; check limits vs requests in manifests), GC pause metrics, upstream provider status.
5. **Retry amplification check:** elevated request counts alongside latency suggests clients retrying, turning a small slowdown into a spiral. Compare request rate vs baseline.

## 2. Database running hot

1. **Hot on what: CPU, IO, connections, locks?** Different resources, different causes. Pull DB CPU, IOPS, active connections, and lock wait metrics for the incident window.
2. **Active queries right now.** Via DB monitoring if the platform has it; otherwise ask the user to run the equivalent of `SELECT * FROM pg_stat_activity` and paste it. Look for long-running queries, many identical queries, or `idle in transaction`.
3. **Top queries by total time.** Query metrics or `pg_stat_statements`. A new entry in the top 5 that wasn't there yesterday is the prime suspect. Correlate its first appearance with deploys.
4. **Common mechanisms, in rough order of frequency:**
   - New/changed query missing an index (check the plan, then migration history)
   - A previously fine query hitting a data-size tipping point (plan flip from index scan to seq scan)
   - Lock contention from a migration or a long transaction blocking others
   - Autovacuum (or equivalent maintenance) falling behind, causing bloat and slow scans
   - Traffic increase without query change (check request rate first so you don't chase a query ghost)
5. **Mitigation ladder (all proposed to the user):** kill the offending query/transaction < add index concurrently < revert the deploy that introduced the query < scale the instance (last, slowest, often masks the cause).

## 3. DB connection pool exhaustion

Symptom is in the app (timeouts acquiring a connection); cause is usually below it.

1. **Confirm it is the pool:** pool acquisition wait / utilization metrics, or acquire-timeout log lines. Get pool size from config (code or env vars in manifests) and compare with active connections on the DB side.
2. **Two distinct shapes:**
   - **Connections held too long:** DB is slow (go to playbook 2), or code holds connections across slow external calls / forgets to release. Check DB-side query duration first; it is the cause in the majority of cases.
   - **Demand exceeds pool:** traffic spike or pod count increase. N pods x pool_size must stay under DB `max_connections` (minus reserved slots). A recent autoscale-out can exhaust DB connections fleet-wide while each pod looks fine. Check pod count history vs connection count.
3. **Check for `idle in transaction`** sessions: classic leak signature (transaction opened, code path errored before commit/rollback).
4. **Layering check:** if a connection pooler (pgbouncer, RDS Proxy, etc.) sits in the middle, exhaustion can be at either layer; check both.
5. **Mitigations (proposed):** restart leaking pods (fast, temporary) < fix the slow query < raise pool size (only with headroom math: pods x pool <= max_connections budget) < add/resize the pooler.

## 4. Kubernetes upscaling problems

Work the chain: HPA decides -> scheduler places -> node provisions -> pod starts -> pod becomes ready.

1. **Is HPA even asking for more?** `kubectl describe hpa <name>`: current vs desired replicas, and events. If desired isn't rising: metric missing/stale (metrics-server or external metrics adapter broken), wrong target metric, or already at `maxReplicas`. Hitting maxReplicas during genuine load is a one-line fix; check this first, it is embarrassing to find it last.
2. **Pods Pending?** `kubectl get pods` + `describe` a Pending pod. Events tell you why: `Insufficient cpu/memory` (cluster full; is cluster-autoscaler/Karpenter reacting?), node selector/affinity/taint mismatch, PVC binding, or quota limits.
3. **Node autoscaler stuck?** Its logs/events say why it won't add nodes: instance-type unavailability in the AZ, cloud quota reached, max size on the node group. Check the node group's IaC for the max.
4. **Pods starting but not Ready?** Image pull errors, failing readiness probes (probe config in the manifest vs actual endpoint behavior), crashloop (`kubectl logs --previous`), or init containers stuck on a dependency.
5. **PodDisruptionBudgets and topology spread constraints** can silently block placement and drains; check whether events mention them.

## 5. Stuck workflow-engine executions (Temporal and similar)

Determine WHERE it is stuck; each location has a different owner.

1. **Stuck how?** Not starting, not progressing, or activities failing/retrying? Check the engine's UI/metrics for the workflow type: running count, task queue backlog, activity failure rate.
2. **Task queue backlog growing + no worker polling** = worker problem: workers crashed, not deployed, or pointed at the wrong task queue/namespace. Check worker pod status and worker logs. Most common cause.
3. **Activities failing and retrying:** pull the activity error from workflow history. The stack trace usually points at a downstream dependency (DB, external API). The workflow isn't stuck, it is patiently retrying into a broken dependency; fix the dependency.
4. **Workflow task failures (not activity failures):** usually a deploy introducing non-determinism (code changed under a running workflow without versioning/patching). Correlate failure start with worker deploys; look for non-determinism errors in worker logs. Mitigation (proposed): roll back the worker, or reset workflows after fixing.
5. **Worker resource saturation:** worker slots exhausted (sticky cache, max concurrent activities), worker CPU pegged, or OOMKill loop. Check worker pod metrics and the engine's worker slot metrics.
6. **Server-side:** if ALL workflow types across services degrade at once, look at the engine cluster/managed service status and its persistence layer, not the workers.

## Cross-cutting: correlating with changes

For every playbook, once you know the deviation start time, check in parallel: deploy events/markers in the observability platform, merge history in the app repo, IaC applies/state changes, cluster events (`kubectl get events --sort-by=.lastTimestamp`), and scheduled jobs/cron around that time. Most incidents are caused by a change; telemetry tells you what broke, change history tells you why now.
