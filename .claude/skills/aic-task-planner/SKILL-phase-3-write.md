# Phase 3: Pass 2 — Write + Verify + Finalize

**Goal:** Mechanically map Exploration Report + decisions into template. If not in the report, don't add it; if it is, don't omit it.

**HARD RULE:** After §C.6 passes, §6 runs immediately — the task is NOT complete until §6 finishes. There is no user gate between Pass 2 and §6 (see `SKILL.md §Autonomous execution`).

## C.1 Confirm reference files in context

`SKILL-recipes.md` and `SKILL-guardrails.md` were pre-read in §1. Review the matching recipe and guardrails. Re-read only if context truncated (use offset/limit).

## C.2 Mapping table

| Report field                   | Template section                                                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EXISTING FILES                 | Files table (only "Create" for DOES NOT EXIST)                                                                                                                                                 |
| EXISTING SOLUTIONS             | Architecture Notes (reuse decisions)                                                                                                                                                           |
| SIBLING PATTERN                | Architecture Notes (reuse mandate) + Interface / Signature (structural pattern)                                                                                                                |
| CONSUMER ANALYSIS              | Files table ("Modify" rows for broken consumers)                                                                                                                                               |
| CALLER CHAIN ANALYSIS          | Files table ("Modify" rows for every file in chain) + Steps (closure restructure)                                                                                                              |
| APPROACH EVALUATION            | Architecture Notes (chosen approach + rationale)                                                                                                                                               |
| INTERFACES                     | Interface / Signature (first code block)                                                                                                                                                       |
| CONSTRUCTOR + METHOD BEHAVIORS | Interface / Signature (second code block — class)                                                                                                                                              |
| DEPENDENT TYPES                | Dependent Types (tiered: T0 verbatim, T1 table, T2 table)                                                                                                                                      |
| DEPENDENCIES + ESLINT CHANGES  | Config Changes                                                                                                                                                                                 |
| DESIGN DECISIONS               | Architecture Notes                                                                                                                                                                             |
| SYNC/ASYNC                     | Steps (implementation step must state this)                                                                                                                                                    |
| LIBRARY API CALLS              | Steps (exact function calls in implementation)                                                                                                                                                 |
| SCHEMA                         | Steps (SQL step references exact columns)                                                                                                                                                      |
| STEP PLAN                      | Steps (method-to-step assignment)                                                                                                                                                              |
| TEST STRATEGY                  | Steps (test step specifies exact mocking)                                                                                                                                                      |
| CHANGE-PATTERN INSTANCES       | Architecture Notes (blast radius summary) + Steps (ensure all instances covered)                                                                                                               |
| TEST IMPACT                    | Files table ("Modify" rows for affected tests) + Steps (assertion updates)                                                                                                                     |
| COPY TARGET AUDIT              | Steps (exclusion strategy) + Architecture Notes (bundle contents justification)                                                                                                                |
| NON-TS ASSET PIPELINE          | Steps (build copy, CI build step, vitest alias) + Config Changes if needed                                                                                                                     |
| BEHAVIOR CHANGES               | Architecture Notes ("Behavior change:" bullets for each observable difference)                                                                                                                 |
| FIXTURE SIMULATION             | Files table ("Modify" rows for ASSERTION FLIPS fixtures) + Architecture Notes (`**Auto-ratcheting artifacts:**` bullet for AUTO-RATCHET paths) + Follow-up Items (FIXTURE BLOCKED latent bugs) |
| BINDING INVENTORY              | Steps ("use existing `name` (line N)" directives for reused bindings)                                                                                                                          |
| UNIT CONTRACT                  | Architecture Notes (`**Unit contract:**` bullet listing each numeric slot name)                                                                                                                |
| PREDECESSOR CONTRACTS          | Architecture Notes (`**Predecessor contracts:**` bullet listing consumed outputs)                                                                                                              |
| SIBLING QUORUM                 | Architecture Notes (majority-pattern citation when ≥2 siblings examined)                                                                                                                       |
| RESEARCH DOCUMENT              | Header `> **Research:**` line (path to `documentation/research/` file)                                                                                                                         |

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
- Never remove the only consumer of an imported symbol without also removing its import — steps that drop a call-site (argument removal, helper replacement, signature shrinkage) must explicitly remove or update the import in the same step or a successor step in the same file. `pnpm lint` and `pnpm knip` must stay clean after the step runs; a dangling import that only surfaces at final verification means the step was incomplete.
- Never rewrite an SQL `SELECT`/`INSERT` column list by line anchor without echoing the table-alias convention of the cited line — if the source line uses `cl.intent, cl.files_selected, ...` (table-qualified), the step must write `, cl.<column>`; if the source line is unaliased, write `, <column>`. Mixing the two produces SQL ambiguous-column errors at runtime and will surface in Acceptance Criteria. When one file contains multiple `SELECT` statements with different alias conventions, write the prefix explicitly per step — do not say "append `, total_budget` to the query at line N" without stating the alias.

## C.4 Save the task file

Save to `documentation/tasks/$EPOCH-kebab-case-name.md`. Use `$EPOCH` in the heading (final NNN assigned in §6). Use template below.

---

## C.5 Mechanical review

Run all checks using Grep and Read. Fire Step 1 checks in one parallel batch.

**Step 1:** Re-read every referenced interface, type, and `.d.ts` file from disk. Run all checks A–AF in parallel. Report pass/fail with evidence.

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

N. **CONSUMER COMPLETENESS (conditional — modified interfaces/types/signatures):** All breaking **importers from 14a (all four grep patterns: imports, return-type annotations, type arguments, variable/parameter annotations)** and callers from 14c → "Modify" rows. Verify CONSUMER ANALYSIS in the exploration report lists the four 14a grep commands and their file counts; if any of the four patterns is missing or its file list is empty without justification, fail. Missing = fail. No modifications = auto-pass.

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

Z. **BEHAVIOR CHANGE DOCUMENTATION (mandatory — "Modify" rows changing control flow):** For each function with changed conditionals/returns/guards/error paths: verify Architecture Notes has "Behavior change:" bullet (old → new → why). Missing = fail. Pure additions only → auto-pass. Missing BEHAVIOR CHANGES field in report = fail. **Z-extension — nullish-boundary examples:** When a Step body specifies omission logic using a nullish guard (e.g. "omit when null/undefined/nullish", "omit when not present", "only when non-null"), the Behavior Change section must include at least one example where the guarded value is `0` (zero), showing explicitly whether zero triggers omission or renders a `0.0` clause. Zero-is-not-nullish is a frequent implementor error; leaving the boundary undocumented passes the responsibility to the executor (observed: Task 348 Step 1 said "omit when nullish" but the cache-hit fixture had `tokenReductionPct: 0` and the cache-hit Behavior Change example showed no reduction clause — the two are inconsistent).

AA. **DOCUMENTATION IMPACT COVERAGE (mandatory — non-doc tasks):** STALE/UPDATE files → must be in Files table with Change Specification (current + change + target), or in Follow-up Items. Prose-only doc steps = fail. SECTION EDIT specs need documentation-writer delegation. "No impact" → spot-check with grep. Missing DOCUMENTATION IMPACT field = fail.

AB. **SPECULATIVE TOOL EXECUTION COMPLETENESS (mandatory):** Grep task file for tool-conditional patterns ("if knip", "if lint", etc.). Any match outside code blocks = fail. Files table descriptions must be unconditional. SPECULATIVE TOOL EXECUTION field must exist. `knip.json` modifications must list exact entries.

AC. **FILE CONVENTION CONSISTENCY (mandatory — "Modify" rows adding code):** Step instructions must specify one idiom matching the file's existing conventions (JSON loading, module system, test framework). Alternatives = fail. Missing convention note in BINDING INVENTORY = fail.

AD. **VERIFY PATTERN MATCHABILITY (mandatory — steps with grep-based Verify lines):** For every `Verify:` line whose command is `grep ... 'pattern'` (or `grep -F 'pattern'`, `rg 'pattern'`, `grep ... | ...`), the literal pattern must be a substring that can plausibly appear in the output of the preceding step. Specifically: (1) if the command greps a source file path, the pattern must be a substring that will appear in that file after the step executes (or in a compiler/lint diagnostic referencing the file); (2) if the command greps a file name in a diagnostic (`grep -F 'foo.ts'`), the file must be listed in the Files table; (3) if the step creates or modifies file `NNN-foo.ts` and the Verify pattern is `NNN-bar` (different stem), fail — the grep is vacuous and always exits 0 regardless of real errors. This check catches pattern/path renames (e.g. `grep 005-classifier` on a file named `006-classifier-scores.ts`). Scan-with-grep verifies that rely on empty output (`print nothing`) must reference patterns that would actually appear on failure — otherwise the verify is trivially satisfied.

AE. **METRIC NAMING COHERENCE (mandatory — tasks introducing numeric metrics, scores, indices, or derived measurements):** For every new field whose name implies a semantic meaning (`*Index`, `*Score`, `*Confidence`, `*Rate`, `*Ratio`, `*Distance`, `*Count`, `*Probability`, etc.), verify the formula or algorithm in Interface/Signature or Steps actually computes what the name describes. Red flags: (a) `ambiguityIndex` computed as a signal-absence product rather than inter-candidate competition; (b) `confidence` computed as a per-winner saturation without runner-up margin; (c) `specificity` derived from a count without any normalisation to a reference set; (d) `distance` that is not a metric (asymmetric or violates triangle inequality); (e) any name whose plain-English meaning diverges from the formula. Rename the field or change the formula — never ship a semantic mismatch. Tasks adding no new metric names → auto-pass. This check is subagent-friendly; the C.5b reviewer should be asked explicitly "does each new metric name describe what its formula computes?" with formula and name side by side.

AF. **DERIVED METRIC INPUT PERSISTENCE (mandatory — tasks that persist a derived scalar to storage):** When the task persists a value `Y = f(A, B, …)` to any storage table, all independent inputs `A, B, …` that are produced in the same pipeline step must also be persisted (as their own columns), OR the task must state explicitly in Architecture Notes that the derivation is non-invertible (lossy), document which inputs are dropped, and justify the information loss. Red flags: (a) persisting `ambiguityIndex = (1 − confidence) · (1 − specificity)` while persisting only `confidence`; (b) persisting an aggregate without its components when the raw components are cheap (≤ 8 bytes each); (c) persisting a normalised value without its un-normalised source. The intent is that future analysts can reconstruct any alternative derivation from the stored columns — dropping an input silently defeats this. Tasks not touching storage → auto-pass.

AG. **EXISTING-SYMBOL SIGNATURE FIDELITY (mandatory — Interface/Signature redeclares an existing export):** For every `export function`, `export class`, `export const`, or `export interface` declaration in the `## Interface / Signature` code blocks, determine whether the symbol already exists today. Criteria: the task cites the source file as an existing path (Files row "Modify"), or the task prose says "existing export", "current signature", "signature unchanged", or equivalent. For each such declaration, Grep the cited source file for `export (function|class|const|interface) <SymbolName>`. If the symbol is found, the declared signature in the task must match the actual signature byte-for-byte (parameter names, types, return type, modifiers). Mismatch without an explicit `**Signature change:**` block in the task body showing both `before:` and `after:` = fail. Symbols that do not yet exist (Files row "Create") are exempt and covered by check B. Closes the failure class where the task's redeclared signature diverges from reality (observed: `runCliDiagnosticsAndExit` declared `Promise<number>` when actual was `void`).

AH. **CHANGE SPECIFICATION ROUND-TRIP (mandatory — every `Change Specification` block):** For each Change Specification, parse `Current text`, `Required change`, and `Target text`. Assert mechanical consistency between directive verbs and target mutation:

- "insert X between A and B" → Target must contain the substring `A…X…B` with no other intervening token named in the directive; Current must contain `A…B` adjacently in the same direction.
- "replace X with Y" → Current must contain X; Target must not contain X; Target must contain Y.
- "append X after Y" / "add X after Y" → Target's Y must be immediately followed by X on the same or next line.
- "prepend X before Y" / "add X before Y" → mirror rule.
- "increment N to M" / "update count from N to M" → Target must contain M at the same syntactic position Current had N.
- "remove X" → Current must contain X; Target must not.

Any Change Specification whose Required directive does not match the actual Current→Target mutation = fail. Closes the failure class where directive and target text contradict (observed: Task 325 Step 6 said "alphabetically between A and B" but target placed the insertion between A and C).

AI. **INTRA-BULLET ASSIGNMENT CONSISTENCY (mandatory — Step bodies binding values):** For every bullet or sentence in Step bodies that specifies a value assignment to a named target — patterns `<target> → <expression>`, `<target>: <expression>`, `store <expression> as <target>`, `bind <target> to <expression>`, `set <target> = <expression>` — assert exactly one expression per target within that single bullet/sentence. A bullet that says "`X` → `f(a)` ... store `g(a)`" (two different expressions referencing the same target `X`) = fail. Multiple targets in one bullet are allowed only when each target has exactly one expression. Closes the failure class where a single instruction names two incompatible values for the same slot (observed: Task 322 Step 7 said `tokenReductionRatio → toPercentage(Number(...))` then "store `Number(...)`").

AJ. **UNIT CONTRACT MANDATE (mandatory — tasks that bind numeric values to named slots):** Any task that writes numeric values to a named slot (DB column, interface field, config key, wire-format field, JSON response key, CLI output value) must include, in `## Architecture Notes`, a `**Unit contract:**` bullet listing each numeric slot name with its domain and source:

```
- **Unit contract:**
  - `<slot_name>` ∈ [<range>] — <source expression or citation>
  - `<slot_name>` in <units> — <source expression or citation>
```

Parsing rule: Grep the task for every numeric binding target (Step body assignments, SQL column binds, struct field assignments where the RHS is a numeric expression). Extract the target name. Every extracted target must appear in the Unit contract list with its domain and source. Missing entry = fail. Tasks that bind only booleans, strings, branded IDs, enum values, or timestamps (covered by `ISOTimestamp`) → auto-pass on numeric slots. Closes the failure class where a column named `_ratio` stores a percentage value without the task flagging the scale (observed: Task 322 `token_reduction_ratio` vs `selection_ratio` vs `budget_utilisation`).

AK. **SECTION EDIT RESOLUTION (mandatory — every Change Specification with Target text):** For each Change Specification's `Target text`, Grep the literal text for delegation-placeholder patterns: `produced by`, `generated by`, `output of`, `after running`, `synthesized by`, `result of running`, `written by the documentation-writer`, `written by the <skill>`, `TBD`, `resolved during execution`. If matched, the task must resolve the placeholder during planning via one of: (a) inline the resolved literal text directly in the Target block, (b) cite a file path on disk where the resolved text already lives (`Target text: See documentation/research/<slug>.md lines N-M`), or (c) include a Step that invokes the delegated skill during planning with its output pasted into the task. Unresolved placeholder left for the executor = fail. Closes the failure class where SECTION EDIT shifts the doc-writer invocation from planner to executor (observed: Task 325 Step 8 "produced by running the documentation-writer skill").

AL. **DUAL ANCHOR REQUIRED (mandatory — any line-number reference in task body):** Scan Steps, Change Specifications, Architecture Notes, and Files table descriptions for line-number references: `line N`, `lines N-M`, `:line N`, `at line N`, `line N of <file>`. For each match, assert a literal quoted anchor appears within 40 characters before or after — a grep-unique substring from the referenced line enclosed in backticks or quotes. `line 49 (where `show aic status|last|chat-summary|projects` appears)` passes. `line 49` alone = fail. The literal anchor guarantees the executor can relocate the edit target even after upstream edits shift line numbers. Closes the stale-anchor failure class (pure line numbers become stale between plan time and execute time). **AL-extension — anchor-line proximity:** After locating the anchor text in the step, Grep the cited source file for the anchor substring and record the matching line number. If the matching line differs from the stated line N by more than 5, fail — the anchor exists but the line number is wrong, which will mislead the executor (observed: Task 348 Step 1 cited "line 158" for `lastCompilationForwardedHero` but the anchor `` `AIC optimised context by intent:` `` is at line 173).

AM. **GOAL-TO-ACCEPTANCE TRACEABILITY (mandatory — every task):** Parse the `## Goal` section into atomic clauses (one per comma- or conjunction-separated observable). For each clause, assert at least one bullet in `## Acceptance Criteria` references a concrete proof artifact — a test-case name from the `## Tests` table, a new exported symbol name, a specific CLI output string, a row count assertion, a log-line substring, a file-presence assertion, or an MCP tool name. Generic boilerplate bullets (`pnpm lint clean`, `pnpm typecheck clean`, `no new Date()`, `branded types`) are ignored for traceability counting. A Goal clause with zero traceable acceptance bullet = fail. Closes the failure class where generic acceptance criteria pass while the task's specific goal is silently unmet.

AN. **SOURCE CITATION FIDELITY (mandatory — every `Source:` line in Exploration Report or task body):** Parse every `Source: <path>` line and every verbatim-quoted code/schema block with an adjacent `Source:` attribution. For each: (1) Glob-validate the path exists on disk — missing path = fail; (2) for any verbatim-quoted block, Read the cited file and assert the quoted content appears there byte-for-byte (whitespace-tolerant but token-identical) — content drift = fail; (3) for line-range citations (`shared/src/foo.ts lines 12-34`), assert the range exists and the quoted content matches lines in that range. This check is the foundation every other check trusts — invalidates any downstream pass that relied on hallucinated citations. Closes the failure class where an invented `Source:` anchors an invented quote (a weaker model's highest-impact failure mode).

AO. **EXPLORATION-TO-TASK COVERAGE (mandatory — every task with an Exploration Report):** For every actionable finding in the Exploration Report — patterns recorded as `IN SCOPE`, `WILL BECOME STALE`, `NEEDS UPDATE`, `ALREADY STALE`, `OPTIONAL FIELD HAZARDS` entries, `CHANGE-PATTERN INSTANCES` classified IN-SCOPE, `CONSUMER ANALYSIS` entries marked "will break", `CALLER CHAIN ANALYSIS` chain files, `TEST IMPACT` invalidated assertions, `BEHAVIOR CHANGES` entries — Grep the task file for a corresponding resolution: either a Files-table row naming the affected file, a Step body referencing the finding, an Architecture Notes bullet acknowledging it, or an explicit `## Follow-up Items` entry for deferred findings (only valid under Minimal scope tier). Any IN-SCOPE finding without a resolution in the task = fail. This closes the lossy-compression class where material exploration findings silently drop during Pass 2 writing.

AP. **PREREQUISITE GRAPH VALIDATION (mandatory — task header has `Depends on:` or `Prerequisite:` or `Prerequisite ...`):** Parse the header's prerequisite field(s). For each referenced task:

- Extract the task identifier (NNN or task name).
- Glob `documentation/tasks/*.md`, `documentation/tasks/drafts/*.md`, `documentation/tasks/done/*.md` for a matching file. Not found = fail.
- Read the referenced task's header and record its `Status:` (Pending | In progress | Done).
- Reject contradictory chains: if the current task is authored as `Pending` and names a `Pending` task as a prerequisite, that's a valid chain; if the current task's Goal explicitly requires artifacts the prerequisite has not yet produced and the prerequisite is not `Done`, the task must include an Architecture Notes bullet stating the ordering constraint.
- Detect trivial cycles: if the referenced task's own `Depends on:` names the current task, fail with cycle detected.

Missing prerequisite file, or cycle, = fail. Closes the failure class where a task references a prerequisite that does not exist or forms an impossible chain.

AQ. **DEFERRED-FIELD BOOKKEEPING (mandatory — enforced by `deferral-probe.sh`):** Run `bash .claude/skills/shared/scripts/deferral-probe.sh <task-file>`. The script scans Step bodies (outside fenced code blocks and `## Architecture Notes`) for assignments of the form `` `<field>` → `null` ``, `` `<field>` → `false` ``, `` `<field>` → `0` ``, `` `<field>` → `undefined` ``, `` `<field>` → `None` ``, `` `<field>` → "" ``, `` `<field>` → '' ``, or `` `<field>` → [] `` (also the colon-separated variant), where `<field>` is a backticked identifier. For every hit the task must satisfy at least one of:

- a `## Follow-up Items` section that mentions the field name AND contains a successor task reference matching `(task|Task) NNN`, `pending/NNN-*`, or `documentation/tasks/NNN-*`;
- a sentence in `## Architecture Notes` or `## Goal` naming the field and stating it `remains null` / `stays null` / `always null` / `permanently null` / `never populated` (deliberate permanent zero-value);
- a `## Change Specification` block whose Target text populates the field non-null within the same task.

Exit 1 from `deferral-probe.sh` = fail. Closes the cross-task obligation leak observed in task 322 where `classifier_confidence` shipped hardcoded `null` with the parenthetical "populated in a later task" but no named successor task, causing `aic_quality_report` to report `classifierConfidence.available = false` indefinitely. HARD RULE 22 in `SKILL.md`.

AR. **SUCCESSOR-CONTRACT CLOSURE (mandatory — enforced by `followup-propagation-check.sh`):** Run `bash .claude/skills/shared/scripts/followup-propagation-check.sh <task-file>`. The script globs every other task file in `documentation/tasks/`, `documentation/tasks/done/`, `documentation/tasks/pending/`, extracts `## Follow-up Items` bullets referencing the current task's NNN as a successor, and for each referenced field asserts the field identifier appears somewhere in the current task file (Files table, Goal, Architecture Notes, Steps, Tests, Interface/Signature). Exit 1 from the script = fail. Fix by either expanding scope to cover the field (add a Files row / Step / Acceptance bullet that names it) or editing the originating task's Follow-up Items entry to name a different successor. Closes the 322→330 drift where task 322 advertised `classifierConfidence` against a later task, task 330 landed and passed without touching `quality_snapshots.classifier_confidence`, and no mechanical gate connected the two. HARD RULE 23 in `SKILL.md`.

AS. **FIXTURE SIMULATION COVERAGE (mandatory — conditional on BEHAVIOR CHANGES having at least one entry in the Exploration Report; HARD RULE 25 in `SKILL.md`):** Read the Exploration Report's `FIXTURE SIMULATION` field. Fail the check if any of the following hold:

1. `BEHAVIOR CHANGES` has ≥1 entry but `FIXTURE SIMULATION` is missing, empty, or reads "No fixture simulation required" — the simulation step was skipped.
2. `Importers simulated:` is empty or lists only the primary unit test when the modified symbol is imported by integration tests (grep `shared/src/integration/__tests__/**` and `test/benchmarks/**` independently — every hit must appear).
3. Any fixture classified `ASSERTION FLIPS` whose test file path does NOT appear in the task's `## Files` table as a Modify row — the ripple is declared but not resolved.
4. Any fixture classified `AUTO-RATCHET` whose path does NOT appear verbatim under an `**Auto-ratcheting artifacts:**` bullet in `## Architecture Notes`. The bullet must list every auto-ratcheted path (exact string, one per line) so the executor's §5c Step 2 whitelist can match it byte-for-byte.
5. Any fixture classified `FIXTURE BLOCKED — latent bug` without a named resolution path: either (a) the bug fix appears in the current task's Files table + Steps, or (b) a successor task NNN is named in `## Follow-up Items`, or (c) a justified workaround is documented in `## Architecture Notes` with the workaround's scope described literally (the specific fixture pattern substituted) — silent workarounds in test fixtures fail this check.
   \*\*FAIL → write the missing Files rows / Architecture Notes bullet / Follow-up entry, then re-run C.5. Closes the executor Scope-tripwire firing class observed in task 342 (BF02) where three integration `defaultRulePack` helpers, an expected-selection benchmark, and 4+ unit-test fixture inputs were all discovered at execute time instead of plan time.

AT. **FILES TABLE ROW CAP (mandatory — HARD RULE 6 "Max ten files per task"; enforced by `validate-task.sh`):** Count `Create`/`Modify`/`Verify`/`Delete`/`Replace`/`Rename` rows in the `## Files` table. `> 10` = fail, no inline override. When a feature genuinely spans 11+ files, split: most commonly into a persistence/migration task and a consumer/read-path task that names the first as `Depends on:`. A "File-count note" bullet that rationalises the breach does NOT satisfy this check — it is informational, not exemptive. Closes the "atomic across persistence + consumers" pattern observed in task 347 where 17 files shipped bundled and the planner-gate did not fire.

AU. **STEP COMPLEXITY CAP (mandatory — HARD RULE 6 "One file per step. Max two methods per step"; enforced by `validate-task.sh`):** For every numbered step under `## Steps`, count distinct backtick-quoted source paths ending in `.ts`/`.cjs`/`.mjs`/`.cts`/`.mts`; `≥ 2` = fail. Also count distinct `line N` / `lines N-M` / `at line N` anchors in the step body; `≥ 4` heuristically indicates more than two methods touched = fail. Split the step into one-file-per-step atomic edits before finalising. A step that reads "Modify `compilation-runner.ts` to delete X, import Y, extend `buildFreshMeta`/`buildCacheHitMeta`/`buildLogEntry`, …" concentrates five method edits into one numbered step — the executor treats each step atomically and this concentration is the single most common cause of partial edits. Closes the pattern observed in task 347 where Step 6 packed ≥ 6 method-level edits plus 2 re-exports into one numbered bullet.

AV. **TEST-SURFACE SIBLING COVERAGE (mandatory — HARD RULE 25 task-file-inferred layer; enforced by `validate-task.sh`):** For every `Modify` row whose path is a production `.ts` file under `shared/src/` or `mcp/src/` (not `*.test.ts`, not `*.interface.ts`), Glob the candidate sibling test paths `<dir>/__tests__/<basename>.test.ts` and `<dir>/<basename>.test.ts`. If any sibling exists on disk, the task file must mention that test path somewhere — Files table row, Architecture Notes bullet, Follow-up Items entry, or `**Auto-ratcheting artifacts:**` bullet. An explicit opt-out via a `**Test-surface excluded:**` bullet naming the path and reason (e.g. "pure rename; no assertion touches the renamed identifier") also passes. Missing mention = fail. This check is the mechanical backstop for AS: it catches the failure mode where the Exploration Report's `FIXTURE SIMULATION` field was correctly empty but the planner forgot to list the test file anyway, OR where exploration silently skipped the fixture simulation step. Closes the pattern observed in task 347 where `compilation-runner.ts`, `run-pipeline-steps.ts`, `handlers/compile-handler.ts`, and `cli-diagnostics.ts` each had a sibling test on disk and none were in the Files table.

**Step 1 wrapper (mandatory invocation — single entry point).** Do NOT run the individual sub-scripts as the final gate. Invoke the wrapper once:

```
bash .claude/skills/shared/scripts/planner-gate.sh <task-file>
```

The wrapper runs every sub-gate in parallel, emits ordered per-gate pass/fail output, and appends a `{ "gate": "planner-gate", "status": "ok"|"fail", "target": "<abs-path>" }` record to `.aic/gate-log.jsonl`. Per-sub-gate coverage (which script enforces which check) is canonically listed in `SKILL.md` Output checklist — do not re-list it here; any drift between the two lists is a bug.

`checkpoint-log.sh` reads `.aic/gate-log.jsonl` and refuses `aic-task-planner task-finalized` unless a `planner-gate` ok record matching the current task file exists within the last 30 minutes (matching is task-scoped when `CHECKPOINT_TASK_FILE` is exported on the emission — always export it; see §6 step 7). Emergency bypass `CHECKPOINT_ALLOW_NO_GATE=1` leaves an audit trail. Individual sub-scripts may be run during iteration for faster feedback, but the wrapper is the only accepted gate before §6 finalize.

**Step 2: Score rubric.** 0 (fail) or 1 (pass) per dimension. Checks: B (interface+signature), C (types), E (config), A (ambiguity), D (steps), H (branded), G (self-contained), J (tests), F (sync), K (library API), L (wiring), M (simplicity), N (consumers), O (conditional deps), P (siblings), Q (transformer benchmark), R (transformer safety), S (code block API), T (normalization), U (acceptance), V (test compat), W (caller chain), X (copy target), X2 (non-TS assets), Y (binding reuse), Z (behavior change), AA (doc impact), AB (tool execution), AC (file convention), AD (verify matchability), AE (metric naming coherence), AF (derived metric inputs), AG (existing-symbol signature), AH (change spec round-trip), AI (intra-bullet assignment), AJ (unit contract), AK (section edit resolution), AL (dual anchor), AM (goal traceability), AN (source citation fidelity), AO (exploration coverage), AP (prerequisite graph), AQ (deferred-field bookkeeping), AR (successor-contract closure), AS (fixture simulation coverage), AT (files-table row cap), AU (step complexity cap), AV (test-surface sibling coverage). Conditional checks auto-pass when precondition unmet.

**Check-id namespace note:** `AR` in this rubric means successor-contract closure (`followup-propagation-check.sh`). `AR` in `validate-task.sh` means documentation-routing. Keep both references explicit when reporting failures.

**Run order constraint (AN first).** Check AN must run and pass before any other mechanical check that reads cited content. If AN fails, re-running downstream checks against hallucinated sources wastes work — fix citations first, then re-run the full rubric.

## C.5b / C.5c / C.5d — parallel verification (MANDATORY batching)

After C.5 passes 100%, **dispatch C.5b, C.5c, and — when triggered — C.5d in a single parallel batch** (one message, multiple `Task` tool calls). They have disjoint, independently-designed inputs — C.5b gets the exploration report, C.5c explicitly does NOT, C.5d explicitly does NOT read the task file — so they cannot interact. Wait for all to return, union their findings, then act.

Do NOT run them serially. Serial dispatch was the previous pattern and was the single largest wall-clock cost in Pass 2; it is now a hard regression. The only exception is if C.5d's trigger is not met (skip it entirely — see its own section).

### Dispatch pattern (concrete template)

Issue one assistant message containing either two or three `Task` tool calls in the same tool-use block (two if C.5d's trigger is not met, three if it is). Example shape:

```
Message to user agent (single turn):
  Task(subagent_type="generalPurpose", description="C.5b independent verification",
       prompt="<C.5b role + inputs + checks + critic prompt if critic_required>")
  Task(subagent_type="generalPurpose", description="C.5c codebase verification",
       prompt="<C.5c role + inputs + convention/dependency probes>")
  # Only if C.5d's complexity trigger fires:
  Task(subagent_type="generalPurpose", description="C.5d adversarial re-planning",
       prompt="<C.5d role + inputs + goal-derivation instructions>")
```

A serial sequence of three `Task` calls across three messages is the regression this section blocks. If you catch yourself writing the second subagent call only after the first subagent returns, stop and re-issue them in one batch.

### Critic dispatch (HARD RULE 26 — mechanical, no LLM judgement)

Before rendering the C.5b prompt, read the latest `"gate":"architectural-invariants"` record in `.aic/gate-log.jsonl` (appended by `planner-gate.sh` in C.5 Step 1):

```
grep -F '"gate":"architectural-invariants"' .aic/gate-log.jsonl | tail -1
```

Inspect the record's `critic_required` field:

- `true` → the C.5b prompt MUST render `.claude/skills/shared/prompts/critic-measurement-consistency.md` as an additional critic prompt attached to the C.5b subagent, and the critic's HARD findings block `task-finalized` the same way other C.5b findings do.
- `false` → the C.5b prompt MUST NOT render the critic prompt.

No other input influences this choice — not the task's recipe, not your own estimate of complexity. The mechanical flag in the gate record is authoritative. Inverting it (rendering the critic when `false`, or skipping it when `true`) is a HARD RULE 26 violation.

Handling findings from the parallel batch:

- Union all findings first (no interleaving of fix cycles).
- For each genuine finding, fix the root cause, re-run the corresponding C.5 rubric check, and re-spawn **only the verification stage whose finding triggered the fix** (not all three). Do not re-run a stage that already returned PASS.
- The circuit breaker in §C.6 counts re-runs across stages — three failures of the same check id across any combination of C.5/C.5b/C.5c/C.5d is still the soft cap.

## C.5b Independent verification agent

Spawn a `generalPurpose` subagent with:

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
   - **Metric naming coherence** (AE): for every new field whose name implies a semantic (`*Index`, `*Score`, `*Confidence`, `*Rate`, `*Distance`, `*Probability`, etc.), read the formula and state whether the formula computes what the name describes. If not, report MISMATCH with a proposed rename or formula change.
   - **Derived metric input persistence** (AF): for every derived value persisted to storage, enumerate its independent inputs and verify each is also persisted OR the task justifies the loss.
   - **Verify pattern matchability** (AD): for every grep-based `Verify:` line, assert that the pattern could match real output. Flag vacuous greps (pattern never appears in any produced file or diagnostic).
   - **Pattern-claim verification** (AG-companion): whenever the task prose claims "mirroring `<path>` style", "follows the pattern in `<path>`", "matches the convention in `<path>`", or equivalent imitation language, Read the cited pattern file and enumerate its structural features (export shape — `z.object()` vs shape-object-with-`as const`; factory signature; parameter order; default-value conventions; return type wrapper). Compare byte-for-byte against the task's proposal. Any structural feature in the cited pattern that is not reproduced in the task, or any structural feature in the task that is absent from the cited pattern, is a MISMATCH. Report each feature individually. Closes the pattern-claim-drift failure class (observed: Task 323 claimed to mirror `status-request.schema.ts` but exported `z.object(...)` instead of a shape object — prose said "mirror", structure did not).
   - **Predecessor-contract check** (mandatory — task header has `Depends on:` or `Prerequisite:`): Read every prerequisite task's `## Interface / Signature`, `## Step` bodies, and `## Architecture Notes`. Enumerate every output contract the predecessor establishes: column names and nullability in storage tables, enum values added to branded types, interface methods added, schema fields added, config keys introduced, null-vs-zero semantics for new numeric fields, default-value semantics. For each entry, Grep the current task for a consistent consumption — the current task must not construct input that violates the predecessor's declared nullability, must not read a column name the predecessor did not write, must not assume a non-null value when the predecessor writes null, must not assume an enum value the predecessor did not define. Each mismatch = INVALIDATED with the exact predecessor line cited. Closes the cross-task coherence class (observed: Task 322 wrote `classifier_confidence = NULL`; Task 323 tests assumed a non-null path was exercised).
   - **Synthesis-vs-exploration check:** Compare each Step and Architecture Note against the Exploration Report. Flag: steps that overstate exploration evidence (e.g., exploration said "uncertain" but step treats as established), steps that omit explored edge cases or caveats, and facts referenced in steps that do not appear in the exploration report.
4. **Output:** Structured findings list. Summary: "PASS — all N confirmed" or "FAIL — M of N errors" with specifics.

**FAIL:** Fix root cause, re-run corresponding C.5 check. Re-spawn only C.5b (not C.5c/d) unless the same fix plausibly invalidates their findings. Do NOT proceed until this stage returns PASS.
**PASS:** Contributes one third of the parallel batch result; proceed to C.6 only when C.5c and C.5d (if triggered) have also returned PASS.

## C.5c Independent Codebase Verification

Dispatched **in parallel with C.5b** (see `## C.5b / C.5c / C.5d` above). Spawn a `generalPurpose` subagent with task file path, project root, `.cursor/rules/aic-architect.mdc`. Do NOT provide exploration report.

**Category 1 — Dependency probes** ("Modify" rows with signature changes):

1. `MISSING_CALLER` — callers of changed functions not in Files table
2. `MISSING_CONSUMER` — **any file that uses the modified interface/type** not in Files table. Re-run all four 14a grep patterns independently (imports, return-type annotations, type arguments, variable/parameter annotations) against the entire workspace (`shared/src/`, `mcp/src/`, `integrations/`) without reading the task file or exploration report. Every hit that constructs or returns the type must appear in the Files table when the type's required-field shape changed.
3. `MISSING_INTERMEDIARY` — intermediaries needing signature changes
4. `CLOSURE_BREAK` — zero-arg closures wrapping functions gaining params

**Category 2 — Convention probes** ("Create" rows): 5. `NAMING` — kebab-case, `*.interface.ts`, `*.test.ts` 6. `LAYER` — correct directory for declared layer 7. `ISP` — interface methods ≤ 5 8. `MIGRATION`/`DDL` — storage class → migration required 9. `WIRING` — new implementor → wire in `mcp/src/server.ts` 10. `BOUNDARY` — no hexagonal violations 11. `BRANDED` — domain-value params use branded types 12. `UNTESTED` — new class/function → test case in Tests table 13. `DIR_IMPACT` — test files with count assertions on affected dirs 14. `STALE_ASSERTION` — hardcoded counts vs actual disk state 15. `TEST_EXCLUDED` — test files not in `pnpm test` 16. `BUNDLE_TESTS` — recursive copy sources with test files 17. `REDUNDANT_BINDING`/`SHADOW_BINDING` — binding conflicts 18. `MISSING_ASSET_COPY`/`CI_NO_BUILD`/`VITEST_ALIAS_STALE` — non-TS asset pipeline

**Output:** `SUMMARY: PASS (0 findings) | FAIL (N dependency + M convention findings)`

**FAIL:** Fix genuine findings (add to Files table + Steps), document false positives. Re-run C.5 for any rubric check the finding invalidates, then re-spawn C.5c.
**PASS:** Contributes one third of the parallel batch result; proceed to C.6 only when C.5b and C.5d (if triggered) have also returned PASS.

## C.5d Adversarial Re-planning (complexity-gated)

**Trigger (any one):** Files table spans 3+ distinct source directories | 3+ exported signatures change | composition root "Modify" + 2+ other directories modified. None met → skip entirely; do NOT spawn.

**When triggered:** Dispatched **in parallel with C.5b and C.5c** (see `## C.5b / C.5c / C.5d` above). Spawn `generalPurpose` subagent with component goal, project root, `project-plan.md`, `implementation-spec.md`, `.cursor/rules/aic-architect.mdc`. Instruction: "Independent planner — derive Files table from goal and codebase. Do NOT read existing task files."

**Compare:** Both lists = confirmed. Shadow-only = investigate (genuine miss → add). Planner-only = verify justification. Re-run C.5 for changes. No discrepancies → C.6.

## C.5e Handoff accounting

After each verification stage completes (C.5b, C.5c, C.5d), produce a one-line structured summary before proceeding:

- "C.5b: [N] findings ([M] MISMATCH, [K] NOT_FOUND, [J] INVALIDATED). Synthesis-vs-exploration issues: [count]."
- "C.5c: [N] findings ([M] dependency, [K] convention). Overlap with C.5b: [count] shared root causes."
- "C.5d: [N] discrepancies ([M] shadow-only, [K] planner-only). [J] confirmed."

If C.5b and C.5c both flag the same file or interface, note the overlap — shared findings have higher confidence than single-stage findings.

## C.6 Score and act

**Pipeline order:** C.5 → { C.5b ∥ C.5c ∥ C.5d (if triggered) } — the three verification subagents run in parallel after C.5 passes. Each must individually return PASS before §6 runs; fixes propagate back into C.5 rubric checks as in each subagent's own FAIL handling. Later-stage findings feed back into earlier checks.

1. Fix every failing check. Re-run that check to confirm. Iterate until stage passes.
2. N/A only when check's precondition is structurally unmet (e.g. "Wiring accuracy" for non-composition-root). Never N/A to avoid work.
3. **Proceed to §6 immediately** when all stages PASS. Do NOT stop or wait — §6 is mandatory.

### Circuit breaker — re-run budget

Verification loops must terminate. Maintain a per-check counter `attempts[check_id]`. Increment on every re-run of the same check.

- **Soft cap (3 attempts):** If the same check has failed 3 times and is about to be re-run a 4th time, STOP. Do not iterate further. Produce a HALT report containing: (a) the check id (e.g., `AG`, `AN`, `C.5b-predecessor-contract`), (b) the exact failure message across attempts, (c) the diffs applied between attempts, and (d) a hypothesis section naming the root cause — likely one of: ambiguous exploration evidence, predecessor-task contract conflict, architectural premise that is wrong, or a rule that does not fit the task. Escalate to the user with this report and wait for direction. **Never silently mark the check "N/A" to bypass it.**
- **Hard cap (5 attempts total across all checks):** If the task file has undergone 5 full C.5 re-runs without all checks passing, STOP and escalate regardless of which checks are failing. The correct action may be to split the task, change the chosen recipe, or invoke `SKILL-phase-1-recommend` again with new user input. Continuing wastes tokens and usually produces compounding errors.
- **Reset rule:** Counters reset only after the planner ships the task file (§6). They do not reset across stages — C.5 failing twice then C.5b failing twice counts as 4 total attempts toward the hard cap.

The breaker is mandatory. A task that cannot pass verification within the budget is a signal to re-plan, not to retry.

---

## §6. Finalize and offer execution (MANDATORY — never skip)

Task files are gitignored — finalization copies from worktree to main workspace. After verification passes:

1. **Assign sequential task number (NNN).** NOT the epoch value. From **main workspace root**, scan `documentation/tasks/` and `documentation/tasks/done/` for highest existing number:

   ```
   { ls documentation/tasks/ 2>/dev/null; ls documentation/tasks/done/ 2>/dev/null; } | grep -oE '^[0-9]+' | awk 'length <= 4' | sort -rn | head -1
   ```

   Add 1 to result. Zero-pad to 3 digits if under 100. No files → start at `001`. **Guard:** NNN > 9999 or 10+ digits = you used the epoch — redo.

2. **Update heading in worktree file.** Use StrReplace on the worktree task file to change the `# Task $EPOCH:` heading to `# Task NNN:`.

3. **Copy the task file to the main workspace. One command — do NOT split:**

   ```
   cp <worktree>/documentation/tasks/$EPOCH-name.md <main-workspace>/documentation/tasks/NNN-name.md
   ```

   Use absolute paths. Confirm the file exists on main afterwards (`ls <main-workspace>/documentation/tasks/NNN-name.md`) before proceeding to step 4 — the worktree is about to be deleted, so if the copy failed the task file is lost.

4. **Remove the worktree, branch, and stale metadata via the shared script (MANDATORY — non-negotiable).** Always run from the **main workspace root**:

   ```
   bash .claude/skills/shared/scripts/cleanup-worktree.sh remove \
        <main-workspace>/.git-worktrees/plan-$EPOCH
   ```

   The script removes the directory, prunes `git worktree` metadata, deletes the `plan/$EPOCH` branch, removes the parent `.git-worktrees/` if empty, and **verifies all three are gone**. It exits 0 on success and 1 if any residue remains — treat exit 1 as a HARD STOP and report to the user with the script's stderr.

   Do NOT invent your own `rm -rf` / `git worktree prune` / `git branch -D` sequence — past agents have missed a step or skipped verification, leaving orphan directories behind. The script is the single source of truth.

5. **Announce:** "Task saved to `documentation/tasks/NNN-name.md`. Score: N/M (X%). Use the @aic-task-executor skill to execute it."

6. **Final sweep (MANDATORY — last shell command in the session).** Editors may recreate directory stubs for files they were tracking, and prior interrupted runs may still have orphans elsewhere in `.git-worktrees/`. Run the idempotent sweep after the announcement:

   ```
   bash .claude/skills/shared/scripts/cleanup-worktree.sh sweep
   ```

   Script exit 0 means no orphans remain. Exit 1 means a directory could not be removed — stop and report, do not claim the task is finalized.

7. **Emit the `task-finalized` checkpoint.** Run this exactly — substitute `<abs-task-file>` with the absolute path to the task file you just placed in the main workspace (the `<main-workspace>/documentation/tasks/NNN-name.md` from step 3). **Always export `CHECKPOINT_TASK_FILE`** — the variable makes `checkpoint-log.sh` verify that the most recent `planner-gate` success targeted this specific task file, not just any recent task file:

   ```
   echo "CHECKPOINT: aic-task-planner/task-finalized — complete"
   CHECKPOINT_TASK_FILE=<abs-task-file> \
     bash .claude/skills/shared/scripts/checkpoint-log.sh \
     aic-task-planner task-finalized <abs-task-file>
   ```

   `CHECKPOINT_TASK_FILE` must point to an absolute path of a real file (use the main-workspace path from step 3, never the worktree path which was just deleted in step 4). Without the env var the gate falls back to recency-only enforcement and a stale or unrelated `planner-gate` success for a different task can satisfy this checkpoint — a concurrent-agent / replanning hazard. `checkpoint-log.sh` also rejects with exit 3 if fewer than 5 seconds have elapsed since the last `exploration-complete`; do not batch.

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
- **Unit contract:** [MANDATORY if the task binds any numeric value to a named slot (DB column, interface field, config key, wire-format field, JSON response key). Omit entirely if no numeric bindings exist.]
  - `<slot_name>` ∈ [<range>] — [source expression or file:line citation]
  - `<slot_name>` in <units> — [source expression or file:line citation]
- **Predecessor contracts:** [MANDATORY when `Depends on:` lists a task and the current task consumes its outputs. List each consumed contract: column name + nullability, enum value, interface method signature, config key type, null-vs-zero semantics. Omit if no `Depends on:` or no consumed outputs.]
  - `<contract>` from Task NNN — [exact semantics, e.g. "writes `NULL` until Task M populates the classifier"]

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
// Full type definition, copied byte-for-byte from the CURRENT source file.
// Only types the component directly calls methods on or constructs inline.
// When the type itself changes in this task, split into two labeled blocks:
//   ### Tier 0 — verbatim (current)   ← current-state literal
//   ### Tier 0 — target (after task)  ← post-change literal
// Never label a modified after-state block as "verbatim" — AG (existing-
// symbol signature fidelity) checks against the current source, and a
// mislabeled after-state will fail AG on perfectly valid content.
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

| Test case | Description        | Mock / assert contract                                                                                                                                                                        |
| --------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [name]    | [what it verifies] | [exact mocks (`Clock` → ISO literal, injected store → inline seed), precise assertion (`expect(result.x).toEqual(<literal>)`), any `vi.spyOn(process, "exit")` / `vi.waitFor` pattern needed] |

The **Mock / assert contract** column is mandatory for every row. It carries forward the TEST STRATEGY block from the Exploration Report — never drop to "see step N" or a one-line description. If a test requires no mocks, write `no mocks; <exact assertion literal>`.

## Acceptance Criteria

Every atomic clause of `## Goal` must map to at least one task-specific bullet below — referencing a Tests-table row, a new exported symbol, a specific CLI output string, a JSON field, or a file path. The generic invariants at the end of this list do NOT satisfy goal traceability; they are codebase invariants that every task must already uphold.

**Goal-traceability bullets (MANDATORY — one per Goal clause):**

- [ ] [Goal clause 1 proof: e.g. "Test `persistsSnapshotOnSuccess` asserts the `quality_snapshots` row is inserted with `tokenReductionRatio` equal to `result.meta.tokenReductionPct`"]
- [ ] [Goal clause 2 proof: e.g. "`aic_quality_report` MCP tool is registered in `mcp/src/server.ts` and returns the exact JSON shape fixed in Architecture Notes when called with `{}`"]

**Generic invariants (every task inherits these — never the only bullets):**

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
