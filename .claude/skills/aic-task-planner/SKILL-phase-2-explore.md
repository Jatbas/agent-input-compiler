# Phase 2: Pass 1 — Explore + Decide

**Goal:** Gather every fact, verify mechanically, resolve every decision, present for user review.

**Note:** `shared/package.json`, `eslint.config.mjs`, `SKILL-recipes.md`, `SKILL-guardrails.md` were pre-read in Phase 1 (`SKILL-phase-1-recommend.md`) — do not re-read.

## A.1 Mandatory exploration checklist

Complete every item. Two batches minimize sequential tool-call rounds.

**Exploration scope principle:** The scope of a task and the scope of exploration are independent. A single-file task may require exploration of consumers, siblings, shared utilities, and configuration across the entire codebase. A single-section documentation edit may require full-document analysis. Never limit exploration to match task scope — always explore broadly enough to detect scope-adjacent issues, stale artifacts, and downstream impacts. Less capable models tend to narrow exploration to match the task; this principle counteracts that bias.

**Batch A — fire in one parallel round** (no data dependencies):

1. **Read every interface the component implements** — copy full interface verbatim.
2. **Read target database schema + normalization analysis** — if component touches a table, read migration file, record exact columns. Verify 1NF (no multi-value columns), 2NF (full composite PK dependency), 3NF (no transitive deps → lookup tables), no redundant derivable columns. Record in NORMALIZATION ANALYSIS. Violations in existing schema → flag as prerequisite fix or justified exception.
3. **Check existing files** — Glob every file the recipe pattern would create. Record EXISTS / DOES NOT EXIST.
4. **Verify every external library API** — read installed `.d.ts` under `node_modules/`, record exact class names, constructor signatures, method signatures, import paths. If not installed, search the web.
5. **Check recipe fit (HARD RULE 11 — routed subagent, not inline)** — dispatch a subagent rendered from `.claude/skills/shared/prompts/ask-stronger-model.md` with the strongest available model. Pass the subagent the component description, its target package, the interface/signature snippet, and the decision tree below. The subagent returns `{ recipe: <name>, evidence: <one-sentence why> }`. Do not walk the tree in the orchestrator yourself; the orchestrator's role is to hand off the tree as input and consume the routed verdict.

   Decision tree (top-to-bottom, stop at first YES, each branch answered with evidence):
   - Bug/broken pattern without new component? → **fix/patch** (sub-check: if fix needs new class, use that recipe + fix items)
   - Wraps external library behind core interface? → **adapter**
   - Implements `*Store` + SQL against `ExecutableDb`? → **storage**
   - Implements `ContentTransformer` + wires into pipeline? → **pipeline transformer**
   - Instantiates classes, opens DBs, registers handlers? → **composition root**
   - Gold data, fixtures, benchmark tests? → **benchmark**
   - npm publishing, CI, package metadata? → **release-pipeline**
   - Creates/edits `.md` documentation? → **documentation** (see `SKILL-recipes.md`)
   - None → **general-purpose** (requires full component characterization)

   Never improvise outside a recipe. Record the subagent's chosen recipe + evidence sentence in the exploration log under `RECIPE`.

6. **Sibling analysis + shared code prediction** (mandatory — all recipes):
   - **Siblings with shared utilities:** Read closest sibling, identify shared imports/pattern. New component MUST reuse same utilities and pattern.
   - **Sibling without shared utilities (second-of-kind):** Structurally identical functions → extract to shared utility as prerequisite. Add Create/Modify rows.
   - **First of kind:** Predict generic vs specific parts. 2+ generic → extract to shared utility from day one.
   - Record in SIBLING PATTERN. Check if existing class/interface could gain a method → EXISTING SOLUTIONS.
   - **Multi-layer:** Run sibling analysis independently at each layer.
   - **Quorum (mandatory — ≥2 siblings required):** Never rely on a single "closest sibling" as the canonical pattern. Read at least TWO siblings in the same directory (or the same layer if directory has only one sibling). Compare their structural features (export shape, factory signature, parameter order, default-value conventions, naming). If the two agree → that is the canonical pattern; record both paths. If they disagree → read a third sibling, pick the majority pattern, and record the outlier in SIBLING QUORUM with a note explaining why it is a legacy/outlier. If only one sibling exists in the whole layer → mark it explicitly "SOLE SIBLING — treated as canonical." Record all examined sibling paths in SIBLING QUORUM.
7. **Cross-package duplication check** (conditional — new utility/helper/factory) — Grep entire codebase (`mcp/src/` and `shared/src/`). If equivalent logic exists: (a) extract to `shared/` or (b) justify duplication. Record in EXISTING SOLUTIONS.
8. **Wiring completeness check** (conditional — composition root tasks, OR Modify row for composition root, OR signature change of function called by composition root) — verify every function's return value is consumed or documented as side-effect-only. When non-composition-root task changes a composition-root-called function signature, verify call site and wrappers are in Files table.
   8b. **Stale marker detection** (mandatory) — grep Files table entries for `TODO`, `FIXME`, `HACK`, and phase heading references (`Phase (?:[A-Z]{1,2}|[0-9]+(?:\.[0-9]+)?)\b` — documentation-writer Dimension 9). Cross-reference against `documentation/tasks/progress/aic-progress.md` (main workspace only — gitignored). Record: `[marker] at [file:line] — ACTIONABLE / INFORMATIONAL`. Actionable in modified files → scope expansion candidate.
   8c. **Change-impact pattern scan** (mandatory) — identify the core change pattern of the task: what structural or behavioral change does it introduce? Then grep the ENTIRE codebase for all instances of the same pattern or assumption. This applies to every task type:
   - Adding a new entry to a dispatch table → grep for all dispatch tables that might need the same entry.
   - Changing a function signature → grep for all callers and wrappers (extends item 14c).
   - Renaming a concept → grep for all string references to the old name. When files are renamed or copied-with-rename (e.g. by an install script), trace the **full transitive dependency graph**: (1) grep all references TO each renamed file (direct consumers), (2) grep all references FROM each renamed file to other files in the renamed set (sibling/internal references). A script that rewrites external consumer paths but not internal sibling paths is a bug. Verify the script handles both.
   - Adding a validation rule → grep for all places the validated value is produced.
   - Changing a user-visible path string (CLI output line, formatter string, or any hardcoded path under `.aic/`, `~/.aic/`, or similar) → grep source, `documentation/`, `README.md`, `.claude/` (CLAUDE.md and skill files), and `.cursor/rules/` for the old path string. Also grep the cross-editor sync targets (`AIC-architect.mdc`, `CLAUDE_MD_TEMPLATE` in `install-trigger-rule.ts` and `integrations/claude/install.cjs`) — all must stay byte-identical for the prompt-command sections. Classify each hit as IN SCOPE or FOLLOW-UP.
   - Adding a feature or guard to an editor-specific integration hook (any file under `integrations/<editor>/`) → glob `integrations/*/hooks/` and list every hook with the same event type across all other editors. For each parallel hook: read it and check whether the same behavioral gap exists. Classify as IN SCOPE (add to this task), PARTIAL (same file type but genuinely different concern — justify), or FOLLOW-UP (distinct editor scope, document as companion task). A FOLLOW-UP classification is only valid when the gap is confirmed absent in the parallel hook — never use it to defer a confirmed gap.
     For each instance found, classify as: IN SCOPE (this task fixes it), PARTIAL (this task touches the file but not this instance — justify why), or FOLLOW-UP (different file/concern, deferred). Record in CHANGE-PATTERN INSTANCES. Partial scope → justify why the instance is excluded.

**Batch B — fire in one parallel round after Batch A** (depends on Batch A discoveries):

9. **Read every domain type** the component reads/writes — copy verbatim. Flag every optional field (`?:`) the implementation accesses → OPTIONAL FIELD HAZARDS. Steps must use `?.` + fallback.
10. **Adapters:** determine sync vs async from the interface return type.
11. **Check branded types** — verify correct branded type from `core/types/` for every parameter. Check factory function usage.
12. **Plan step breakdown** — max 2 methods per step, max 1 file per step. Record mapping.
13. **Verify module resolution** — if config changes proposed, read `tsconfig.json`, record `moduleResolution`. Uncertain → blocker.
14. **Trace consumers of modified types/signatures** (conditional — "Modify" file touches interface, type, or exported function signature):
    **(14a)** Grep **four usage patterns** for every modified interface/type, not just `import` statements. A factory function that returns the type or a generic parameterised on the type _imports_ the name and _constructs_ the value but may hide the literal fields inside the function body — naive object-literal greps miss it. Run all four and de-duplicate the file list:
    - (a) Import statements: `import .* \bTypeName\b` (explicit imports).
    - (b) Return-type annotations: `:\s*TypeName\b` and `: Promise<TypeName>` / `: Readonly<TypeName>` / `: ReadonlyArray<TypeName>` (factories and helpers).
    - (c) Type arguments: `<TypeName[,>]` (generics, e.g. `Array<TypeName>`, `Record<string, TypeName>`, `Partial<TypeName>`).
    - (d) Variable/parameter annotations: `:\s*TypeName[\s,)=;{]` (typed locals and parameters).

    Classify every hit as "will break" / "compatible". Breakage → add "Modify" rows. Record the four grep commands actually run and their file counts in CONSUMER ANALYSIS so verification agents can reproduce.
    **(14c)** Grep all direct callers of changed exported functions. Trace recursively to system boundary. Every file in chain → "Modify" row. Zero-arg closures wrapping functions gaining params → parameterize, inline, or restructure. Record in CALLER CHAIN ANALYSIS.
    **14b.** Scope-adjacent string reference scan (conditional — "Modify" files) — for every function name, type name, interface name, constant name, or package name being modified or renamed: grep the full codebase for string-literal occurrences beyond import statements. Check: dispatch tables using string keys (`Record<string, Handler>` entries), error messages referencing the name, log statements, test descriptions (`it("should ... [name] ...")`, `describe("[name]"...)`), comments in other files, documentation, and infrastructure configs (`vitest.config.ts` resolve aliases, `tsconfig.json` path mappings, `.github/workflows/*.yml` step commands, `package.json` scripts). Classify each as "in-scope fix" (add to task scope) or "follow-up" (report to user). Record in SCOPE-ADJACENT REFERENCES. **Pitfall:** `package.json` name changes break resolve aliases.

15. **Existing test impact analysis** (mandatory) — grep `**/*.test.ts`, `**/*.test.js`, `**/__tests__/**` for references to affected files/behaviors. For each invalidated assertion: record test file, line, current value, correct value. Add as "Modify" rows. Record in TEST IMPACT.
    **15b.** Quantitative change scan — when countable quantities change: determine old/new count, grep for old count as literal in tests/scripts/config, grep for names encoding counts. Classify "in-scope fix" / "follow-up".
    **15c.** Test assertion ground-truth audit — for hardcoded literals in assertions, verify against actual source. Already wrong → record as `ALREADY STALE`. Run test file if possible.
    **15d.** Test runner wiring check — classify each test file as "IN TEST SUITE" / "EXCLUDED" from `pnpm test`. EXCLUDED tests need standalone "Verify:" lines. EXCLUDED + broken → flag as pre-existing gap.

16. **Copy/bundle target directory audit** (conditional — recursive copy/bundle ops) — glob full source tree, flag `__tests__/`, `*.test.*`, `node_modules/`, `.git/`. Task must specify exclusion strategy. Record in COPY TARGET AUDIT.

16b. **Non-TS runtime asset check** (conditional — runtime read of non-TS file) — verify: (1) build copies to `dist/`, (2) CI builds before test, (3) vitest aliases to `src/`. Any NO = fix in task. Record in NON-TS ASSET PIPELINE.

16c. **Modified file binding inventory** (mandatory — "Modify" files with new code) — list bindings, module type (CJS/ESM). Existing binding computes needed value → "use existing `<name>` (line N)". Flag shadowing conflicts. Record in BINDING INVENTORY.

17. **Behavior change analysis** (mandatory — for every file in the Files table with action "Modify" where the task changes the logic of an existing function, not just adds a new function/export to the file) — for each function being modified:
    - Read the function in its current state.
    - Identify every conditional branch, early return, guard clause, error handler, default value, and fallback in the function.
    - Compare the pre-change behavior against the post-change behavior. An "observable behavioral difference" is any change in: conditions under which code runs or does not run, values returned in edge cases, side effects triggered or suppressed, error paths taken.
    - Record each behavioral difference in a BEHAVIOR CHANGES field in the Exploration Report: `[file]:[function] — OLD: [what happened before] → NEW: [what happens now] — REASON: [why the change is correct]`.
    - If any behavioral difference exists, the task's Architecture Notes must include a **Behavior change:** bullet explaining the old behavior, the new behavior, and why the change is correct.
    - This is especially critical when: (a) a conditional is narrowed or widened, (b) a new always-available resource is introduced that changes effective reachability, (c) the combination of (a) and (b) creates a correctness requirement that did not exist before.
    - If no "Modify" rows change existing function logic (all modifications are pure additions — new functions, new exports, new imports), record "No behavior changes — modifications are additive only" and move on.

18. **Speculative verification tool execution** (mandatory) — if any step/Files-row/criterion depends on tool output (`pnpm knip`, `pnpm lint`, `pnpm test`, etc.), run the tool during exploration and record exact output. Never defer with "if knip reports." Tool cannot run → resolve by static analysis or flag as **BLOCKER**. Record in SPECULATIVE TOOL EXECUTION.

19. **File convention determination** (mandatory — "Modify" files with multiple valid idioms) — read target file, determine which idiom it uses (JSON loading, module system, test framework, path computation). Step instructions use that idiom only — never alternatives. Record in BINDING INVENTORY.

20. **Predecessor output inventory** (mandatory — task header will list `Depends on:` or `Prerequisite:`) — for every predecessor task named in the header:
    - Glob `documentation/tasks/*.md`, `documentation/tasks/drafts/*.md`, `documentation/tasks/done/*.md` for the predecessor file. Missing → **BLOCKER**.
    - Read the predecessor's `## Interface / Signature`, `## Step` bodies, `## Architecture Notes`, and `## Tests` section.
    - Enumerate every **output contract** the predecessor establishes that this task will consume: new storage column names with nullability and domain, new enum values on branded types, new interface methods with their signatures, new config keys with their types, null-vs-zero semantics for each new numeric field, default-value semantics, new MCP tool names, new CLI subcommand names, new file paths written to disk.
    - For each contract, record: `[contract name] — [semantics from predecessor] — consumed by [this task's step N]`. Mark any contract that appears unstable (predecessor says "returns null until Task M", "temporary placeholder", "to be populated by follow-up") — this task MUST design around the unstable value, not assume it.
    - Record all findings in a PREDECESSOR CONTRACTS field of the Exploration Report. Use this field to populate the task's `## Architecture Notes` → `**Predecessor contracts:**` bullet during Pass 2.

21. **Unit contract inventory** (mandatory — task binds any numeric value to a named slot) — for every numeric value the task will write to a DB column, interface field, config key, wire-format field, JSON response key, or CLI output value:
    - Record the slot name, the expected domain (e.g., `[0, 1]` decimal ratio, `[0, 100]` percentage, raw count in items, duration in milliseconds, duration in seconds), and the exact source expression or file:line where the source value is produced.
    - When the slot's name contains a unit hint (`*_ratio`, `*_pct`, `*_percent`, `*_ms`, `*_seconds`, `*_count`, `*_rate`), verify the expected domain matches the hint. Mismatch → the slot must be renamed or the domain must be converted; do NOT silently store a mismatched scale.
    - Record all findings in a UNIT CONTRACT field of the Exploration Report. Use this field to populate the task's `## Architecture Notes` → `**Unit contract:**` bullet during Pass 2.

**Pre-read items** (in context from Phase 1 — extract findings, do not re-read):

20. **`shared/package.json`** — record dependencies and pinned versions.
21. **`eslint.config.mjs`** — record restricted-import rules for target layer. Determine exact structural change if needed.
22. **Installer-managed content sync** (conditional — touches `.cursor/rules/AIC-architect.mdc`, `.claude/CLAUDE.md`, install.cjs templates, or `mcp/src/install-trigger-rule.ts`) — diff shared sections. Drifted → add "Modify" rows. Record in INSTALLER SYNC. Source of truth: `AIC-architect.mdc`.
23. **Documentation impact analysis** (mandatory — all non-documentation task types) — grep `documentation/`, `README.md`, and `CONTRIBUTING.md` for every entity the task creates, modifies, or renames: component names, interface names, function names, class names, file paths, type names. For each match, read the surrounding context (5 lines before and after) and classify the reference:
    - **WILL BECOME STALE** — the document describes specific details (behavior, signature, wiring, file path) that the task changes. After the task executes, the document will contain incorrect information.
    - **NEEDS UPDATE** — the document references the entity by a name or path being renamed, or describes behavior being modified. The reference is not yet wrong but will be after the task.
    - **UNAFFECTED** — generic mention that does not depend on the specific details being changed (e.g., the entity appears in a high-level architecture list but no detail is given).

    **Enumerated-set impact** (supplementary check — run when the task adds a new member to a group): When the task adds a new member to a group that documentation enumerates — MCP tools, CLI subcommands, prompt commands, pipeline steps, config fields, error codes, branded types, editor hooks — also grep `documentation/`, `README.md`, and `CONTRIBUTING.md` for: (a) the group's current count as a word or digit (e.g., "Six MCP tools", "6 tools", "four prompt commands"), (b) exhaustive listings of the group (tables with one row per member, bullet lists, code block inventories), and (c) prose that references "all" members of the group. Each hit follows the same WILL BECOME STALE / NEEDS UPDATE / UNAFFECTED classification. Entity-name search alone misses this case because the new name has zero hits in existing docs — but every count and exhaustive listing is now incomplete.

    Record all findings in the DOCUMENTATION IMPACT field of the Exploration Report. For each file classified as WILL BECOME STALE or NEEDS UPDATE, determine the change complexity:
    - **MECHANICAL** — the fix is a name/path text replacement with no surrounding prose changes needed.
    - **SECTION EDIT** — the surrounding prose describes behavior, architecture, or usage that must be rewritten to reflect the new state.

## A.2 Produce the Exploration Report

Save to `<worktree>/documentation/tasks/.exploration-$EPOCH-slug.md` (worktree path, not main workspace). Every field must be filled with a `Source:` line citing the exact file path. Cannot cite a source → **"NOT VERIFIED — BLOCKER"**.

```
EXPLORATION REPORT

LAYER: [adapter | storage | pipeline | core | mcp | cli]
RECIPE: [adapter | storage | pipeline | composition-root | benchmark | release-pipeline | fix-patch | general-purpose]

COMPONENT CHARACTERIZATION (general-purpose recipe only — omit for specialized recipes):
- Primary concern: [pure domain logic | bootstrap/factory | integration/orchestration | configuration | type/interface definition | refactoring | test infrastructure]
- Layer: [core | pipeline | bootstrap | mcp | test | cross-layer]
- Interface relationship: [implements existing | defines new | standalone function | no new code]
- Dependency profile: [none | interface-only | external library | database | mixed]
- State model: [stateless | immutable config | mutable (JUSTIFY)]
- Closest recipe: [name] — does not fit because [specific reason]
- Borrowed from closest recipe: [which exploration items or template patterns are reused]
- Function vs class: [function | class] — [reason]
- Existing home: Could not add to existing file/class because [reason]

EXISTING FILES (for every file the recipe pattern would create):
- [file path]: EXISTS / DOES NOT EXIST
  Source: verified via Glob/Read

SIBLING PATTERN (mandatory — answer applicable subsection):

**With shared utilities:** Closest sibling: [path]. Shared imports: [utility: functions]. Pattern: [factory/class]. REUSE MANDATE: must use same utilities.

**Without shared utilities (second-of-kind):** First sibling: [path]. Generic functions: [name → extract to shared utility]. EXTRACTION MANDATE: extract before implementing.

**First of kind:** SHARED CODE PREDICTION: generic [functions + varying param] vs specific [functions]. 2+ generic → extract to shared utility. All specific → "No extraction — [why]".

SIBLING QUORUM (mandatory — from item 6 quorum rule):
- Siblings examined: [sibling A path, sibling B path, (sibling C path if tiebreak needed)]
- Agreement: [AGREE — both match on features X, Y, Z | DISAGREE — majority pattern is <pattern>, outlier is <path> because <reason>]
- Canonical pattern chosen: [pattern name with one-line description]
- Or: SOLE SIBLING — only one sibling exists in layer, treated as canonical: [path]

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

NORMALIZATION ANALYSIS (mandatory when task creates or modifies a migration):
- 1NF: [PASS — all columns atomic | VIOLATION — column X stores multiple values → fix: create junction table Y]
- 2NF: [PASS — no partial dependencies | VIOLATION — column X depends only on part of composite PK → fix: extract to table Y]
- 3NF: [PASS — no transitive dependencies | VIOLATION — column X determines column Y → fix: extract X→Y into lookup table Z]
- Lookup candidates: [column X in table Y has N distinct repeated string values → extract to reference table Z with FK | None — all repeated-value columns already use FKs or are genuinely variable]
- Redundant columns: [column X is derivable from columns A, B via expression → remove and compute at query time | None]
- Justified exceptions: [column X is denormalized because (read performance, SQLite lack of computed columns, etc.) | None]
  Source: [migration file path or "new migration proposed"]

OPTIONAL FIELD HAZARDS (mandatory — list every optional field the implementation accesses):
- [TypeName].[fieldName] (`?:` [FieldType]) — accessed in [method/step] — handle with `?.` and default [value]
- Or: No optional fields accessed by this component.

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

EXISTING SOLUTIONS (conditional — item 6):
- [file]: [what it solves] — Source: [Read/Grep]
- Or: N/A

CONSUMER ANALYSIS (conditional — item 14a):
- [importer]: [will break — member X | compatible]
- Or: N/A

CALLER CHAIN ANALYSIS (conditional — item 14c):
- Changed: [function] in [file] — signature change: [describe]
  Chain: [caller file]:[line] → [upstream] → boundary: [MCP handler/CLI/test]
  Files table impact: [N "Modify" rows added]
- Or: N/A

CHANGE-PATTERN INSTANCES (mandatory — item 8c):
- Pattern: [description] — Instances: [file:line — IN SCOPE/PARTIAL/FOLLOW-UP]
- Total: [N] — covers: [M of N] — partial justification: [reason]
- Or: Isolated change.

TEST IMPACT (mandatory — items 15, 15b, 15c, 15d):
- Side effects: [description]
- Affected assertions: [test file]:[line] — current → required — reason
- Quantitative: Old [N] → New [M] — grep results for literal [N]
- Ground-truth: [test]:[line] — literal [value] vs actual: [CORRECT | ALREADY STALE]
- Wiring: [test file] — [IN TEST SUITE | EXCLUDED] — pre-existing gap: [yes/no]
- Files table impact: [N test "Modify" rows]
- Or: No test impact.

COPY TARGET AUDIT (conditional — recursive copy/bundle):
- Source: [path] — [subdirs with file counts, PRODUCTION/NON-PRODUCTION flags]
- Exclusion strategy: [filter function | selective copy | justified inclusion]
- Or: N/A

NON-TS ASSET PIPELINE (conditional — runtime non-TS file read):
- [asset] — build copies: [YES/NO] — CI builds before test: [YES/NO] — vitest alias: [YES/NO]
- Or: N/A

BEHAVIOR CHANGES (conditional — from item 17, for every "Modify" file where existing function logic changes):
- [file]:[function] — OLD: [what happened before] → NEW: [what happens now] — REASON: [why the change is correct]
- [file]:[function] — OLD: [what happened before] → NEW: [what happens now] — REASON: [why the change is correct]
- Or: No behavior changes — modifications are additive only (new functions, new exports, new imports).

BINDING INVENTORY (conditional — "Modify" files with new code):
- [file] — module: [CJS/ESM] — bindings: [`name` (line N): desc] — reuses: [`name`] — conflicts: [none/details]
- Or: N/A

APPROACH EVALUATION (conditional — recipe deliberation or composition root):
- Approach A vs B: [description, file count] — Chosen: [which] — [why]
- Or: N/A

LAYER BLOCKERS:
- Storage needs node:fs/node:path? [YES → STOP | NO]
- Core/pipeline imports external package? [YES → STOP | NO]
- Adapter imports better-sqlite3 or zod? [YES → STOP | NO]
- Recipe fit? [adapter | storage | pipeline | composition-root | benchmark | release-pipeline | fix-patch | general-purpose]

LIBRARY API CALLS (exact function chain, no "or equivalent"):
- [step]: call [exact function]([args]) → [return type]

MODULE RESOLUTION (only if config changes proposed):
- tsconfig moduleResolution: [value]
- Proposed exports format: [with/without "types" condition]
- Verification: [how TypeScript resolves the proposed paths]

TEST STRATEGY (one sentence per test case):
- [test name]: Mock [X] to [throw/return Y], assert [Z]

TRANSFORMER DETAILS (conditional — pipeline transformer recipe only):
- Format-specific or non-format-specific: [choice] — [why]
- fileExtensions: [list or empty array]
- Wiring position in create-pipeline-deps.ts transformers array: [before/after which transformer]
- Safety test plan:
  - [safety_test_name]: [file type] — [what structural property is verified]
- Current baseline (test/benchmarks/baseline.json entry "1"):
  token_count: [N], duration_ms: [N]

INSTALLER SYNC (conditional — item 20):
- Source of truth: `AIC-architect.mdc`
- Templates: [each file — IN SYNC | DRIFT — section X]
- Files table impact: [N "Modify" rows]
- Or: N/A

DOCUMENTATION IMPACT (mandatory — all non-documentation task types, from item 21):
- Entities searched: [list of component/interface/function/type names grepped in documentation/, README.md, CONTRIBUTING.md]
  - [doc file]:[line] — "[excerpt of matching text]" — WILL BECOME STALE / NEEDS UPDATE / UNAFFECTED
  - Reason: [why this reference will or will not become incorrect after the task]
- Enumerated-set impact: [YES — group: (name), current count/listings found in (files) | NO — task does not add to an enumerated group]
  - [doc file]:[line] — "[excerpt: count or listing]" — WILL BECOME STALE / NEEDS UPDATE / UNAFFECTED
- Documentation files requiring changes: [count] — [list of file paths]
- Change complexity per file:
  - [doc file] — MECHANICAL (name/path replacement only) / SECTION EDIT (prose rewrite needed)
- Or: No documentation impact — grep returned 0 relevant matches for all entities and no enumerated-set impact.
  Source: [verified via Grep of documentation/, README.md, CONTRIBUTING.md for each entity name and group listings]

SPECULATIVE TOOL EXECUTION (mandatory — item 18):
- [tool] — run: [YES (summary) | NO (static analysis: result) | BLOCKER (reason)]
- Scope resolved: [entries/fixes or "no tool-dependent scope"]
- Or: N/A

PREDECESSOR CONTRACTS (mandatory — task has `Depends on:` or `Prerequisite:` header):
- Predecessor: Task NNN (`documentation/tasks/NNN-slug.md`)
  - Contract: [exact slot/column/method/enum/config key name]
    - Semantics: [domain, nullability, null-vs-zero, default value — verbatim from predecessor]
    - Stability: [STABLE | UNSTABLE — predecessor says "<quote>", design this task to not rely on populated value]
    - Consumed by: [this task's Step N / Tests row <name> / Architecture Notes bullet]
- Or: N/A — no predecessor tasks or no consumed contracts.

UNIT CONTRACT (mandatory — task binds any numeric value to a named slot):
- Slot: `<slot_name>` — Domain: [e.g. "[0, 1] decimal ratio" | "[0, 100] percentage" | "count of items" | "duration in ms" | "duration in seconds"] — Source: <expression or file:line>
- Name-hint check: [MATCH — slot name suffix matches declared domain | MISMATCH — slot named `_ratio` but source is `[0, 100]`; action: rename to `_pct` OR convert with `/100`]
- Or: N/A — task binds no numeric values.

DESIGN DECISIONS:
- [decision]: [chosen option] — [why]
```

If any field says "NOT VERIFIED — BLOCKER" or cannot be filled, **STOP and tell the user**. Do not proceed.

## A.3 Mechanical self-verification

Run these checks in parallel before presenting to the user:

1. **Re-read each cited source file** — Read every path in a `Source:` line.
2. **Grep interface/type names** — compare line counts against pasted blocks. Divergence → re-read and fix.
3. **Grep branded type usage** — confirm each constructor parameter's branded type exists in `core/types/`.
4. **Grep existing files** — Glob to confirm EXISTS/DOES NOT EXIST claims.
5. **Cross-check library .d.ts** — re-read cited `node_modules/` paths, confirm signatures match.
6. **Installer sync check** (conditional — INSTALLER SYNC present) — read source-of-truth and templates, confirm match. Drift found → fix report.

Fix every discrepancy in the exploration file before proceeding.

## A.4 Resolve design decisions

Every item must have a single definitive answer — no "or", "optionally", "depending on".

- **Constructor parameters:** Timestamps → `Clock`. Entity IDs → `IdGenerator`. SQL → `ExecutableDb`. File I/O → check layer constraints.
- **Conditional dependencies:** Not eagerly instantiated — accept as injected parameter; composition root decides. Unsure → **ask user**.
- **Method behavior:** ONE sentence per method. Contains "or"/"optionally" → not decided. Pick one or **ask user**.
- **Interface design:** Exactly ONE interface. Never alternatives.
- **Config changes:** Exact changes. "[package] already at [version]; no change" or "add [package] at [version]". ESLint: exact config block or "no change."
- **Branded types:** Cross-reference BRANDED CHECK in report.
- **Layer constraints (HARD GATE):** LAYER BLOCKERS = YES → **STOP and ask user**.
- **Test strategy:** Exact mocking per test: "Mock [X] to [throw/return Y], assert [Z]." Never "mock or skip." When behavior differs by condition (e.g., field present vs absent, value matches vs not), include tests for BOTH paths — one test per distinct outcome. Negative/boundary tests are as important as happy path tests.
- **Library API calls:** Exact function call chain. Not "e.g. X or equivalent."
- **Wiring verification (composition roots):** Verify constructor signatures against actual source.
- **Module resolution (if config changes):** Verify tsconfig supports proposed format.
- **Dispatch pattern:** If any logic in the component has 3+ branches — whether dispatching on an enum, a type discriminator, or ordered predicate matching (path prefix tiers, conditional scoring maps, node-type checks) — choose `Record<Enum, Handler>` for exhaustive enum dispatch or a handler array (`readonly { matches: predicate; handler: value }[]`) for predicate-based dispatch. Write the chosen pattern and show the data structure in the step instructions. Any list of "X => value, Y => value, Z => value, else => default" with 3+ entries is a dispatch pattern that needs this treatment.
- **Forward effect simulation (mandatory):** Trace forward: what state changes → who observes → what breaks. Cross-ref TEST IMPACT and CHANGE-PATTERN INSTANCES. Uncaptured impacts → update and re-run item 15.
- **Signature chain simulation (when exported signature changes):** Pass-through callers → verify signature changes. Originators → verify data access. Zero-arg closures → specify restructure option.
- **Research delegation (optional):** Unanswerable questions → delegate to `aic-researcher` skill.
- **Documentation change production (when DOCUMENTATION IMPACT has STALE/UPDATE):** MECHANICAL → write Change Specification directly. SECTION EDIT → delegate to `aic-documentation-writer`. Add "Modify" rows + doc steps. Scope tier excludes doc changes → Follow-up Items.

## A.4b Simplicity sweep

After resolving all decisions, review the plan for over-engineering. For every new artifact the plan introduces, answer one question:

- **Each new file in Files table:** "Can this live in an existing file?" If an existing file in the same layer/directory handles the same concern, add to it instead.
- **Each new interface:** "Does an existing interface already cover this responsibility?" If it can gain a method, prefer that.
- **Each new type/branded type:** "Is this type used in more than one place?" If used only by the component being built, consider inlining or using an existing type.

**Red flag:** If the plan creates 3+ new files for a single-concern component (beyond source + test), justify each file or simplify.

Record any simplifications made. If simplification changes the STEP PLAN or FILES, update them before proceeding.

## A.4c Scope expansion recommendation (all task types)

If exploration found issues beyond original scope (stale markers, change-pattern instances, scope-adjacent references, consumer breakage, invalidated test assertions, stale assertions, excluded tests, documentation drift, sibling improvements, actionable TODOs) — present three scope tiers:

> **Exploration found issues beyond the original scope.** Choose a scope tier:
>
> **Minimal (original scope only):** Implement only the original task. Found issues are reported as follow-up items.
>
> - Changes: [list the original changes]
> - Issues deferred: [count and brief summary, including documentation files needing updates]
>
> **Recommended (original + high-impact findings):** Original task + fixes for correctness/consistency issues: stale markers, string references, consumer breakage, MECHANICAL doc fixes. SECTION EDIT deferred.
>
> - Additional changes: [list with rationale]
> - Issues deferred: [count + summary]
>
> **Comprehensive (full sweep):** All findings including sibling improvements, TODOs, broader refactoring, all doc changes (MECHANICAL + SECTION EDIT).
>
> - Additional changes: [list with rationale]
> - Issues deferred: None
>
> **"Pick a tier, or tell me a custom scope."**

Wait for the user's response. Update the task scope accordingly before writing the task file in Pass 2. If the user picks Minimal, the deferred issues are listed in a `## Follow-up Items` section at the end of the task file for future planning.

If the user picks Recommended or Comprehensive, re-run the A.4b simplicity sweep on all newly added files — those files were not present during the original A.4b run. If simplification reduces the newly added scope, present the change before proceeding to A.5.

**When to skip this checkpoint:** If exploration found zero issues beyond the original scope (no stale markers, no scope-adjacent references, no consumer breakage beyond what the task already covers), skip A.4c entirely and proceed to A.5. Do not present empty tiers.

## A.5 User checkpoint

Present a decisions-focused summary in chat (full report is in the worktree file):

> **Pass 1 complete.** Full report: `<worktree>/documentation/tasks/.exploration-$EPOCH-slug.md`
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

**Phase complete.** Read `SKILL-phase-3-write.md` and execute it immediately.
