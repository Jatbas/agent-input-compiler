---
name: aic-task-executor
description: Executes planner task files with steps, mechanical verification, progress updates, and isolated worktree commits.
editors: all (Cursor Composer / Agent recommended for full fidelity)
---

# Task Executor (SKILL.md)

## QUICK CARD

Single-screen reference. Canonical details live in the referenced sections — do not recreate runners from memory.

- **Purpose:** Execute a task file in an isolated worktree, verify, squash-merge to `main`, archive the task, update progress.
- **Inputs:** Task file in `documentation/tasks/NNN-*.md`, or a direct, fully-specified user instruction.
- **Phases (in order):** Setup → Implement → Verify → Finalize. Read each `SKILL-phase-N-*.md` file before executing that phase.
- **Checkpoints:** 4 for code/mixed (`setup-complete`, `implementation-complete`, `verification-complete`, `finalized`); 3 for pure-doc (Phase 4 skipped; see §Process overview). Each phase file ends with the exact emission command.
- **Pre-flight gate (§2):** `bash .claude/skills/shared/scripts/executor-preflight.sh <task-file>` — runs ambiguity-scan / deferral-probe / architectural-invariants in parallel. Non-zero exit = stop and tell the user (HARD RULE 8).
- **Setup-complete gate:** always export `CHECKPOINT_TASK_FILE=<abs-task-file>` when emitting `setup-complete` so `checkpoint-log.sh` verifies the preflight target matches this task (not just recency).
- **Toolchain gate (§4a):** `pnpm lint / typecheck / test / knip / lint:clones` in one parallel batch via the canonical runner in `SKILL-phase-4-verify.md §4a`. Sequential `&&` form is a last-resort fallback only.
- **Scope discipline:** the Files table is a closed set. Out-of-list edits = Blocked diagnostic (HARD RULE 9). Legitimate side-effects are the narrow whitelist in `SKILL-phase-5-finalize.md §5c Step 2`.
- **Autonomous:** run continuously; stop only on the conditions listed in §Autonomous execution. Never merge with uncommitted changes, `--no-verify`, or silenced lint / type errors.
- **Subagents:** none for pure-code tasks; documentation-writer Phase 3 critics dispatched from §4-doc / §4-mixed for doc/mixed tasks.

## Severity vocabulary (only two tiers)

- **HARD RULE** — verified by `typecheck`, `lint`, `test`, `ambiguity-scan`, or a shell check. Violation = stop and fix.
- **GUIDANCE** — best practice. Deviate only with justification.

## HARD RULES

1. Never skip verification. `pnpm typecheck && pnpm lint && pnpm test` must all pass before merge.
2. Never merge with uncommitted changes in the worktree.
3. Never use `--no-verify`.
4. Never add `eslint-disable`, `@ts-ignore`, `@ts-nocheck`. Fix the code instead.
5. Follow the task file literally. If an instruction is ambiguous, stop and tell the user; do not guess.
6. Verify external assumptions before implementing (read the actual `.d.ts`, run the actual tool, query the actual database).
7. Evidence before claims: never report "fixed" or "passes" without fresh output from this run.
8. Pre-flight mechanical gates are non-optional. Run `bash .claude/skills/shared/scripts/executor-preflight.sh <task-file>` in §2 before internalizing design decisions. Any non-zero exit = stop and tell the user; do not execute. The wrapper writes a success record to `.aic/gate-log.jsonl` and `checkpoint-log.sh` refuses to accept `setup-complete` without a fresh record for the current task — export `CHECKPOINT_TASK_FILE=<abs-task-file>` when emitting `setup-complete` so an unrelated preflight from a concurrent agent or earlier session cannot satisfy the gate. Skipping the preflight gate is a checkpoint violation. This is defense in depth against planner pass-through failures — the executor is the last line of defence before the task lands in production.
9. Scope discipline — the task's Files table is a closed set. The only files you may edit outside that set are the narrow side-effects enumerated in `SKILL-phase-5-finalize.md` §5c Step 2 (lint-staged reformatting of already-listed files, task-declared auto-ratcheting benchmark artifacts, and generated artifacts named in Config Changes). Everything else — test-fixture tweaks to placate new logic, sibling-test keyword injections, integration snapshots not declared in the task, adjacent refactors exposed by the change, schema/validator/descriptor mirrors not declared by the task, or benchmark expected-output/golden artifacts that change because behavior changed — is a **Blocked diagnostic** under §Blocked Handling. Report the proposed out-of-list file(s), the reason the core change needs them, and the options (extend scope with user approval, re-plan, or discard). Never silently expand the allowlist at §5c.
10. Architectural-invariants defense in depth — `executor-preflight.sh` independently re-runs `architectural-invariants.sh` against the task file. The 8 triggers and their required bullets are defined in `.claude/skills/shared/prompts/architectural-invariants-reference.md`; do not re-derive them from memory. If the gate fails, the planner's Pass 2 equivalent (HARD RULE 26 of `aic-task-planner`) was skipped or under-specified — **stop and tell the user.** Quote the failing check, the missing discipline bullet, and the fix hint from the wrapper output. Do not paper over a missing bullet by inferring intent; flag the planner output as incomplete and wait for user direction.

    **Scope disclaimer.** A passing gate means the 8 named patterns were checked and found clean. It is NOT a measurement-correctness guarantee; new defect shapes outside those 8 patterns pass silently. If you spot a measurement issue during execution that the gate did not flag, do not silently fix it — stop and surface it so a new trigger can be added.

## GUIDANCE

- Prefer targeted edits (StrReplace) on the minimum necessary lines. Do not overwrite whole files when a small edit suffices.
- Favour sibling patterns — if three similar files already follow a pattern, follow it.

## Autonomous execution

Run as a single continuous flow. Do not pause to announce each step. Do not paraphrase the task file back to the user. The only points you stop and ask the user are:

- **Pre-flight blocker** — a check in §1 fails: missing template, task status not `Pending`, dependency not `Done`, `executor-preflight.sh` non-zero exit (any sub-gate — ambiguity-scan, deferral-probe, or architectural-invariants — fired), prerequisite mismatch, HEAD mismatch after worktree creation, or an unverifiable external assumption (§2.5).
- **Ambiguous instruction** — a step cannot be executed literally.
- **Scope growth** — making a step pass requires editing a file that is not in the task's Files table and is not one of the enumerated legitimate side-effects in `SKILL-phase-5-finalize.md` §5c Step 2. Stop the moment you notice it; do not open the file.
- **Verification failure** — the full toolchain gate in §4a fails and you cannot resolve it within 3 attempts (then use `aic-systematic-debugging`). A per-step `Verify` (§3) that cannot be fixed after 2 attempts is a **Blocked diagnostic** — see Blocked Handling below.
- **Blocked diagnostic** — three failed per-step `Verify` attempts, a circuit-breaker trip (§3), or a structural issue exposed by §4. Report the state and stop.
- **Finalize issue** — §6a surfaces something that blocks auto-merge: see `SKILL-phase-5-finalize.md` §6a stop list (dirty tree outside task surface, failed gate regression, merge conflict, new knip / clone findings, or task-file ambiguity surfaced late).

On a fully clean finalize (§5 PASS, git status shows only expected deltas, §4a all-green), merge to main runs autonomously using the agreed commit message. Do not ask.

## Blocked Handling

Reached on three failed per-step `Verify` attempts in §3, a §3 circuit breaker, a §4 structural issue, or any failure that makes the task impossible without architectural change.

1. Stop executing steps.
2. Report to the user: (a) which step, (b) what you tried, (c) what failed, (d) the specific error / evidence, (e) the minimal next action you recommend (re-scope task, switch architecture, escalate to `aic-systematic-debugging`).
3. Do not merge. Do not move the task file to `done/`. Leave the worktree intact so diagnostics remain reproducible.
4. Wait for user direction.

## When to use

- Execute a pending task file from `documentation/tasks/pending/`.
- Execute a direct, fully-specified user instruction that does not require planning (the user has already stated files, signatures, and acceptance). Ambiguous requests → route to `aic-task-planner` first.

## When NOT to use

- When the task file does not yet exist (use `aic-task-planner` first).
- When you need to answer a question (use `aic-researcher`).

## Weak-model runbook (deterministic path)

Follow this sequence exactly. Do not reorder.

1. Read `SKILL-phase-1-setup.md` and execute setup section 1 (pre-read/worktree/install).
2. Run `bash .claude/skills/shared/scripts/executor-preflight.sh <task-file>` before internalizing design decisions in setup section 2.
3. Emit `setup-complete` checkpoint only after preflight success is recorded. Export `CHECKPOINT_TASK_FILE=<abs-task-file>` on the `checkpoint-log.sh` call so the gate verifies the preflight target matches the current task, not just recency.
4. Read `SKILL-phase-3-implement.md` and execute steps literally in order.
5. For code and mixed tasks, read `SKILL-phase-4-verify.md` and run §4a then §4b then §4c.
6. For pure documentation tasks, skip Phase 4 and follow the doc verification route in Phase 3.
7. Read `SKILL-phase-5-finalize.md` and run finalize/merge flow exactly.
8. Emit `finalized` checkpoint only after finalize is complete.

If a gate fails, fix the reported cause and rerun that gate/stage. Do not continue on a failing gate.

## Canonical paths (copy exactly)

- Rule file: `.cursor/rules/aic-architect.mdc`
- Skill root: `.claude/skills/aic-task-executor/`
- Shared scripts: `.claude/skills/shared/scripts/`
- Preflight wrapper: `.claude/skills/shared/scripts/executor-preflight.sh`
- Checkpoint logger: `.claude/skills/shared/scripts/checkpoint-log.sh`
- Gate log: `.aic/gate-log.jsonl`
- Skill log: `.aic/skill-log.jsonl`
- Pending tasks: `documentation/tasks/pending/`
- Done tasks: `documentation/tasks/done/`

## Failure triage map (script -> next action)

- `executor-preflight.sh` fails -> stop execution, report failing sub-gates, and ask user whether to fix task file or re-plan. Do not implement code yet.
- `ambiguity-scan.sh` fails -> replace ambiguous language in the task file with literal, testable instructions.
- `deferral-probe.sh` fails -> add named successor in `## Follow-up Items` or permanent-value justification in `## Architecture Notes` / `## Goal`.
- `architectural-invariants.sh` fails -> add required discipline bullet(s) exactly as the gate requests.
- `checkpoint-log.sh` rejects `setup-complete` -> rerun `executor-preflight.sh <task-file>` for the current task, then re-emit with `CHECKPOINT_TASK_FILE=<abs-task-file>` exported. Unrelated or stale preflight successes no longer satisfy the gate when the env var is set.
- §4a toolchain fails -> fix every failing job and rerun full §4a batch.
- §4b mechanical dimension fails -> fix that dimension and rerun failed checks before proceeding.
- §6 merge precondition fails -> stop-and-ask flow in `SKILL-phase-5-finalize.md` §6a; do not auto-merge.

## Process overview (phase dispatch)

Read each phase file before executing it. Mode classification (pure code / mixed / pure documentation), worktree creation, and merge mechanics live inline inside `SKILL-phase-1-setup.md` and `SKILL-phase-5-finalize.md`.

| Phase                                                                                                                                                                                               | File                         | Checkpoint                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------- |
| 1. Setup (pre-flight + worktree)                                                                                                                                                                    | `SKILL-phase-1-setup.md`     | `setup-complete`          |
| 3. Implement                                                                                                                                                                                        | `SKILL-phase-3-implement.md` | `implementation-complete` |
| 4. Verify (**code + mixed tasks only** — pure-documentation tasks run their critic pipeline inline inside `SKILL-phase-3-implement.md §4-doc` and skip this phase; see phase-3 end-of-file handoff) | `SKILL-phase-4-verify.md`    | `verification-complete`   |
| 5. Finalize (progress update + merge)                                                                                                                                                               | `SKILL-phase-5-finalize.md`  | `finalized`               |

At every phase exit: emit checkpoint line + call `bash .claude/skills/shared/scripts/checkpoint-log.sh aic-task-executor <phase> <artifact-path-or-note> [status]`. A successful run emits four checkpoint lines **for code and mixed tasks** (`setup-complete`, `implementation-complete`, `verification-complete`, `finalized`) or three checkpoint lines **for pure-documentation tasks** (`setup-complete`, `implementation-complete`, `finalized`). Phase 2 is intentionally unused — kept for runner alignment and not a missing phase.

## Subagent dispatch

Subagent use is scoped by task mode:

- **Pure code tasks** — no subagents. All work is sequential.
- **Pure documentation tasks** — §4-doc spawns 3-4 critics in parallel via the `aic-documentation-writer` Phase 3 pipeline (see `SKILL-phase-3-implement.md §4-doc-a`).
- **Mixed tasks** — §4-mixed spawns the same critic set, scaled per `SKILL-phase-3-implement.md §4-mixed-a` (Critic 2 only for MECHANICAL changes, full set for SECTION EDIT changes).
- **Any mode** — delegating a verification step (e.g. full test suite) to a background shell is a tool call, not a subagent.

## Failure patterns

- Fixing tests by relaxing assertions (use `aic-systematic-debugging`).
- Merging with failing gates.
- Editing `aic-progress.md` inside the worktree — the file is gitignored and the update vanishes on worktree removal. Always edit it on the main workspace. `SKILL-phase-5-finalize.md` §5b is the correct point.
- Guessing at an ambiguous instruction — stop and ask instead.

## Output checklist

Success path (merged):

- [ ] Pre-flight `executor-preflight.sh` exited 0 on the task file before implementation began (HARD RULE 8), and `setup-complete` was emitted with `CHECKPOINT_TASK_FILE` set to the absolute task-file path so `checkpoint-log.sh` verified the preflight's `target` matched the current task (not just recency).
- [ ] Task file moved to `documentation/tasks/done/` with `Status: Done`.
- [ ] `aic-progress.md` updated on the main workspace (not inside the worktree).
- [ ] Commits follow `type(scope): description`, ≤ 72 chars.
- [ ] Full `§4a` gate (lint, typecheck, test, knip, lint:clones) passed on the merged branch.
- [ ] `§4b` dim 22 (goal-traceability acceptance) clean — every task-specific Acceptance Criteria bullet maps to a concrete test, symbol, string, field, or path. Generic invariants alone do not satisfy this dim.
- [ ] `§4b` dim 23 (boundary contract mirrors) clean when the task changes a runtime contract shape — schema, validator, descriptor, formatter, parser, test, and manual payload mirrors are either in scope or explicitly compatible.
- [ ] Predecessor contracts (if any) verified in §2 before writing code; no predecessor drift discovered mid-implementation.
- [ ] Dual-anchor discipline honored in §3 — StrReplace `old_string` used the backticked literal, not the line number.
- [ ] Unit contract (if any) honored in §3 — every numeric write matches the declared domain; no silent rescaling.
- [ ] Worktree + branch removed via `bash .claude/skills/shared/scripts/cleanup-worktree.sh remove <worktree-dir> <branch>` (exit 0 required) and final `cleanup-worktree.sh sweep` reports 0 orphan directories.
- [ ] Four checkpoint lines in `.aic/skill-log.jsonl` for code / mixed tasks; three for pure-documentation tasks (Phase 4 skipped).

Discard path (user said discard in §6c or Blocked at §6a):

- [ ] Worktree + feature branch removed via `cleanup-worktree.sh remove` + `cleanup-worktree.sh sweep` (both exit 0).
- [ ] Task file restored to `documentation/tasks/NNN-name.md` with `Status: In Progress` (or the original status if the task was ad-hoc) — see §6c.
- [ ] `aic-progress.md` not updated (no merge, nothing to record).
- [ ] Checkpoint lines in `.aic/skill-log.jsonl` match the phases actually run (up to three for pure-doc, up to four for code / mixed), with the last one marked `blocked` and carrying the reason.
