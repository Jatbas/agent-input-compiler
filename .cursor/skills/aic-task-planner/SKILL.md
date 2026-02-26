# Task Planner

## Purpose

Produce a self-contained task file that any agent can pick up and execute without prior context. The task file lives in `documentation/tasks/` and contains everything needed: goal, file paths, signatures, steps, tests, and acceptance criteria.

**Announce at start:** "Using the task-planner skill."

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

## Process

### 1. Present options

Read `mvp-progress.md`. List the next 3–5 components that are `Not started` and are unblocked (their dependencies are `Done`). Present them to the user with a one-line description each.

Ask: **"Which of these do you want to tackle next? Or tell me something else."**

Do NOT proceed until the user picks.

### 2. Explore and produce Exploration Report

Once the user picks, gather context thoroughly before writing anything.

**Use parallel Read calls for exploration (not subagents):**

Read all required files using parallel Read tool calls in a single message. For example, read `shared/package.json`, `eslint.config.mjs`, the target interface file, and the relevant spec section all at once. This is faster than subagents (no spin-up cost) and keeps all context in one window for cross-referencing during the decision phase.

**Mandatory exploration checklist — complete every item:**

1. **Read `shared/package.json`** — record which dependencies already exist and their pinned versions.
2. **Read `eslint.config.mjs`** — record the current restricted-import rules for the target layer. If ESLint changes are needed, determine the exact structural change (which config block, which array, what entry).
3. **Read every interface the component implements** — copy the full interface with all method signatures, parameter types, and return types verbatim.
4. **Read every domain type the component reads or writes** — e.g. `CachedCompilation`, `TelemetryEvent`, `GuardFinding`. Copy their full type definitions (all fields) verbatim. Paste the actual code — never write "see task NNN" or "see documentation."
5. **Read the target database schema** — if the component touches a table, read the migration file that creates it. Record exact column names, types, and constraints. Cross-check against the type definitions.
6. **For adapters wrapping a library**: determine whether the library's API is sync or async. Check the interface return type: `T` means use the sync API, `Promise<T>` means use the async API.
7. **Check branded types** — for every parameter in the interface AND every constructor parameter that represents a domain value (path, token count, timestamp, ID, score), verify the correct branded type from `core/types/`. Also check: if the class constructs branded values (e.g. setting `this.extensions`), it must use factory functions (`toFileExtension(...)`, `toTokenCount(...)`) — never raw literals or `as const` on raw strings.
8. **Check existing files** — for every file the recipe pattern would create (interface, adapter/store, test, config), check if that file already exists in the codebase. Record each as `EXISTS` or `DOES NOT EXIST`. If the interface already exists, the Files table must NOT list it as "Create."
9. **Plan the step breakdown** — count the number of methods in the class. Assign methods to steps (max 2 per step). Record the mapping: "Step N: methodA, methodB." This prevents oversized steps during writing.

**After completing the checklist, produce an Exploration Report.** This is a structured working document (not shown to the user) that maps 1:1 to template sections. Every field must be filled — empty fields mean the exploration is incomplete.

```
EXPLORATION REPORT

LAYER: [adapter | storage | pipeline | core | mcp | cli]

EXISTING FILES (for every file the recipe pattern would create):
- [file path]: EXISTS / DOES NOT EXIST

DEPENDENCIES:
- [package]: [version] (already in package.json)
- [package]: NOT present (add at [exact version])
- Or: No new dependencies needed

ESLINT CHANGES:
- Current restrictions for [layer]: [summarize what's restricted]
- Change needed: [exact config block to add/modify]
- Or: No ESLint changes needed ([explain why])

INTERFACES (paste verbatim from core — full code blocks, not summaries):
[full interface code block with all imports]

DEPENDENT TYPES (paste verbatim from core/types — full code blocks, NEVER "see task NNN"):
[full type definitions with all fields and imports]
Or: None — only primitive branded types used (list which: TokenCount, RelativePath, etc.)

SCHEMA (if storage, paste from migration):
[exact CREATE TABLE with column names, types, constraints]

CONSTRUCTOR:
- [param]: [Type] — [why needed: "generates timestamps" / "receives open database"]
- [param]: [Type] — [why needed]
- Not needed: [Clock | IdGenerator | etc.] — [why not: "timestamps come from input data"]
- BRANDED CHECK: [param] uses [BrandedType] not raw string/number ✓

METHOD BEHAVIORS (one definitive sentence each):
- [method]: [exact behavior, no "or"/"optionally"]

SYNC/ASYNC (adapters only):
- Library API: [sync function name] / [async function name]
- Interface returns: [T] / [Promise<T>]
- Decision: use [sync | async] API

STEP PLAN (max 2 methods per step):
- Step N: [methodA], [methodB]
- Step N+1: [methodC]

LAYER BLOCKERS (check before proceeding):
- Storage needs node:fs/node:path? [YES → STOP, ask user | NO]
- Core/pipeline imports external package? [YES → STOP | NO]
- Adapter imports better-sqlite3 or zod? [YES → STOP | NO]

LIBRARY API CALLS (adapters only — exact function chain, no "or equivalent"):
- [step]: call [exact function]([args]) → [return type]

TEST STRATEGY (one sentence per error/edge test case):
- [test name]: Mock [X] to [throw/return Y], assert [Z]

DESIGN DECISIONS (record every choice made):
- [decision]: [chosen option] — [why]
```

If any field cannot be filled, you have a **blocker**. Stop and ask the user. Do not proceed to §3.

### 3. Resolve all decisions

Before writing, go through this decision checklist using the Exploration Report. Every item must have a single definitive answer — no "or", "optionally", "depending on", "if needed".

**Constructor parameters:**

For each parameter in the constructor, state WHY it's needed:

- Does the implementation generate timestamps? → needs `Clock`
- Does it generate entity IDs? → needs `IdGenerator`
- Does it execute SQL? → needs `ExecutableDb`
- Does it read/write files? → check layer constraints (storage bans `node:fs`)

If you're unsure whether a parameter is needed, **ask the user**. Never write "inject X if you need it."

**Method behavior:**

For each method, write ONE sentence describing the exact behavior. Test: does the sentence contain "or", "optionally", or "depending on"? If yes, you haven't decided. Either pick one behavior or **ask the user**.

**Interface design (if creating a new interface):**

Write exactly ONE interface. Never show alternatives. If you considered multiple designs, pick the one that best fits the spec and layer constraints. If you genuinely can't pick, **ask the user** — but show your reasoning.

**Config changes:**

State exactly what changes. For dependencies: "[package] already at [version]; no change" or "add [package] at [version]". For ESLint: show the exact config block or "no change needed." Never "add X if not present."

**Constructor branded types:**

Check every constructor parameter. If a parameter represents a file path, use `AbsolutePath` — never raw `string`. If it represents a cache key, timestamp, or ID, use the matching branded type. Cross-reference the BRANDED CHECK line in the Exploration Report.

**Layer constraints (HARD GATE — do not skip):**

Read the LAYER BLOCKERS section of the Exploration Report. If any blocker is YES, **STOP and ask the user**. Do not write a task file with a known layer violation. Common blockers:

- **Storage needs `node:fs`/`node:path`?** — File I/O in storage is banned. Present options: (a) store in DB column, (b) create an adapter behind an interface, (c) ESLint exception. Wait for user decision.
- **Core/pipeline imports external package?** — Banned. Must use an interface.
- **Adapter imports `better-sqlite3`/`zod`?** — Banned. SQL lives in storage; validation at boundaries.

**Test strategy:**

For each test case that tests error/failure behavior, decide the exact mocking approach. Write ONE sentence: "Mock [dependency] to [throw/return X], then assert [expected outcome]." Never write "mock or skip" or "mock or conditional test." If the component's error path depends on an environment condition (e.g. native module unavailable), decide: either (a) mock the dependency to simulate failure, or (b) use a deterministic setup that forces the error. Pick one.

**Library API calls (adapters only):**

State the exact function call chain the adapter uses. Not "e.g. X or equivalent" — write the precise calls: "Call `encoding_for_model("gpt-4")` to get the encoder. Call `encoder.encode(text).length` to count tokens." The executor must not look up API docs.

**Verify instructions:**

For each step's Verify line, confirm the verification is actionable against the current codebase. If verification says "file X that imports Y fails lint" but file X doesn't exist, rewrite to: "Run `pnpm lint` — passes with zero errors."

**Final " or " sweep — all task text:**

Before proceeding to §4, mentally scan every sentence you plan to write — Steps, Tests table descriptions, Architecture Notes, parenthetical qualifiers, implementation notes below code blocks. For each sentence containing " or ", ask: does the executor have to choose between two actions? If yes, resolve it now. Common traps:

- Test descriptions: "same order or stable sort" → pick one: "identical output order across calls"
- Parenthetical qualifiers: "(sync or async)" → the decision was made in §3, write only the chosen one
- Implementation notes: "use X or Y API" → write the exact function name

This sweep catches ambiguity that slips past the method-behavior and test-strategy checks above because those checks focus on the Exploration Report, not on prose you compose during writing.

**After this step, every field in the Exploration Report must have a single answer with no hedging.** If it doesn't, go back and resolve.

### 4. Write the task file

Save to: `documentation/tasks/NNN-kebab-case-name.md`

NNN = zero-padded sequence number (001, 002, ...). Check existing files in `documentation/tasks/` for the next number.

**Before writing, internalize these prohibitions.** Violating any of these means the verification step will reject the task and force a rewrite — so get it right on the first pass:

- Never write "if needed", "or optionally", "may be", "consider", "you could", "might want", "decide whether". Every sentence is a single definitive instruction.
- Never reference another task file ("see Task 009"). Every task is self-contained.
- Never write "Create" in the Files table for a file that the Exploration Report marked as EXISTS.
- Never put 3+ methods in one step. Use the STEP PLAN from the Exploration Report.
- Never use raw `string`/`number` for a constructor parameter that represents a domain value. Check the BRANDED CHECK.

**Mechanically map the Exploration Report to the template:**

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

Do not add information that isn't in the Exploration Report. Do not omit information that is. The writing step is **mechanical copying**, not creative composition.

### 5. Verify via independent review (subagent)

After writing the task file, dispatch a **review subagent** with clean context. The subagent performs ALL verification — both mechanical checks and quality scoring — in a single pass. This is faster than running checks sequentially and eliminates confirmation bias from the writing agent.

Do NOT run the checks yourself first. The subagent's fresh perspective catches issues (like subtle ambiguity) that the writing agent's bias causes it to miss.

Launch `subagent_type="generalPurpose"` with this prompt structure:

```
You are reviewing a task file for quality. Perform ALL checks below, then score the 10-point rubric.
Be strict — if you see ANY issue in a dimension, score 0.

TASK FILE:
[paste the full task file content]

ACTUAL CODEBASE INTERFACES (ground truth):
[paste the interface code blocks from the Exploration Report]

ACTUAL CODEBASE TYPES (ground truth):
[paste the dependent type definitions from the Exploration Report]

EXISTING FILES IN CODEBASE:
[paste the EXISTING FILES section from the Exploration Report]

MECHANICAL CHECKS — run each, report pass/fail with evidence:

A. AMBIGUITY SCAN (two layers):
   Layer 1 — search for these literal banned phrases (ANY match = fail):
   "if needed", "or optionally", "may be", "if not present", "you may", "or document",
   "if type is extended", "may be added", "decide whether", "you could", "consider", "might want",
   "or equivalent", "or similar", "or alternatively", "or skip", "or another", "or use",
   "mock or skip", "mock or conditional"
   Layer 2 — read every non-code sentence in the ENTIRE task file containing " or ".
   This includes Steps, Tests table descriptions, Architecture Notes, parenthetical qualifiers,
   and implementation notes below code blocks. Does it present two alternative actions
   the executor must choose between? If yes = fail.
   Acceptable "or": conditional behavior ("if X, fall back to Y"), conjunctions ("zero errors or warnings").
   NOT acceptable: "use X or equivalent", "mock or skip", "sync or async API",
   "same order or stable sort", "X or Y API".

B. SIGNATURE CROSS-CHECK: For each method in the class code block, verify against
   the interface code block — parameter names, types (including readonly), return types must match exactly.

C. DEPENDENT TYPES: If the component reads/writes/returns any domain type, are full
   type definitions pasted inline? (not "see task NNN", not empty)

D. STEP COUNT: Does any step implement 3+ methods or touch 2+ files?

E. CONFIG CHANGES: Contains "None" or exact diffs? No "if not present"?

F. FILES TABLE: Does any "Create" row target a file that already EXISTS in the codebase?

G. SELF-CONTAINED: Does the file reference another task? ("see Task", "defined in task")

H. CONSTRUCTOR BRANDED TYPES: For each constructor param representing a domain value
   (path, timestamp, ID, score), is it a branded type? Raw string/number = fail.

I. VERIFY INSTRUCTIONS: Does each step's "Verify:" line reference something that exists
   or will exist by that step?

J. TEST TABLE ↔ STEP CROSS-CHECK: For each row in the Tests table, does the corresponding
   test step mention that test case by name or describe its assertion? A test case in the
   table but absent from step instructions = fail. A test described in a step but missing
   from the table = fail.

RUBRIC — score each dimension 0 (fail) or 1 (pass):
1. Interface accuracy: Interface code block matches actual codebase interface verbatim (imports, params, types, readonly, returns). If interface is new (doesn't exist yet), check it uses correct branded types and imports.
2. Signature consistency: Class signature matches interface exactly (names, types, readonly, returns). Cross-reference check B.
3. Dependent Types: Full type definitions pasted inline. Cross-reference check C.
4. Config Changes: Exact versions verified against package.json. Exact ESLint blocks. Cross-reference check E.
5. No ambiguity: Zero banned phrases found AND zero executor-facing choices. Cross-reference check A (both layers).
6. Step granularity: Every step ≤ 2 methods, 1 file. Cross-reference check D.
7. Branded types: All domain values use correct branded types. Cross-reference check H.
8. Self-contained: No cross-task references. Cross-reference check G.
9. Test coverage: Tests for happy path, edge cases (empty input, null, zero), and error paths. Every Tests table row appears in the test step instructions. Cross-reference check J.
10. Codebase sync: Files table reflects actual codebase state. Cross-reference check F.

Return:
- Mechanical checks: pass/fail for each (A through J) with evidence
- Per-dimension score (0 or 1) with one-line justification
- Total score (0-10)
- List of specific fixes needed (empty if score = 10)
```

The subagent returns a score and a list of fixes. **Do not override the subagent's score** — if it finds an issue you missed, that is the point.

**If score = 10:** Proceed to §6.

**If score 8–9:** Auto-apply the subagent's specific fixes inline (reword the ambiguous sentence, add the missing test case, fix the version number). Then self-verify: re-read each changed line and confirm the specific violation is resolved. No re-review subagent needed — these are minor fixes. Proceed to §6 with the corrected score.

**If score < 8:** Apply the subagent's fixes, re-write the task file, and re-run the subagent review. Iterate until score ≥ 8.

### 6. Offer execution

After verification passes (score 10, or score 8–9 with auto-fix applied), say:

**"Task saved to `documentation/tasks/NNN-name.md`. Score: N/10. Use the @aic-task-executor skill to execute it."**

### 7. Review existing tasks

Triggered when the user asks to review one or more task files. This process re-evaluates tasks against the current codebase and all guardrails, then rewrites any that have issues.

**Scope:**

- "review task 008" → review a single task file
- "review tasks" / "review all tasks" → review all pending tasks in `documentation/tasks/` (skip files in `documentation/tasks/done/`)

**Step 7a: Gather current codebase state**

Run the **mandatory exploration checklist** (from §2) once for the full batch. This gives you the ground truth to evaluate every task against:

- Current `shared/package.json` dependencies and versions
- Current `eslint.config.mjs` restricted-import rules
- All core interfaces (full signatures)
- All domain types (full field definitions)
- Database schema from migration files
- Branded types available in `core/types/`

Use parallel Read tool calls to gather this. Cache the results — you do not re-explore per task.

**Step 7b: Evaluate each task via review subagent**

For each task file, dispatch a **review subagent** (`subagent_type="generalPurpose"`) with clean context — the same unified prompt from §5. Provide:

- The full task file content
- The actual codebase interfaces (from step 7a)
- The actual codebase types (from step 7a)
- The existing files list (from step 7a)
- The full prompt (mechanical checks A-J + 10-point rubric)

The subagent evaluates the task against every guardrail and the rubric, returning mechanical check results, per-dimension score, total score, and list of specific fixes.

When reviewing multiple tasks, launch up to 4 review subagents in parallel for throughput.

**Step 7c: Present findings**

Collect the subagent results. For each task, present:

1. A **score** (0–10) from the subagent with per-dimension breakdown
2. A **table of guardrail violations** (guardrail name + what's wrong)
3. A **list of specific fixes** needed

If reviewing multiple tasks, present a summary table first (task number, score, one-line summary), then detail per task.

**Step 7d: Rewrite**

After presenting findings, ask: **"Rewrite all, rewrite specific tasks (list numbers), or skip?"**

When rewriting:

- Read the original task file
- Apply every fix from step 7c
- Run the exploration checklist items that are relevant to the fixes (e.g. if a dependent type was missing, read the actual type file now)
- Write the corrected task file **in place** (same path, same NNN number)
- Do **not** change the task's scope or add/remove files unless a guardrail violation requires it (e.g. missing test file per test-parity rule)
- After rewriting, re-check the corrected file against guardrails to confirm all violations are resolved

After rewriting, re-score the task. **Every rewrite must produce a new score — never present a rewritten task without one.**

- **Original score < 8:** ALWAYS dispatch the review subagent again (same prompt from §5). The minor/substantial distinction does not apply — a score this low means the task had structural issues that require independent verification. Iterate until score ≥ 8.
- **Original score 8–9, minor fixes only** (rewording a sentence, fixing a version number, removing a banned phrase): self-verify that the specific violations are resolved by re-reading the changed lines. Assign the corrected score (original score + fixed dimensions). No subagent needed.
- **Original score 8–9, substantial changes** (changed signatures, restructured steps, added/removed files, new type definitions): dispatch the full review subagent again (same prompt from §5).

After rewriting, say: **"Task NNN rewritten. Score: N/10. [Summary of changes]."** The score is mandatory — if you cannot determine a score, dispatch the review subagent.

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
- [Record key design decisions from §3, e.g. "Replace semantics, not append"]

## Files

| Action | Path                                      |
| ------ | ----------------------------------------- |
| Create | `exact/path/to/file.ts`                   |
| Create | `exact/path/to/__tests__/file.test.ts`    |
| Modify | `exact/path/to/existing.ts` (what change) |

## Interface / Signature

REQUIRED. Two code blocks: (1) interface copied verbatim from core, (2) class with constructor and all method signatures. Return types must match interface exactly.

```typescript
// Interface copied verbatim from core (with imports)
```

```typescript
// Class declaration, constructor with all parameters, and every method signature
// Return types MUST match interface (including readonly modifiers)
```

## Dependent Types

REQUIRED if the component reads, writes, or returns any domain type. Paste full type definitions with all fields. If the component only uses primitive branded types (e.g. `TokenCount`), this section may say "None — only primitive branded types used."

```typescript
// Full type definition with all fields and imports
```

## Config Changes

REQUIRED. State "None" or show exact diffs. Never "add X if not present."

- **package.json:** [package] already at [version]; no change. Or: add [package] at [version].
- **eslint.config.mjs:** [exact config block to add]. Or: No change needed.

## Steps

Each step is one small action (2–5 minutes). Max 2 methods per step.

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

## Recipes

Concrete patterns for common task types. Follow the matching recipe when the component fits.

### Adapter recipe (wrapping an external library)

**Files pattern:**

| Action | Path                                                                              |
| ------ | --------------------------------------------------------------------------------- |
| Create | `shared/src/core/interfaces/[name].interface.ts` (if interface doesn't exist yet) |
| Create | `shared/src/adapters/[library]-adapter.ts`                                        |
| Create | `shared/src/adapters/__tests__/[library]-adapter.test.ts`                         |
| Modify | `eslint.config.mjs` (add per-file restriction — see below)                        |

**Constructor:** Typically `constructor()` with no infrastructure dependencies. Exception: if the adapter needs to generate timestamps or IDs, inject `Clock` or `IdGenerator`.

**ESLint per-library restriction:** Add this config block AFTER the general adapter boundary block and BEFORE the system-clock exemption.

**CRITICAL — flat config override semantics:** In ESLint flat config, when two blocks match the same file, the LAST block's rule value **replaces** the earlier one — it does NOT merge. A standalone block with only the new library path would DROP the adapter boundary's existing restrictions (better-sqlite3, zod, `BAN_RELATIVE_PARENT`, patterns) for all non-exempt adapter files. To prevent this, the per-library block must include ALL paths and patterns from the adapter boundary block PLUS the new library entry. Read `eslint.config.mjs`, find the adapter boundary block's `no-restricted-imports` paths and patterns arrays, and copy them into the new block:

```javascript
{
  files: ["shared/src/adapters/**/*.ts"],
  ignores: ["shared/src/adapters/[library]-adapter.ts"],
  rules: {
    "no-restricted-imports": ["error", {
      paths: [
        // All existing adapter boundary paths (copy from adapter boundary block)
        ...existingAdapterBoundaryPaths,
        // New library restriction
        {
          name: "[library-package]",
          message: "Only [library]-adapter.ts may import [library-package]."
        },
      ],
      patterns: [
        // All existing adapter boundary patterns (copy from adapter boundary block)
        ...existingAdapterBoundaryPatterns,
      ],
    }],
  },
},
```

During exploration (§2), record the exact adapter boundary paths and patterns so the Config Changes section contains the complete merged block — not just the new library entry.

**Sync/async:** Check the interface return type. If it returns `T` (not `Promise<T>`), state in the implementation step: "Use [library]'s sync API (`[function-name]`)." If `Promise<T>`, use the async API.

**Config Changes pattern:**

- Dependencies: check `shared/package.json`. State "already at [version]" or "add at [version]."
- ESLint: show the exact config block above with the library name filled in.

### Storage recipe (implementing a core store interface)

**Files pattern:**

| Action | Path                                                       |
| ------ | ---------------------------------------------------------- |
| Create | `shared/src/storage/sqlite-[name]-store.ts`                |
| Create | `shared/src/storage/__tests__/sqlite-[name]-store.test.ts` |

**Constructor:** Always starts with `db: ExecutableDb`. Add other params based on the decision checklist:

- Generates timestamps → add `clock: Clock`
- Generates entity IDs → add `idGenerator: IdGenerator`
- All timestamps come from input data → no Clock needed

**Layer constraint — NO file I/O:** The storage layer ESLint bans `node:fs`, `fs`, `node:path`, `path`. If the design requires reading/writing files, this is a **blocker** — stop and ask the user. Options: (a) store data in DB columns instead of files, (b) create a separate adapter behind an interface and inject it, (c) request an ESLint exception.

**SQL column mapping:** In the Steps section, show the exact mapping between type fields and table columns:

```
Type field → Column:
- event.id (UUIDv7) → id (TEXT PK)
- event.timestamp (ISOTimestamp) → created_at (TEXT)
- event.cacheHit (boolean) → cache_hit (INTEGER, 0/1)
```

**Test pattern:** Use in-memory SQLite (`":memory:"`) and run the migration before each test. Mock `Clock` and `IdGenerator` with deterministic implementations.

**Edge test checklist for storage:** Beyond happy-path tests, always include:

- **Computed columns:** If any SQL computes a derived value (e.g. `ROUND(...)`, percentage, ratio), add a test where the denominator is zero or the inputs are zero. Verify the store handles it without division-by-zero or NaN.
- **Idempotency / upsert:** If the schema uses `INSERT OR REPLACE`, `ON CONFLICT`, or similar, add a test that writes the same primary key twice and verifies the expected semantics (replace vs reject vs no-op).
- **Empty result sets:** Add a test that queries before any data is inserted and verifies the return value (empty array, null, or zero — whichever the interface specifies).

---

## Conventions

- One task file per component or tightly related group of components
- Completed task files are archived to `documentation/tasks/done/` (they serve as audit trail)
- Status values: `Pending`, `In Progress`, `Done`, `Blocked`
- Steps are small enough that any agent can follow without interpretation
- Exact file paths always — never "add a file somewhere"
- Exact code for interfaces and signatures — never "add appropriate validation"
- Tests live in `__tests__/` directories co-located with the source they test (e.g. `shared/src/pipeline/__tests__/intent-classifier.test.ts`). Never place `.test.ts` files next to source files.
- Reference ADRs and rules by number/name, not by restating them
- When modifying `eslint.config.mjs`: specify which config block to change, the exact rule name/path, and the entry to add. Use the adapter recipe ESLint snippet as a starting point.
- When modifying `package.json`: always write `shared/package.json` (never just `package.json`) to disambiguate in the monorepo. State the exact package name and pinned version. If already present, say so and skip the step.
- For adapters wrapping libraries: explicitly state sync vs async API usage in the implementation step
- Never reference another task file for type definitions, context, or decisions. Every task is self-contained — an agent executes it with only the task file and the codebase. If two tasks share types, paste the types in both.
- Never list "Create" in the Files table for a file that already exists. Check first — interfaces from Phase B already exist.

## Guardrails

These rules prevent common planning mistakes. Follow them strictly. The §5 Verify step enforces these automatically — but apply them during writing too so the first pass is clean.

### Size cap

If the Files table exceeds ~10 new files, **split into multiple tasks**. Each task should be completable in one focused session (~30 min of agent work). When the user asks for "everything" in a phase, produce a sequence of tasks (002, 003, 004...) rather than one mega-task.

### No prose signatures

Every class and function in the Files table **must** have an exact TypeScript code block in the Interface/Signature section showing the class declaration, constructor, and method signatures. Never describe a constructor or method in prose (e.g. "Constructor: `(config: BudgetConfig)`"). If you can't write the exact code, you don't understand the component well enough — go back to step 2 (Explore).

### Test parity

Every implementation file with non-trivial logic **must** have a corresponding `.test.ts` in the Files table. If the MVP test plan (`documentation/mvp-specification-phase0.md` §8a) specifies test cases for a step, those test cases must appear in the task's Tests table. A step that only verifies with `pnpm typecheck` (no test) is only acceptable for pure type/interface definitions.

### No ambiguity

Every file in the Files table is **mandatory**. Never mark a file as "optional" or say "may be added in this task or a follow-up." If you're unsure whether to include something, ask the user. The executor must never have to decide scope.

This extends to **all instructions**, not just the Files table:

- **No hedging language.** Ban: "if needed", "or optionally", "may be added", "if type is extended", "you may use X or Y", "or document behaviour". Every instruction must be a single definitive action.
- **No design decisions for the executor.** If a step says "decide whether to replace or append" or "inject X if you need it", the planner hasn't finished designing. Go back to step 2, resolve the question (or ask the user), and write one clear instruction.
- **No "if not present" for known state.** After the exploration checklist, you know whether a dependency exists and at what version. Write "already at 1.0.21" or "add at 1.0.21" — never "add if not present."

### Single definition

Never show alternative interfaces or "Option A / Option B" in the Interface/Signature section. The task file must contain exactly **one** interface definition and exactly **one** class signature. If you're unsure which design is better, ask the user before writing the task file. Showing multiple options means the planner hasn't made a decision.

### Signature consistency

The interface and the implementing class must use **identical** parameter types and return types. After writing both code blocks, cross-check:

- Every parameter name and type matches (including `readonly` modifiers).
- Return types match exactly (e.g. `readonly RelativePath[]` in interface must also be `readonly RelativePath[]` in class, not `RelativePath[]`).
- If the interface method has parameters, the class method must list the same parameters — even if the implementation ignores them.

### Branded type check

Every parameter that represents a domain value must use the correct branded type. Before writing signatures, check `core/types/` for:

- Paths → `AbsolutePath`, `RelativePath`, `FilePath` (never raw `string`)
- Tokens → `TokenCount` (never raw `number`)
- Timestamps → `ISOTimestamp` (never raw `string`)
- IDs → `UUIDv7`, `SessionId`, `RepoId` (never raw `string`)
- Scores → `Percentage`, `Confidence`, `RelevanceScore` (never raw `number`)

If the existing core interface uses `string` for a parameter that should be branded, note this as a potential issue and ask the user — do not silently propagate the mismatch.

### Step size limit

No single step should implement more than **2 methods** or modify more than **1 file**. If a class has 4 methods, split implementation across 2+ steps (e.g. "Step 2: Implement parseImports", "Step 3: Implement extractSignaturesWithDocs and extractSignaturesOnly", "Step 4: Implement extractNames"). Large steps cause agents to rush and miss edge cases.

### Test table ↔ step instructions

Every test case listed in the Tests table must appear in the test step's instructions. After writing both sections, cross-check: scan each Tests table row and confirm the corresponding step mentions it by name or describes the exact assertion. If a test case exists in the table but no step tells the executor to write it, the executor will skip it. Conversely, if a step mentions a test not in the table, add it to the table.

### Sync vs async for adapters

When a task wraps an external library, the step that implements the adapter must state whether to use the library's **sync** or **async** API. The interface return type determines this: if the interface returns `T`, the adapter must use the sync API; if `Promise<T>`, the async API. Never leave this implicit.
