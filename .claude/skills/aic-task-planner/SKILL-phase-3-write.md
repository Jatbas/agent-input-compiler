# Phase 3: Pass 2 — Write + Verify + Finalize

**Goal:** Mechanically map Exploration Report + decisions into template. If not in the report, don't add it; if it is, don't omit it.

**CRITICAL:** After C.6 passes, §6 runs immediately — the task is NOT complete until §6 finishes. Do NOT stop or wait between Pass 2 and §6.

## C.1 Confirm reference files in context

`SKILL-recipes.md` and `SKILL-guardrails.md` were pre-read in §1. Review the matching recipe and guardrails. Re-read only if context truncated (use offset/limit).

## C.2 Mapping table

| Report field                   | Template section                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------- |
| EXISTING FILES                 | Files table (only "Create" for DOES NOT EXIST)                                    |
| EXISTING SOLUTIONS             | Architecture Notes (reuse decisions)                                              |
| SIBLING PATTERN                | Architecture Notes (reuse mandate) + Interface / Signature (structural pattern)   |
| CONSUMER ANALYSIS              | Files table ("Modify" rows for broken consumers)                                  |
| CALLER CHAIN ANALYSIS          | Files table ("Modify" rows for every file in chain) + Steps (closure restructure) |
| APPROACH EVALUATION            | Architecture Notes (chosen approach + rationale)                                  |
| INTERFACES                     | Interface / Signature (first code block)                                          |
| CONSTRUCTOR + METHOD BEHAVIORS | Interface / Signature (second code block — class)                                 |
| DEPENDENT TYPES                | Dependent Types (tiered: T0 verbatim, T1 table, T2 table)                         |
| DEPENDENCIES + ESLINT CHANGES  | Config Changes                                                                    |
| DESIGN DECISIONS               | Architecture Notes                                                                |
| SYNC/ASYNC                     | Steps (implementation step must state this)                                       |
| LIBRARY API CALLS              | Steps (exact function calls in implementation)                                    |
| SCHEMA                         | Steps (SQL step references exact columns)                                         |
| STEP PLAN                      | Steps (method-to-step assignment)                                                 |
| TEST STRATEGY                  | Steps (test step specifies exact mocking)                                         |
| CHANGE-PATTERN INSTANCES       | Architecture Notes (blast radius summary) + Steps (ensure all instances covered)  |
| TEST IMPACT                    | Files table ("Modify" rows for affected tests) + Steps (assertion updates)        |
| COPY TARGET AUDIT              | Steps (exclusion strategy) + Architecture Notes (bundle contents justification)   |
| NON-TS ASSET PIPELINE          | Steps (build copy, CI build step, vitest alias) + Config Changes if needed        |
| BEHAVIOR CHANGES               | Architecture Notes ("Behavior change:" bullets for each observable difference)    |
| BINDING INVENTORY              | Steps ("use existing `name` (line N)" directives for reused bindings)             |
| RESEARCH DOCUMENT              | Header `> **Research:**` line (path to `documentation/research/` file)            |

**Research auto-reference:** If a research document was produced/used, the `> **Research:**` line MUST appear in task header. No document → omit line entirely.

## C.3 Write prohibitions

- Never write "if needed", "or optionally", "may be", "consider", "you could", "might want"
- Never reference another task file ("see Task 009")
- Never write "Create" in Files table for a file the Exploration Report marked EXISTS
- Never put 3+ methods in one step
- Never use raw `string`/`number` for domain-value constructor parameters
- Never paste Tier 1 or Tier 2 types verbatim — use the tiered format (table for Tier 1, table for Tier 2)
- Never use Tier 1 or Tier 2 for types the component calls methods on or constructs inline — those must be Tier 0
- Never write a manual class when the closest sibling uses a factory function for the same purpose — the Interface/Signature must use the same factory
- Never reimplement logic that the sibling delegates to shared utility functions — import and call the existing shared utilities
- Never produce a research document (via §0b or inline) without referencing it in the task's `> **Research:**` header line
- Never describe SQL bind-parameter changes with prose only — show complete `.all(...)`/`.run(...)` argument list
- Never write recursive copy without COPY TARGET AUDIT in exploration
- Never derive a value when target file has existing binding — say "use existing `<name>` (line N)"
- Never make scope depend on uncollected tool output — run tool in exploration or flag blocker
- Never offer alternative idioms when file already uses one — match existing convention

## C.4 Save the task file

Save to `documentation/tasks/$EPOCH-kebab-case-name.md`. Use `$EPOCH` in the heading (final NNN assigned in §6). Use template below.

---

## C.5 Mechanical review

Run all checks using Grep and Read. Fire Step 1 checks in one parallel batch.

**Step 1:** Re-read every referenced interface, type, and `.d.ts` file from disk. Run all checks A–AC in parallel. Report pass/fail with evidence.

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
Cat 8 (tool-conditional scope): "if knip reports", "if knip flags", "if lint shows",
"if lint reports", "if test shows", "if test fails", "if typecheck reports",
"if [tool] reports", "if [tool] flags", "if [tool] shows",
"run [tool] and add", "run [tool] to determine", "check [tool] output"
Tool-conditional scope in non-code text = fail.
Layer 2 — Grep for `" or "` in non-code text. Two alternative actions for executor to choose = fail. Acceptable: conditional behavior, conjunctions, code blocks.
Layer 3 — Grep for parenthesized hedges: `\(if needed\)`, `\(optional\)`, `\(e\.g\.`, `\(or similar\)`. Match = fail.

B. **SIGNATURE CROSS-CHECK:** Class methods must match interface source exactly (params, types, returns). Optional fields (`?:`) accessed → verify steps use `?.` + fallback. Cross-check OPTIONAL FIELD HAZARDS against step text.

C. **DEPENDENT TYPES:** If the component reads/writes/returns any domain type, are type definitions present inline (Tier 0 verbatim, Tier 1 signature+path, Tier 2 path-only)? Never "see task NNN", never empty.

D. **STEP COUNT:** Grep step headers. Any step with 3+ methods or 2+ distinct file paths = fail. Doc steps are not exempt — 1 file per step.

E. **CONFIG CHANGES:** Grep for "None" in Config Changes section. Must be either "None" with no caveats or exact diffs. Grep for "if not present" = fail.

F. **FILES TABLE:** For each "Create" row, Glob the path — if the file exists = fail.

G. **SELF-CONTAINED:** Grep for "see Task", "defined in task", "see task" (case-insensitive). Any match = fail.

H. **CONSTRUCTOR BRANDED TYPES:** For each constructor param representing a domain value, verify the type is a branded type from `core/types/`. Raw `string`/`number` = fail.

I. **VERIFY INSTRUCTIONS:** Read each step's "Verify:" line. Confirm the referenced artifact exists or will exist by that step. Grep for `node -e "` — any match containing `===` without `assert` or `process.exit` = fail (silent comparison, always exits 0).

J. **TEST TABLE ↔ STEP CROSS-CHECK:** Grep each Tests table row name in the step instructions. Grep each test name from steps in the Tests table. Mismatches = fail.

K. **LIBRARY API ACCURACY (external npm only):** Re-read `.d.ts` files. Grep for every method/constructor name used. 0 matches = fail. Cross-check class names, import paths, constructor signatures. No `.d.ts` re-read for used library = fail.

L. **WIRING ACCURACY (composition roots only):** Re-read each concrete class source file. Every `new ClassName(...)` call in the task must match actual constructor signature.

M. **SIMPLICITY CHECK:** Count "Create" rows in the Files table. For a single-concern component (one interface, one class), more than 3 "Create" rows (source + test + one config/migration) requires justification in Architecture Notes. If no justification = fail.

N. **CONSUMER COMPLETENESS (conditional — modified interfaces/types/signatures):** All breaking importers and callers from 14c → "Modify" rows. Missing = fail. No modifications = auto-pass.

O. **CONDITIONAL DEPENDENCY LOADING (conditional — composition roots):** Conditional deps eagerly created in bootstrap = fail. Must inject + conditionally create in `main()`. No conditional deps = auto-pass.

P. **SIBLING PATTERN REUSE (mandatory):**
**(P1)** Siblings with shared utilities → task must import same utilities. Manual class vs sibling's factory = fail.
**(P2)** Second-of-kind → Files table must have shared utility Create/Modify + sibling refactor. Inline copy = fail.
**(P3)** First-of-kind → SHARED CODE PREDICTION must exist. 2+ generic functions inlined = fail.

Q. **TRANSFORMER BENCHMARK STEP (conditional — pipeline transformer):** Task adding `ContentTransformer` must have benchmark verification step. No transformer = auto-pass.

R. **TRANSFORMER SAFETY TESTS (conditional — pipeline transformer):** Non-format-specific → safety test per sensitive type (Python, YAML, JSX). Format-specific → safety test per extension. No transformer = auto-pass.

S. **CODE BLOCK API EXTRACTION (internal project interfaces — mandatory):** Extract every `.methodName(` and `new ClassName(` from all code blocks. For each targeting a project interface/type/storage class in `shared/src/`, Grep source for exact name. 0 matches = fail. Check K covers npm `.d.ts`; check S covers project types.

T. **DATABASE NORMALIZATION (conditional — migration tasks):** Verify NORMALIZATION ANALYSIS is present. For each SQL statement check: **(T1)** 1NF — no multi-value columns. **(T2)** 2NF — no partial key dependencies. **(T3)** 3NF — no transitive dependencies without lookup tables (justified exceptions allowed). **(T4)** Repeated string-domain columns have reference tables (warn for ≤3 values). **(T5)** No derivable columns without justification. No migration = auto-pass.

U. **ACCEPTANCE CRITERIA ACHIEVABILITY (mandatory):** For each criterion:

- References a test → verify task changes don't break it without updating. Self-contradicting = fail.
- References a command → verify changes don't introduce failing patterns.
- Says "all tests pass" → cross-ref TEST IMPACT. Affected tests not in Files table = fail.
- Structurally unreachable = fail.
- Verify line invokes a test → audit it passes pre-task (or scope to post-fix state). EXCLUDED tests must use standalone invocation.

W. **CALLER CHAIN COMPLETENESS (conditional — CALLER CHAIN ANALYSIS present):** Every chain file → "Modify" row + step instructions. Closures/wrappers → explicit restructure instructions. Chain must reach system boundary. No CALLER CHAIN field = auto-pass.

V. **EXISTING TEST COMPATIBILITY (mandatory):** Cross-ref TEST IMPACT and CHANGE-PATTERN INSTANCES:

- Invalidated test assertions → "Modify" row + step instructions to update. Missing = fail.
- Quantitative changes → correct new count in steps. Wrong count = fail.
- Stale-assumption names → rename or justify. ALREADY STALE literals → fix to correct post-task value, not stale value.
- "No test impact" contradicted by CHANGE-PATTERN INSTANCES = fail.
- EXCLUDED tests → standalone invocation in Verify lines. Fixed EXCLUDED tests → register in `pnpm test` or justify exclusion.

X. **COPY TARGET COMPLETENESS (conditional — recursive copy operations):** Verify COPY TARGET AUDIT field exists, lists all subdirectories, and task has exclusion strategy for non-production content. No recursive copies = auto-pass.

X2. **NON-TS ASSET PIPELINE (conditional — runtime non-TS file reads):** Verify NON-TS ASSET PIPELINE field has all YES: build copies asset, CI builds before test, vitest alias to `src/`. No non-TS assets = auto-pass.

Y. **BINDING REUSE (conditional — new code in existing files):** Verify steps use existing bindings instead of redundant derivations. No duplicate/shadow bindings. BINDING INVENTORY field must exist. No new code in modified files = auto-pass.

Z. **BEHAVIOR CHANGE DOCUMENTATION (mandatory — "Modify" rows changing control flow):** For each function with changed conditionals/returns/guards/error paths: verify Architecture Notes has "Behavior change:" bullet (old → new → why). Missing = fail. Pure additions only → auto-pass. Missing BEHAVIOR CHANGES field in report = fail.

AA. **DOCUMENTATION IMPACT COVERAGE (mandatory — non-doc tasks):** STALE/UPDATE files → must be in Files table with Change Specification (current + change + target), or in Follow-up Items. Prose-only doc steps = fail. SECTION EDIT specs need documentation-writer delegation. "No impact" → spot-check with grep. Missing DOCUMENTATION IMPACT field = fail.

AB. **SPECULATIVE TOOL EXECUTION COMPLETENESS (mandatory):** Grep task file for tool-conditional patterns ("if knip", "if lint", etc.). Any match outside code blocks = fail. Files table descriptions must be unconditional. SPECULATIVE TOOL EXECUTION field must exist. `knip.json` modifications must list exact entries.

AC. **FILE CONVENTION CONSISTENCY (mandatory — "Modify" rows adding code):** Step instructions must specify one idiom matching the file's existing conventions (JSON loading, module system, test framework). Alternatives = fail. Missing convention note in BINDING INVENTORY = fail.

**Step 2: Score rubric.** 0 (fail) or 1 (pass) per dimension. Checks: B (interface+signature), C (types), E (config), A (ambiguity), D (steps), H (branded), G (self-contained), J (tests), F (sync), K (library API), L (wiring), M (simplicity), N (consumers), O (conditional deps), P (siblings), Q (transformer benchmark), R (transformer safety), S (code block API), T (normalization), U (acceptance), V (test compat), W (caller chain), X (copy target), X2 (non-TS assets), Y (binding reuse), Z (behavior change), AA (doc impact), AB (tool execution), AC (file convention). Conditional checks auto-pass when precondition unmet.

## C.5b Independent verification agent

After C.5 passes 100%, spawn a `generalPurpose` subagent with:

1. **Role:** "Independent task-file reviewer. No prior context. Find factual errors by cross-checking against source files and the exploration report."
2. **Inputs:** Task file path + every referenced source file path (interfaces, types, migrations, `.d.ts`, modified files) + the Exploration Report (as a read-only appendix for evidence comparison — the reviewer checks task claims against this primary evidence but does not anchor on exploration framing).
3. **Checks** (report FOUND/NOT_FOUND, MATCH/MISMATCH, COMPATIBLE/INVALIDATED):
   - API calls: extract `.methodName(`/`new ClassName(` → Grep interface/`.d.ts`
   - SQL columns: verify against migration `CREATE TABLE`
   - SQL normalization: 1NF, 2NF, 3NF, lookup tables
   - File paths: Glob every "Modify" row → EXISTS/DOES NOT EXIST
   - Signature match: class methods vs interface source
   - Acceptance criteria vs test assertions
   - Test assertion ground-truth: literals vs actual source → CORRECT/STALE
   - Test runner wiring: IN TEST SUITE/EXCLUDED
   - Coverage completeness: CHANGE-PATTERN INSTANCES → in Files table
   - Test impact completeness: invalidated tests → in Files table
   - Caller chain completeness: chain files → in Files table
   - Copy target audit, binding reuse, behavior change completeness, doc impact completeness
   - **Synthesis-vs-exploration check:** Compare each Step and Architecture Note against the Exploration Report. Flag: steps that overstate exploration evidence (e.g., exploration said "uncertain" but step treats as established), steps that omit explored edge cases or caveats, and facts referenced in steps that do not appear in the exploration report.
4. **Output:** Structured findings list. Summary: "PASS — all N confirmed" or "FAIL — M of N errors" with specifics.

**FAIL:** Fix root cause, re-run corresponding C.5 check, re-spawn. Do NOT proceed until PASS.
**PASS:** Proceed to C.6.

## C.5c Independent Codebase Verification

Spawn a `generalPurpose` subagent with task file path, project root, `.cursor/rules/AIC-architect.mdc`. Do NOT provide exploration report.

**Category 1 — Dependency probes** ("Modify" rows with signature changes):

1. `MISSING_CALLER` — callers of changed functions not in Files table
2. `MISSING_CONSUMER` — importers of changed interfaces not in Files table
3. `MISSING_INTERMEDIARY` — intermediaries needing signature changes
4. `CLOSURE_BREAK` — zero-arg closures wrapping functions gaining params

**Category 2 — Convention probes** ("Create" rows): 5. `NAMING` — kebab-case, `*.interface.ts`, `*.test.ts` 6. `LAYER` — correct directory for declared layer 7. `ISP` — interface methods ≤ 5 8. `MIGRATION`/`DDL` — storage class → migration required 9. `WIRING` — new implementor → wire in `mcp/src/server.ts` 10. `BOUNDARY` — no hexagonal violations 11. `BRANDED` — domain-value params use branded types 12. `UNTESTED` — new class/function → test case in Tests table 13. `DIR_IMPACT` — test files with count assertions on affected dirs 14. `STALE_ASSERTION` — hardcoded counts vs actual disk state 15. `TEST_EXCLUDED` — test files not in `pnpm test` 16. `BUNDLE_TESTS` — recursive copy sources with test files 17. `REDUNDANT_BINDING`/`SHADOW_BINDING` — binding conflicts 18. `MISSING_ASSET_COPY`/`CI_NO_BUILD`/`VITEST_ALIAS_STALE` — non-TS asset pipeline

**Output:** `SUMMARY: PASS (0 findings) | FAIL (N dependency + M convention findings)`

**FAIL:** Fix genuine findings (add to Files table + Steps), document false positives. Re-run C.5 + C.5c.
**PASS:** Proceed to C.5d (if triggered) or C.6.

## C.5d Adversarial Re-planning (complexity-gated)

**Trigger (any one):** Files table spans 3+ distinct source directories | 3+ exported signatures change | composition root "Modify" + 2+ other directories modified. None met → skip to C.6.

**When triggered:** Spawn `generalPurpose` subagent with component goal, project root, `project-plan.md`, `implementation-spec.md`, `AIC-architect.mdc`. Instruction: "Independent planner — derive Files table from goal and codebase. Do NOT read existing task files."

**Compare:** Both lists = confirmed. Shadow-only = investigate (genuine miss → add). Planner-only = verify justification. Re-run C.5 for changes. No discrepancies → C.6.

## C.5e Handoff accounting

After each verification stage completes (C.5b, C.5c, C.5d), produce a one-line structured summary before proceeding:

- "C.5b: [N] findings ([M] MISMATCH, [K] NOT_FOUND, [J] INVALIDATED). Synthesis-vs-exploration issues: [count]."
- "C.5c: [N] findings ([M] dependency, [K] convention). Overlap with C.5b: [count] shared root causes."
- "C.5d: [N] discrepancies ([M] shadow-only, [K] planner-only). [J] confirmed."

If C.5b and C.5c both flag the same file or interface, note the overlap — shared findings have higher confidence than single-stage findings.

## C.6 Score and act

**Pipeline order:** C.5 → C.5b → C.5c → C.5d (if triggered). Each stage must PASS before the next. Later-stage findings feed back into earlier checks.

1. Fix every failing check. Re-run that check to confirm. Iterate until stage passes.
2. N/A only when check's precondition is structurally unmet (e.g. "Wiring accuracy" for non-composition-root). Never N/A to avoid work.
3. **Proceed to §6 immediately** when all stages PASS. Do NOT stop or wait — §6 is mandatory.

---

## §6. Finalize and offer execution (MANDATORY — never skip)

Task files are gitignored — finalization copies from worktree to main workspace. After verification passes:

1. **Assign sequential task number (NNN).** NOT the epoch value. From **main workspace root**, scan `documentation/tasks/` and `documentation/tasks/done/` for highest existing number:

   ```
   { ls documentation/tasks/ 2>/dev/null; ls documentation/tasks/done/ 2>/dev/null; } | grep -oE '^[0-9]+' | awk 'length <= 4' | sort -rn | head -1
   ```

   Add 1 to result. Zero-pad to 3 digits if under 100. No files → start at `001`. **Guard:** NNN > 9999 or 10+ digits = you used the epoch — redo.

2. **Update heading in worktree file.** Use StrReplace on the worktree task file to change the `# Task $EPOCH:` heading to `# Task NNN:`.

3. **Copy to main workspace AND remove worktree — one chained command (do NOT split these):**

   ```
   cp <worktree>/documentation/tasks/$EPOCH-name.md <main-workspace>/documentation/tasks/NNN-name.md && \
   cd <main-workspace> && \
   git worktree remove .git-worktrees/plan-$EPOCH && \
   git branch -D plan/$EPOCH
   ```

   Use absolute paths. If `git worktree remove` reports untracked/modified files, add `--force`. **The worktree must be gone before step 4.** Verify: `git worktree list` must not show `plan-$EPOCH`.

4. **Announce:** "Task saved to `documentation/tasks/NNN-name.md`. Score: N/M (X%). Use the @aic-task-executor skill to execute it."

---

## Task File Template

**Recipe variations:** release-pipeline → replace Interface/Signature + Dependent Types with "Publish specification" (see SKILL-recipes.md). fix/patch (behavioral only) → replace Interface/Signature with "Behavior Change" section (Before/After format showing exact inputs, old output, new output), omit Dependent Types if unchanged. fix/patch (signature change) → keep Interface/Signature with before/after signatures. All fix/patch tasks must include a "Behavior Change" section with **Before:** and **After:** descriptions showing the same inputs producing different outputs.

````markdown
# Task NNN: [Component Name]

> **Status:** Pending
> **Phase:** [from progress file]
> **Layer:** [core | pipeline | storage | adapter | mcp | cli]
> **Depends on:** [list of components that must be Done]
> **Research:** [path to research doc if one was produced, otherwise omit this line entirely]

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

- **Root `package.json`:** [exact change or "no change"]
- **`shared/package.json`:** [exact change or "no change"]
- **`mcp/package.json`:** [exact change or "no change"]
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
