---
name: aic-documentation-writer-team
description: Team-based documentation pipeline — Track A (writing) and Track B (verification) run simultaneously; reconciliation replaces sequential write-then-review.
---

# Documentation Writer — Team Variant

## Purpose

Experimental team-of-agents variant of `aic-documentation-writer`. Track A (writing) and Track B (independent verification) launch simultaneously rather than sequentially. Reconciliation is lightweight — critics are informed by Track B's pre-computed verification rather than starting from scratch.

Use alongside the original skill to compare output quality. If the team variant consistently produces better results, it replaces the original.

**Announce at start:** "Using the documentation-writer-team skill."

## Team Architecture

This skill uses a two-track parallel model instead of the original's sequential Phase 1 → Phase 2 → Phase 3 pipeline.

| Track                  | Sub-agents                                            | Input                          | Output                                         |
| ---------------------- | ----------------------------------------------------- | ------------------------------ | ---------------------------------------------- |
| Track A — Writing      | Explorer 1 (factual), Explorer 4 (completeness)       | Target document + codebase     | Draft Change Specification with evidence trail |
| Track B — Verification | Explorer 2 (structure), Explorer 3 (audience/quality) | Target document + codebase     | Independent verification report                |
| Reconciliation         | 2 critics                                             | Track A draft + Track B report | Final verified document                        |

Track B starts simultaneously with Track A. Track B does NOT see Track A's draft while running — this preserves the double-blind verification invariant. After both tracks complete, 2 critics review Track A's draft against Track B's requirements, then the orchestrator applies the final text.

**Why this is different from the original:**

- Original bottleneck: critics cannot start until writing is complete (Phase 3 waits for Phase 2)
- Team fix: Track B verification runs concurrently with Track A writing; critics only need to reconcile (not re-investigate facts from scratch)
- Total pipeline time ≈ max(Track A time, Track B time) + reconciliation

## Editors

- **Cursor:** Attach the skill with `@` or invoke via `/`. Every "Spawn agent" instruction means a call to the **Task tool** with the specified `subagent_type`. You MUST use the Task tool — never do the work inline.
- **Claude Code:** Invoke with `/aic-documentation-writer-team`. Every "Spawn agent" instruction means a parallel subagent launch. You MUST spawn separate agents — never do the work inline.

## Cardinal Rules

Same as the original `aic-documentation-writer` Cardinal Rules 0–7. Key constraints:

### 0. Mandatory Subagent Dispatch

You MUST spawn Track A and Track B as separate subagents. Never do explorer or critic work inline.

### 1. Evidence Over Claims

Every finding must cite at least one concrete source: file path with line number, grep result, or URL.

### 2. Producer-Critic Separation

The agent that drafts must NEVER evaluate its own writing. Track A writes; Track B verifies independently; critics reconcile.

### 3. Double-Blind Factual Verification (preserved)

Track B runs WITHOUT seeing Track A's draft. The two tracks produce independent outputs. Critics reconcile discrepancies.

## Autonomous Execution

Run Phases 1 and 2 as a single continuous flow. Do NOT pause between phases.

**Legitimate user gates (the ONLY points where you stop):**

- Prescriptive document incongruence (Cardinal Rule 7 in the original — code vs doc mismatch in project-plan, implementation-spec, architecture, security)
- Audit mode: after presenting the Structured Audit Report, wait for user to approve corrections

**Everything else runs without pausing.**

## Process Overview

| Phase                      | Description                                                            | Subagents             |
| -------------------------- | ---------------------------------------------------------------------- | --------------------- |
| Phase 1: Parallel Tracks   | Track A + Track B launch simultaneously                                | 4 total (2 per track) |
| Phase 2: Reconcile + Apply | 2 critics review Track A draft with Track B findings; apply final text | 2 critics             |

## Operation Mode

Same mode classification as original (Write / Modify / Audit). For Audit mode, run the original `aic-documentation-writer` — the team variant is optimized for Write/Modify.

When called by the planner or executor, follow the same Entry Point Routing as the original (Phase 3 only for executor; Phases 1-3 for planner; full pipeline for direct invocation).

## Phase Dispatch

1. Read `SKILL-phase-1-team.md` → execute Phase 1 (launch Track A + Track B)
2. Read `SKILL-phase-2-team.md` → execute Phase 2 (reconciliation + apply)

**Reference files (read before spawning subagents):**

- `../aic-documentation-writer/SKILL-dimensions.md` — explorer and critic prompt templates
- `../aic-documentation-writer/SKILL-standards.md` — writing standards
- `../aic-documentation-writer/SKILL-policies.md` — editorial content policies
- `../shared/SKILL-investigation.md` — runtime evidence checklist

## Quality Gates

Same as original `aic-documentation-writer` Quality Gates (all 7 for write/modify mode; all 9 for audit mode). See original SKILL.md for the full list.

## Common Rationalizations — STOP

Same as the original `aic-documentation-writer`. In particular:

- Never spawn Track A without spawning Track B in the same message.
- Never let Track B see Track A's draft before producing its own output.
- Never skip the reconciliation critics — they enforce Track B requirements on Track A's draft.
