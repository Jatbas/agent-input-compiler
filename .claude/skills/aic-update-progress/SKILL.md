---
name: aic-update-progress
description: Updates documentation/tasks/progress/aic-progress.md after tasks—component tables, daily log, and phase header metrics.
editors: all
---

# Update Progress (SKILL.md)

## QUICK CARD

- **Purpose:** After a task is merged, update the progress file accurately.
- **Inputs:** The just-completed task file (now in `documentation/tasks/done/`).
- **Outputs:** Updated `documentation/tasks/progress/aic-progress.md` (gitignored; per-operator).
- **Non-skippable steps:** Read task file → update component tables → append daily-log line → refresh phase header metrics.
- **Mechanical gates:** None scriptable (progress file is free-form). Use the reply contract below as a soft gate.
- **Checkpoint lines:** `CHECKPOINT: aic-update-progress/complete` + `checkpoint-log.sh`.
- **Degraded mode:** Sequential, single-agent. No subagents.

## Severity vocabulary (only two tiers)

- **HARD RULE** — non-negotiable invariants listed below.
- **GUIDANCE** — style.

## HARD RULES

1. **Never touch `aic-progress.md` inside a worktree.** The file is gitignored; update it on the main working branch only, after the worktree merges.
2. **Append-only daily log.** Do not rewrite prior days.
3. **Every updated component row cites the completing task file** by filename (not by task ID in prose).
4. **Phase header metrics use the actual merged state.** Never rely on memory.

## GUIDANCE

- Keep daily-log entries ≤ 3 lines per task.
- Group tables by phase, not by status.

## Autonomous execution

Run continuously. Stop on:

- Progress file missing (ask the user whether to initialise).
- Phase / component unknown to the progress file (ask the user to confirm the correct section).

## When to use

- Immediately after `aic-task-executor` merges a worktree.
- After a manual hot-fix lands on the working branch.

## When NOT to use

- Mid-task (wait until merge).
- For user-facing release notes (use `aic-update-changelog`).

## Process overview (inline phases)

1. **Read task outcome** — open the task file at `documentation/tasks/done/<id>-<slug>.md`. Note: the task ID, the phase / component section it belongs to, the files changed, the acceptance criteria met, and any follow-ups. Checkpoint: `read-complete`.
2. **Update component tables** — locate the relevant component row(s) in `aic-progress.md`. Update status and reference the task filename (not the task ID as prose). Checkpoint: `components-updated`.
3. **Append daily log** — add a dated entry under today's heading with ≤ 3 lines per task merged today. Checkpoint: `daily-log-appended`.
4. **Refresh phase header metrics** — recompute phase metrics (files shipped, tests added, benchmark deltas) from the merged state, not memory. Checkpoint: `metrics-refreshed`.

## Failure patterns

- Updating progress inside a worktree → file vanishes when worktree is removed (gitignored).
- Duplicating a task's row across multiple phases.
- Refreshing metrics from memory instead of the actual merged state.

## Output checklist

- [ ] Every merged task appears in a component table.
- [ ] Daily log has one entry per task merged today.
- [ ] Phase metrics match the actual code (`git log`, `test/benchmarks/baseline.json`).
- [ ] Four checkpoint lines in `.aic/skill-log.jsonl`.
