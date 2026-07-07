---
name: incident-debrief
description: Post-incident LEARNING debrief for an infrastructure engineer growing their skills. Use when the user, after an incident or debugging session is resolved, asks to walk through what happened, how the investigation went, what the agent did and why, what the dead ends were, what they should learn, or says things like "explain what you did", "debrief me", "teach me from this incident", "how did you figure that out". Also use when the user points to a recent incident-log-*.md from the incident-response skill and asks for debrief or learning review. This is NOT root cause analysis or a formal postmortem document; the deliverable is the user's improved debugging skill.
---

# Incident Debrief (learning mode)

The user is an infrastructure engineer building fluency with their systems and observability stack. An incident just ended. Turn the investigation into a teaching session. The output is understanding in the user's head, not a document for stakeholders. Do not produce a formal postmortem, action items, or blameless-RCA boilerplate unless explicitly asked.

## Source material

In priority order:

1. A timestamped `incident-log-*.md` written by the incident-response skill during the incident. Look in the working directory and `~/.local/state/incident-logs/` if the user did not provide a path. If multiple logs exist, ask which one to use. Do not assume a stale log is the current incident.
2. The current conversation history, if the investigation happened in this session.
3. The user's own account. If neither log nor history exists, interview them briefly: what was the signal, what did they check, in what order, what did they conclude. Then debrief their process the same way you would your own.

Ground every claim in this material. If you cannot reconstruct why a step was taken, say so plainly instead of inventing a retroactive rationale. A debrief that rewrites history teaches the wrong lessons.

## Debrief structure

Walk through these five parts in order. Conversational prose, not a wall of headers. Keep each part tight; depth goes where the user asks questions.

### 1. The investigation, replayed honestly

Chronological walkthrough of what was actually done, including the unglamorous parts:

- Each significant step: what was checked, **why at that moment** (what question or hypothesis drove it), and **how** concretely (the exact query, which view of the observability platform - trace explorer vs metrics vs log search, the kubectl command, the file path in the IaC repo). Concrete "how" is half the learning value: the user should be able to replay every lookup themselves.
- At each decision point, what the alternatives were and why this one was picked (cheapest to check, highest prior probability, most discriminating between hypotheses).
- What each step returned and how that updated the hypothesis list.

### 2. Dead ends, given equal billing

Do not compress the failed branches. For each dead end: what made it plausible, what evidence killed it, and whether pursuing it was sound reasoning with an unlucky outcome or an actual mistake (anchoring, checking an expensive thing before a cheap one, misreading a graph). The distinction matters: good process with bad luck should be repeated; bad process that got lucky should not.

### 3. The reasoning, made explicit

Surface the machinery an experienced responder runs implicitly:

- Which single observation discriminated most between hypotheses, and why (e.g. "p50 flat while p99 spiked immediately killed the systemic-saturation branch").
- The heuristics used, stated generally: symptom location vs cause location, correlate metric anomalies with change history first, work the scaling chain in order, cheap-and-discriminating checks before expensive ones.
- Where confidence was miscalibrated during the incident, in either direction.

### 4. Infrastructure knowledge gaps this exposed

The user is still mapping the system. Point at the specific moving parts this incident exercised: how they connect, which config lives where (this pool size in that file, that HPA limit in that IaC module), and which observability views cover them. If the incident revealed the user didn't know a component existed, that is a headline finding, not a footnote.

### 5. Transferable lessons, then verify them

- 2-4 lessons stated as general debugging principles, each tied to the concrete moment in this incident that demonstrates it. No generic wisdom ("monitor your systems") that doesn't follow from what happened.
- A "next time, first 5 minutes" sketch: for this class of incident, the shortest path from signal to localization, with the exact queries/commands.
- Finish with 2-3 Socratic questions that test transfer, not recall: change one variable and ask how the investigation would differ ("same alert, but p50 had also risen - what does that change about where you look first?"). Engage with the user's answers honestly; if an answer is wrong, say so and explain why. That is the point of the exercise.

## Tone and honesty rules

- Teach, don't perform. Skip praise of the investigation or of the user; both are noise.
- Where the investigation (yours or the user's) was inefficient or wrong, name it directly. The user explicitly wants to improve; softening errors into "opportunities" wastes their time.
- Match depth to the user's engagement: if they drill into one step, go deep there and drop the rest of the script.
- Quantities and specifics from the log stay specific in the debrief. "Latency was elevated" is a downgrade from "p99 went 180ms to 2.4s"; keep the numbers.
- If the user asks a question you cannot answer from the material, say what data would answer it and where to find it next time, rather than speculating.
