---
name: aic-task-planner
description: Plans self-contained tasks in documentation/tasks/ with goals, signatures, steps, tests, and acceptance criteria for agent execution.
---

# Task Planner

## Purpose

Produce a self-contained task file that any agent can pick up and execute without prior context. The task file lives in `documentation/tasks/` and contains everything needed: goal, file paths, signatures, steps, tests, and acceptance criteria.

**Announce at start:** "Using the task-planner skill."

## Editors

- **Cursor:** Attach the skill with `@` or invoke via `/`. Where this skill delegates to the `aic-documentation-writer` or `aic-researcher` (which spawn subagents), use the **Task tool** with the specified `subagent_type`. Never do subagent work inline.
- **Claude Code:** Invoke with `/aic-task-planner`. Where this skill delegates to multi-agent skills, spawn separate agents as specified.

## Cardinal Rule: Stop If Unsure

**If you do not know something with certainty, STOP and tell the user.** Never guess, assume, or improvise:

- **Library APIs:** Read installed `.d.ts` files first — never write signatures from memory.
- **Template fit:** No matching specialized recipe → use **general-purpose recipe** from `SKILL-recipes.md`. Never improvise outside a recipe.
- **TypeScript resolution:** Verify `package.json` exports / `tsconfig.json` path changes work. If unverifiable, state as blocker.
- **Exploration fields:** Any field without verified information = **blocker**. Do not write "None" or skip. Tell the user.

## Simplicity Principle

- **Prefer extending over creating.** Check if an existing interface/type/file can gain a method or field before creating new ones.
- **Prefer fewer files.** If a change fits in an existing file without making it unwieldy, put it there.
- **Prefer no abstraction over premature abstraction.** Inline until a second use case appears.
- **Prefer direct flow over transformation layers.** Don't create intermediate types unless shapes genuinely differ.
- **Simplicity test:** For every new file/type/interface: _"What if I use what already exists?"_ If nothing breaks → don't create it.

## Autonomous Execution

Run each pass as a single continuous flow. Do NOT pause mid-pass to report status or ask for confirmation.

**Legitimate user gates (ONLY points where you stop):**

- §1: User picks a component
- §0b: Ambiguous intent
- A.4c: Scope expansion tiers (skip if no expansion found)
- A.5: User checkpoint after Pass 1
- §0b step 6: Research-then-plan confirmation

**Everything else runs without pausing.** A.1→A.4b is one flow. C.1→C.6 is one flow. After C.6, §6 runs immediately — the task is NOT complete until §6 finishes.

**Anti-patterns:** Do NOT send status messages between A.5 approval and Pass 2. Do NOT stop after Pass 2 — §6 copies the file to main workspace. Always run §6. Do NOT announce ("Task saved…") before the worktree removal command completes — §6 step 3 chains copy + worktree removal as one command; if you split them and announce first, the worktree is never removed.

## When to Use

- User says "plan next task", "what's next", or "create a task"
- Before any multi-file implementation work
- When the user picks a component from `documentation/tasks/progress/aic-progress.md` — still run §1 ranking to validate the pick
- User says "review task NNN", "review tasks", or "review all tasks" — triggers the **Review** process (see §7)

## Inputs (read these every time)

1. `documentation/tasks/progress/aic-progress.md` — what is done, what is next (main workspace only — gitignored)
2. `documentation/project-plan.md` — architecture, ADRs, conventions
3. `documentation/implementation-spec.md` — detailed component specs
4. `documentation/security.md` — security constraints
5. `.cursor/rules/AIC-architect.mdc` — active architectural rules
6. Existing source in `shared/src/` — current interfaces, types, patterns

## Process Overview

Two passes + finalization. §6 is mandatory — task incomplete until file copied to main workspace.

| Step        | Deliverable                                                                     | User gate?          |
| ----------- | ------------------------------------------------------------------------------- | ------------------- |
| §1 Present  | User picks a component                                                          | Yes — wait for pick |
| Pass 1      | Exploration Report + all decisions resolved                                     | Yes — user reviews  |
| Pass 2      | Task file written + 4-stage verified (self → document → codebase → adversarial) | No — self-check     |
| §6 Finalize | Task file numbered, copied to main workspace, worktree removed                  | No — automatic      |

---

## §0b. Intent Classification (mandatory — run first, before worktree setup)

**Classification decision tree (evaluate in order, stop at first match):**

1. Does the user reference a specific component from `documentation/tasks/progress/aic-progress.md`, say "plan next task", "what's next", or name a concrete component to plan? → **Task planning** — proceed to §1.
2. Does the user ask to analyze, investigate, or debug something AND explicitly say not to plan or create a task (e.g., "do not create a task", "just analyze", "tell me what's wrong")? → **Analysis-only** — run the Runtime Verification Checklist (below), present findings, stop. No worktree, no task file.
3. Does the request contain question words (how, why, where, what) directed at understanding the codebase? → **Research-then-plan** — delegate to researcher.
4. Does the request contain improvement language (improve, optimize, fix, analyze, gaps, problems, weaknesses, issues)? → **Research-then-plan** — delegate to researcher.
5. Does the request ask to analyze, verify, or improve documentation? → **Research-then-plan** — delegate to researcher (documentation analysis classification).
6. Does the request ask to evaluate a technology, compare options, or assess fit? → **Research-then-plan** — delegate to researcher (technology evaluation classification).
7. Is the intent ambiguous? → **Ask the user:** "This seems like it needs investigation first. Want me to research this before planning, or go straight to planning a specific component?"

**When auto-delegation triggers:**

1. Announce: "This request needs investigation first. Running the research protocol."
2. Read `.claude/skills/aic-researcher/SKILL.md`.
3. Spawn as subagent (do NOT execute inline). Pass full request + project context.
4. Save research document to `documentation/research/`.
5. Present findings: "Research complete — see `documentation/research/YYYY-MM-DD-title.md`. Want me to plan based on these findings?"
6. If user says proceed → create worktree (§0), continue to §1 with research as input.

### Runtime Verification Checklist

Applies to: (1) analysis-only requests — full checklist then present; (2) Pass 1 exploration with external systems — integrate into Batch A/B.

Collect **actual evidence** for each item. Unverifiable → blocker. Read `../shared/SKILL-investigation.md` and apply the **Runtime Evidence Checklist** and **Codebase Investigation Depth** requirements.

---

## Phase Dispatch

After §0b classification, read and execute the appropriate phase files **in order**. Each phase file is a sibling of this file (same directory). Read each one just before executing it — do NOT skip ahead.

**Task planning (§0b classification #1 or post-research #6):**

1. Read `SKILL-phase-0-setup.md` → execute §0 worktree setup
2. Read `SKILL-phase-1-recommend.md` → execute §1, wait for user pick **(USER GATE)**
3. Read `SKILL-phase-2-explore.md` → execute Pass 1, wait for user "proceed" **(USER GATE)**
4. Read `SKILL-phase-3-write.md` → execute Pass 2 + §6 finalize (continuous — do NOT stop between them)

**Analysis-only (§0b classification #2):** No phase files needed — present findings and stop.

**Research-then-plan (§0b classifications #3–#6):** Delegate to researcher, then resume at step 1 above if user says proceed.

**Review (user says "review task NNN"):** Read `SKILL-phase-7-review.md` → execute §7.

**CRITICAL:** You must NOT write a task file without first completing phases 0–2. The task template is in `SKILL-phase-3-write.md` — you cannot access it until you have a verified exploration report from phase 2.

---

## Plan Failure Patterns — Never Write These

- "TBD", "TODO", "implement later", "in a future task"
- "add appropriate handling/tests", "handle edge cases" (without listing them)
- "similar to Task N", "see Task N" (repeat the code)
- "write tests for the above" without listing test cases
- "update as needed", "fix if broken", "refactor if necessary"

## Conventions

- One task file per component. Completed tasks → `documentation/tasks/done/`. Status: `Pending` / `In Progress` / `Done` / `Blocked`.
- Exact file paths, exact code for interfaces/signatures. Tests in co-located `__tests__/`.
- Reference ADRs by number. `shared/package.json` to disambiguate. Never reference another task. Never "Create" for existing files.
- For recipes: `SKILL-recipes.md`. For guardrails: `SKILL-guardrails.md`.
- **Probe accumulation:** Missed failures → extract class, add probe to C.5c.

## Common Rationalizations — STOP

- Never skip subagent dispatch. Never skip evidence requirements. Never do inline what should be spawned.
- Never plan from memory — read `.d.ts`, interfaces, and source files. "Probably" = not verified.
- Never skip the exploration report, improvise outside recipes, or defer details to the executor. The worktree is temporary — §6 is mandatory.
