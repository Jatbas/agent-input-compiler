---
name: aic-task-planner
description: Plans self-contained tasks in documentation/tasks/ with goals, signatures, steps, tests, and acceptance criteria for agent execution.
editors: all (Cursor Composer / Agent recommended for full fidelity)
---

# Task Planner (SKILL.md)

## QUICK CARD

- **Purpose:** Produce a task file an agent executor can follow without improvisation.
- **Inputs:** A user request, plus the current repo state. Read `documentation/tasks/_template.md` before every run.
- **Outputs:** One task file at `documentation/tasks/NNN-<slug>.md` (ID assigned by you at §6). This skill finalizes directly to `documentation/tasks/`; moving to `pending/`, `drafts/`, or `done/` is a downstream filesystem operation handled by the user or the executor.
- **Non-skippable steps:** Classify intent → Pass 1 (explore) → user gate → Pass 2 (write + mechanical review + verification subagents) → §6 finalize.
- **Mechanical gates:**
  `bash .claude/skills/shared/scripts/validate-exploration.sh <exploration-report>` — Pass 1 end.
  `bash .claude/skills/shared/scripts/ambiguity-scan.sh <task-file>` — Pass 2 end.
  `bash .claude/skills/shared/scripts/validate-task.sh <task-file>` — Pass 2 end.
- **Checkpoint lines:** After each phase, emit one line `CHECKPOINT: aic-task-planner/<phase> — complete` and append to `.aic/skill-log.jsonl` via `bash .claude/skills/shared/scripts/checkpoint-log.sh aic-task-planner <phase> <artifact-path>`. A successful run emits one checkpoint per phase entry in the process-overview table.
- **Subagent mode:** Recipe classification (HARD RULE 11) and Pass 2 verification (§C.5b–d) both dispatch subagents. See §Subagent dispatch below. Documentation recipe additionally dispatches parallel explorers/critics per `SKILL-recipes.md`.

## Severity vocabulary (only two tiers)

- **HARD RULE** — scriptable or otherwise non-negotiable. Every HARD RULE is either caught by an ESLint / shell gate, or the rule is small enough to check with a single grep. Violating a HARD RULE means stopping and fixing.
- **GUIDANCE** — best practice that improves quality but is not mechanically enforced. Deviate only when you can justify the deviation in the Architecture Notes.

No other severity tiers. Do not invent a tier named "CRITICAL", "Cardinal Rule", "Iron Law", "MANDATORY", "MUST", or "STOP" — those all mean HARD RULE here. The word `CRITICAL` is allowed inside prose or code-block explanations (e.g. a call-out in a recipe) as long as it is not used as a severity label for rules.

## HARD RULES (non-negotiable)

1. Stop if unsure. Ask one question. Do not invent choices the user must make.
2. No ambiguity in the task file. The ambiguity-scan script is the ground truth — if it reports a hit, fix it before finalizing.
3. Every file in the Files table is mandatory (no "optional" / "may add").
4. **For code-component tasks** (adapter, storage, pipeline transformer, composition root, fix/patch with signature change, general-purpose with new class or function): every class and function has a TypeScript code block in Interface/Signature. Never describe a signature in prose. Documentation and release-pipeline recipes replace Interface/Signature per `SKILL-recipes.md` and are exempt.
5. **For code-component tasks** (same scope as rule 4): exactly one interface + one implementation in Interface/Signature. Never "Option A / Option B". Recipe-specific section replacements (Change Specification, Publish specification, Behavior Change) have their own structure defined in `SKILL-recipes.md`.
6. One file per step. Max two methods per step. Max ten files per task — split into multiple tasks otherwise.
7. Recipe fit required. Every task matches a recipe in `SKILL-recipes.md` or the general-purpose recipe. No improvised structures.
8. Never guess a library API or a wire format. Verify against `.d.ts` or official docs.
9. No `eslint-disable`, `@ts-ignore`, `@ts-nocheck`, `--no-verify`. If a rule fires, fix the code.
10. Before writing the task file, read the matching canonical example under `examples/` (`adapter-task-example.md`, `fix-patch-task-example.md`, …) and imitate its structure — section order, label vocabulary, acceptance-criteria style. See `.claude/skills/shared/examples/README.md`.
11. Recipe classification is a routed decision — dispatch it via a subagent rendered from `.claude/skills/shared/prompts/ask-stronger-model.md` with the strongest available model. See `.claude/skills/shared/SKILL-routing.md`. Do not classify the recipe inline in the orchestrator.

## GUIDANCE (best practice)

- Prefer smaller, focused files; big files signal unclear responsibility.
- Read the minimum surface area needed — use offset/limit for large files.
- Explain the _why_ in Architecture Notes, not the _what_.
- Keep commit messages ≤ 60 chars in examples; imperative mood.

## Autonomous execution

Between user gates you run continuously: do not pause to ask "should I continue?". Stops are only:

1. **Phase 1 — pick the task** (`SKILL-phase-1-recommend.md`): if the user picks a non-optimal component you warn and wait for confirmation.
2. **Phase 2 — Pass 1 complete** (`SKILL-phase-2-explore.md §A.5`): user reviews exploration decisions and says "proceed".
3. **Phase 2 — scope tiers** (`SKILL-phase-2-explore.md §A.4c`, conditional): when exploration finds out-of-scope issues, present Minimal / Recommended / Comprehensive tiers and wait for the user's pick.
4. **Blocker** — any exploration field marked `NOT VERIFIED — BLOCKER`, any LAYER BLOCKER = YES, any unresolved ambiguity, or the task cannot proceed without user input.

There is **no user gate after Pass 2**. Once §C.5/§C.5b/§C.5c/§C.5d all PASS, §6 finalize runs immediately — task file is placed, worktree removed, announcement printed — without asking. Everything else runs through without intermediate questions.

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

| Phase                                    | File                         | Exits with checkpoint  |
| ---------------------------------------- | ---------------------------- | ---------------------- |
| 0. Setup + template read                 | `SKILL-phase-0-setup.md`     | `setup-complete`       |
| 1. Recommend next task + user pick       | `SKILL-phase-1-recommend.md` | `task-picked`          |
| 2. Pass 1 — Explore + Decide + user gate | `SKILL-phase-2-explore.md`   | `exploration-complete` |
| 3. Pass 2 — Write + Verify + §6 finalize | `SKILL-phase-3-write.md`     | `task-finalized`       |
| 7. Self-review (optional post-finalize)  | `SKILL-phase-7-review.md`    | `self-review-complete` |
| — Guardrails reference                   | `SKILL-guardrails.md`        | —                      |
| — Recipes reference                      | `SKILL-recipes.md`           | —                      |

At every phase exit, emit the checkpoint line and call `checkpoint-log.sh`. A successful run emits four checkpoints (`setup-complete`, `task-picked`, `exploration-complete`, `task-finalized`) plus `self-review-complete` if Phase 7 runs.

**Phase-gate wall-clock enforcement.** `checkpoint-log.sh` now rejects with exit code 3 if `aic-task-planner` emits `exploration-complete` within 5 seconds of the last `task-picked`, or `task-finalized` within 5 seconds of the last `exploration-complete`, or `task-picked` within 1 second of the last `setup-complete`. This prevents the previously-observed failure mode where all four checkpoints were batched at run end and the independent-verification subagents that are supposed to run _between_ gates never actually ran. If a checkpoint is rejected, do not re-run with `CHECKPOINT_ALLOW_RAPID=1` unless the run is a documented test or replay — the correct fix is to run the gate's real work (grep sweeps, subagent dispatch, self-review) before emitting.

## Subagent dispatch

This skill dispatches subagents in three places:

1. **HARD RULE 11 — recipe classification** (`SKILL-phase-2-explore.md §A.1` item 5): always routed via `.claude/skills/shared/prompts/ask-stronger-model.md` with the strongest available model. The decision-tree branches documented inline in §A.1 item 5 define the candidate recipes; the routed subagent returns the selected recipe + evidence. Do not walk the tree inline in the orchestrator. See `.claude/skills/shared/SKILL-routing.md`.
2. **Pass 2 verification** (`SKILL-phase-3-write.md §C.5b–§C.5d`): `generalPurpose` subagents perform independent cross-check, convention probes, and adversarial re-planning.
3. **Documentation recipe** (`SKILL-recipes.md`): parallel explorers and critics per the documentation recipe's pipeline.

No other phase dispatches subagents. All other work is sequential in the orchestrator.

## Failure patterns

- Writing the task file without exploring first (always do Pass 1).
- Ambiguity in instructions (ambiguity-scan is the referee).
- Improvising a structure outside recipes (use general-purpose recipe if nothing else fits).
- Skipping the user gates (they catch design drift).

## Output checklist (before delivering to the user)

- [ ] Task file ID assigned (NNN), placed at `documentation/tasks/NNN-<slug>.md`.
- [ ] `validate-exploration.sh` passes on the exploration report.
- [ ] `validate-task.sh` passes on the task file.
- [ ] `ambiguity-scan.sh` passes on the task file.
- [ ] Four checkpoint lines emitted (`setup-complete`, `task-picked`, `exploration-complete`, `task-finalized`).
- [ ] `.aic/skill-log.jsonl` contains the matching entries.
- [ ] Worktree + branch removed via `bash .claude/skills/shared/scripts/cleanup-worktree.sh remove <main>/.git-worktrees/plan-$EPOCH` (exit 0 required) and final `cleanup-worktree.sh sweep` reports 0 orphan directories (see `SKILL-phase-3-write.md §6`).
