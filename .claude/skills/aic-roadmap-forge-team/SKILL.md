---
name: aic-roadmap-forge-team
description: Team-based roadmap forging — critics are embedded within tracks (Track A runs Critic A; Track B runs Critic B) rather than running as a separate post-investigation phase.
---

# Roadmap Forge — Team Variant

## Purpose

Experimental team-of-agents variant of `aic-roadmap-forge`. Critics are embedded within tracks: Track A runs Explorer 1 then Critic A (feasibility); Track B runs Explorers 2 and 3 then Critic B (strategic fit). Both tracks launch simultaneously.

Use alongside the original skill to compare output quality.

**Announce at start:** "Using the roadmap-forge-team skill."

## Team Architecture

| Track                          | Explorer(s)                                                | Embedded critic                                                | Output                                                     |
| ------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| Track A — Documentation Gaps   | Explorer 1 (gap analyst)                                   | Critic A (feasibility): starts when Explorer 1 returns         | Gap candidates with feasibility scores                     |
| Track B — Technical + External | Explorer 2 (optimizer) + Explorer 3 (external) in parallel | Critic B (strategic fit): starts when Explorers 2 and 3 return | Optimization + external findings with strategic fit scores |
| Synthesis                      | —                                                          | —                                                              | Scored, ranked, grouped phase proposals                    |

**Why this is different from the original:**

- Original: all critics run after all 3 explorers complete + synthesis — critics see already-synthesized output and potentially anchor on it
- Team fix: Critic A starts within Track A when Explorer 1 returns, while Track B's explorers are still running. Critic B starts within Track B when Explorers 2 and 3 return. The two critics never see each other's output before producing their own.
- Cross-track convergence boost: a candidate appearing independently in both Track A and Track B receives +1 to its UP score during synthesis (convergent evidence from independent tracks = strong signal).

## Editors

- **Cursor:** Attach the skill with `@` or invoke via `/`. Every "Spawn agent" instruction means a call to the **Task tool** with the specified `subagent_type`. You MUST use the Task tool — never do the work inline.
- **Claude Code:** Invoke with `/aic-roadmap-forge-team`. Every "Spawn agent" instruction means a parallel subagent launch. You MUST spawn separate agents — never do the work inline.

## Cardinal Rules

Same as original `aic-roadmap-forge`. The §0 strategic framing step is never optional — run it even if the user says "just generate phases."

## Autonomous Execution

Run §0 through §7 as a single continuous flow. Stop only at §6 (user approval gate) and the Input Routing gates defined in the original.

## When to Use

Same triggers as original `aic-roadmap-forge`.

## Input Routing

Same Tier 1/2/3 chain as original. Announce the tier. If Tier 2 is empty or Tier 3 yields zero candidates, follow the original gates.

## Process Overview

| Step                        | Description                                                                             | Subagents |
| --------------------------- | --------------------------------------------------------------------------------------- | --------- |
| Input Routing               | Same as original                                                                        | 0         |
| §0-§2 (frame, state, setup) | Same as original                                                                        | 0         |
| §3 Team tracks              | Track A + Track B launch simultaneously                                                 | 4 total   |
| §4 Synthesis                | Dual-category proposals: Quick Wins (fixes/cleanup) + Strategic Phase (next capability) | 0         |
| §5 Convergence detection    | Cross-track agreement = UP boost (inverted from original within-track check)            | 0         |
| §6 Present + §7 Write       | Same as original (dual-category presentation)                                           | 0         |

## Phase Dispatch

1. Read `../aic-roadmap-forge/SKILL-phase-0-frame.md` → execute §0 strategic framing, §1 current state, §2 pre-spawn setup (unchanged)
2. Read `SKILL-phase-team.md` → execute §3 team tracks + §4 synthesis + §5 convergence detection
3. Read `../aic-roadmap-forge/SKILL-phase-6-present.md` → execute §6 present **(USER GATE)** + §7 write (post-approval)

**Reference:** Read `../aic-roadmap-forge/SKILL-scoring.md` for Value Scoring Rubric (used in §3 and §4).

## Quality Gates

Same as original `aic-roadmap-forge`.
