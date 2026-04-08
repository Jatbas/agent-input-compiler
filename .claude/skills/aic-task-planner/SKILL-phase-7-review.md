# Phase 7: Review Existing Tasks

Triggered when the user asks to review one or more task files.

## Scope

- "review task 008" → single task
- "review tasks" / "review all tasks" → all pending in `documentation/tasks/` (skip `done/`)

## Step 7.0: Worktree setup

Create a planning worktree from `main` using the same procedure as §0 steps 1–3 (see `SKILL-phase-0-setup.md`). Store the epoch value. Use the worktree for code exploration (reading interfaces, types, source files). Task files are gitignored, so read and write them from the **main workspace** — the worktree will not have them.

## Step 7a: Check for codebase drift

For each file referenced in the task's Files table (both "Create" and "Modify" paths), check if the file or its directory has changed since the task was written. Use `git log -1 --format='%ai' -- <path>` for modified files and Glob for created files that now exist. If drift is detected, flag the specific files and re-read them before proceeding.

## Step 7b: Gather codebase state

Run the Pass 1 exploration checklist (see `SKILL-phase-2-explore.md`) once for the full batch. Use parallel Read calls. Cache the results.

## Step 7c: Evaluate each task

Run the full 4-stage verification pipeline: C.5 mechanical checks (self), C.5b independent document review, C.5c independent codebase verification, and C.5d adversarial re-planning (if triggered by complexity thresholds). See `SKILL-phase-3-write.md` for the full verification pipeline. Use parallel Grep + Read calls. For multiple tasks, batch the Grep calls — up to 4 task files in parallel.

## Step 7d: Present findings

For each task: score, guardrail violations table, specific fixes. If drift was detected in 7a, highlight affected sections. For multiple tasks: summary table first.

## Step 7e: Rewrite

Ask: **"Rewrite all, rewrite specific tasks (list numbers), or skip?"**

When rewriting: read original, apply fixes, re-read source files. Write in place (same path, same NNN). Fix every failing check. Re-run full 4-stage pipeline. Iterate until PASS. N/A only when precondition structurally unmet.

Clean up: `rm -rf .git-worktrees/plan-$EPOCH && git worktree prune && git branch -D plan/$EPOCH`

Announce: **"Task NNN rewritten. Score: N/M (X%). [Summary of changes]."**

**Final sweep (MANDATORY — last shell command in the session).** Editors may recreate directory stubs for files they were tracking:

```
rm -rf .git-worktrees/plan-$EPOCH 2>/dev/null; rmdir .git-worktrees 2>/dev/null || true
```

Verify: `ls .git-worktrees/plan-$EPOCH 2>&1` must report "No such file or directory".
