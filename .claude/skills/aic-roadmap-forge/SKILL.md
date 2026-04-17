---
name: aic-roadmap-forge
description: Generates new phases and roadmap entries for the progress file by synthesizing documentation, codebase analysis, and external research through adversarial multi-agent review.
editors: all (Cursor Composer / Agent recommended for full fidelity)
---

# Roadmap Forge (SKILL.md)

## QUICK CARD

- **Purpose:** Propose the next phase(s) for `aic-progress.md`, backed by evidence and reviewed adversarially.
- **Inputs:** Progress file, project plan, implementation spec, optional external research target.
- **Outputs:** Proposal artifact with per-phase tasks, feasibility review, and strategic-fit review, archived under `.aic/roadmap-forge/<timestamp>/`.
- **Non-skippable steps:** Intake → Explore (3 parallel explorers) → Synthesise proposal → Critic round (feasibility + strategic-fit) → User gate → Finalise.
- **Mechanical gates:**
  `bash .claude/skills/shared/scripts/evidence-scan.sh <proposal>` — every claim cited.
  `bash .claude/skills/shared/scripts/ambiguity-scan.sh <proposal>` — no hedge words.
- **Checkpoint lines:** emit per phase; `checkpoint-log.sh`.
- **Degraded mode:** Run explorer prompts sequentially as the single agent. The critic prompts still run as independent passes — do not collapse them.

## Severity vocabulary (only two tiers)

- **HARD RULE** — enforced by script or explicitly listed below.
- **GUIDANCE** — best practice.

## HARD RULES

1. **Dispatch three explorers and two critics.** Gap analyst, optimization analyst, ecosystem scout; then feasibility and strategic-fit critics.
2. **Every proposal item cites evidence.** `doc:line`, `file:line`, telemetry query, or URL.
3. **Critics run on the draft proposal only — not the explorer reports.** This is a double-blind stance that catches drift.
4. **Feasibility HARD findings block inclusion.** A roadmap item flagged HARD must be reworked or cut.
5. **No new phase without a measurable success criterion.** A proposal item without a metric is HARD.

## GUIDANCE

- Prefer phases with 3-6 tasks; larger phases are hard to track.
- When two ideas conflict, propose both with the trade-off documented — let the user choose.
- Cross-reference existing phases by name, not by internal ID, to avoid drift.

## Autonomous execution

Run continuously through the Critic round. Stop at the user gate. Resume on user signal.

## When to use

- Before starting a major new initiative.
- When the progress file is near-complete and the next direction is unclear.
- Periodic roadmap review (e.g. quarterly).

## When NOT to use

- Fixing the current sprint (use `aic-task-planner`).
- Answering a single research question (use `aic-researcher`).

## Inputs

- `documentation/tasks/progress/aic-progress.md` (gitignored; fall back to user input if absent).
- `documentation/project-plan.md`.
- `documentation/implementation-spec.md`.
- Optional external source URLs.

## Process overview (phase dispatch)

| Phase                                            | File                           | Checkpoint          |
| ------------------------------------------------ | ------------------------------ | ------------------- |
| 0. Frame + intake                                | `SKILL-phase-0-frame.md`       | `intake-complete`   |
| 3. Investigate (3 parallel explorers)            | `SKILL-phase-3-investigate.md` | `explore-complete`  |
| 4. Synthesize proposal                           | `SKILL-phase-4-synthesize.md`  | `proposal-drafted`  |
| 5. Review (feasibility + strategic-fit critics)  | `SKILL-phase-5-review.md`      | `critique-complete` |
| 6. Present to user + finalise into progress file | `SKILL-phase-6-present.md`     | `roadmap-updated`   |
| — Scoring reference                              | `SKILL-scoring.md`             | —                   |

## Subagent dispatch

Templates in `prompts/`:

- `explorer-gap.md`, `explorer-optimization.md`, `explorer-ecosystem.md` — three parallel explorers.
- `critic-feasibility.md`, `critic-strategic-fit.md` — two critics.

## Failure patterns

- Skipping the ecosystem scout → roadmap drifts from industry state.
- Accepting a proposal item without a metric.
- Proposing phases larger than the planner can fit into 3-6 tasks.

## Output checklist

- [ ] Proposal artifact at `.aic/roadmap-forge/<timestamp>/proposal.md`.
- [ ] Three explorer reports archived.
- [ ] Two critic reports archived.
- [ ] `evidence-scan.sh` passes on the proposal.
- [ ] `ambiguity-scan.sh` passes on the proposal.
- [ ] `aic-progress.md` updated with the approved phases (after user gate).
- [ ] Six checkpoint lines in `.aic/skill-log.jsonl`.
