# Task Executor

## Purpose

Execute a task file produced by the `aic-task-planner` skill. Read the task, internalize its specs, implement every step, verify with Grep-based mechanical checks for scoring, iterate until clean, finalize progress, and stage for commit.

**Announce at start:** "Using the task-executor skill on `<task file path>`."

## When to Use

- User says "execute task", "go", "implement task NNN"
- User references a task file in `documentation/tasks/`
- Immediately after the task-planner offers execution

## Inputs

1. The task file path (e.g. `documentation/tasks/001-phase-b-core-interfaces.md`)
2. `.cursor/rules/AIC-architect.mdc` — active architectural rules
3. Existing source in `shared/src/` — current interfaces, types, patterns

## Process

### 1. Read, validate, and internalize the task

**Pre-read all inputs in one parallel batch** to eliminate extra rounds:

- The task file (e.g. `documentation/tasks/NNN-name.md`)
- `documentation/mvp-progress.md`
- `shared/package.json`
- `eslint.config.mjs`
- `.cursor/rules/AIC-architect.mdc`

**Validate** from the pre-read results:

- Status is `Pending` (do not re-execute `Done` or `Blocked` tasks)
- All dependencies listed in "Depends on" are actually `Done` in `documentation/mvp-progress.md`

If a dependency is not done, **stop and tell the user**.

Update the task file status to `In Progress`.

**Create a feature branch** to isolate all work:

```
git checkout -b feat/task-NNN-kebab-name
```

Use the task number and kebab-case name from the task file (e.g. `feat/task-011-sqlite-cache-store`). All implementation work happens on this branch. If the branch already exists (e.g. resuming a blocked task), check it out instead of creating it.

**Verify the branch is active** immediately after creation:

```
git rev-parse --abbrev-ref HEAD
```

The output must be `feat/task-NNN-kebab-name`. If it shows `main` or any other branch, retry the checkout. If it still fails, stop and tell the user.

**Store the branch name** (e.g. `feat/task-075-yaml-compactor`) — you will need it for the branch guard in §5c.

### 2. Internalize the task

Before writing any code, absorb these sections from the pre-read task file. Do not skip this step — it prevents rework caused by implementing without understanding the spec.

**Read the Interface / Signature section (or Wiring Specification for composition roots).** Memorize:

- For interface-implementing components: the exact interface (first code block), class declaration, constructor parameters, and method signatures (second code block). Return types including `readonly` modifiers.
- For composition roots: every concrete class constructor signature (from the wiring code block), every exported function signature, and every external library API (class names, import paths, method calls). These are your ground truth — every `new ClassName(...)` call must match the wiring specification exactly.

**Read the Dependent Types section.** The task file uses a tiered system:

- **Tier 0 (verbatim):** Full type definitions are pasted inline. Memorize every field — you will need these for correct field mappings and test data.
- **Tier 1 (signature + path):** Only the type name, file path, method count, and purpose are listed. **Read the source file** at the given path before implementing any step that uses this type. Do this on demand — read only when you reach the step that needs it.
- **Tier 2 (path-only):** Only the type name, file path, and factory function are listed. These are branded primitives or `as const` enums. Use the listed factory function for construction. Read the source file only if the factory call fails to typecheck.

For non-composition-root tasks, all types are Tier 0 (verbatim) — this distinction only applies to composition root tasks.

**Read the Config Changes section.** Note (using the pre-read `shared/package.json` and `eslint.config.mjs`):

- Which dependencies must exist (and verify they actually do — already in context from Step 1)
- Which ESLint changes must be applied (and in which step)
- If "None", confirm no config steps appear in the Steps section

**Read the Architecture Notes.** Note design decisions (e.g. "replace semantics, not append", "sync API only", "no Clock needed"). These constrain your implementation.

**Cross-check prerequisites:** If Config Changes lists a dependency as "already at X", verify it's actually there (package.json is in context). If it lists an ESLint change, confirm the Steps section has a step for it. If anything doesn't match, **stop and tell the user** — the task file may need replanning.

**Build the touched-files list.** Extract every file path from the task's **Files table** (both "Create" and "Modify" rows). Then add the standard files that every task modifies:

- `documentation/mvp-progress.md` (progress update in §5b)
- `documentation/tasks/done/NNN-name.md` (task file after move+archive in §5c)

If any step mentions auto-ratcheting benchmark files (e.g. `test/benchmarks/baseline.json`), add those too. If Config Changes lists modifications to `shared/package.json` or `eslint.config.mjs`, add those.

**This is your commit allowlist.** Only these files may be staged in §5c. Keep this list in mind throughout implementation — if you create or modify a file not on this list, either add it (with justification) or revert it before committing.

**Task quality gate — scan for ambiguity before implementing:**

Before writing any code, scan every non-code instruction sentence in the Steps section, Verify lines, and test descriptions. Flag any sentence containing patterns from these categories:

- **Hedging:** "if needed", "if necessary", "as needed", "may be", "may want", "might", "you could", "could also", "should work", "probably", "likely", "possibly", "potentially", "perhaps", "try to", "ideally", "preferably", "feel free to"
- **Examples-as-instructions:** "e.g.", "for example", "for instance", "such as", "something like", "along the lines of", "similar to", "or similar", "or equivalent", "or comparable", "some kind of", "some sort of"
- **Delegation:** "decide whether", "choose between", "depending on", "up to you", "alternatively", "or alternatively", "whichever", "whatever works", "or optionally", "optionally"
- **Vague qualifiers:** "appropriate" (unspecified), "suitable", "reasonable", "etc.", "and so on"
- **State hedges:** "if not present", "if not already", "if it doesn't exist", "add if not present"
- **Escape clauses:** "or skip", "or ignore", "or leave for later", "if possible", "where possible", "mock or skip"
- **False alternatives:** " or " presenting two implementation choices, "or use", "or another"
- **Parenthesized hedges:** any `(...)` containing the above patterns

If you find any match: **stop and tell the user** that the task file contains unresolved decisions. List each ambiguous sentence and what decision it requires. Do not guess — the planner must resolve it. This prevents implementing the wrong approach and having to rewrite.

### 3. Implement

Work through the **Steps** section in order.

**Pre-write reference (rules NOT caught by ESLint).** Before writing each production file, scan this table. Every item causes a §4b failure and rework loop if missed. Internalize before your first keystroke.

| #   | Rule                | What to check                                                                                                                   | Wrong                                       | Right                                     |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------- |
| 1   | Readonly arrays     | Every `T[]` has `readonly` — props, params, locals, returns, generics (e.g. `reduce<{ readonly files: readonly T[] }>`)         | `items: string[]`                           | `readonly items: readonly string[]`       |
| 2   | Readonly properties | Every class and interface property                                                                                              | `id: string`                                | `readonly id: string`                     |
| 3   | No mutating methods | No `.push()` `.splice()` `.sort()` `.reverse()` — use spread, reduce, `.toSorted()`, `.toReversed()`. Tests exempt              | `arr.push(x)`                               | `[...arr, x]`                             |
| 4   | Branded types       | Factory functions for all domain values — never raw `string`/`number` for paths, tokens, scores, IDs                            | `path: string`                              | `path: RelativePath`                      |
| 5   | Comment style       | Only `//` — ESLint catches `/* */` but NOT `/** */`                                                                             | `/** comment */`                            | `// comment`                              |
| 6   | No `let`            | `const` exclusively — reduce, ternary, helpers for accumulators. Only boolean flags in imperative closures exempt. Tests exempt | `let acc = []`                              | `reduce(...)` or `const x = cond ? a : b` |
| 7   | Typed exports       | Explicit type annotation on exported const objects                                                                              | `export const x = {`                        | `export const x: Type = {`                |
| 8   | Return types        | Explicit return type on every exported function and method                                                                      | `transform(c)`                              | `transform(c): string`                    |
| 9   | Signature match     | Params, types, return types EXACTLY match the interface — including `readonly` modifiers                                        | Mismatched param type or missing `readonly` | Exact match with interface file           |
| 10  | Immutable returns   | Never mutate inputs — always return new objects                                                                                 | `input.x = y; return input`                 | `return { ...input, x: y }`               |
| 11  | Code clones         | Import existing shared utilities — never duplicate logic from sibling files                                                     | Copy-paste from sibling                     | `import { fn } from "./shared.js"`        |
| 12  | SQL determinism     | No `date('now')` or `datetime('now')` in SQL — bind time from Clock                                                             | `date('now')`                               | `? (bound from Clock)`                    |

**Recipe-specific pitfalls** (check the ones matching your task's layer):

- **Pipeline transformers:** `readonly` on `fileExtensions` array AND internal lookup tables (e.g. `BLOCK_REPLACEMENTS`-style arrays). Readonly tuple types in `reduce` generic params. Format-specific transformers need at least one `safety_*` test per listed extension.
- **Storage:** No `date('now')` in SQL — always bind from Clock. Use branded type factories in tests (`toUUIDv7(...)`, `toISOTimestamp(...)`). Test zero-denominator edge cases for computed SQL columns.
- **Adapters:** Sync vs async determined by interface return type — check before writing. ESLint restriction block must include ALL existing adapter boundary paths/patterns (flat config replaces, not merges).
- **Composition roots:** Never eagerly instantiate conditional dependencies — accept via injected parameter, create conditionally in `main()`. No `new` leaking into helper functions. Use ternary-spread for immutable accumulation.

**Code clone details.** Existing shared utilities to check before writing any function: `glob-match.ts` (glob matching), `pattern-scanner.ts` (regex-based guard scanning), `handle-command-error.ts` (CLI error handling), `run-action.ts` (CLI action wiring), `tree-sitter-node-utils.ts` (tree-sitter AST helpers), `tree-sitter-provider-factory.ts` (tree-sitter language provider factory). The codebase enforces 0% duplication via `pnpm lint:clones` (jscpd). Never modify `.jscpd.json` to ignore source files. Never change the `lint:clones` script.

**Pre-implementation sibling check.** Before writing the main source file, read the closest existing sibling in the same directory (the most similar file following the same pattern — e.g., if implementing `rust-provider.ts`, read `go-provider.ts`). Identify the shared utilities, factories, and helpers it imports. Your implementation must follow the same structural pattern and reuse the same shared code. If the task's Interface/Signature conflicts with the sibling's pattern (e.g., task shows a manual class but sibling uses a factory like `defineTreeSitterProvider`), follow the sibling's established pattern — it reflects evolved shared infrastructure that the task spec may not have captured.

**Shared code extraction trigger.** If the sibling has inline functions that are structurally identical to what you need but with different predicates/config (e.g., a tree walker that only changes the node-type check), extract those functions to a shared utility file first — parameterized with callbacks. Refactor the sibling to use the shared utility, then use it in the new component. Do not copy-customize inline code when extraction is possible. If no sibling exists (first file of its kind), check whether any function you are writing is generic (its structure would be identical in a future sibling with different config/predicates). If so, place it in a shared utility file from the start rather than inlining it.

**For test implementation steps**, cross-reference the **Tests table** in the task file. Every row in the Tests table must have a corresponding test case with that exact name. Do not invent extra test cases. Do not skip any. Use the task file's Dependent Types section to build correct test data.

**Test structure by task layer:**

- **Storage tests:** Create in-memory DB via `new Database(":memory:")` from `better-sqlite3`. Run the migration (`migration.up(db)`) before each test. Create the store with the real DB wrapped as `ExecutableDb`, plus mock `Clock` and/or `IdGenerator` that return deterministic values. Use branded type factory functions for test data (`toUUIDv7(...)`, `toISOTimestamp(...)`, etc.).
- **Adapter tests:** For file-based adapters (glob, ignore), create a temp directory with fixture files. For parser/encoder adapters (tiktoken, TypeScript provider), use in-memory string fixtures. Clean up temp dirs after tests.
- **Pipeline tests:** Inject mock dependencies implementing the required interfaces. Verify inputs are not mutated. Test edge cases (empty arrays, zero budgets, no files).
- **Composition root tests (MCP/CLI):** Tests are integration-style. For MCP servers: prefer the SDK's `Client` with `InMemoryTransport` for in-process protocol tests — this avoids fragile wire-format issues. For process spawn tests (startup/crash behavior only): verify the exact wire format from the transport's `.d.ts` before writing framing code — MCP stdio uses content-length headers, not newline-delimited JSON. For scope creation tests: create a temp directory, call the scope function, verify directory structure and returned objects. For idempotency tests: call scope creation twice on the same path, verify no crash. Always clean up temp directories after tests.

For each step:

1. Do exactly what the step says.
2. Run the **Verify** command listed in that step.
3. If verification fails, fix the issue before moving to the next step.
4. If you cannot fix it after 2 attempts, go to **Blocked diagnostic** (see below).
5. **Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make a step work (type casts, extra plumbing, output patching, wrapper functions not in the task), stop. The task's approach is likely wrong. Go to **Blocked diagnostic** — list the adaptations you made and report that the approach needs re-evaluation.

**Per-file quick check (after writing each production file).** Before moving to the next step, run these 4 Grep commands on the file you just wrote. This catches the most common first-pass violations immediately — 4 tool calls (~1 second) that prevent an entire §4b rework cycle. Skip this for test files.

1. Grep for `\.push\(|\.splice\(|\.sort\(|\.reverse\(` — mutating methods (table row 3)
2. Grep for `/\*\*` — block comment style (table row 5)
3. Grep for `^\s*let ` — mutable bindings (table row 6)
4. Grep for `export const \w+ = \{` — check each match has a type annotation (table row 7)

If any match, fix in the same file before proceeding. Do NOT defer to §4b — fixing now prevents compound rework later.

**Prefer direct implementation over subagent dispatch.** Subagents require full context re-assembly, which is token-expensive and introduces cold-start latency. Implement steps directly using parallel tool calls (Read + Write + Shell) in a single message where possible. The task file provides all the context you need — Interface/Signature, Dependent Types, Architecture Notes — so there is no exploration overhead.

### 4. Verify

After completing all steps, run a single verification pass using tool output as objective evidence. No memory-based review — tool output does not lie.

**4a — Run toolchain.**

Run the full toolchain in one command:

```
pnpm lint && pnpm typecheck && pnpm test && pnpm knip && pnpm lint:clones
```

**Read the output.** Confirm:

- Zero errors AND zero warnings (including sonarjs cognitive-complexity warnings).
- Test count has not dropped compared to previous run.
- Each test name from the Tests table appears in the output by name.
- No new unused files, exports, or dependencies introduced by this task (knip). Pre-existing knip findings (e.g. error files for future phases) are acceptable — only new findings matter.
- Zero code clones (jscpd). The codebase maintains 0% duplication — any new clone must be eliminated before proceeding.

This runs ONCE. Do not re-run unless you fix something. If the lint/typecheck/test portion fails, the chain stops before knip — fix the failure, then re-run the full chain.

**4b — Re-read all files + mechanical checks in one parallel batch.**

Fire all of these in a single round of tool calls:

- Use the Read tool on every file created or modified. Do NOT rely on what you remember writing. This breaks the "I just wrote it so I know it's fine" shortcut.
- Batch all Grep calls for the mechanical checks below. Use Grep on the created/modified files for each dimension.

**When a check finds violations, fix them immediately** — replace `.push()` with spread, add missing `readonly`, swap `/** */` for `//`, wrap raw literals with factory functions, add type annotations, refactor `let` to `const`, extract shared utilities for detected clones, etc. After fixing, re-run only the failed checks to confirm they are clean before moving on.

| Dimension                          | Tool check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Evidence required                                                                                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Signature match                 | For interface components: re-read the interface file and implementation file side by side. For composition roots: re-read the Wiring Specification and implementation — verify every `new ClassName(...)` call, every exported function signature, and every library import/call                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Interface components: list each method with param names, types, return types — MATCH or MISMATCH. Composition roots: list each constructor call and library API call — MATCH or MISMATCH |
| 2. Readonly / mutability           | Grep for `\.push\(`, `\.splice\(`, `\.sort\(`, `\.reverse\(` in new/modified production files (exclude `__tests__/` and `*.test.ts`). Grep for array types missing `readonly` (pattern: `: [A-Z]\w+\[\]` without preceding `readonly`) in new production files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Paste Grep output ("0 matches" = pass)                                                                                                                                                   |
| 3. Branded types                   | Grep for factory function usage (`toTokenCount`, `toRelativePath`, etc.) in implementation AND test files. Grep for suspicious raw literals in type positions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Paste evidence of factory function usage or raw values found                                                                                                                             |
| 4. Comment style                   | Grep for `/\*\*` and `/\*[^/]` in new files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Paste Grep output ("0 matches" = pass)                                                                                                                                                   |
| 5. DI & immutability               | For interface components: re-read constructor — list each param and whether it's an interface or concrete class. For composition roots: verify that only the composition root file uses `new` for infrastructure classes — no `new` leaking into helpers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Interface components: list each constructor param with its type. Composition roots: list each `new` call and confirm it's in the composition root file                                   |
| 6. Tests complete                  | Re-read test file — list every `it(` or `test(` name. Cross-check against Tests table in task file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Two-column list: Tests table row → matching test name (or MISSING)                                                                                                                       |
| 7. Config changes                  | Re-read `shared/package.json` and `eslint.config.mjs` if task required changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | State each required change and whether it's present                                                                                                                                      |
| 8. Lint + typecheck + tests + knip | Reference the §4a output                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | "Passed in §4a with 0 errors, 0 warnings, no new knip findings" or paste output                                                                                                          |
| 9. ESLint gaps                     | Grep for untyped exported objects (`export const \w+ = {` without type annotation). Grep for `else if` chains (3+ branches) in new files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Paste Grep output ("0 matches" = pass)                                                                                                                                                   |
| 10. Layer boundaries               | Grep for banned import patterns in new files (e.g. `from ['"](?!#)\.\.` for cross-layer relative imports, specific banned packages)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Paste Grep output ("0 matches" = pass)                                                                                                                                                   |
| 11. No `let` in production         | Grep for `^\s*let ` in new/modified production files (exclude `__tests__/` and `*.test.ts`). Only boolean control flags in imperative closures are acceptable — accumulators via `let` reassignment are NOT acceptable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Paste Grep output ("0 matches" = pass, or list each as justified boolean control flag)                                                                                                   |
| 12. Zero code clones               | Reference the `pnpm lint:clones` output from §4a. If clones are found, extract shared utilities (see `shared/src/pipeline/glob-match.ts`, `pattern-scanner.ts`) — never duplicate logic across files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | "0 clones found" from §4a output, or list each clone found and how it was eliminated                                                                                                     |
| 13. SQL determinism                | Grep for `date\('now'\)` and `datetime\('now'\)` in new/modified storage files. Any match = fail — pass the current time as a bound parameter from `Clock`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Paste Grep output ("0 matches" = pass)                                                                                                                                                   |
| 14. Orphan test files              | Glob for `*.test.ts` files NOT under `__tests__/` directories in `shared/src/`, `mcp/src/`. Any match = potential orphan (vitest only runs `**/__tests__/**/*.test.ts`). Verify each is either (a) in the vitest include pattern, or (b) should be moved/deleted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | List each orphan found and resolution, or "0 orphans found"                                                                                                                              |
| 15. Conditional dependency loading | For composition roots and bootstrap functions only: Grep new/modified files for `new ` and `.create(` calls. For each, determine if the dependency is always needed or only when certain project characteristics hold (specific file extensions, config flags, WASM grammars). If conditional but eagerly instantiated inside a bootstrap/factory function instead of injected as a parameter and conditionally created in `main()` = fail. If no composition root or bootstrap files were created/modified, this check passes automatically                                                                                                                                                                                                          | List each `new`/`.create()` call with "always needed" or "conditional — injected via [param]", or "N/A — no composition root files modified"                                             |
| 16. Transformer benchmark delta    | For tasks that add or modify a `ContentTransformer` and wire it in `create-pipeline-deps.ts`: run `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts` and note the actual `tokensCompiled` from the test output. The test auto-ratchets `baseline.json` when tokens decrease — no manual editing needed. Check the test stdout for "baseline ratcheted" (tokens improved) or unchanged delta. If the baseline was ratcheted, the updated `baseline.json` will appear in the git diff — commit it with the task. Also run `pnpm test shared/src/integration/__tests__/selection-quality-benchmark.test.ts` to verify file selection is unaffected. If no transformer was added or modified, this check passes automatically | "Benchmark: baseline N tokens → actual M tokens (delta: -X%). Baseline auto-ratcheted / unchanged." and "Selection quality: PASS (paths unchanged)"                                      |
| 17. Transformer file-type safety   | For tasks that add a `ContentTransformer`: Grep the test file for test names matching `safety_` pattern. Verify that for non-format-specific transformers, at least one safety test exists per sensitive file type (Python indentation, YAML structure, JSX syntax). For format-specific transformers, at least one safety test per listed extension. If no transformer was added, this check passes automatically                                                                                                                                                                                                                                                                                                                                    | List each `safety_*` test found, or "N/A — no transformer added"                                                                                                                         |

**4c — Confirm clean and track first-pass quality.**

After §4b, every dimension must be clean (all violations fixed, all re-checks passing). If a dimension reveals an architectural issue that cannot be fixed mechanically (e.g. signature mismatch, wrong layer boundary, missing DI), go to **Blocked diagnostic** — these indicate a task-file or design problem, not a code-style issue.

Track first-pass quality: for each dimension, record whether it was clean on first check or required a fix. This is informational — it helps calibrate the pre-write reference table and per-file quick checks over time but does not gate progress. Report the count in §5a (e.g. "17/17 first-pass clean" or "15/17 first-pass clean, fixed 2: readonly array in X, block comment in Y"). Dimensions 16–17 are conditional — exclude from the denominator when they don't apply (no transformer added). If the per-file quick check (§3) already caught and fixed a violation during implementation, that dimension still counts as first-pass clean — the quick check is part of the first pass.

Once all dimensions are confirmed clean, proceed to §5.

### 5. Finalize

When all dimensions are confirmed clean, complete these three sub-steps in order.

**5a — Report to the user:**

- What was implemented (files created/modified)
- Test results (pass count, confirming no regressions)
- **First-pass quality: N/M** (from §4c, where M = applicable dimensions) — list any dimensions that needed fixing and what was fixed
- **Benchmark impact** (transformer tasks only): "Token reduction: baseline X → actual Y (delta: -Z%). Baseline auto-ratcheted / unchanged." Include this only when dimension 16 applied
- Review findings and fixes applied (if any)
- Any concerns or follow-up items

**5b — Update progress.**

Use the `aic-update-mvp-progress` skill to update `documentation/mvp-progress.md`.

**Critical:** Use today's actual date for the daily log entry. If today's entry already exists, append to it. If it is a new day, create a new entry at the top of the Daily Log section (reverse chronological). Do not put today's work under yesterday's date.

**5c — Archive task, update status, commit, and show diff.**

Run these sequentially in one flow — no user gate between them:

1. **Move the task file first** (before editing status — editing the old path after moving creates a ghost file):
   ```
   mkdir -p documentation/tasks/done && mv documentation/tasks/NNN-name.md documentation/tasks/done/
   ```
2. **Edit the status at the NEW path** (`documentation/tasks/done/NNN-name.md`): change `> **Status:** In Progress` to `> **Status:** Done`. Do NOT edit the old path — the file no longer exists there.
3. **Verify the move** — confirm the old path is gone and the new path has the correct status:
   ```
   test ! -f documentation/tasks/NNN-name.md && head -3 documentation/tasks/done/NNN-name.md
   ```
   If the old file still exists, delete it: `rm documentation/tasks/NNN-name.md`.
4. **Branch guard — verify you are on the feature branch before staging.**

   ```
   git rev-parse --abbrev-ref HEAD
   ```

   If the output is NOT `feat/task-NNN-kebab-name`, switch to it immediately: `git checkout feat/task-NNN-kebab-name`. If the branch does not exist, go to **Blocked diagnostic**. **Never commit to main** — the feature branch isolates all work until the user approves the merge in §6.

5. **Stage only touched files and commit on the feature branch.**

   Use the touched-files list built in §2 — never `git add -A`. Stage each file explicitly:

   ```
   git add path/to/file1.ts path/to/file2.ts ... && git commit -m "feat(<scope>): <what was built>"
   ```

   Before committing, run `git status --porcelain` and compare against the touched-files list. If any file in `git status` is NOT on the list, investigate:
   - If it is a legitimate side-effect of the task (e.g. auto-formatted by lint-staged, auto-ratcheted benchmark), add it to the list and stage it.
   - If it is unrelated (e.g. leftover from a previous branch, editor config, exploration file), do NOT stage it. Leave it unstaged.

   If you accidentally stage an unrelated file, unstage it with `git reset HEAD <path>` before committing.

   Use the conventional commit format: `type(scope): description`, max 72 chars, imperative, no period.

6. **Post-commit hygiene check.** Lint-staged runs during commit and may auto-format files, leaving the working tree dirty. This step catches and resolves that before proposing merge.

   a. Run `git status --porcelain`. Filter the output against the touched-files list — only files on the list matter. If no touched files are dirty, skip to (e).
   b. Stage only the dirty touched files and amend: `git add <touched dirty files> && git commit --amend --no-edit`.
   c. Run `pnpm lint && pnpm typecheck && pnpm test`. If any fail, fix the issues, then stage only the fixed touched files and amend again. Repeat at most twice — if still failing after 2 fix attempts, go to **Blocked diagnostic**.
   d. Run `git status --porcelain` again. Filter against touched-files list. If touched files are still dirty (another lint-staged pass reformatted), repeat from (b). Cap at 3 iterations — if still dirty, something is structurally wrong; go to **Blocked diagnostic**.
   e. Run `git diff main...HEAD --stat` to produce the final file list for the merge proposal. Verify that `git rev-parse --abbrev-ref HEAD` still shows the feature branch name.

### 6. Merge and Clean Up

This step handles the merge and cleanup. Present the diff to the user for approval.

**6a — Propose merge:**

Present:

- The branch name (`feat/task-NNN-kebab-name`)
- The list of files changed (from the `--stat` output in 5c)
- The commit message used
- Ask: **"Merge to main? (yes / adjust message / discard branch)"**

**Do NOT merge automatically.** Wait for the user's response.

**6b — On approval, merge and clean up:**

```
git checkout main
git merge --squash feat/task-NNN-kebab-name
git commit -m "feat(<scope>): <what was built>"
git branch -D feat/task-NNN-kebab-name
```

The squash merge produces a single clean commit on main. Use the same commit message from 5c (or the user's adjusted version).

**6c — If the user says "discard":**

```
git checkout main
git branch -D feat/task-NNN-kebab-name
```

Report that the branch was deleted and no changes were merged.

---

## Blocked Handling

If during execution you encounter something unexpected or cannot fix an issue after 2 attempts:

**Step 1 — Diagnose before blocking:**

Before declaring Blocked, check whether the failure is in your code or in the task file:

- **Signature mismatch:** Does the task file's Interface/Signature still match the actual interface in the codebase? If the interface changed since planning, the task file needs replanning — not more implementation attempts.
- **Type mismatch:** Do the Dependent Types in the task file match the actual types in `core/types/`? If fields are missing or renamed, report the discrepancy.
- **Config conflict:** Does the ESLint change in the task file conflict with the current `eslint.config.mjs` structure? If blocks were reordered or rules changed since planning, report it.
- **Layer violation:** Does the implementation require something banned by the layer's ESLint rules (e.g. storage needing `node:fs`)? This is a design issue, not a code issue.
- **Approach mismatch (circuit breaker):** Did you accumulate 3+ workarounds? List each adaptation. This pattern means the task's chosen approach doesn't fit the actual codebase — the planner needs to re-evaluate alternatives, not the executor needs to try harder.

**Step 2 — Block and report:**

1. **Stop immediately** — do not guess or improvise.
2. Append a `## Blocked` section to the task file with:
   - What you tried (specific code or command)
   - What went wrong (exact error message)
   - Whether the issue is in your code or the task file's spec
   - What decision you need from the user
3. Commit the partial work on the feature branch so nothing is lost — stage only files from the touched-files list:
   ```
   git add <touched files> && git commit -m "wip(task-NNN): blocked — <short reason>"
   ```
4. Switch back to main: `git checkout main`
5. Change the task file status to `Blocked`.
6. Report to the user: include the branch name (`feat/task-NNN-kebab-name`) so they know where the partial work lives. The user can resume later by checking out the branch, or discard it with `git branch -D`.
7. **Wait for guidance**. Do not continue.

---

## Conventions

- Never skip a step — execute them in order
- Never add files or features not listed in the task
- Never modify the task file content (Steps, Signatures, etc.) — only update the Status field
- If something in the task file seems wrong, ask the user rather than silently fixing it
- All verification must pass before reporting success
- Evidence over claims — always read and report actual command output
- All work happens on a feature branch — never commit directly to main. Run `git rev-parse --abbrev-ref HEAD` before every commit to verify
- Merge only when the user approves — present the diff and wait for confirmation
- On discard, delete the feature branch cleanly — main stays untouched
- The planner operates on main; the executor operates on a feature branch — this enables parallel operation without conflicts
