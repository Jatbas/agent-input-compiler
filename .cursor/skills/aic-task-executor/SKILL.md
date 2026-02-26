# Task Executor

## Purpose

Execute a task file produced by the `aic-task-planner` skill. Read the task, implement every step, self-review in two stages, iterate until clean, update progress, and stage for commit.

**Announce at start:** "Using the task-executor skill on `<task file path>`."

## When to Use

- User says "execute task", "go", "implement task NNN"
- User references a task file in `documentation/tasks/`
- Immediately after the task-planner offers execution

## Inputs

1. The task file path (e.g. `documentation/tasks/001-phase-b-core-interfaces.md`)
2. `.cursor/rules/aic-architect.mdc` — active architectural rules
3. Existing source in `shared/src/` — current interfaces, types, patterns

## Process

### 1. Read and validate the task

Read the task file. Verify:

- Status is `Pending` (do not re-execute `Done` or `Blocked` tasks)
- All dependencies listed in "Depends on" are actually `Done` in `documentation/mvp-progress.md`

If a dependency is not done, **stop and tell the user**.

Update the task file status to `In Progress`.

### 2. Implement

Work through the **Steps** section in order.

For each step:

1. Do exactly what the step says.
2. Run the **Verify** command listed in that step.
3. If verification fails, fix the issue before moving to the next step.
4. If you cannot fix it after 2 attempts, go to **Blocked** (see below).

**Subagent dispatch (recommended for tasks with 5+ steps):**

For larger tasks, consider dispatching a focused subagent per step or group of related steps. Each subagent gets only the context it needs (the step description, relevant file paths, signatures from the task file). This prevents context drift on long tasks. Use `subagent_type="generalPurpose"` and include in the prompt:

- The exact step text from the task file
- The relevant Interface/Signature section
- The file paths involved
- The verify command to run

Review the subagent's output before proceeding to the next step.

### 3. Two-Stage Self-Review

After completing all steps, review in two separate passes:

**Pass 1 — Spec compliance:**

- Did I implement everything in the Files table?
- Does the code match the Interface/Signature section exactly?
- Did I add anything that was NOT requested? Remove it.
- Are all properties `readonly` where specified?
- Do all imports use the correct layer aliases (`#core/`, `#pipeline/`, etc.)?

**Pass 2 — Code quality:**

- Run `pnpm lint && pnpm typecheck && pnpm test`.
- Check: no layer boundary violations, no banned imports, no inline rule disabling.
- Check: branded types used where specified, DI via constructor injection, no concrete dependencies.
- Names are clear and match what things do.
- No unnecessary comments. Existing comments explain why, not what.
- No over-engineering. YAGNI.

### 4. Verification Before Completion

Before declaring success, verify with evidence — do not just claim it works:

- Run `pnpm lint && pnpm typecheck && pnpm test` and **read the output**.
- Confirm test count has not dropped (compare against the expected count from the task file or previous run).
- Confirm zero warnings, not just zero errors.
- If the task specifies test cases, confirm each one appears in the output by name.

### 5. Fix Issues

If review or verification found problems:

1. Fix them.
2. Re-run `pnpm lint && pnpm typecheck && pnpm test`.
3. Self-review again (both passes).
4. Repeat until clean. **Maximum 3 iterations** — if still failing after 3, go to Blocked.

### 6. Report

When clean, report to the user:

- What was implemented (files created/modified)
- Test results (pass count, confirming no regressions)
- Self-review findings and fixes applied (if any)
- Any concerns or follow-up items

### 7. Update Progress

Use the `aic-update-mvp-progress` skill to update `documentation/mvp-progress.md`.

**Critical:** Use today's actual date for the daily log entry. If today's entry already exists, append to it. If it is a new day, create a new entry at the top of the Daily Log section (reverse chronological). Do not put today's work under yesterday's date.

### 8. Update Task Status

Change the task file header from `> **Status:** In Progress` to `> **Status:** Done`.

### 9. Archive the Task File

Move the completed task file to `documentation/tasks/done/`:

```
mkdir -p documentation/tasks/done
mv documentation/tasks/NNN-name.md documentation/tasks/done/
```

### 10. Stage and Propose Commit

Stage all changed files with `git add`. Then **propose** a conventional commit message to the user:

```
feat(<scope>): <what was built>
```

**Do NOT commit automatically.** Present the staged files and proposed message, then wait for the user to approve or adjust. The user decides when to commit.

---

## Blocked Handling

If during execution you encounter something unexpected or cannot fix an issue:

1. **Stop immediately** — do not guess or improvise.
2. Append a `## Blocked` section to the task file with:
   - What you tried
   - What went wrong
   - What decision you need from the user
3. Change the task file status to `Blocked`.
4. Report to the user and **wait for guidance**. Do not continue.

---

## Conventions

- Never skip a step — execute them in order
- Never add files or features not listed in the task
- Never modify the task file content (Steps, Signatures, etc.) — only update the Status field
- If something in the task file seems wrong, ask the user rather than silently fixing it
- All verification must pass before reporting success
- Evidence over claims — always read and report actual command output
- Commit only when the user says so
