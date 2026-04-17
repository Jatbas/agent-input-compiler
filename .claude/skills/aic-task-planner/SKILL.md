---
name: aic-task-planner
description: Plans self-contained tasks in documentation/tasks/ with goals, signatures, steps, tests, and acceptance criteria for agent execution.
editors: all (Cursor Composer / Agent recommended for full fidelity)
---

# Task Planner (SKILL.md)

## QUICK CARD

- **Purpose:** Produce a task file an agent executor can follow without improvisation.
- **Inputs:** A user request, plus the current repo state. Read `documentation/tasks/_template.md` before every run.
- **Outputs:** One task file in `documentation/tasks/pending/NNN-<slug>.md` (ID assigned by you). If the user prefers, the file may stay in `documentation/tasks/drafts/` until they move it.
- **Non-skippable steps:** Classify intent → Pass 1 (explore) → user-gate → Pass 2 (write + mechanical review) → user-gate → finalize.
- **Mechanical gates:**
  `bash .claude/skills/shared/scripts/validate-exploration.sh <exploration-report>` — Pass 1 end.
  `bash .claude/skills/shared/scripts/ambiguity-scan.sh <task-file>` — Pass 2 end.
  `bash .claude/skills/shared/scripts/validate-task.sh <task-file>` — Pass 2 end.
- **Checkpoint lines:** After each phase, emit one line `CHECKPOINT: aic-task-planner/<phase> — complete` and append to `.aic/skill-log.jsonl` via `bash .claude/skills/shared/scripts/checkpoint-log.sh aic-task-planner <phase> <artifact-path>`.
- **Degraded mode (no subagent support):** This skill does not dispatch subagents. Run phases sequentially from the phase files.

## Severity vocabulary (only two tiers)

- **HARD RULE** — scriptable or otherwise non-negotiable. Every HARD RULE is either caught by an ESLint / shell gate, or the rule is small enough to check with a single grep. Violating a HARD RULE means stopping and fixing.
- **GUIDANCE** — best practice that improves quality but is not mechanically enforced. Deviate only when you can justify the deviation in the Architecture Notes.

No other tiers. Do not use "CRITICAL", "Cardinal Rule", "Iron Law", "MANDATORY", "MUST", "STOP" — they all mean HARD RULE here.

## HARD RULES (non-negotiable)

1. Stop if unsure. Ask one question. Do not invent choices the user must make.
2. No ambiguity in the task file. The ambiguity-scan script is the ground truth — if it reports a hit, fix it before finalizing.
3. Every file in the Files table is mandatory (no "optional" / "may add").
4. Every class and function has a TypeScript code block in Interface/Signature. Never describe a signature in prose.
5. Exactly one interface + one implementation in Interface/Signature. Never "Option A / Option B".
6. One file per step. Max two methods per step. Max ten files per task — split into multiple tasks otherwise.
7. Recipe fit required. Every task matches a recipe in `recipes/` or the general-purpose recipe. No improvised structures.
8. Never guess a library API or a wire format. Verify against `.d.ts` or official docs.
9. No `eslint-disable`, `@ts-ignore`, `@ts-nocheck`, `--no-verify`. If a rule fires, fix the code.
10. Before writing the task file, read the matching canonical example under `examples/` (`adapter-task-example.md`, `fix-patch-task-example.md`, …) and imitate its structure — section order, label vocabulary, acceptance-criteria style. See `../shared/examples/README.md`.
11. Recipe classification is a routed decision — dispatch it via a subagent rendered from `../shared/prompts/ask-stronger-model.md` with the strongest available model. See `../shared/SKILL-routing.md`. Do not classify the recipe inline in the orchestrator.

## GUIDANCE (best practice)

- Prefer smaller, focused files; big files signal unclear responsibility.
- Read the minimum surface area needed — use offset/limit for large files.
- Explain the _why_ in Architecture Notes, not the _what_.
- Keep commit messages ≤ 60 chars in examples; imperative mood.

## Autonomous execution

Between user gates you run continuously: do not pause to ask "should I continue?". The two user gates are:

1. **After Pass 1 Finalize (§B in `SKILL-phase-2-explore.md`)** — user reviews decisions.
2. **After Pass 2 Write (§C in `SKILL-phase-3-write.md`)** — user reviews task file.

Everything else runs through without intermediate questions.

## When to use

- New feature, refactor, bug fix, benchmark, config change, release pipeline.

## When NOT to use

- Ad-hoc one-line fixes (just do the fix).
- Questions (use `aic-researcher` instead).
- Release cuts (use `aic-release`).

## Inputs (read before acting)

- User request.
- `documentation/tasks/_template.md` — task file template.
- `documentation/implementation-spec.md` — architecture contract.
- `documentation/tasks/progress/aic-progress.md` — phase scope (gitignored; fall back to user intent if absent).
- `recipes/<recipe>.md` — recipe matching the task's component type.
- `SKILL-guardrails.md` — guardrail reference applied during Pass 2.

## Process overview (phase dispatch)

Phases live in separate files. Read the next phase file in full before executing it; do not summarise.

| Phase                                       | File                                                           | Exits with checkpoint  |
| ------------------------------------------- | -------------------------------------------------------------- | ---------------------- |
| 0. Setup + template read                    | `SKILL-phase-0-setup.md`                                       | `setup-complete`       |
| 1. Recommend recipe / intent classification | `SKILL-phase-1-recommend.md`                                   | `intent-classified`    |
| 2. Pass 1 — Explore + Decide                | `SKILL-phase-2-explore.md`                                     | `exploration-complete` |
| 3. Pass 2 — Write + Verify + Finalize       | `SKILL-phase-3-write.md`                                       | `task-finalized`       |
| 7. Self-review                              | `SKILL-phase-7-review.md`                                      | `self-review-complete` |
| — Guardrails reference                      | `SKILL-guardrails.md`                                          | —                      |
| — Recipes reference                         | `recipes/<recipe>.md` (formerly the single `SKILL-recipes.md`) | —                      |

At every phase exit, emit the checkpoint line and call `checkpoint-log.sh`.

## Subagent dispatch

This skill does not spawn subagents. All work is sequential.

## Failure patterns

- Writing the task file without exploring first (always do Pass 1).
- Ambiguity in instructions (ambiguity-scan is the referee).
- Improvising a structure outside recipes (use general-purpose recipe if nothing else fits).
- Skipping the user gates (they catch design drift).

## Output checklist (before delivering to the user)

- [ ] Task file ID assigned, placed in `documentation/tasks/pending/` or `drafts/`.
- [ ] `validate-exploration.sh` passes on the exploration report.
- [ ] `validate-task.sh` passes on the task file.
- [ ] `ambiguity-scan.sh` passes on the task file.
- [ ] Two checkpoint lines emitted (exploration-complete, task-finalized).
- [ ] `.aic/skill-log.jsonl` contains the matching entries.
