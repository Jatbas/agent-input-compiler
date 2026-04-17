---
name: aic-task-executor
description: Executes planner task files with steps, mechanical verification, progress updates, and isolated worktree commits.
editors: all (Cursor Composer / Agent recommended for full fidelity)
---

# Task Executor (SKILL.md)

## QUICK CARD

- **Purpose:** Execute a task file exactly as written, commit the result in an isolated worktree, update progress, and merge back.
- **Inputs:** A task file in `documentation/tasks/pending/`, or an ad-hoc request matching one of the ad-hoc patterns.
- **Outputs:** Committed changes in an isolated worktree, merged to the working branch; task file moved to `done/`; `aic-progress.md` updated.
- **Non-skippable steps:** Pre-flight → Worktree → Implement → Verify → Update progress → Merge.
- **Mechanical gates:**
  `pnpm typecheck`, `pnpm lint`, `pnpm test` — must all pass before merge.
  `bash .claude/skills/shared/scripts/validate-task.sh <task-file>` before starting implementation.
- **Checkpoint lines:** After each phase, emit `CHECKPOINT: aic-task-executor/<phase> — complete` and call `checkpoint-log.sh`.
- **Degraded mode:** No subagents are dispatched; all work is sequential. If the shell is restricted to a single command at a time, run phases one at a time and checkpoint after each.

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

## GUIDANCE

- Prefer targeted edits (StrReplace) on the minimum necessary lines. Do not overwrite whole files when a small edit suffices.
- Favour sibling patterns — if three similar files already follow a pattern, follow it.

## Autonomous execution

Run as a single continuous flow. The only points you stop are:

- **Pre-flight blocker** — a check in §1 fails (missing template, broken task file).
- **Verification failure** — a gate fails and you cannot resolve it within 3 attempts (then use `aic-systematic-debugging`).
- **Ambiguous instruction** — a step cannot be executed literally.

Do not pause to announce each step. Do not paraphrase the task file back to the user.

## When to use

- Execute a pending task file.
- Execute a direct user instruction matching one of the ad-hoc patterns in `SKILL-phase-0-ad-hoc.md`.

## When NOT to use

- When the task file does not yet exist (use `aic-task-planner` first).
- When you need to answer a question (use `aic-researcher`).

## Process overview (phase dispatch)

Read each phase file before executing it. Ad-hoc detection and worktree/merge mechanics live inline inside `SKILL-phase-1-setup.md` and `SKILL-phase-5-finalize.md`.

| Phase                                               | File                         | Checkpoint                |
| --------------------------------------------------- | ---------------------------- | ------------------------- |
| 1. Setup (ad-hoc detection + pre-flight + worktree) | `SKILL-phase-1-setup.md`     | `setup-complete`          |
| 3. Implement                                        | `SKILL-phase-3-implement.md` | `implementation-complete` |
| 4. Verify                                           | `SKILL-phase-4-verify.md`    | `verification-complete`   |
| 5. Finalize (progress update + merge)               | `SKILL-phase-5-finalize.md`  | `finalized`               |

At every phase exit: emit checkpoint line + call `checkpoint-log.sh`.

## Subagent dispatch

This skill does not dispatch subagents. The optional exception is delegating a verification step (e.g. running the full test suite) to a background shell; that is a tool call, not a subagent.

## Failure patterns

- Fixing tests by relaxing assertions (use `aic-systematic-debugging`).
- Merging with failing gates.
- Updating `aic-progress.md` before the worktree merges (it is gitignored — always update on the working branch, after the merge).
- Guessing at an ambiguous instruction — stop and ask instead.

## Output checklist

- [ ] Task file moved to `documentation/tasks/done/`.
- [ ] `aic-progress.md` updated on the working branch (not inside the worktree).
- [ ] Commits follow `type(scope): description`, ≤ 72 chars.
- [ ] All three gates (`typecheck`, `lint`, `test`) passed on the merged branch.
- [ ] Seven checkpoint lines in `.aic/skill-log.jsonl`.
