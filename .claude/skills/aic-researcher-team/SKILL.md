---
name: aic-researcher-team
description: Team-based research protocol — Track A (codebase investigation) and Track B (adversarial challenge) run simultaneously; the challenger attacks framing before exploration completes.
---

# Researcher — Team Variant

## Purpose

Experimental team-of-agents variant of `aic-researcher`. Track A (codebase investigation) and Track B (adversarial challenge) launch simultaneously after framing. The adversarial challenger attacks the framing hypotheses directly while Track A is still investigating — not after investigation completes.

Use alongside the original skill to compare output quality.

**Announce at start:** "Using the researcher-team skill."

## Team Architecture

| Track                   | Agents                                                                   | Input                                 | Output                                                               |
| ----------------------- | ------------------------------------------------------------------------ | ------------------------------------- | -------------------------------------------------------------------- |
| Track A — Investigation | 2 codebase explorers                                                     | §2 framing hypotheses + codebase      | Explorer findings with file:line citations                           |
| Track B — Adversarial   | 1 adversarial challenger (+ 1 web researcher for technology evaluations) | §2 framing hypotheses only            | Challenge report: attacks hypotheses, identifies Track A blind spots |
| Synthesis               | Orchestrator (no sub-agents)                                             | Track A findings + Track B challenges | Research document                                                    |

Track B receives the §2 framing hypotheses but NOT Track A's findings — this preserves adversarial independence. After both tracks complete, the orchestrator synthesizes findings from both tracks.

**Why this is different from the original:**

- Original: adversarial review (§5) runs only after full exploration + synthesis — the critic sees already-synthesized results and anchors on them
- Team fix: Track B's challenger attacks hypotheses BEFORE Track A produces findings, so it cannot anchor on results it has not seen
- Track B proactively identifies blind spots; the synthesis step checks whether Track A fell into any of them

## Editors

- **Cursor:** Attach the skill with `@` or invoke via `/`. Every "Spawn agent" instruction means a call to the **Task tool** with the specified `subagent_type`. You MUST use the Task tool — never do the work inline.
- **Claude Code:** Invoke with `/aic-researcher-team`. Every "Spawn agent" instruction means a parallel subagent launch. You MUST spawn separate agents — never do the work inline.

## Cardinal Rules

### 1. Mandatory Subagent Dispatch

You MUST spawn Track A and Track B as separate subagents simultaneously. Never do investigation or adversarial work inline.

### 2. Evidence Over Claims

Every finding must cite at least one concrete source (file:line or URL). No exceptions.

## Autonomous Execution

Run §1 through §6 as a single continuous flow.

**The ONLY conditions that stop execution:**

- Task tool unavailable (tell the user and stop)
- A blocked diagnostic that cannot be resolved by re-spawning

## When to Use

Same triggers as original `aic-researcher`. The team variant applies to all research classifications except Factual lookup (which answers directly in chat with no sub-agents).

## Process Overview

| Step               | Description                             | Subagents |
| ------------------ | --------------------------------------- | --------- |
| §1 Classify        | Same as original                        | 0         |
| §2 Frame           | Same as original                        | 0         |
| §3 Parallel Tracks | Track A + Track B launch simultaneously | 2-4 total |
| §4-§5 Synthesis    | Orchestrator merges track outputs       | 0         |
| §6 Finalize        | Same as original                        | 0         |

## Phase Dispatch

For factual lookup (§1 classification): answer directly in chat. Done.

For all other classifications:

1. Read `../aic-researcher/SKILL-phase-2-frame.md` → execute §2 framing
2. Read `SKILL-phase-team.md` → execute §3 parallel tracks + §4-§5 synthesis
3. Read `../aic-researcher/SKILL-phase-6-finalize.md` → execute §6 final synthesis + save document

**Reference:** Read `../aic-researcher/SKILL-protocols.md` for classification-specific protocols (referenced in §2d of the frame phase).

## Quality Gates

Same as original `aic-researcher` Quality Gates (all 5). Track B challenger output does not count toward the "60% High confidence" gate — that gate applies only to the synthesized findings.
