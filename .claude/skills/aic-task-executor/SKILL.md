---
name: aic-task-executor
description: Executes planner task files with steps, mechanical verification, progress updates, and isolated worktree commits.
---

# Task Executor

## Purpose

Execute a task file produced by the `aic-task-planner` skill. Read the task, internalize its specs, implement every step, verify with Grep-based mechanical checks for scoring, iterate until clean, finalize progress, and stage for commit.

**Announce at start:** "Using the task-executor skill on `<task file path>`."

## Editors

- **Cursor:** Attach the skill with `@` or invoke via `/`. Where this skill says to spawn subagents (e.g. documentation critics in §4-doc), use the **Task tool** with the specified `subagent_type`. You MUST use the Task tool for subagent work — never do it inline.
- **Claude Code:** Invoke with `/aic-task-executor`. Where this skill references multi-agent work, spawn separate agents. Never perform critic/explorer work inline.

## Autonomous Execution

Run §1–§6 as a single continuous flow. Never pause to report status or ask for confirmation mid-flow. **§6 is mandatory — task is NOT complete until merged to main.**

**Stop ONLY for:** unmet dependency (§1), unresolved ambiguity (§2), unverifiable assumption (§2.5), circuit breaker (§3), blocked diagnostic, or merge approval (§6a). Everything else runs continuously. After §6a approval, §6b runs immediately.

## When to Use

- User says "execute task", "go", "implement task NNN"
- User references a task file in `documentation/tasks/`
- Immediately after the task-planner offers execution
- User attaches this skill for ad-hoc work (no task file)

## Ad-hoc Work (No Task File)

**When this skill is attached but no task file is referenced, the full process still applies.** The worktree, verification, and merge steps are NOT optional — they exist to protect the main branch from untested changes. For ad-hoc work:

- §1: Create a worktree (use the epoch-only naming: `.git-worktrees/$EPOCH`)
- §2: Skip task internalization (no task file to read)
- §3: Implement the user's request directly in the worktree
- §4: Run the full verification pass (§4a toolchain + §4b mechanical checks on all files you created/modified)
- §5: Report results, skip progress update, commit in the worktree
- §6: Propose merge to user

**NEVER skip §4 (verification) for ad-hoc work.**

## Inputs

1. The task file path (e.g. `documentation/tasks/001-phase-b-core-interfaces.md`) — or the user's ad-hoc request
2. `.cursor/rules/AIC-architect.mdc` — active architectural rules
3. Existing source in `shared/src/` — current interfaces, types, patterns

## Process

The process has **six sections** plus mode-specific variants. §6 (Merge and Clean Up) is mandatory — the task is not complete until the worktree is merged into main and removed.

| Step                  | Deliverable                                 | User gate?              |
| --------------------- | ------------------------------------------- | ----------------------- |
| §1 Read + validate    | Task file internalized, worktree created    | Only if deps not met    |
| §2 Internalize        | Touched-files list, mode detection          | Only if ambiguity found |
| §3 Implement          | Code/docs written in worktree               | No — continuous         |
| §4 Verify             | All dimensions clean                        | No — continuous         |
| §5 Finalize           | Report, progress update, commit in worktree | No — continuous         |
| §6 Merge and Clean Up | Squash merge to main, worktree removed      | Yes — wait for approval |

## Phase Dispatch

After reading the task file, execute the phase files in order. Each phase file is a sibling of this file (same directory). Read each one just before executing it — do NOT skip ahead.

**Standard execution (with or without task file):**

1. Read `SKILL-phase-1-setup.md` → execute §1 setup + §2 internalize + §2.5 verify + §2b mode detection
2. Read `SKILL-phase-3-implement.md` → execute implementation (§3/§3-doc/§3-mixed based on mode from §2b)
3. Read `SKILL-phase-4-verify.md` → execute §4 verification
4. Read `SKILL-phase-5-finalize.md` → execute §5 finalize + §6 merge (continuous — do NOT stop between them)

**Documentation tasks:** Phase 3 file contains §3-doc and §4-doc together. Skip `SKILL-phase-4-verify.md` (code verify). Proceed directly to Phase 5.
**Mixed tasks:** Phase 3 file contains §3 (code), §3-mixed (docs), and §4-mixed (doc verify). Phase 4 file runs §4 (code verify).
**Code tasks:** Phase 3 file uses §3 only. Phase 4 file runs §4 (code verify) only.

**CRITICAL:** You must NOT skip §4 (verification) even for ad-hoc work. §6 (merge) is MANDATORY — the task is NOT complete until merged to main.

---

## Blocked Handling

If you cannot fix an issue after 2 attempts:

**Step 1 — Diagnose before blocking.** Check whether the failure is in your code or the task file:

- **Signature mismatch:** Does the interface in codebase still match the task file? If the interface changed since planning, the task file needs replanning — not more implementation attempts.
- **Type mismatch:** Do Dependent Types match actual types in `core/types/`? If fields are missing or renamed, report the discrepancy.
- **Config conflict:** Does ESLint change conflict with current `eslint.config.mjs`? If blocks were reordered or rules changed since planning, report it.
- **Layer violation:** Does implementation need something banned by ESLint rules? This is a design issue, not a code issue.
- **Approach mismatch (circuit breaker):** 3+ workarounds accumulated? List each. The task's chosen approach doesn't fit the actual codebase — the planner needs to re-evaluate, not the executor needs to try harder.

**Step 2 — Block and report:**

1. **Stop immediately** — do not guess or improvise.
2. Append a `## Blocked` section to the task file (main workspace copy) with:
   - What you tried (specific code or command)
   - What went wrong (exact error message)
   - Whether the issue is in your code or the task file's spec
   - What decision you need from the user
3. Commit partial work in worktree: `git add <touched files> && git commit -m "wip(task-NNN): blocked — <short reason>"`
4. Change task status to `Blocked` (main workspace copy).
5. Report to user with worktree path + branch name.
6. **Wait for guidance.**

---

## Conventions

- Execute steps in order — never skip
- Never add files/features not in the task; never modify task file content (only Status field)
- If the task file seems wrong, ask the user
- All verification must pass before reporting success; evidence over claims
- All work in a worktree — never commit directly to main; merge only when user approves
- Multiple executors can run in parallel in separate worktrees

## Common Rationalizations — STOP

| Thought                                                         | Reality                                                                             |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| "This step is trivial, I can skip verification"                 | Trivial steps fail too. Verify everything.                                          |
| "I just wrote it so I know it is correct"                       | Re-read from disk. Memory is unreliable after 10+ files.                            |
| "Tests should pass now"                                         | "Should" means you have not run them. Run them.                                     |
| "The task file is probably wrong, I will improvise"             | Stop and report to the user. Never improvise.                                       |
| "I will fix this lint error later"                              | Fix it now. Deferred fixes compound.                                                |
| "One more try without going to Blocked"                         | If you have tried 2+ times, go to Blocked. More attempts waste tokens.              |
| "This workaround is fine, the task did not anticipate this"     | 3+ workarounds = circuit breaker. Report it.                                        |
| "I can skip the worktree for this small change"                 | The worktree protects main. Size does not matter.                                   |
| "Verification passed in §4a, no need for §4b mechanical checks" | §4a catches toolchain errors. §4b catches convention violations. Both are required. |
| "I will commit and fix the remaining issue after"               | All dimensions must be clean before committing.                                     |
| "The subagent said it succeeded"                                | Verify independently. Never trust subagent reports without evidence.                |
| "This debugging attempt will work"                              | Follow the systematic debugging skill. No guessing.                                 |

- Never skip verification, worktree setup, or mechanical checks — no matter how trivial the step seems.
- Never trust memory or subagent reports — re-read from disk, run the command, verify with tool output.
- Never stop before §6 — the worktree is temporary; without merge to main the user has nothing.
