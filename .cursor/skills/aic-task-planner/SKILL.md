# Task Planner

## Purpose

Produce a self-contained task file that any agent can pick up and execute without prior context. The task file lives in `documentation/tasks/` and contains everything needed: goal, file paths, signatures, steps, tests, and acceptance criteria.

**Announce at start:** "Using the task-planner skill."

## When to Use

- User says "plan next task", "what's next", or "create a task"
- Before any multi-file implementation work
- When the user picks a component from `documentation/mvp-progress.md`

## Inputs (read these every time)

1. `documentation/mvp-progress.md` — what is done, what is next
2. `documentation/project-plan.md` — architecture, ADRs, conventions
3. `documentation/mvp-specification-phase0.md` — detailed component specs
4. `documentation/security.md` — security constraints
5. `.cursor/rules/aic-architect.mdc` — active architectural rules
6. Existing source in `shared/src/` — current interfaces, types, patterns

## Process

### 1. Present options

Read `mvp-progress.md`. List the next 3–5 components that are `Not started` and are unblocked (their dependencies are `Done`). Present them to the user with a one-line description each.

Ask: **"Which of these do you want to tackle next? Or tell me something else."**

Do NOT proceed until the user picks.

### 2. Explore before writing

Once the user picks, gather context thoroughly before writing anything.

**Use focused subagents for exploration (recommended):**

Launch one or more `subagent_type="explore"` agents to gather context in parallel. For example:

- One subagent to find all existing interfaces/types the component depends on
- One subagent to read the relevant spec sections from `mvp-specification-phase0.md`
- One subagent to check the architectural rules and ADRs that apply

This prevents missing dependencies or misunderstanding constraints. Each subagent should return the specific code signatures, type definitions, or rule text it found.

**Ask yourself (after exploration):**

- What interfaces does this component depend on?
- What types/branded types does it use?
- What layer does it live in (core, pipeline, storage, adapter)?
- What are the architectural constraints for that layer?
- Are there any blockers or unknowns?

If you have questions or see a blocker, **ask the user now**. One question at a time. Do not guess.

### 3. Write the task file

Save to: `documentation/tasks/NNN-kebab-case-name.md`

NNN = zero-padded sequence number (001, 002, ...). Check existing files in `documentation/tasks/` for the next number.

Use the template below. Every signature and file path must be exact — the executor should not need to interpret or guess.

### 4. Offer execution

After saving, say:

**"Task saved to `documentation/tasks/NNN-name.md`. Use the @aic-task-executor skill to execute it."**

---

## Task File Template

````markdown
# Task NNN: [Component Name]

> **Status:** Pending
> **Phase:** [from mvp-progress.md]
> **Layer:** [core | pipeline | storage | adapter | mcp | cli]
> **Depends on:** [list of components that must be Done]

## Goal

[One sentence: what this task produces and why.]

## Architecture Notes

- [2–3 bullets: which ADRs apply, layer rules, DI requirements]
- [Reference specific rules, e.g. "ADR-007: UUIDv7 for all IDs"]

## Files

| Action | Path                                      |
| ------ | ----------------------------------------- |
| Create | `exact/path/to/file.ts`                   |
| Create | `exact/path/to/file.test.ts`              |
| Modify | `exact/path/to/existing.ts` (what change) |

## Interface / Signature

```typescript
// Exact interface or function signature to implement
```

## Steps

Each step is one small action (2–5 minutes).

### Step 1: [action]

[What to do, with exact code if needed]

**Verify:** [how to verify this step worked — e.g. "lint passes", "test fails with X"]

### Step 2: [action]

...

### Step N: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass, zero warnings.

## Tests

| Test case | Description        |
| --------- | ------------------ |
| [name]    | [what it verifies] |
| [name]    | [edge case]        |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] Interface matches signature exactly
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` outside allowed files
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section to this file with:
   - What you tried
   - What went wrong
   - What decision you need from the user
3. Report to the user and wait for guidance
````

---

## Conventions

- One task file per component or tightly related group of components
- Completed task files are archived to `documentation/tasks/done/` (they serve as audit trail)
- Status values: `Pending`, `In Progress`, `Done`, `Blocked`
- Steps are small enough that any agent can follow without interpretation
- Exact file paths always — never "add a file somewhere"
- Exact code for interfaces and signatures — never "add appropriate validation"
- Reference ADRs and rules by number/name, not by restating them

## Guardrails

These rules prevent common planning mistakes. Follow them strictly.

### Size cap

If the Files table exceeds ~10 new files, **split into multiple tasks**. Each task should be completable in one focused session (~30 min of agent work). When the user asks for "everything" in a phase, produce a sequence of tasks (002, 003, 004...) rather than one mega-task.

### No prose signatures

Every class and function in the Files table **must** have an exact TypeScript code block in the Interface/Signature section showing the class declaration, constructor, and method signatures. Never describe a constructor or method in prose (e.g. "Constructor: `(config: BudgetConfig)`"). If you can't write the exact code, you don't understand the component well enough — go back to step 2 (Explore).

### Test parity

Every implementation file with non-trivial logic **must** have a corresponding `.test.ts` in the Files table. If the MVP test plan (`documentation/mvp-specification-phase0.md` §8a) specifies test cases for a step, those test cases must appear in the task's Tests table. A step that only verifies with `pnpm typecheck` (no test) is only acceptable for pure type/interface definitions.

### No ambiguity

Every file in the Files table is **mandatory**. Never mark a file as "optional" or say "may be added in this task or a follow-up." If you're unsure whether to include something, ask the user. The executor must never have to decide scope.
