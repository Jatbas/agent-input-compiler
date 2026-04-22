---
name: aic-task-executor
description: Executes planner task files with steps, mechanical verification, progress updates, and isolated worktree commits.
editors: all (Cursor Composer / Agent recommended for full fidelity)
---

# Task Executor (SKILL.md)

## QUICK CARD

- **Purpose:** Execute a task file exactly as written, commit the result in an isolated worktree, update progress, and merge back.
- **Inputs:** A task file in `documentation/tasks/pending/` or a direct user instruction for an already-specified change.
- **Outputs:** Committed changes in an isolated worktree, squash-merged to `main` on a clean finalize (main workspace is checked out on `main` during §6b); task file moved to `done/`; `aic-progress.md` updated.
- **Non-skippable steps:** Setup → Implement → Verify → Finalize (progress update + merge).
- **Mechanical gates:**
  Pre-flight (§2, before any code is written — independently re-runs the planner's Pass 2 gates):
  `bash .claude/skills/shared/scripts/executor-preflight.sh <task-file>` — single entry point that runs `ambiguity-scan.sh` and `deferral-probe.sh` in order, halts on first non-zero exit, and appends a `{ "gate": "executor-preflight", "status": "ok"|"fail" }` record to `.aic/gate-log.jsonl`. `checkpoint-log.sh` rejects the executor's `setup-complete` checkpoint unless this record is present within the last 30 minutes (emergency bypass `CHECKPOINT_ALLOW_NO_GATE=1` leaves an audit trail).
  Toolchain (§4a, before merge):
  `pnpm lint && pnpm typecheck && pnpm test && pnpm knip && pnpm lint:clones` — must all pass before merge. (QUICK CARD lists the full chain in §4a order; §4a is authoritative if they ever drift.)
- **Checkpoint lines:** After each phase, emit `CHECKPOINT: aic-task-executor/<phase> — complete` and call `checkpoint-log.sh`. Four checkpoint lines for code or mixed tasks (setup, implementation, verification, finalized); three for pure-documentation tasks (setup, implementation, finalized — Phase 4 is skipped, see Process overview note).
- **Degraded mode:** For code tasks, all work is sequential (no subagents). For documentation / mixed tasks, §4-doc / §4-mixed dispatch the documentation-writer Phase 3 critic pipeline — see §Subagent dispatch below.

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
8. Pre-flight mechanical gates are non-optional. Run `bash .claude/skills/shared/scripts/executor-preflight.sh <task-file>` in §2 before internalizing design decisions. Exit 1 = stop and tell the user; do not execute. The wrapper writes a success record to `.aic/gate-log.jsonl` and `checkpoint-log.sh` refuses to accept `setup-complete` without a fresh record — so skipping the gate is also a checkpoint violation. This is defense in depth against planner pass-through failures — the executor is the last line of defence before the task lands in production.
9. Scope discipline — the task's Files table is a closed set. The only files you may edit outside that set are the narrow side-effects enumerated in `SKILL-phase-5-finalize.md` §5c Step 2 (lint-staged reformatting of already-listed files, benchmark baselines marked auto-ratcheting in the task file, and generated artifacts named in Config Changes). Everything else — test-fixture tweaks to placate new logic, sibling-test keyword injections, integration snapshots not declared in the task, adjacent refactors exposed by the change, or benchmark coverage that shrinks because the new behavior excludes more paths — is a **Blocked diagnostic** under §Blocked Handling. Report the proposed out-of-list file(s), the reason the core change needs them, and the options (extend scope with user approval, re-plan, or discard). Never silently expand the allowlist at §5c.

## GUIDANCE

- Prefer targeted edits (StrReplace) on the minimum necessary lines. Do not overwrite whole files when a small edit suffices.
- Favour sibling patterns — if three similar files already follow a pattern, follow it.

## Autonomous execution

Run as a single continuous flow. Do not pause to announce each step. Do not paraphrase the task file back to the user. The only points you stop and ask the user are:

- **Pre-flight blocker** — a check in §1 fails: missing template, task status not `Pending`, dependency not `Done`, `executor-preflight.sh` exit 1 (either sub-gate — ambiguity-scan or deferral-probe — fired), prerequisite mismatch, HEAD mismatch after worktree creation, or an unverifiable external assumption (§2.5).
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

## Process overview (phase dispatch)

Read each phase file before executing it. Mode classification (pure code / mixed / pure documentation), worktree creation, and merge mechanics live inline inside `SKILL-phase-1-setup.md` and `SKILL-phase-5-finalize.md`.

| Phase                                                                                                                                                                                               | File                         | Checkpoint                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------- |
| 1. Setup (pre-flight + worktree)                                                                                                                                                                    | `SKILL-phase-1-setup.md`     | `setup-complete`          |
| 3. Implement                                                                                                                                                                                        | `SKILL-phase-3-implement.md` | `implementation-complete` |
| 4. Verify (**code + mixed tasks only** — pure-documentation tasks run their critic pipeline inline inside `SKILL-phase-3-implement.md §4-doc` and skip this phase; see phase-3 end-of-file handoff) | `SKILL-phase-4-verify.md`    | `verification-complete`   |
| 5. Finalize (progress update + merge)                                                                                                                                                               | `SKILL-phase-5-finalize.md`  | `finalized`               |

At every phase exit: emit checkpoint line + call `checkpoint-log.sh`. A successful run emits four checkpoint lines **for code and mixed tasks** (`setup`, `implementation`, `verification`, `finalized`) or three checkpoint lines **for pure-documentation tasks** (`setup`, `implementation`, `finalized`). Phase 2 is intentionally unused — kept for runner alignment and not a missing phase.

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

- [ ] Pre-flight `executor-preflight.sh` exited 0 on the task file before implementation began (HARD RULE 8), with a matching `"gate":"executor-preflight","status":"ok"` record in `.aic/gate-log.jsonl` that `checkpoint-log.sh` accepted before `setup-complete` fired.
- [ ] Task file moved to `documentation/tasks/done/` with `Status: Done`.
- [ ] `aic-progress.md` updated on the main workspace (not inside the worktree).
- [ ] Commits follow `type(scope): description`, ≤ 72 chars.
- [ ] Full `§4a` gate (lint, typecheck, test, knip, lint:clones) passed on the merged branch.
- [ ] `§4b` dim 22 (goal-traceability acceptance) clean — every task-specific Acceptance Criteria bullet maps to a concrete test, symbol, string, field, or path. Generic invariants alone do not satisfy this dim.
- [ ] Predecessor contracts (if any) verified in §2 before writing code; no predecessor drift discovered mid-implementation.
- [ ] Dual-anchor discipline honored in §3 — StrReplace `old_string` used the backticked literal, not the line number.
- [ ] Unit contract (if any) honored in §3 — every numeric write matches the declared domain; no silent rescaling.
- [ ] Worktree + branch removed via `bash .claude/skills/shared/scripts/cleanup-worktree.sh remove <worktree-dir> <branch>` (exit 0 required) and final `cleanup-worktree.sh sweep` reports 0 orphan directories.
- [ ] Four checkpoint lines in `.aic/skill-log.jsonl` for code / mixed tasks; three for pure-documentation tasks (Phase 4 skipped).

Discard path (user said discard in §6c or Blocked at §6a):

- [ ] Worktree + feature branch removed via `cleanup-worktree.sh remove` + `cleanup-worktree.sh sweep` (both exit 0).
- [ ] Task file restored to `documentation/tasks/NNN-name.md` with `Status: In Progress` (or the original status if the task was ad-hoc) — see §6c.
- [ ] `aic-progress.md` not updated (no merge, nothing to record).
- [ ] Checkpoint lines in `.aic/skill-log.jsonl` match the phases actually run (up to three for pure-doc, up to four for code / mixed), with the last one marked `failed` and carrying the reason.
