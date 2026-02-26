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

## Simplicity Principle: Simplest Correct Path First

**The default is the simplest solution that is correct. Complexity must be justified.**

The planner's natural bias is toward comprehensiveness — more types, more files, more abstractions. Recipes reinforce this by mechanically generating artifacts. The result: plans that are technically correct but unnecessarily complex.

**Rules:**

- **Prefer extending over creating.** Before proposing a new interface, type, or file, check if an existing one can gain a method or field. Adding a method to an existing interface is simpler than creating a new interface + adapter + test file.
- **Prefer fewer files.** If a change can live in an existing file without making it unwieldy, put it there. A new file is a new import, a new mental context switch, and a new thing to maintain.
- **Prefer no abstraction over premature abstraction.** A branded type used in exactly one place, a utility function called once, an interface with one implementor that will never have a second — these are indirection, not abstraction. Inline until a second use case appears.
- **Prefer direct flow over transformation layers.** If data already has the right shape, pass it through. Don't create intermediate types or mapping functions unless the shapes genuinely differ.

**The simplicity test:** For every new file, new type, or new interface in the plan, ask: _"What happens if I don't create this and instead use what already exists?"_ If the answer is "nothing breaks, and the code is still clear" — don't create it.

## When to Use

- User says "plan next task", "what's next", or "create a task"
- Before any multi-file implementation work
- When the user picks a component from `documentation/mvp-progress.md` — still run §1 ranking to validate the pick
- User says "review task NNN", "review tasks", or "review all tasks" — triggers the **Review** process (see §7)

## Inputs (read these every time)

1. `documentation/mvp-progress.md` — what is done, what is next
2. `documentation/project-plan.md` — architecture, ADRs, conventions
3. `documentation/mvp-specification-phase0.md` — detailed component specs
4. `documentation/security.md` — security constraints
5. `.cursor/rules/aic-architect.mdc` — active architectural rules
6. Existing source in `shared/src/` — current interfaces, types, patterns

## Process Overview

The process has **two passes** plus a presentation step. Each pass produces a concrete deliverable. One user gate between passes keeps oversight without unnecessary round-trips.

| Step       | Deliverable                                             | User gate?          |
| ---------- | ------------------------------------------------------- | ------------------- |
| §1 Present | User picks a component                                  | Yes — wait for pick |
| Pass 1     | Exploration Report + all decisions resolved             | Yes — user reviews  |
| Pass 2     | Task file written + mechanically verified (score ≥ 75%) | No — self-check     |

---

## §1. Recommend the best next task

**Pre-read all inputs in one parallel batch** — these are needed in Pass 1 regardless of which component the user picks, and pre-reading eliminates a full round of tool calls later:

- `documentation/mvp-progress.md`
- `documentation/project-plan.md`
- `documentation/mvp-specification-phase0.md`
- `documentation/security.md`
- `.cursor/rules/aic-architect.mdc`
- `shared/package.json`
- `eslint.config.mjs`
- `SKILL-recipes.md` (this file's sibling — static reference)
- `SKILL-guardrails.md` (this file's sibling — static reference)

From `mvp-progress.md`, identify all components with status `Not started` whose dependencies are `Done`.

**Rank** the unblocked components using these criteria (in priority order):

1. **Pattern-setter:** Is this the first component of its kind in the current phase? The first CLI command, first adapter, first storage class, etc. establishes the conventions that all subsequent siblings will follow. Pattern-setters always rank highest.
2. **Implicit prerequisites:** Will other unblocked components import from or depend on this one? Schemas before commands, shared utilities before consumers, composition roots before feature handlers. Components that unblock the most downstream work rank higher.
3. **Phase table order:** Within a phase, the row order in `mvp-progress.md` reflects intended implementation sequence. Earlier rows rank higher than later rows when the above criteria do not differentiate.

**Present** the result:

> **Recommended next:** [component name] — [one-line why it ranks first]
>
> **Alternatives** (ranked):
>
> 1. [component] — [one-line description]
> 2. [component] — [one-line description]
>    ...
>
> **"Go with the recommendation, pick an alternative, or tell me something else."**

Do NOT proceed until the user picks.

### User picks a non-optimal task

If the user picks a component — either from the alternatives list or by naming one directly (e.g. "plan task X") — and it does **not** rank first, warn before proceeding:

> **Heads up:** [picked component] ranks #N. The recommended task is **[top-ranked component]** because [one-line reason].
>
> Picking [picked component] first means [concrete consequence: e.g. "you'll establish the CLI pattern in a less central command" or "the compile command will have to be written without this foundation"].
>
> **Switch to the recommendation, or continue with your pick?**

Wait for confirmation. If the user confirms their pick, proceed to Pass 1 with that component.

---

## Pass 1: Explore + Decide

**Goal:** In a single pass, gather every fact needed, verify the findings mechanically, resolve every design decision, and present the full picture for user review. When the user approves, Pass 2 is purely mechanical.

**Note:** `shared/package.json`, `eslint.config.mjs`, `SKILL-recipes.md`, and `SKILL-guardrails.md` were pre-read during §1. They are already in context — do not re-read them.

### A.1 Mandatory exploration checklist

Complete every item. Each produces evidence for the report. Items are organized into two batches to minimize sequential tool-call rounds.

**Batch A — fire in one parallel round** (no data dependencies; interface paths and library names come from the mvp-spec pre-read in §1):

1. **Read every interface the component implements** — copy the full interface verbatim.
2. **Read the target database schema** — if the component touches a table, read the migration file. Record exact columns.
3. **Check existing files** — for every file the recipe pattern would create, check if it already EXISTS (Glob). Record each.
4. **Verify every external library API by reading installed `.d.ts` files** — locate under `node_modules/`, read them, record exact class names, constructor signatures, method signatures, and import paths. If not installed, search the web. This applies to ALL layers.
5. **Check recipe fit** — determine which recipe applies (adapter, storage, pipeline, composition root) using the pre-read `SKILL-recipes.md`. If no recipe fits → **BLOCKER**.
6. **Search for existing solutions** (conditional — if the target layer already has 2+ files of this recipe type) — Grep for similar functionality before proposing new code. Check: does an existing adapter/storage/pipeline class already solve part of this problem? Could an existing interface gain a method instead of creating a new interface? Record findings in the EXISTING SOLUTIONS field of the Exploration Report.

**Batch B — fire in one parallel round after Batch A completes** (depends on interfaces, types, and library APIs discovered in Batch A):

7. **Read every domain type the component reads or writes** — copy full type definitions verbatim. Never write "see task NNN."
8. **For adapters wrapping a library**: determine sync vs async from the interface return type.
9. **Check branded types** — for every parameter, verify the correct branded type from `core/types/`. Check factory function usage.
10. **Plan the step breakdown** — count methods, assign to steps (max 2 per step, max 1 file per step). Record the mapping.
11. **Verify module resolution** — if config changes are proposed, read the relevant `tsconfig.json` and record `moduleResolution`. If uncertain → state as blocker.
12. **Trace consumers of modified types** (conditional — if any file in the Files table is "Modify" and touches an interface or type) — Grep for all importers of the modified interface/type. Classify each as "will break" (uses removed/changed members) or "compatible" (unaffected). If breakage is expected, add "Modify" rows to the Files table for each broken consumer. Record findings in the CONSUMER ANALYSIS field of the Exploration Report.

**Pre-read items** (already in context from §1 — extract findings, do not re-read):

13. **`shared/package.json`** — record dependencies and pinned versions.
14. **`eslint.config.mjs`** — record restricted-import rules for the target layer. If ESLint changes are needed, determine the exact structural change.

### A.2 Produce the Exploration Report

**Write the report to a file**, not to the chat. Save to `documentation/tasks/.exploration-NNN.md` (where NNN matches the upcoming task number — check existing files in `documentation/tasks/` for the next number). This avoids slow chat streaming for a 200–300 line document and gives the user a better review surface (editor search, folding, scrolling).

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

DEPENDENT TYPES (classified by tier — see SKILL-guardrails.md):
  Tier 0 (verbatim — component calls methods or constructs inline):
    Source: [exact file path]
    [full type definition with all fields and imports]
  Tier 1 (signature + path — passed through to constructors, never consumed):
    [TypeName] — [path] — [N members] — [one-line purpose]
  Tier 2 (path-only — branded types and as const enums):
    [TypeName] — [path] — factory: [factoryFunction(raw)]
  NEVER "see task NNN". NEVER "None" for composition roots.

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

EXISTING SOLUTIONS (conditional — only if checklist item 6 triggered):
- [file path]: [what it already solves, fully or partially]
  Source: [verified via Read/Grep]
- Or: No existing solutions — this is genuinely new.
- Or: Not applicable — first component of this recipe type in this layer.

CONSUMER ANALYSIS (conditional — only if checklist item 12 triggered):
- [importer file path]: [will break — uses changed member X | compatible — unaffected]
  Source: [verified via Grep for import statements]
- Or: Not applicable — no existing interfaces or types are modified.

APPROACH EVALUATION (conditional — only if recipe fit required deliberation OR component is a composition root):
- Approach A: [description] — files: [count], new artifacts: [count]
- Approach B: [description] — files: [count], new artifacts: [count]
- Chosen: [A or B] — [why]
- Or: Not applicable — recipe fit is obvious, single clear approach.

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

### A.3 Mechanical self-verification

Before presenting to the user, verify the Exploration Report yourself using objective tool output. Run these checks in parallel:

1. **Re-read each cited source file** — use Read on every path listed in a `Source:` line.
2. **Grep for interface/type names** — for each pasted interface or type, Grep the source file for the name and compare line counts against the pasted block. If line counts diverge, re-read and fix.
3. **Grep for branded type usage** — for each constructor parameter, Grep `core/types/` to confirm the branded type exists and the factory function is correct.
4. **Grep for existing files** — for each file in EXISTING FILES, use Glob to confirm EXISTS/DOES NOT EXIST claims.
5. **Cross-check library .d.ts** — re-read each cited `node_modules/` path, Grep for the class/method name, confirm signatures match.

For every discrepancy found, fix the exploration file (use targeted edits on `documentation/tasks/.exploration-NNN.md`) before proceeding. Do NOT present unchecked claims to the user.

### A.4 Resolve design decisions

Work through this checklist using the verified Exploration Report. Every item must have a single definitive answer — no "or", "optionally", "depending on".

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

### A.4b Simplicity sweep

After resolving all decisions, review the plan for over-engineering. For every new artifact the plan introduces, answer one question:

- **Each new file in Files table:** "Can this live in an existing file?" If an existing file in the same layer/directory handles the same concern, add to it instead.
- **Each new interface:** "Does an existing interface already cover this responsibility?" If it can gain a method, prefer that.
- **Each new type/branded type:** "Is this type used in more than one place?" If used only by the component being built, consider inlining or using an existing type.

**Red flag:** If the plan creates 3+ new files for a single-concern component (beyond source + test), justify each file or simplify.

Record any simplifications made. If simplification changes the STEP PLAN or FILES, update them before proceeding.

### A.5 User checkpoint

The full Exploration Report is in `documentation/tasks/.exploration-NNN.md` (written in A.2). **Present a decisions-focused summary in chat**, not the full report. The summary must include every design decision so the user can approve the plan without opening the file for routine components. Say:

> **Pass 1 complete.** Full report: `documentation/tasks/.exploration-NNN.md`
>
> **Component:** [name] | **Layer:** [layer] | **Recipe:** [recipe]
>
> **Design decisions:**
>
> - Constructor: [params and why each is needed]
> - Method behaviors: [one sentence each]
> - Sync/async: [decision and why] (adapters only)
> - Config changes: [exact changes or "none"]
> - Dispatch pattern: [chosen pattern] (if applicable)
>
> **Files:** [count] create, [count] modify
>
> **Test strategy:** [count] test cases — [one-line summary of coverage]
>
> **Blockers:** [list or "None"]
>
> **Review the decisions above. Open the exploration file for full evidence. Say "proceed" or flag issues.**

**Wait for the user to say "proceed."** Do NOT continue to Pass 2 until they do.

---

## Pass 2: Write + Verify

**Goal:** Mechanically map the Exploration Report + resolved decisions into the task file template, then immediately verify using Grep-based checks. No creative composition — if it's not in the report, don't add it; if it is, don't omit it.

### C.1 Confirm reference files in context

`SKILL-recipes.md` and `SKILL-guardrails.md` were pre-read during §1 and are already in context. Review the recipe matching the RECIPE field in the Exploration Report, and review all guardrails before writing. Do not re-read these files unless the context window has been truncated.

The Exploration Report is on disk at `documentation/tasks/.exploration-NNN.md`. If context has been truncated and you need to re-read report sections, use Read with offset/limit to target specific sections rather than re-reading the entire file.

### C.2 Mapping table

Mechanically map the Exploration Report to the template:

| Report field                   | Template section                                          |
| ------------------------------ | --------------------------------------------------------- |
| EXISTING FILES                 | Files table (only "Create" for DOES NOT EXIST)            |
| EXISTING SOLUTIONS             | Architecture Notes (reuse decisions)                      |
| CONSUMER ANALYSIS              | Files table ("Modify" rows for broken consumers)          |
| APPROACH EVALUATION            | Architecture Notes (chosen approach + rationale)          |
| INTERFACES                     | Interface / Signature (first code block)                  |
| CONSTRUCTOR + METHOD BEHAVIORS | Interface / Signature (second code block — class)         |
| DEPENDENT TYPES                | Dependent Types (tiered: T0 verbatim, T1 table, T2 table) |
| DEPENDENCIES + ESLINT CHANGES  | Config Changes                                            |
| DESIGN DECISIONS               | Architecture Notes                                        |
| SYNC/ASYNC                     | Steps (implementation step must state this)               |
| LIBRARY API CALLS              | Steps (exact function calls in implementation)            |
| SCHEMA                         | Steps (SQL step references exact columns)                 |
| STEP PLAN                      | Steps (method-to-step assignment)                         |
| TEST STRATEGY                  | Steps (test step specifies exact mocking)                 |

### C.3 Write prohibitions (internalize before writing)

Violating any of these causes the mechanical review (C.5) to reject and force a rewrite:

- Never write "if needed", "or optionally", "may be", "consider", "you could", "might want"
- Never reference another task file ("see Task 009")
- Never write "Create" in Files table for a file the Exploration Report marked EXISTS
- Never put 3+ methods in one step
- Never use raw `string`/`number` for domain-value constructor parameters
- Never paste Tier 1 or Tier 2 types verbatim — use the tiered format (table for Tier 1, table for Tier 2)
- Never use Tier 1 or Tier 2 for types the component calls methods on or constructs inline — those must be Tier 0

### C.4 Save the task file

Save to: `documentation/tasks/NNN-kebab-case-name.md`

NNN = zero-padded sequence number. Check existing files in `documentation/tasks/` for the next number.

Use the task file template below.

---

### C.5 Mechanical review

Immediately after saving the task file, run every check below yourself using Grep and Read. Tool output is objective evidence — no second agent needed to interpret "0 matches = pass".

**Step 1: Re-read ground truth + run mechanical checks A–N in one parallel batch.** Fire all of these in a single round of tool calls:

- Re-read from disk every interface file, type file, and library `.d.ts` the task references (do NOT reuse what you remember — re-read the actual files).
- Run Grep checks on the saved task file (ambiguity scan, self-contained check, step count, config changes, etc.).
- Run Read + Grep cross-checks on source files (signature verification, library API accuracy, branded types, etc.).

Report pass/fail for each check with evidence (match count, line number, or "0 matches").

A. **AMBIGUITY SCAN** (three layers — see `SKILL-guardrails.md` "No ambiguity" for full list):
Layer 1 — Grep the task file for each banned phrase category (Cat 1–7). ANY match in non-code lines = fail.
Cat 1 (hedging): "if needed", "if necessary", "if required", "if appropriate",
"as needed", "as appropriate", "may be", "may want", "may need", "may be added",
"might want", "might need", "might be", "you could", "could also",
"should work", "should suffice", "probably", "likely", "possibly", "potentially",
"perhaps", "try to", "attempt to", "ideally", "preferably", "feel free to"
Cat 2 (examples-as-instructions): "e.g.", "eg.", "for example", "for instance",
"such as", "something like", "along the lines of", "similar to", "or similar",
"or equivalent", "or comparable", "some kind of", "some sort of", "some form of"
Cat 3 (delegation): "decide whether", "decide if", "choose between", "depending on",
"up to you", "your choice", "alternatively", "or alternatively", "whichever",
"whatever works", "however you prefer", "or optionally", "optionally"
Cat 4 (vague): "appropriate" (unspecified), "suitable", "reasonable", "etc.",
"and so on", "and so forth", "and more"
Cat 5 (state hedges): "if not present", "if not already", "if it doesn't exist",
"if missing", "add if not present", "create if not exists"
Cat 6 (escape clauses): "or skip", "or ignore", "or leave for later",
"in a later task", "if possible", "where possible", "if feasible",
"mock or skip", "mock or conditional"
Cat 7 (false alternatives): "or use", "or another", "or any"
Layer 2 — Grep for `" or "` in the task file. Read each match. Does it present two alternative actions the executor must choose between? If yes = fail.
Acceptable "or": conditional behavior, conjunctions ("zero errors or warnings").
Layer 3 — Grep for parenthesized hedges: `\(if needed\)`, `\(optional\)`, `\(e\.g\.`, `\(or similar\)`, `\(sync or async\)`. Any banned pattern inside parentheses = fail.

B. **SIGNATURE CROSS-CHECK:** For each method in the class code block, compare against the interface source file — parameter names, types (including readonly), return types must match exactly.

C. **DEPENDENT TYPES:** If the component reads/writes/returns any domain type, are type definitions present inline (Tier 0 verbatim, Tier 1 signature+path, Tier 2 path-only)? Never "see task NNN", never empty.

D. **STEP COUNT:** Grep step headers. Count methods listed per step — any step with 3+ methods or 2+ files = fail.

E. **CONFIG CHANGES:** Grep for "None" in Config Changes section. Must be either "None" with no caveats or exact diffs. Grep for "if not present" = fail.

F. **FILES TABLE:** For each "Create" row, Glob the path — if the file exists = fail.

G. **SELF-CONTAINED:** Grep for "see Task", "defined in task", "see task" (case-insensitive). Any match = fail.

H. **CONSTRUCTOR BRANDED TYPES:** For each constructor param representing a domain value, verify the type is a branded type from `core/types/`. Raw `string`/`number` = fail.

I. **VERIFY INSTRUCTIONS:** Read each step's "Verify:" line. Confirm the referenced artifact exists or will exist by that step.

J. **TEST TABLE ↔ STEP CROSS-CHECK:** Grep each Tests table row name in the step instructions. Grep each test name from steps in the Tests table. Mismatches = fail.

K. **LIBRARY API ACCURACY:** Re-read the `.d.ts` files. Cross-check class names, import paths, constructor signatures, method calls against ground truth. If no `.d.ts` was read for a library = fail.

L. **WIRING ACCURACY (composition roots only):** Re-read each concrete class source file. Every `new ClassName(...)` call in the task must match actual constructor signature.

M. **SIMPLICITY CHECK:** Count "Create" rows in the Files table. For a single-concern component (one interface, one class), more than 3 "Create" rows (source + test + one config/migration) requires justification in Architecture Notes. If no justification = fail.

N. **CONSUMER COMPLETENESS (conditional — only if task modifies existing interfaces/types):** For each modified interface/type, Grep the codebase for importers. Every importer that will break must appear as a "Modify" row in the Files table. Missing consumers = fail. If no interfaces/types are modified, this check passes automatically.

**Step 2: Score the rubric.** Score each dimension 0 (fail) or 1 (pass):

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
13. Simplicity (check M)
14. Consumer completeness — conditional (check N)

### C.6 Score and act

**≥ 90%:** Proceed to §6.

**75–89%:** Auto-apply fixes for each failing check. Re-run the specific Grep checks that failed to confirm resolution. Proceed to §6 with the corrected score.

**< 75%:** Apply fixes, rewrite affected sections, re-run all mechanical checks. Iterate until ≥ 75%.

---

## §6. Offer execution

After verification passes:

1. **Delete the exploration file:** Remove `documentation/tasks/.exploration-NNN.md`. The task file is self-contained — the exploration file has served its purpose.
2. **Announce:** "Task saved to `documentation/tasks/NNN-name.md`. Score: N/M (X%). Use the @aic-task-executor skill to execute it."

---

## §7. Review existing tasks

Triggered when the user asks to review one or more task files.

**Scope:**

- "review task 008" → single task
- "review tasks" / "review all tasks" → all pending in `documentation/tasks/` (skip `done/`)

**Step 7a: Check for codebase drift.** For each file referenced in the task's Files table (both "Create" and "Modify" paths), check if the file or its directory has changed since the task was written. Use `git log -1 --format='%ai' -- <path>` for modified files and Glob for created files that now exist. If drift is detected, flag the specific files and re-read them before proceeding.

**Step 7b: Gather codebase state.** Run the Pass 1 exploration checklist once for the full batch. Use parallel Read calls. Cache the results.

**Step 7c: Evaluate each task.** Run the mechanical checks (C.5) on each task file yourself. Use parallel Grep + Read calls. For multiple tasks, batch the Grep calls — up to 4 task files in parallel.

**Step 7d: Present findings.** For each task: score, guardrail violations table, specific fixes. If drift was detected in 7a, highlight affected sections. For multiple tasks: summary table first.

**Step 7e: Rewrite.** Ask: **"Rewrite all, rewrite specific tasks (list numbers), or skip?"**

When rewriting:

- Read original, apply fixes, re-read relevant source files
- Write corrected task in place (same path, same NNN)
- Do not change scope unless a guardrail requires it
- **Original < 75%:** Always re-run full mechanical checks (C.5). Iterate until ≥ 75%.
- **Original 75–89%, minor fixes:** Re-run only the failing Grep checks to confirm resolution. Assign corrected score.
- **Original 75–89%, substantial changes:** Re-run full mechanical checks (C.5).

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
- [Record key design decisions from Pass 1]

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

### Tier 0 — verbatim

```typescript
// Full type definition with all fields and imports
// Only types the component directly calls methods on or constructs inline
```

### Tier 1 — signature + path

| Type       | Path              | Members | Purpose                         |
| ---------- | ----------------- | ------- | ------------------------------- |
| `TypeName` | `path/to/file.ts` | N       | methodA, methodB + props: propC |

### Tier 2 — path-only

| Type       | Path              | Factory          |
| ---------- | ----------------- | ---------------- |
| `TypeName` | `path/to/file.ts` | `factoryFn(raw)` |

## Config Changes

- **package.json:** [exact change or "no change"]
- **eslint.config.mjs:** [exact config block or "no change"]

## Steps

### Step 1: [action]

[What to do, with exact code if needed]

**Verify:** [actionable verification]

### Step N: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

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
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` outside allowed files
- [ ] No `let` in production code (only `const`; control flags in imperative closures are the sole exception)
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
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
