# Task Executor

## Purpose

Execute a task file produced by the `aic-task-planner` skill. Read the task, internalize its specs, implement every step, self-review in three passes, run a tool-assisted evidence review for scoring, iterate until clean, update progress, and stage for commit.

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

### 2. Internalize the task

Before writing any code, read and absorb these sections of the task file. Do not skip this step — it prevents rework caused by implementing without understanding the spec.

**Read the Interface / Signature section.** Memorize:

- The exact interface the component implements (first code block)
- The exact class declaration, constructor parameters, and method signatures (second code block)
- Return types including `readonly` modifiers

**Read the Dependent Types section.** Memorize every field of every domain type the implementation reads, writes, or returns. You will need these to write correct field mappings and test data.

**Read the Config Changes section.** Note:

- Which dependencies must exist (and verify they actually do in `shared/package.json`)
- Which ESLint changes must be applied (and in which step)
- If "None", confirm no config steps appear in the Steps section

**Read the Architecture Notes.** Note design decisions (e.g. "replace semantics, not append", "sync API only", "no Clock needed"). These constrain your implementation.

**Cross-check prerequisites:** If Config Changes lists a dependency as "already at X", verify it's actually there. If it lists an ESLint change, confirm the Steps section has a step for it. If anything doesn't match, **stop and tell the user** — the task file may need replanning.

**Task quality gate — scan for ambiguity before implementing:**

Before writing any code, scan the Steps section and Interface/Signature notes for executor-facing choices. Read every non-code instruction sentence. Flag any sentence where:

- It contains " or " presenting two alternative actions (e.g. "mock or skip", "use X or equivalent")
- It uses hedging language: "if needed", "optionally", "may be", "consider", "you could", "might want"
- It leaves a design decision to you (e.g. "decide whether to...", "choose between...")

If you find any ambiguity: **stop and tell the user** that the task file contains unresolved decisions. List each ambiguous sentence and what decision it requires. Do not guess — the planner must resolve it. This prevents implementing the wrong approach and having to rewrite.

### 3. Implement

Work through the **Steps** section in order.

**Write correct code on the first pass.** Every rework loop wastes tokens and time. Before writing any code, internalize these rules so you don't have to fix them later:

- All properties `readonly`. All array types `readonly T[]` — everywhere: class properties, function parameters, local variables, return types, generic type parameters (e.g. `reduce<{ readonly files: readonly T[] }>`). No exceptions.
- No `.push()`, `.splice()`, `.sort()`, `.reverse()`. Always `.toSorted()` instead of `.sort()` — even `[...arr].sort()` is banned, use `arr.toSorted()`. Always `.toReversed()` instead of `.reverse()`. Use spread or reduce for building arrays.
- No `any`. Explicit return types on all functions.
- Branded types for all domain values — never raw `string`/`number` for paths, tokens, scores, IDs. Use factory functions: `toTokenCount(N)`, `toRelativePath("...")`, `toUUIDv7("...")`, `toISOTimestamp("...")`.
- `//` comments only — `/* */` and `/** */` are banned. ESLint catches multi-line block comments but NOT single-line `/** */` — you must catch these yourself. Write `// comment` not `/** comment */`.
- No `Date.now()`, `new Date()`, `Math.random()` — use injected `Clock`.
- Tests live in `__tests__/` directories, not next to source files.
- Imports use layer aliases (`#core/`, `#pipeline/`), never relative paths across layers.
- `as const` objects for enums, never TS `enum` keyword.
- One class per file (enforced by `max-classes-per-file`).
- One public method per class (SOLID SRP). Constructor plus one public method.
- Constructor injection only — never `new` for infrastructure/service classes outside composition roots.
- No `no-param-reassign` violations — never mutate function parameters or their properties.
- `prefer-const` — use `const` for all variables unless reassignment is required.
- Return new objects from all methods — never mutate inputs.
- Exported const objects that implement interfaces must have explicit type annotations (e.g. `export const migration: Migration = { ... }`, not untyped object literals).

If you catch yourself writing mutable code and then fixing it, you are doing it wrong. Write it immutably from the start.

**For test implementation steps**, cross-reference the **Tests table** in the task file. Every row in the Tests table must have a corresponding test case with that exact name. Do not invent extra test cases. Do not skip any. Use the task file's Dependent Types section to build correct test data.

**Test structure by task layer:**

- **Storage tests:** Create in-memory DB via `new Database(":memory:")` from `better-sqlite3`. Run the migration (`migration.up(db)`) before each test. Create the store with the real DB wrapped as `ExecutableDb`, plus mock `Clock` and/or `IdGenerator` that return deterministic values. Use branded type factory functions for test data (`toUUIDv7(...)`, `toISOTimestamp(...)`, etc.).
- **Adapter tests:** For file-based adapters (glob, ignore), create a temp directory with fixture files. For parser/encoder adapters (tiktoken, TypeScript provider), use in-memory string fixtures. Clean up temp dirs after tests.
- **Pipeline tests:** Inject mock dependencies implementing the required interfaces. Verify inputs are not mutated. Test edge cases (empty arrays, zero budgets, no files).

For each step:

1. Do exactly what the step says.
2. Run the **Verify** command listed in that step.
3. If verification fails, fix the issue before moving to the next step.
4. If you cannot fix it after 2 attempts, go to **Blocked diagnostic** (see below).

**Subagent dispatch (recommended for tasks with 5+ steps):**

For larger tasks, consider dispatching a focused subagent per step or group of related steps. Each subagent gets only the context it needs. Use `subagent_type="generalPurpose"` and include in the prompt:

- The exact step text from the task file
- The relevant Interface/Signature section (both code blocks)
- The Dependent Types section (full type definitions)
- Design decisions from Architecture Notes
- The file paths involved
- The verify command to run
- The first-pass coding rules (copy the bullet list from "Write correct code on the first pass" above — subagents do not inherit these rules automatically)

Review the subagent's output before proceeding to the next step. After review, run the Pass 3 manual scan on any files the subagent created — subagents are especially prone to single-line `/** */` comments and non-readonly local array types.

### 4. Three-Pass Self-Review

After completing all steps, review in three separate passes:

**Pass 1 — Spec compliance:**

- Did I implement every file in the Files table? No extra files?
- **Signature cross-check** — for each method in the written code, verify against the task file's Interface/Signature section:
  - Parameter names match exactly
  - Parameter types match exactly (including `readonly` modifiers)
  - Return types match exactly (e.g. `readonly T[]` not `T[]`)
  - If the interface method has parameters, the class method lists the same parameters — even if unused
- Are all properties `readonly` where specified?
- Do all imports use the correct layer aliases (`#core/`, `#pipeline/`, etc.)?
- **Config Changes verified** — every change listed in the Config Changes section was applied:
  - Dependencies: correct package at correct version in `package.json`
  - ESLint: config block added in the correct position in `eslint.config.mjs`
  - If "None", confirm no config files were modified
- **Tests table covered** — every test case from the Tests table has a corresponding test in the test file, named correctly

**Pass 2 — Code quality:**

- Run `pnpm lint && pnpm typecheck && pnpm test`.
- Check: no layer boundary violations, no banned imports, no inline rule disabling.
- Check: branded types used where specified, DI via constructor injection, no concrete dependencies.
- Check: `as const` objects for enums (not TS `enum`), factory functions for branded types (not raw casts).
- Names are clear and match what things do.
- No unnecessary comments. Existing comments explain why, not what.
- No over-engineering. YAGNI.

**Pass 3 — ESLint gap supplement (manual scan):**

ESLint does not catch everything. After lint passes, manually scan the written code for:

- **Single-line block comments:** Search for `/**` and `/*` in the new files. Replace with `//`. ESLint only catches multi-line block comments.
- **Non-readonly array types:** Check every array type annotation — function parameters, local `const`/`let` declarations, reduce/map type parameters, return types. ALL must be `readonly T[]`.
- **`.sort()` anywhere:** Even `[...arr].sort()` is wrong. Use `.toSorted()`.
- **Untyped exported objects:** Every exported `const` that implements an interface must have an explicit type annotation (`: Migration`, `: ContentTransformer`, etc.).
- **Raw string/number in type positions:** Check that reduce accumulator types, intermediate variables, and function parameters use branded types where the domain requires it — not bare `number` or `string`.

### 5. Verification Before Completion

Before declaring success, verify with evidence — do not just claim it works:

- Run `pnpm lint && pnpm typecheck && pnpm test` and **read the output**.
- Confirm test count has not dropped (compare against the expected count from the task file or previous run).
- Confirm zero warnings, not just zero errors.
- If the task specifies test cases, confirm each one appears in the output by name.

### 6. Tool-assisted evidence review

The three-pass self-review (§4) catches most issues, but memory-based review has blind spots. This step forces objectivity by **re-reading files from disk** and **using Grep to verify pattern dimensions**. Tool output does not lie — if Grep finds no `/**`, that is proof.

**Step 6a — Re-read all implemented files from disk.**

Use the Read tool on every file created or modified. Do NOT rely on what you remember writing. This breaks the "I just wrote it so I know it's fine" shortcut.

**Step 6b — Run tool-assisted checks (batch these in parallel where possible).**

Use Grep on the created/modified files for each pattern check. Run multiple Grep calls in a single message for speed.

| Dimension                   | Tool check                                                                                                                                                                      | Evidence required                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1. Signature match          | Re-read the interface file and implementation file side by side                                                                                                                 | List each method: param names, types, return types — state MATCH or MISMATCH with the specific difference |
| 2. Readonly / mutability    | `Grep` for `\.push\(`, `\.splice\(`, `\.sort\(`, `\.reverse\(` in new files. `Grep` for array types missing `readonly` (pattern: `: [A-Z]\w+\[\]` without preceding `readonly`) | Paste Grep output ("0 matches" = pass)                                                                    |
| 3. Branded types            | `Grep` for factory function usage (`toTokenCount`, `toRelativePath`, etc.) in implementation AND test files. `Grep` for suspicious raw literals in type positions               | Paste evidence of factory function usage or raw values found                                              |
| 4. Comment style            | `Grep` for `/\*\*` and `/\*[^/]` in new files                                                                                                                                   | Paste Grep output ("0 matches" = pass)                                                                    |
| 5. DI & immutability        | Re-read constructor — list each param and whether it's an interface or concrete class                                                                                           | List each constructor param with its type                                                                 |
| 6. Tests complete           | Re-read test file — list every `it(` or `test(` name. Cross-check against Tests table in task file                                                                              | Two-column list: Tests table row → matching test name (or MISSING)                                        |
| 7. Config changes           | Re-read `shared/package.json` and `eslint.config.mjs` if task required changes                                                                                                  | State each required change and whether it's present                                                       |
| 8. Lint + typecheck + tests | Already verified in §5 — reference that output                                                                                                                                  | "Passed in §5 with 0 errors, 0 warnings" or paste output                                                  |
| 9. First-pass quality       | Self-track: count fix iterations during §3                                                                                                                                      | State count: "0 iterations" or "1 iteration for [reason]"                                                 |
| 10. Layer boundaries        | `Grep` for banned import patterns in new files (e.g. `from ['"](?!#)\.\.` for cross-layer relative imports, specific banned packages)                                           | Paste Grep output ("0 matches" = pass)                                                                    |

**Step 6c — Score and report.**

Score each dimension 0 (fail with evidence of violation) or 1 (pass with evidence of compliance). Be strict — if Grep found ANY match for a banned pattern, score 0 for that dimension regardless of whether you think it's a false positive. Investigate first.

Tally the total. Record per-dimension scores with one-line justifications.

**If score < 8:** Fix the failing dimensions, re-run the tool checks for those dimensions only, re-score. **Maximum 3 iterations** — if still below 8, go to Blocked.

**If score ≥ 8:** Proceed to §7.

### 7. Report

When the evidence review score ≥ 8, report to the user:

- What was implemented (files created/modified)
- Test results (pass count, confirming no regressions)
- **Implementation score: N/10** (from evidence review) with per-dimension breakdown
- Review findings and fixes applied (if any)
- Any concerns or follow-up items

### 8. Update Progress

Use the `aic-update-mvp-progress` skill to update `documentation/mvp-progress.md`.

**Critical:** Use today's actual date for the daily log entry. If today's entry already exists, append to it. If it is a new day, create a new entry at the top of the Daily Log section (reverse chronological). Do not put today's work under yesterday's date.

### 9. Update Task Status

Change the task file header from `> **Status:** In Progress` to `> **Status:** Done`.

### 10. Archive the Task File

Move the completed task file to `documentation/tasks/done/`:

```
mkdir -p documentation/tasks/done
mv documentation/tasks/NNN-name.md documentation/tasks/done/
```

### 11. Stage and Propose Commit

Stage all changed files with `git add`. Then **propose** a conventional commit message to the user:

```
feat(<scope>): <what was built>
```

**Do NOT commit automatically.** Present the staged files and proposed message, then wait for the user to approve or adjust. The user decides when to commit.

---

## Blocked Handling

If during execution you encounter something unexpected or cannot fix an issue after 2 attempts:

**Step 1 — Diagnose before blocking:**

Before declaring Blocked, check whether the failure is in your code or in the task file:

- **Signature mismatch:** Does the task file's Interface/Signature still match the actual interface in the codebase? If the interface changed since planning, the task file needs replanning — not more implementation attempts.
- **Type mismatch:** Do the Dependent Types in the task file match the actual types in `core/types/`? If fields are missing or renamed, report the discrepancy.
- **Config conflict:** Does the ESLint change in the task file conflict with the current `eslint.config.mjs` structure? If blocks were reordered or rules changed since planning, report it.
- **Layer violation:** Does the implementation require something banned by the layer's ESLint rules (e.g. storage needing `node:fs`)? This is a design issue, not a code issue.

**Step 2 — Block and report:**

1. **Stop immediately** — do not guess or improvise.
2. Append a `## Blocked` section to the task file with:
   - What you tried (specific code or command)
   - What went wrong (exact error message)
   - Whether the issue is in your code or the task file's spec
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
