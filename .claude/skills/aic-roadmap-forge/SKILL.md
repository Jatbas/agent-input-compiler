---
name: aic-roadmap-forge
description: Generates new phases and roadmap entries for the progress file by synthesizing documentation, codebase analysis, and external research through adversarial multi-agent review.
---

# Roadmap Forge

## Purpose

Synthesize what the project _should_ become next. Reads documentation, analyzes the codebase, and researches the external ecosystem to propose new phases and component entries for `documentation/tasks/progress/aic-progress.md`.

The deliverable is a **dual-category draft** — **Category A (Quick Wins)** for fixes, cleanup, and broken references plannable immediately; **Category B (Strategic Phase)** for the next meaningful capability or positioning move — both in the exact format used by aic-progress.md, shown to the user for approval before any write.

**Announce at start:** "Using the roadmap-forge skill."

## Editors

- **Cursor:** Attach the skill with `@` or invoke via `/`. Every "Spawn N explorers" instruction means N calls to the **Task tool** with the specified `subagent_type`. You MUST use the Task tool — never do the work inline. **Verification:** After all explorers return, list the Task tool call handles for each explorer before proceeding to §4. If you cannot list distinct handles for each explorer, you did not spawn them — stop and restart §3 with actual Task tool calls.
- **Claude Code:** Invoke with `/aic-roadmap-forge`. Every "Spawn N explorers" instruction means N parallel subagent launches. You MUST spawn separate agents — never do the work inline. **Verification:** After all explorers return, list the subagent launch confirmations (task IDs or agent IDs) before proceeding to §4. If you cannot show N distinct agents were launched, stop and restart §3.

## Process Overview

| Step                      | Deliverable                                                                             | User gate?                  |
| ------------------------- | --------------------------------------------------------------------------------------- | --------------------------- |
| Input Routing             | Resolved input source (Tier 1/2/3)                                                      | No                          |
| §0 Strategic framing      | 3-5 direction hypotheses (before reading any file)                                      | No                          |
| §1 Current state          | Gap candidate list + phase inventory                                                    | No                          |
| §2 Pre-spawn setup        | SKILL-investigation sections extracted                                                  | No                          |
| §3 Parallel investigation | Explorer findings with evidence, disconfirmation, and value scores                      | No                          |
| §4 Synthesize             | Dual-category proposals: Quick Wins (fixes/cleanup) + Strategic Phase (next capability) | No                          |
| §4i Self-review           | Mechanical consistency check before critic dispatch                                     | No                          |
| §5 Adversarial review     | Feasibility critic + strategic fit critic + adjudication                                | No                          |
| §5b Convergence detection | Re-spawn if explorers over-agreed or no disconfirmation found                           | No                          |
| §6 Present                | Draft phases displayed to user                                                          | **Yes — wait for approval** |
| §7 Write                  | Approved phases inserted into aic-progress.md                                           | No (post-approval)          |

## Autonomous Execution

Run §0 through §7 as a single continuous flow, stopping only at the user gates listed below. Do NOT pause between sections to report status, explain what you will do next, or ask for confirmation. Completing one section means immediately starting the next — not sending a message and waiting. **After the user approves at §6, §7 runs immediately** — write the approved phases to aic-progress.md without further prompting. The task is NOT complete until §7 finishes.

**Legitimate user gates (the ONLY points where you stop and wait):**

- §6: Present draft for user approval (always wait before writing to aic-progress.md)
- §6 revision cycles: wait for user response on change requests
- Input Routing: Tier 2 empty (ask user before proceeding with Explorer 2+3 only)
- Input Routing: Tier 3 zero candidates (ask user how to proceed)

**Everything else runs without pausing.** Strategic framing, current state analysis, parallel investigation, synthesis, self-review, adversarial review, and convergence detection all run as one continuous flow. Present the complete proposal at §6 after all analysis is done. After approval, §7 writes the phases.

**Anti-patterns:** Do not pause to report status mid-pipeline. After §6 approval, proceed to §7 immediately.

## When to Use

- User says "what should we build next", "generate next phase", "plan Phase 2", "what's left", "forge roadmap"
- After a release cut, when the progress file has no remaining `Not started` entries worth pursuing. Typically run immediately after `aic-release` completes to generate the next internal phase structure in `aic-progress.md`.
- When `aic-task-planner` is invoked but `aic-progress.md` has no `Not started` or `Pending` components — forge is the correct next step.
- When the user provides a research document and says "generate phases from this"
- When the user wants codebase optimization proposals added to the roadmap

## Input Routing

Before §1, resolve the input source using this three-tier chain:

**Tier 1 — Default (no user instruction):**
Read `documentation/project-plan.md` and `documentation/implementation-spec.md`. If these contain planned-but-untracked work (architecturally intended components not yet in any phase table), use them as the primary source.

**Tier 1 supplement — `documentation/bck/` (temporary):** If `documentation/bck/` exists, also read any files there. This directory holds the original pre-rewrite versions of documents (created during Phase VA documentation audits). After VA02/VA03 sanitize the main docs of planning language, the `bck/` originals are the richer source for architectural intent and untracked planned work. When a `bck/` version of a file contradicts the current version on planning content, the `bck/` version takes precedence for gap identification (the current version reflects public-facing rewrites, not removed intent). This directory is temporary — once Phase VA is complete and no longer relevant, stop checking it.

If Tier 1 yields candidates AND the user's prompt also asks for ecosystem perspective ("what else should we consider", "include external research", "what's the ecosystem doing"), run Tier 1 as primary AND spawn Explorer 3 in §3. Announce: "Input source: Tier 1 + external research supplement."

**Tier 2 — Fallback (Tier 1 yields nothing new):**
If project-plan + impl-spec are exhausted, read all files in both `documentation/future/` and `documentation/research/`.

Extract candidates from any **Roadmap Mapping** sections first (these are pre-analysed), then from raw document content. If a Roadmap Mapping section is shorter than the document's findings section, treat it as incomplete and extract candidates from the full body as well.

If both directories are absent or empty, announce: "Tier 2 is empty. Proceeding with codebase optimization (Explorer 2) and external research (Explorer 3) only. Provide a document to use as Tier 3 input if you want documentation-driven candidates." Wait for user confirmation before proceeding.

**Tier 3 — User override (explicit document provided):**
Use ONLY the specified document. Skip Tier 1 and Tier 2. If the document yields zero candidates after §1 gap identification, announce: "The provided document contains no untracked roadmap candidates. Confirm how to proceed: (a) extract optimization candidates from this document, (b) treat deferred recommendations as candidates even without explicit phase mapping, or (c) provide a different document."

**Announce the tier:** "Input source: [Tier 1 — project-plan + impl-spec / Tier 1 + external research supplement / Tier 2 — future/ / Tier 3 — [filename]]"

---

## Phase Dispatch

After Input Routing, read and execute the phase files in order. Each phase file is a sibling of this file (same directory). Read each one just before executing it — do NOT skip ahead.

1. Read `SKILL-phase-0-frame.md` → execute §0 strategic framing, §1 current state, §2 pre-spawn setup
2. Read `SKILL-phase-3-investigate.md` → execute §3 parallel investigation
3. Read `SKILL-phase-4-synthesize.md` → execute §4 synthesis + §4i self-review
4. Read `SKILL-phase-5-review.md` → execute §5 adversarial review + §5b convergence detection
5. Read `SKILL-phase-6-present.md` → execute §6 present draft **(USER GATE)** + §7 write (post-approval)

**Reference:** Read `SKILL-scoring.md` when you need the Value Scoring Rubric (referenced in §3, §4d, §5).

**CRITICAL:** You must NOT skip to §6 without completing §3-§5. The draft proposal depends on explorer findings and adversarial review.

---

## Conventions

- Phase names: single letter or letter+subletter (`Phase V`, `Phase VA`, `Phase VB`) for sub-phases within a version group; version-prefixed (`Phase 2.0 — [title]`) for new version groups. Use the next available letter (W, X, ...) for peer phases at the same level. Use letter+A, letter+B for sub-phases subordinate to an existing phase.
- Component names are title-cased, specific, and actionable (bad: "Improve performance"; good: "Compilation cache TTL enforcement")
- Description column: one sentence, imperative, technical (matches the style of adjacent entries)
- Deps column: use `—` for no deps; component name for intra-phase deps; phase letter for cross-phase deps
- Package column: shortest accurate path (`mcp/`, `shared/src/adapters/`, `./`)
- Skill column: always present; value is the skill the developer must invoke to execute this component — `aic-task-planner` for code tasks, `aic-documentation-writer` for documentation tasks, `aic-task-executor` when a planner task file already exists
- This skill is the only entry point for adding new phases to aic-progress.md — status updates on existing entries go through `aic-update-progress`
- After a maintainer approves and ships a new skill (including this one), update `CONTRIBUTING.md` if the skill changes contributor workflows

---

## Degradation Handling

- If context is compressed mid-skill: read back all explorer results before synthesis — re-spawn any missing explorer.
- If subagent spawning fails silently: detect missing results and re-spawn.
- §0 strategic framing is never optional — run it even if the user says "just generate phases."
- After 2 re-spawns of the same explorer, do not re-spawn again — question the task scope.

**Failure-mode compensations** (why each mechanism exists):

| Failure mode                                 | Compensation                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| Convergence on safe/obvious candidates       | §0 hypotheses generated BEFORE reading files; convergence detection in §5b |
| Confirmation bias in investigation           | Disconfirmation mandate in Explorer 1                                      |
| Missing non-obvious candidates               | Explorer 3 external research; Explorer 4 deep reads                        |
| Technically feasible but strategically wrong | Critic B strategic fit check anchored to user pain                         |
| Implementation blind spots                   | Critic A feasibility check requires file:line citations                    |
| Shallow task detail                          | Evidence density gate (§4a) + escape hatch floor (§4f)                     |
| Short-term thinking                          | §4g second-order implications                                              |
| Hallucinated codebase state                  | Runtime Evidence Checklist + Critic A reads source files                   |
| Critics kill all strategic work              | §4e mandatory dual-output + §5 per-category protection                     |
| Only trivial fixes survive review            | Category B minimum-1 guarantee in adjudication                             |
