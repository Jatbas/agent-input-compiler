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
  `bash .claude/skills/shared/scripts/planner-gate.sh <task-file>` — Pass 2 end (single entry point that runs `ambiguity-scan.sh`, `validate-task.sh`, `deferral-probe.sh`, `architectural-invariants.sh`, and `followup-propagation-check.sh` in order, aborting on the first non-zero exit and writing pass/fail to `.aic/gate-log.jsonl`). `checkpoint-log.sh` rejects `task-finalized` unless `.aic/gate-log.jsonl` contains a `planner-gate` ok record for this task file within the last 30 minutes — no bypass without `CHECKPOINT_ALLOW_NO_GATE=1`.
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
12. **Source citation fidelity.** Every `Source:` line in the Exploration Report, every verbatim-quoted code/schema block in the task file, AND every backtick-quoted path in the `## Files` table with Action = Modify/Verify/Delete/Replace/Rename must cite a path that exists on disk and content that appears in the cited file byte-for-byte. Mechanical check AN (`SKILL-phase-3-write.md §C.5`) covers `Source:` lines and AN-lite covers task-body `Source:` citations; AN-table (in `validate-task.sh`) covers the Files table. All three must run and pass before any other mechanical check that reads cited content. Hallucinated citations invalidate every downstream check that trusted them. Closes the drift observed in task 333 where the Files table cited `mcp/src/server.test.ts` (not on disk) while the real path `mcp/src/__tests__/server.test.ts` appeared only in the Tests section — the AN-lite check passed because no `Source:` line carried the wrong path.
13. **Existing-symbol signature fidelity.** When the task's Interface/Signature redeclares an existing exported symbol, the declared signature must match the source file byte-for-byte unless the task includes an explicit `**Signature change:**` block showing `before:`/`after:`. Mechanical check AG.
14. **Change Specification round-trip.** Every `Change Specification` block's `Required change` directive must, when applied to `Current text`, produce `Target text` without contradiction. Mechanical check AH.
15. **Unit contract for numeric bindings.** Any task that binds numeric values to named slots (DB columns, interface fields, config keys, wire-format fields, JSON keys, CLI values) must declare a `**Unit contract:**` bullet in Architecture Notes listing each slot's domain and source. Mechanical check AJ.
16. **Dual anchors for line references.** Every line-number reference in the task body must be paired with a literal grep-unique substring from the referenced line. Mechanical check AL.
17. **Goal-to-acceptance traceability.** Every atomic clause of `## Goal` must be covered by at least one task-specific `## Acceptance Criteria` bullet — generic invariants (`pnpm lint clean`) do not satisfy traceability. Mechanical check AM.
18. **Exploration-to-task coverage.** Every IN-SCOPE exploration finding (CHANGE-PATTERN INSTANCES, CONSUMER ANALYSIS breakage, CALLER CHAIN ANALYSIS, TEST IMPACT, BEHAVIOR CHANGES, OPTIONAL FIELD HAZARDS) must have a resolution in the task — Files row, Step, Architecture Note, or explicit `## Follow-up Items` entry under the Minimal scope tier. Mechanical check AO.
19. **Prerequisite graph validation.** Every task named under `Depends on:` or `Prerequisite:` must exist on disk, have a compatible `Status:`, and not form a cycle with the current task. Mechanical check AP.
20. **Predecessor contract discipline.** When the task has a `Depends on:` header, Architecture Notes must include a `**Predecessor contracts:**` bullet listing every consumed contract (column name + nullability, enum values, interface methods, config keys, null-vs-zero semantics). Tests and steps must not construct input that violates declared nullability, assume a non-null value where the predecessor writes null, or read a column the predecessor did not declare. Enforced by `C.5b` Predecessor-contract probe and exploration item 24.
21. **Verification circuit breaker.** When the same mechanical check or subagent probe has failed 3 times, STOP and escalate to the user with a root-cause hypothesis. When the task file has undergone 5 full C.5 re-runs without all checks passing, STOP regardless. Never silently mark a check `N/A` to bypass it. Enforced by `SKILL-phase-3-write.md §C.6`.
22. **Deferred-field bookkeeping.** Any hardcoded `null`/`false`/`0`/`""`/`''`/`[]`/`undefined`/`None` assignment in a Step body to a field the same task introduces (via `CREATE TABLE` column or new interface field) must be either registered under `## Follow-up Items` with a named successor task (`task NNN` or `pending/NNN-*` or `documentation/tasks/NNN-*`), or justified as permanent in `## Architecture Notes` / `## Goal` with explicit wording (`remains null`, `stays null`, `always null`, `permanently null`, `never populated`). Enforced by `deferral-probe.sh` and check AQ in `SKILL-phase-3-write.md §C.5`. Closes the failure class observed in task 322 where `classifier_confidence` shipped hardcoded null with a parenthetical "populated in a later task" but no named successor — `aic_quality_report` ran for three days reporting `classifierConfidence.available = false` before the gap was noticed.
23. **Successor-contract closure.** When any other task file has a `## Follow-up Items` entry that names the current task as the successor for a specific field, the current task must address that field in its Files table, Goal, Architecture Notes, Steps, or Tests section — mentioning the field identifier anywhere in the file satisfies the check. Enforced by `followup-propagation-check.sh` (wrapped by `planner-gate.sh`). Closes the drift observed in task 322→330 where task 322 declared `classifierConfidence` deferred to a later task, task 330 (classifier-scores) landed as the nominal successor but only populated `compilation_log.classifier_confidence` and never touched `quality_snapshots.classifier_confidence`, and no mechanical gate caught the advertised obligation going unfulfilled.
24. **Documentation routing.** Multi-line documentation changes route to `aic-documentation-writer`, never inline into a code task. Eligible inline edits (no routing required):
    - Single-line substring replacement inside an existing sentence (e.g. `"default 30 days"` → `"default 7 days"`).
    - Single backtick-quoted identifier rename inside running prose.
    - A single-line footnote or callout addition.
      Anything beyond that — adding a section, inserting a fenced code block, capturing CLI output into the doc, authoring prose that must match sibling-section style, or editing 3+ non-contiguous lines in the same document — must be deferred to `## Follow-up Items` with `aic-documentation-writer` named as the successor skill, OR justified as inline via a `**Documentation routing:**` bullet in `## Architecture Notes` (e.g., "inline because the change is a 1-line default copy update that does not require style matching"). Enforced by `validate-task.sh` check AR: if any Step contains `capture stdout`, `#### ` insertion language, `fenced sample` phrasing, `insert ... into README`, or `append ... section ... .md`, the check fires unless the task mentions `aic-documentation-writer` anywhere or carries the `**Documentation routing:**` bullet. Closes the drift observed in task 333 where a 15-line README sample insertion was bundled into a code task without routing to the documentation specialist — discovered only by human validation of the generated task file.
25. **Behavior-change test-surface simulation.** When any Modify row changes the observable behavior of an existing function (not merely adds a new symbol, export, or type), every test file that imports the modified symbol — unit tests, integration tests, golden snapshots, selection benchmarks, fixture-driven runners — must be simulated against the new behavior before the task ships. This is done in Phase 2 sub-step 17c `FIXTURE SIMULATION` and enforced by Phase 3 mechanical check AS. Each fixture resolves to exactly one classification: (a) `UNCHANGED` — existing assertion still passes; (b) `ASSERTION FLIPS` — the assertion or expected output changes, so the test file becomes a Files table Modify row with the specific assertion delta described in its Steps; (c) `AUTO-RATCHET` — a baseline/golden file (e.g. `test/benchmarks/baseline.json`, integration snapshot) whose content is expected to regenerate mechanically, which must be declared under an `**Auto-ratcheting artifacts:**` bullet in Architecture Notes listing every such path. The executor's `aic-task-executor` `SKILL-phase-5-finalize.md` §5c Step 2 whitelist only auto-stages baselines listed in that bullet — any other baseline dirty in the worktree is a Blocked diagnostic for the executor. Missing fixture simulation is the single most common cause of executor Scope-tripwire fires (§3 step 6 in the executor). Closes the drift observed in task 342 (BF02) where the new zero-semantic-signal floor required edits to `heuristic-selector.test.ts` existing fixtures, three integration `defaultRulePack` helpers, and `test/benchmarks/expected-selection/1.json` — all predictable by simulation, none listed in the Files table, all discovered at execute time.
26. **Architectural invariants (DRY / SOLID / branded types / label alignment).** `architectural-invariants.sh` (wrapped by `planner-gate.sh`) enforces 8 defect-class triggers. The authoritative list of triggers, required bullets, and exemption grammar lives in `.claude/skills/shared/prompts/architectural-invariants-reference.md`. Read that file before you write the task; it is the single source of truth. When a trigger fires, the named bullet must appear anywhere in the task file matching `^(-[[:space:]]+)?\*\*<Name>:\*\*` — the script accepts `## Architecture Notes`, `## Steps`, a `## Files` row description cell, or `## Goal`.

    **Mechanical critic dispatch — no LLM decision.** After `planner-gate.sh` runs, read the latest `"gate":"architectural-invariants"` record in `.aic/gate-log.jsonl`. If `"critic_required": true`, the C.5b independent-verification subagent MUST render `.claude/skills/shared/prompts/critic-measurement-consistency.md` as a critic prompt. If `false`, MUST NOT. No other input influences this choice. The critic's HARD findings block `task-finalized` the same way other `C.5b` findings do.

    **Scope disclaimer.** This gate catches 8 named patterns. It is NOT a measurement-correctness guarantee. New defect shapes that do not match one of the 8 triggers pass silently — add a new trigger + fixture under `.claude/skills/shared/scripts/__tests__/fixtures/` when you see one. Do not widen an existing check to cover an unrelated pattern.

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

**Circuit breaker (HARD RULE 21).** Inside Pass 2 the orchestrator runs until verification passes, but the loop is bounded:

- Soft cap: 3 failed attempts on the same check → STOP, produce a root-cause report, escalate to the user.
- Hard cap: 5 full C.5 re-runs without all checks passing → STOP regardless, escalate with the accumulated diffs.
- Counters reset only after the task file ships (§6). Never silently mark a failing check `N/A` to bypass it. See `SKILL-phase-3-write.md §C.6` → Circuit breaker.

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
- [ ] `validate-exploration.sh` passes on the exploration report — scripted coverage: mandatory sections incl. `SIBLING QUORUM`, `PREDECESSOR CONTRACTS`, `UNIT CONTRACT`; placeholders unfilled; `METHOD BEHAVIORS` definitive; `Source:` paths resolve on disk (AN).
- [ ] `planner-gate.sh` passes on the task file — single wrapper that runs `ambiguity-scan.sh`, `validate-task.sh`, `deferral-probe.sh`, `architectural-invariants.sh`, and `followup-propagation-check.sh` in order and writes the success record `checkpoint-log.sh` requires before accepting `task-finalized`. Covers:
  - `validate-task.sh`: empty parens, trailing prepositions, internal codes (Phase X / AK01 / /AB; `Task N` allowed), sections present, `Option A/B` banned, dual-anchor line references (AL), prerequisite graph (AP), SECTION EDIT resolution (AK), Unit contract when unit-hint slots appear (AJ), `Source:` paths resolve on disk (AN-lite), Files-table paths resolve on disk for Modify/Verify/Delete/Replace/Rename rows (AN-table, HARD RULE 12), documentation routing for multi-line doc changes (AR, HARD RULE 24).
  - `ambiguity-scan.sh`: hedging, delegation, and plan-failure phrase enforcement (Cat 1–8 + P).
  - `deferral-probe.sh`: every hardcoded `null`/`false`/`0`/`""`/`''`/`[]`/`undefined`/`None` assignment to a task-introduced field is either registered under `## Follow-up Items` with a named successor task, or justified as permanent in `## Architecture Notes` / `## Goal` (check AQ).
  - `architectural-invariants.sh`: DRY-01 constants-reuse probe, SRP-01 display-layer compute, LABEL-01 formatter label-formula alignment, BRAND-01 branded-type invariant cite, DIP-01 `new X()` outside composition root, OCP-01 pipeline class modification, SCOPE-01 storage query scope, PERSIST-01 persisted/displayed metric parity (HARD RULE 26).
  - `followup-propagation-check.sh`: every field advertised against this task by another task's `## Follow-up Items` is addressed somewhere in the task file (HARD RULE 23).
- [ ] Checks that are NOT script-enforced but are subagent/prose-enforced (§C.5b–d): AG existing-symbol signature fidelity, AH Change Specification round-trip, AI intra-bullet assignment consistency, AM goal-to-acceptance traceability, AO exploration-to-task coverage, plus pattern-claim verification and predecessor-contract probe.
- [ ] Four checkpoint lines emitted (`setup-complete`, `task-picked`, `exploration-complete`, `task-finalized`).
- [ ] `.aic/skill-log.jsonl` contains the matching entries.
- [ ] Circuit breaker counters reset only after the task ships — no check was silently marked `N/A` to bypass verification (HARD RULE 21 / `SKILL-phase-3-write.md §C.6`).
- [ ] Worktree + branch removed via `bash .claude/skills/shared/scripts/cleanup-worktree.sh remove <main>/.git-worktrees/plan-$EPOCH` (exit 0 required) and final `cleanup-worktree.sh sweep` reports 0 orphan directories (see `SKILL-phase-3-write.md §6`).
