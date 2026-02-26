# Task Planner

## Purpose

Produce a self-contained task file that any agent can pick up and execute without prior context. The task file lives in `documentation/tasks/` and contains everything needed: goal, file paths, signatures, steps, tests, and acceptance criteria.

**Announce at start:** "Using the task-planner skill."

## Cardinal Rule: Stop If Unsure

**If you do not know something with certainty, STOP and tell the user.** Never guess, assume, or improvise. This applies to:

- **Library APIs:** If you have not read the installed `.d.ts` files, you do not know the API. Do not write class names, import paths, or method signatures from memory. Read the actual type definitions first.
- **Template fit:** If the component does not match any recipe (adapter, storage, pipeline, composition root), do not improvise a task structure. Stop and tell the user: "This component type has no recipe. I need guidance."
- **TypeScript resolution:** If you propose changes to `package.json` exports, `tsconfig.json` paths, or module resolution, verify the change works. If you cannot verify, state the uncertainty.
- **Any exploration checklist item:** If a field in the Exploration Report cannot be filled with verified information, it is a **blocker**. Do not write "None" or skip it. Do not proceed to writing. Tell the user what you could not determine and why.

A confident-looking wrong plan is the worst possible output. An incomplete plan that says "I don't know X, here's what I need" is infinitely better. **Never trade correctness for completeness.**

## When to Use

- User says "plan next task", "what's next", or "create a task"
- Before any multi-file implementation work
- When the user picks a component from `documentation/mvp-progress.md`
- User says "review task NNN", "review tasks", or "review all tasks" — triggers the **Review** process (see §7)

## Inputs (read these every time)

1. `documentation/mvp-progress.md` — what is done, what is next
2. `documentation/project-plan.md` — architecture, ADRs, conventions
3. `documentation/mvp-specification-phase0.md` — detailed component specs
4. `documentation/security.md` — security constraints
5. `.cursor/rules/aic-architect.mdc` — active architectural rules
6. Existing source in `shared/src/` — current interfaces, types, patterns

## Process Overview

The process has **four phases**, each with a focused deliverable. Complete one phase fully before starting the next. Read reference files only when a phase requires them — not all at once.

| Phase      | Deliverable                          | User gate?                   |
| ---------- | ------------------------------------ | ---------------------------- |
| §1 Present | User picks a component               | Yes — wait for pick          |
| A. Explore | Exploration Report with evidence     | Yes — user reviews report    |
| B. Decide  | All decisions resolved, no ambiguity | Yes — user reviews decisions |
| C. Write   | Task file written                    | No — mechanical              |
| D. Verify  | Review score ≥ 75%                   | No — subagent                |

---

## §1. Present options

Read `mvp-progress.md`. List the next 3–5 components that are `Not started` and are unblocked (their dependencies are `Done`). Present them to the user with a one-line description each.

Ask: **"Which of these do you want to tackle next? Or tell me something else."**

Do NOT proceed until the user picks.

---

## Phase A: Explore

**Goal:** Gather every fact needed to write the task file. Produce a structured Exploration Report where every field cites its source file.

**Use parallel Read calls** — read all required files in a single message. This is faster than subagents and keeps context in one window for cross-referencing.

### A.1 Mandatory exploration checklist

Complete every item. Each produces evidence for the report.

1. **Read `shared/package.json`** — record dependencies and pinned versions.
2. **Read `eslint.config.mjs`** — record restricted-import rules for the target layer. If ESLint changes are needed, determine the exact structural change.
3. **Read every interface the component implements** — copy the full interface verbatim.
4. **Read every domain type the component reads or writes** — copy full type definitions verbatim. Never write "see task NNN."
5. **Read the target database schema** — if the component touches a table, read the migration file. Record exact columns.
6. **For adapters wrapping a library**: determine sync vs async from the interface return type.
7. **Check branded types** — for every parameter, verify the correct branded type from `core/types/`. Check factory function usage.
8. **Check existing files** — for every file the recipe pattern would create, check if it already EXISTS. Record each.
9. **Plan the step breakdown** — count methods, assign to steps (max 2 per step, max 1 file per step). Record the mapping.
10. **Verify every external library API by reading installed `.d.ts` files** — locate under `node_modules/`, read them, record exact class names, constructor signatures, method signatures, and import paths. If not installed, search the web. This applies to ALL layers.
11. **Check recipe fit** — determine which recipe applies: adapter, storage, pipeline, or composition root. Read `SKILL-recipes.md` for the matching recipe's requirements. If no recipe fits → **BLOCKER**.
12. **Verify module resolution** — if config changes are proposed, read the relevant `tsconfig.json` and record `moduleResolution`. If uncertain → state as blocker.

### A.2 Produce the Exploration Report

Every field must be filled. Every field with pasted code must include a `Source:` line citing the exact file path read. If you cannot cite a source, write **"NOT VERIFIED — BLOCKER"**.

```
EXPLORATION REPORT

LAYER: [adapter | storage | pipeline | core | mcp | cli]
RECIPE: [adapter | storage | pipeline | composition-root | NONE → BLOCKER]

EXISTING FILES (for every file the recipe pattern would create):
- [file path]: EXISTS / DOES NOT EXIST
  Source: verified via Glob/Read

DEPENDENCIES:
- [package]: [version] (already in package.json)
- [package]: NOT present (add at [exact version])
  Source: shared/package.json

ESLINT CHANGES:
- Current restrictions for [layer]: [summarize]
- Change needed: [exact config block to add/modify]
- Or: No ESLint changes needed ([explain why])
  Source: eslint.config.mjs

INTERFACES (paste verbatim — full code blocks with all imports):
  Source: [exact file path]
[full interface code block]

DEPENDENT TYPES (paste verbatim — full code blocks, NEVER "see task NNN"):
  Source: [exact file path for each type]
[full type definitions with all fields and imports]
Or: None — only primitive branded types used (list which: TokenCount, RelativePath, etc.)

SCHEMA (if storage, paste from migration):
  Source: [migration file path]
[exact CREATE TABLE]

CONSTRUCTOR:
- [param]: [Type] — [why needed]
- Not needed: [Clock | IdGenerator | etc.] — [why not]
- BRANDED CHECK: [param] uses [BrandedType] not raw string/number ✓

METHOD BEHAVIORS (one definitive sentence each — no "or"):
- [method]: [exact behavior]

SYNC/ASYNC (adapters only):
- Library API: [sync function name] / [async function name]
- Interface returns: [T] / [Promise<T>]
- Decision: use [sync | async] API

LIBRARY APIs (ALL layers — verified from installed .d.ts):
  Source: [node_modules path to .d.ts]
- [library]: import { [ClassName] } from "[exact/import/path]"
  - Constructor: new [ClassName]([exact params with types])
  - Methods used: [methodName]([params]): [returnType]
  CRITICAL: If you have not read the .d.ts, write "NOT VERIFIED — BLOCKER".

WIRING SPECIFICATION (composition roots only):
- Concrete classes instantiated:
  - [ClassName]([param]: [Type], ...) — Source: [source file path]
- Exported functions:
  - [functionName]([param]: [Type]): [ReturnType]

STEP PLAN (max 2 methods per step, max 1 file per step):
- Step N: [methodA], [methodB] — file: [single file path]

LAYER BLOCKERS:
- Storage needs node:fs/node:path? [YES → STOP | NO]
- Core/pipeline imports external package? [YES → STOP | NO]
- Adapter imports better-sqlite3 or zod? [YES → STOP | NO]
- Recipe fit? [adapter | storage | pipeline | composition-root | NONE → STOP]

LIBRARY API CALLS (exact function chain, no "or equivalent"):
- [step]: call [exact function]([args]) → [return type]

MODULE RESOLUTION (only if config changes proposed):
- tsconfig moduleResolution: [value]
- Proposed exports format: [with/without "types" condition]
- Verification: [how TypeScript resolves the proposed paths]

TEST STRATEGY (one sentence per test case):
- [test name]: Mock [X] to [throw/return Y], assert [Z]

DESIGN DECISIONS:
- [decision]: [chosen option] — [why]
```

If any field says "NOT VERIFIED — BLOCKER" or cannot be filled, **STOP and tell the user**. Do not proceed.

### A.3 User checkpoint

**Present the Exploration Report to the user.** Say:

> **Exploration Report complete.** [paste the full report above]
>
> **Review the report. Say "proceed" to move to decisions, or flag issues.**

**Wait for the user to say "proceed."** Do NOT continue to Phase B until they do.

### A.4 Exploration verification (subagent checkpoint)

After the user says "proceed", dispatch a **verification subagent** (`subagent_type="generalPurpose"`, model `fast`) to check the Exploration Report against the codebase. This catches errors in the report before they propagate into the task file.

Provide the subagent with:

- The full Exploration Report
- The raw file contents of every Source file cited in the report (re-read from disk — do NOT paste from your memory)

Subagent prompt:

```
You are checking an Exploration Report for accuracy. For each field, verify the
report's content against the raw source file provided.

EXPLORATION REPORT:
[paste report]

RAW SOURCE FILES (ground truth):
[paste each cited source file with its path]

CHECK EACH FIELD:
1. INTERFACES — Does the pasted code match the raw file exactly? Missing methods, wrong types?
2. DEPENDENT TYPES — All types referenced in interfaces/constructors pasted? Fields match source?
3. LIBRARY APIs — Import paths, class names, constructor params, method signatures match .d.ts?
4. ESLINT CHANGES — Does the analysis match the actual eslint.config.mjs structure?
5. DEPENDENCIES — Versions match actual package.json?
6. EXISTING FILES — Do the EXISTS/DOES NOT EXIST claims match reality?
7. WIRING SPECIFICATION (if present) — Constructor signatures match actual source files?
8. BRANDED CHECK — All domain-value params use branded types, not raw string/number?
9. MODULE RESOLUTION (if present) — tsconfig moduleResolution matches actual tsconfig?
10. Any BLOCKER fields that were missed?

Return:
- Per-field: PASS or FAIL with specific discrepancy
- List of fixes needed (empty if all pass)
```

**If the subagent finds issues:** Fix the Exploration Report, present the corrected version to the user, and re-run the subagent. Iterate until clean.

**If the subagent finds no issues:** Proceed to Phase B.

---

## Phase B: Decide

**Goal:** Resolve every design decision so Phase C is mechanical writing with zero choices.

Work through this checklist using the (now verified) Exploration Report. Every item must have a single definitive answer — no "or", "optionally", "depending on".

### B.1 Decision checklist

**Constructor parameters:** For each parameter, state WHY it's needed:

- Generates timestamps? → needs `Clock`
- Generates entity IDs? → needs `IdGenerator`
- Executes SQL? → needs `ExecutableDb`
- Reads/writes files? → check layer constraints (storage bans `node:fs`)

If unsure whether a parameter is needed, **ask the user**.

**Method behavior:** For each method, write ONE sentence describing exact behavior. If the sentence contains "or", "optionally", or "depending on" — you haven't decided. Pick one or **ask the user**.

**Interface design (if creating new):** Exactly ONE interface. Never alternatives.

**Config changes:** State exactly what changes. For dependencies: "[package] already at [version]; no change" or "add [package] at [version]". For ESLint: show the exact config block or "no change needed."

**Constructor branded types:** Cross-reference the BRANDED CHECK in the Exploration Report.

**Layer constraints (HARD GATE):** Read the LAYER BLOCKERS section. If any blocker is YES, **STOP and ask the user**.

**Test strategy:** For each error/edge test, decide the exact mocking approach. ONE sentence: "Mock [dependency] to [throw/return X], then assert [expected outcome]." Never "mock or skip."

**Library API calls:** State the exact function call chain for every external library used. Not "e.g. X or equivalent" — the precise calls.

**Wiring verification (composition roots):** Verify every constructor signature against actual source. If source has changed since Exploration Report, re-read and update.

**Module resolution (if config changes):** Verify tsconfig supports proposed exports format.

**Dispatch pattern:** If 3+ branches on enum/discriminator, choose `Record<Enum, Handler>` or handler array. Write the chosen pattern.

### B.2 User checkpoint

**Present the resolved decisions.** Say:

> **Decisions resolved:**
>
> - Constructor: [params and why]
> - Method behaviors: [one sentence each]
> - Config: [exact changes]
> - Test strategy: [summary]
> - [any other key decisions]
>
> **Review the decisions. Say "proceed" to write the task file, or flag issues.**

**Wait for the user to say "proceed."** Do NOT continue to Phase C until they do.

---

## Phase C: Write

**Goal:** Mechanically map the Exploration Report + resolved decisions into the task file template. No creative composition — if it's not in the report, don't add it; if it is, don't omit it.

### C.1 Read reference files

Before writing, read these reference files for the current task:

- **`SKILL-recipes.md`** — read the recipe matching the RECIPE field in the Exploration Report
- **`SKILL-guardrails.md`** — read all guardrails and apply them during writing

### C.2 Mapping table

Mechanically map the Exploration Report to the template:

| Report field                   | Template section                                  |
| ------------------------------ | ------------------------------------------------- |
| EXISTING FILES                 | Files table (only "Create" for DOES NOT EXIST)    |
| INTERFACES                     | Interface / Signature (first code block)          |
| CONSTRUCTOR + METHOD BEHAVIORS | Interface / Signature (second code block — class) |
| DEPENDENT TYPES                | Dependent Types (full code blocks, never refs)    |
| DEPENDENCIES + ESLINT CHANGES  | Config Changes                                    |
| DESIGN DECISIONS               | Architecture Notes                                |
| SYNC/ASYNC                     | Steps (implementation step must state this)       |
| LIBRARY API CALLS              | Steps (exact function calls in implementation)    |
| SCHEMA                         | Steps (SQL step references exact columns)         |
| STEP PLAN                      | Steps (method-to-step assignment)                 |
| TEST STRATEGY                  | Steps (test step specifies exact mocking)         |

### C.3 Write prohibitions (internalize before writing)

Violating any of these causes the Phase D review to reject and force a rewrite:

- Never write "if needed", "or optionally", "may be", "consider", "you could", "might want"
- Never reference another task file ("see Task 009")
- Never write "Create" in Files table for a file the Exploration Report marked EXISTS
- Never put 3+ methods in one step
- Never use raw `string`/`number` for domain-value constructor parameters

### C.4 Save the task file

Save to: `documentation/tasks/NNN-kebab-case-name.md`

NNN = zero-padded sequence number. Check existing files in `documentation/tasks/` for the next number.

Use the task file template below.

---

## Phase D: Verify

**Goal:** Independent review by a subagent with fresh context. Do NOT run checks yourself first — the subagent's fresh perspective catches issues your writing bias misses.

### D.1 Gather ground truth

**Re-read from disk** every interface file, type file, and library `.d.ts` the task references. Do NOT reuse what you remember — re-read the actual files. Paste the raw file contents into the subagent prompt.

### D.2 Dispatch review subagent

Launch `subagent_type="generalPurpose"` with this prompt:

```
You are reviewing a task file for quality. Perform ALL checks below, then score the rubric.
Be strict — if you see ANY issue in a dimension, score 0.

TASK FILE:
[paste the full task file content]

ACTUAL CODEBASE FILES (ground truth — raw file contents, NOT planner interpretations):
[For each interface: paste full file with path]
[For each type: paste full file with path]
[For each library .d.ts: paste relevant type definitions]
[For each concrete class instantiated: paste constructor signature from source]

EXISTING FILES IN CODEBASE:
[paste EXISTING FILES section — verified by Glob]

MECHANICAL CHECKS — run each, report pass/fail with evidence:

A. AMBIGUITY SCAN (two layers):
   Layer 1 — search for banned phrases (ANY match = fail):
   "if needed", "or optionally", "may be", "if not present", "you may", "or document",
   "if type is extended", "may be added", "decide whether", "you could", "consider",
   "might want", "or equivalent", "or similar", "or alternatively", "or skip",
   "or another", "or use", "mock or skip", "mock or conditional"
   Layer 2 — read every non-code sentence containing " or ".
   Does it present two alternative actions the executor must choose between? If yes = fail.
   Acceptable "or": conditional behavior, conjunctions ("zero errors or warnings").

B. SIGNATURE CROSS-CHECK: For each method in the class code block, verify against the
   interface — parameter names, types (including readonly), return types must match exactly.

C. DEPENDENT TYPES: If the component reads/writes/returns any domain type, are full type
   definitions pasted inline? (not "see task NNN", not empty)

D. STEP COUNT: Does any step implement 3+ methods or touch 2+ files?

E. CONFIG CHANGES: Contains "None" or exact diffs? No "if not present"?

F. FILES TABLE: Does any "Create" row target a file that already EXISTS?

G. SELF-CONTAINED: Does the file reference another task? ("see Task", "defined in task")

H. CONSTRUCTOR BRANDED TYPES: For each constructor param representing a domain value,
   is it a branded type? Raw string/number = fail.

I. VERIFY INSTRUCTIONS: Does each step's "Verify:" line reference something that exists
   or will exist by that step?

J. TEST TABLE ↔ STEP CROSS-CHECK: Every Tests table row appears in step instructions?
   Every test in a step appears in the table?

K. LIBRARY API ACCURACY: Cross-check class names, import paths, constructor signatures,
   method calls against provided .d.ts ground truth. If no .d.ts provided for a library = fail.

L. WIRING ACCURACY (composition roots only): Every `new ClassName(...)` call matches
   actual constructor signature from source.

RUBRIC — score each dimension 0 (fail) or 1 (pass):
1. Interface accuracy (check B)
2. Signature consistency (check B)
3. Dependent Types (check C)
4. Config Changes (check E)
5. No ambiguity (check A)
6. Step granularity (check D)
7. Branded types (check H)
8. Self-contained (check G)
9. Test coverage (check J)
10. Codebase sync (check F)
11. Library API accuracy (check K)
12. Wiring accuracy — composition roots only (check L)

Return:
- Mechanical checks: pass/fail for each (A–L) with evidence
- Per-dimension score (0/1/N/A) with one-line justification
- Total score (passed / applicable, as percentage and fraction)
- List of specific fixes needed
```

### D.3 Score and act

**≥ 90%:** Proceed to §6.

**75–89%:** Auto-apply the subagent's specific fixes inline. Self-verify each changed line resolves the violation. Proceed to §6 with the corrected score.

**< 75%:** Apply fixes, rewrite, re-run the subagent. Iterate until ≥ 75%.

---

## §6. Offer execution

After verification passes, say:

**"Task saved to `documentation/tasks/NNN-name.md`. Score: N/M (X%). Use the @aic-task-executor skill to execute it."**

---

## §7. Review existing tasks

Triggered when the user asks to review one or more task files.

**Scope:**

- "review task 008" → single task
- "review tasks" / "review all tasks" → all pending in `documentation/tasks/` (skip `done/`)

**Step 7a: Gather codebase state.** Run the Phase A checklist once for the full batch. Use parallel Read calls. Cache the results.

**Step 7b: Evaluate each task.** Dispatch review subagents (same Phase D prompt). Provide raw codebase files as ground truth. Up to 4 in parallel.

**Step 7c: Present findings.** For each task: score, guardrail violations table, specific fixes. For multiple tasks: summary table first.

**Step 7d: Rewrite.** Ask: **"Rewrite all, rewrite specific tasks (list numbers), or skip?"**

When rewriting:

- Read original, apply fixes, re-read relevant source files
- Write corrected task in place (same path, same NNN)
- Do not change scope unless a guardrail requires it
- **Original < 75%:** Always re-run review subagent. Iterate until ≥ 75%.
- **Original 75–89%, minor fixes:** Self-verify. Assign corrected score.
- **Original 75–89%, substantial changes:** Re-run review subagent.

After rewriting: **"Task NNN rewritten. Score: N/M (X%). [Summary of changes]."**

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
- [Record key design decisions from Phase B]

## Files

| Action | Path                                      |
| ------ | ----------------------------------------- |
| Create | `exact/path/to/file.ts`                   |
| Create | `exact/path/to/__tests__/file.test.ts`    |
| Modify | `exact/path/to/existing.ts` (what change) |

## Interface / Signature

```typescript
// Interface copied verbatim from core (with imports)
```

```typescript
// Class declaration, constructor with all parameters, every method signature
// Return types MUST match interface
```

## Dependent Types

```typescript
// Full type definition with all fields and imports
```

## Config Changes

- **package.json:** [exact change or "no change"]
- **eslint.config.mjs:** [exact config block or "no change"]

## Steps

### Step 1: [action]

[What to do, with exact code if needed]

**Verify:** [actionable verification]

### Step N: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass, zero warnings.

## Tests

| Test case | Description        |
| --------- | ------------------ |
| [name]    | [what it verifies] |

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
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance
````

---

## Conventions

- One task file per component or tightly related group
- Completed tasks archived to `documentation/tasks/done/`
- Status values: `Pending`, `In Progress`, `Done`, `Blocked`
- Steps are small enough that any agent can follow without interpretation
- Exact file paths always — never "add a file somewhere"
- Exact code for interfaces and signatures — never "add appropriate validation"
- Tests in `__tests__/` directories co-located with source
- Reference ADRs by number/name, not by restating them
- When modifying `package.json`: always write `shared/package.json` to disambiguate
- Never reference another task file — every task is self-contained
- Never list "Create" for a file that already exists
- For detailed recipe patterns, read `SKILL-recipes.md`
- For all guardrails to apply during writing, read `SKILL-guardrails.md`
