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

**If you do not know something with certainty, STOP and tell the user.** Never guess, assume, or improvise. This applies to:

- **Library APIs:** If you have not read the installed `.d.ts` files, you do not know the API. Do not write class names, import paths, or method signatures from memory. Read the actual type definitions first.
- **Template fit:** If the component does not match any specialized recipe (adapter, storage, pipeline, composition root, benchmark, release-pipeline), use the **general-purpose recipe** from `SKILL-recipes.md`. The general-purpose recipe requires a full component characterization and closest-recipe analysis — it is more rigorous, not less. Never improvise a task structure outside of a recipe.
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
- When the user picks a component from `documentation/tasks/progress/mvp-progress.md` — still run §1 ranking to validate the pick
- User says "review task NNN", "review tasks", or "review all tasks" — triggers the **Review** process (see §7)

## Inputs (read these every time)

1. `documentation/tasks/progress/mvp-progress.md` — what is done, what is next (main workspace only — gitignored)
2. `documentation/project-plan.md` — architecture, ADRs, conventions
3. `documentation/implementation-spec.md` — detailed component specs
4. `documentation/security.md` — security constraints
5. `.cursor/rules/AIC-architect.mdc` — active architectural rules
6. Existing source in `shared/src/` — current interfaces, types, patterns

## Process Overview

The process has **two passes** plus a presentation step. Each pass produces a concrete deliverable. One user gate between passes keeps oversight without unnecessary round-trips.

| Step       | Deliverable                                                                     | User gate?          |
| ---------- | ------------------------------------------------------------------------------- | ------------------- |
| §1 Present | User picks a component                                                          | Yes — wait for pick |
| Pass 1     | Exploration Report + all decisions resolved                                     | Yes — user reviews  |
| Pass 2     | Task file written + 4-stage verified (self → document → codebase → adversarial) | No — self-check     |

---

## §0. Worktree setup (run after §0b confirms task planning)

**Skip this step entirely** if §0b classified the request as analysis-only (classification #2). Create the worktree only when task planning is confirmed — either from §0b classification #1, or after the user confirms research findings and wants to plan (§0b auto-delegation step 6).

The planner operates in a dedicated worktree based on `main` so that task files and exploration reports reflect the current merged state. This enables **parallel operation**: the planner works in its own worktree, executors work in theirs, and the main workspace stays on `main`, untouched.

1. **Optionally update main.** From the main workspace root:

   ```
   git pull --ff-only
   ```

   If this fails:
   - Run `git status --porcelain`. If **non-empty** (dirty working tree), **skip the pull**: tell the user "Working tree has uncommitted changes; creating planning worktree from current main (main may not be up to date with origin)." Then proceed to step 2. This avoids stash and works safely when multiple executors are running — conflicts are typically documentation-only.
   - If the working tree is **clean**, the failure is due to branch state (not on main, or diverged). Tell the user: "Cannot fast-forward main. Resolve manually (e.g. checkout main, pull or rebase) before planning." Do not proceed.

2. Generate a unique worktree name using the Unix epoch:

   ```
   EPOCH=$(date +%s)
   git worktree add -b plan/$EPOCH .git-worktrees/plan-$EPOCH main
   ```

   The epoch suffix guarantees uniqueness — multiple planners can run in parallel without name collisions. **Store the epoch value** (e.g. `1741209600`) — you will use it in branch/directory names throughout.

3. Install dependencies in the worktree (needed for `.d.ts` reads during exploration):

   ```
   pnpm install
   ```

   Run with `working_directory` set to the worktree absolute path.

4. **All planning work (§1 through §6 or §7) happens in the worktree.** Set `working_directory` to the worktree for all Shell commands. Use worktree-prefixed absolute paths for Read, Write, StrReplace, Grep, and Glob. During planning, task files use `$EPOCH` as a temporary identifier (e.g. `documentation/tasks/1741209600-component-name.md`). The final sequential number (NNN) is assigned at merge time in §6.

5. After the task file is saved and verified (end of §6 or §7), assign the final task number, commit, merge, and clean up. See §6 for the full procedure (§7 follows the same merge steps).

---

## §0b. Intent Classification (mandatory — run first, before worktree setup)

Before planning, classify the user's request. The planner must auto-delegate to the `aic-researcher` skill when the request needs investigation, ensuring identical quality regardless of which skill the user invoked.

**Classification decision tree (evaluate in order, stop at first match):**

1. Does the user reference a specific component from `documentation/tasks/progress/mvp-progress.md`, say "plan next task", "what's next", or name a concrete component to plan? → **Task planning** — proceed to §1.
2. Does the user ask to analyze, investigate, or debug something AND explicitly say not to plan or create a task (e.g., "do not create a task", "just analyze", "tell me what's wrong")? → **Analysis-only** — run the Runtime Verification Checklist (below), present findings, stop. No worktree, no task file.
3. Does the request contain question words (how, why, where, what) directed at understanding the codebase? → **Research-then-plan** — delegate to researcher.
4. Does the request contain improvement language (improve, optimize, fix, analyze, gaps, problems, weaknesses, issues)? → **Research-then-plan** — delegate to researcher.
5. Does the request ask to analyze, verify, or improve documentation? → **Research-then-plan** — delegate to researcher (documentation analysis classification).
6. Does the request ask to evaluate a technology, compare options, or assess fit? → **Research-then-plan** — delegate to researcher (technology evaluation classification).
7. Is the intent ambiguous? → **Ask the user:** "This seems like it needs investigation first. Want me to research this before planning, or go straight to planning a specific component?"

**When auto-delegation triggers:**

1. Announce: "This request needs investigation first. Running the research protocol."
2. Read the `aic-researcher` skill's `SKILL.md` (at `.claude/skills/aic-researcher/SKILL.md`).
3. Spawn the `aic-researcher` skill as a subagent (Claude Code: Agent tool with `subagent_type: "general-purpose"` and the full research request; Cursor: Task tool with the `aic-researcher` skill). Do NOT execute the research protocol inline — the researcher skill requires its own multi-agent subagents that cannot be spawned from within the planner's context. Pass the full user request and relevant project context to the subagent.
4. Save the research document to `documentation/research/`.
5. Present findings and ask: "Research complete — see `documentation/research/YYYY-MM-DD-title.md`. Want me to plan tasks based on these findings, or do you want to review the research first?"
6. If the user says proceed, create the worktree now (§0 worktree setup), then continue to §1 with the research document as an additional input.

**The guarantee:** When auto-delegation spawns the researcher as a subagent, the subagent runs the full research protocol — same phases, same quality gates, same multi-agent critics. The output research document is equivalent to what the standalone researcher skill produces.

### Runtime Verification Checklist

This checklist applies in two situations: (1) analysis-only requests (classification outcome #2 above) — run the full checklist then present findings; (2) during Pass 1 exploration when the component interacts with external systems (hooks, editor APIs, third-party tools, database state). In situation (2), integrate the relevant checklist items into Batch A/B exploration.

For each item that applies, collect **actual evidence** — not assumed state. If an item cannot be verified, report it as a blocker.

Read `../shared/SKILL-investigation.md` and apply the **Runtime Evidence Checklist** (database state, deployed files, bootstrap/lifecycle, cache/file system, documentation cross-check, external system behavior, library API shapes). When the investigation touches AIC codebase code, also apply the **Codebase Investigation Depth** requirements from the same file.

---

## §1. Recommend the best next task

**Pre-read all inputs in one parallel batch** — these are needed in Pass 1 regardless of which component the user picks, and pre-reading eliminates a full round of tool calls later:

- `documentation/tasks/progress/mvp-progress.md` (read from main workspace — gitignored)
- `documentation/project-plan.md`
- `documentation/implementation-spec.md`
- `documentation/security.md`
- `.cursor/rules/AIC-architect.mdc`
- `shared/package.json`
- `eslint.config.mjs`
- `SKILL-recipes.md` (this file's sibling — static reference)
- `SKILL-guardrails.md` (this file's sibling — static reference)
- Research document from `documentation/research/` (optional — include if §0b produced one, or if the user provided a path)

From `documentation/tasks/progress/mvp-progress.md`, identify all components with status `Not started` whose dependencies are `Done`.

**Rank** the unblocked components using these criteria (in priority order):

1. **Pattern-setter:** Is this the first component of its kind in the current phase? The first CLI command, first adapter, first storage class, etc. establishes the conventions that all subsequent siblings will follow. Pattern-setters always rank highest.
2. **Implicit prerequisites:** Will other unblocked components import from or depend on this one? Schemas before commands, shared utilities before consumers, composition roots before feature handlers. Components that unblock the most downstream work rank higher.
3. **Phase table order:** Within a phase, the row order in `documentation/tasks/progress/mvp-progress.md` reflects intended implementation sequence. Earlier rows rank higher than later rows when the above criteria do not differentiate.

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

**Exploration scope principle:** The scope of a task and the scope of exploration are independent. A single-file task may require exploration of consumers, siblings, shared utilities, and configuration across the entire codebase. A single-section documentation edit may require full-document analysis. Never limit exploration to match task scope — always explore broadly enough to detect scope-adjacent issues, stale artifacts, and downstream impacts. Auto-mode models tend to narrow exploration to match the task; this principle counteracts that bias.

**Batch A — fire in one parallel round** (no data dependencies; interface paths and library names come from the mvp-spec pre-read in §1):

1. **Read every interface the component implements** — copy the full interface verbatim.
2. **Read the target database schema + normalization analysis** — if the component touches a table, read the migration file. Record exact columns. Then verify normalization to at least 3NF:
   - **1NF:** Every column holds a single atomic value — no comma-separated lists, no JSON arrays serialized into TEXT columns for queryable data. If a column stores multiple values, it must be a separate junction/association table.
   - **2NF:** Every non-key column depends on the entire primary key. If a table has a composite PK, no column may depend on only part of it — split into a separate table with its own PK.
   - **3NF:** No transitive dependencies — a non-key column must not depend on another non-key column. If column B determines column C, extract B→C into a lookup/reference table and store only B as a foreign key.
   - **Lookup tables:** Repeated string values (statuses, categories, types, severity levels) that appear in multiple rows should be extracted into a reference table with an integer or short-text PK, referenced by FK. This reduces storage and enforces consistency.
   - **No redundant columns:** A column whose value can be derived from other columns in the same row (or via a JOIN) should not exist — compute it at query time or in a VIEW.
     Record all normalization findings in the NORMALIZATION ANALYSIS field of the Exploration Report. If a violation is found in an existing schema, flag it as a prerequisite fix (new migration) or document the justified exception.
3. **Check existing files** — for every file the recipe pattern would create, check if it already EXISTS (Glob). Record each.
4. **Verify every external library API by reading installed `.d.ts` files** — locate under `node_modules/`, read them, record exact class names, constructor signatures, method signatures, and import paths. If not installed, search the web. This applies to ALL layers.
5. **Check recipe fit** — walk the decision tree below top-to-bottom. Stop at the **first** YES. Each question must be answered with evidence (file path, interface name, or concrete observation) — not assumption.

   **Recipe decision tree (evaluate in this order):**
   - Is the task fixing a bug, correcting a broken pattern, patching incorrect behavior, or changing deployment/installation behavior WITHOUT creating a new component? → **fix/patch**. Evidence: existing code is broken or incorrect, task description uses "fix", "patch", "correct", "repair", "broken", "bug", or describes wrong behavior that needs to change. **Sub-check:** If the fix requires creating a new adapter/storage/pipeline class, use that specialized recipe instead and incorporate the fix-specific exploration items (pattern exhaustiveness, test impact analysis, fix-verification test) as additional checks.
   - Does the component wrap an external library (npm package) behind a core interface? → **adapter**. Evidence: interface in `core/interfaces/`, library in `package.json`, ESLint restriction needed.
   - Does the component implement a `*Store` interface and execute SQL against `ExecutableDb`? → **storage**. Evidence: store interface, migration file, SQL queries.
   - Does the component implement `ContentTransformer` and wire into `ContentTransformerPipeline`? → **pipeline transformer**. Evidence: implements `ContentTransformer`, has `id`, `fileExtensions`, `transform()`.
   - Does the component instantiate concrete classes, open databases, register handlers, or start a process (`main()`, `createProjectScope()`)? → **composition root**. Evidence: `new ClassName()` calls, transport setup, handler registration.
   - Does the component add or modify gold data, fixture repos, or benchmark evaluation tests in `test/benchmarks/`? → **benchmark**. Evidence: gold JSON files, fixture repos, benchmark test files.
   - Does the component configure npm publishing, CI workflows, or package metadata for release? → **release-pipeline**. Evidence: `publishConfig`, workflow YAML, `npm pack`.
   - Is the task about creating, editing, analyzing, or improving a `.md` documentation file? → **documentation**. Evidence: target file is in `documentation/`, task involves content editing not code implementation. See `SKILL-recipes.md` for the documentation recipe. **Sub-check:** If the task references a specific section of a document (e.g. "update the Claude Code section"), the planner MUST still analyze the full document structure during exploration (items 5b-5e and item 11 in the documentation recipe). A section-scoped task does not mean section-scoped exploration — parallel sections, scope-adjacent consistency, stale markers, structural validation, and mirror document family detection require full-document and cross-document analysis.
   - None of the above? → **general-purpose**. Requires full component characterization, closest-recipe analysis, and existing-home check (see `SKILL-recipes.md`).

   Never improvise a task structure outside of a recipe. If the decision tree produces a surprising result, re-read `SKILL-recipes.md` for that recipe's "When to use" section to confirm.

6. **Sibling analysis, shared code reuse, and shared code prediction** (mandatory — applies to all recipe types regardless of sibling count):
   **When siblings exist and already use shared utilities:** Read the full source code of the closest sibling. Identify: (a) shared factories, utilities, and helpers the sibling imports (use its import statements as evidence), (b) the structural pattern (factory function vs manual class, shared walkers vs custom traversal), (c) which parts are sibling-specific (grammar, node types, naming rules) vs shared infrastructure. The new component MUST reuse the same shared utilities and structural pattern — never reimplement what the sibling delegates to shared code.
   **When a sibling exists but has NOT yet extracted shared utilities (second-of-its-kind):** This is the critical extraction moment. Compare the new component's needs against the sibling's inline code. Any function that is structurally identical but differs only in callbacks, predicates, or config values MUST be extracted to a shared utility file as a prerequisite step in the task. Add "Create" or "Modify" rows to the Files table for the shared utility file, and a "Modify" row for the first sibling (to refactor it to use the new shared utility). Signs of extractable code: traversal logic parameterized only by node-type predicates, factory/builder functions parameterized only by config objects, collection logic parameterized only by filter functions, import-extraction logic parameterized only by node-type identifiers.
   **When first of its kind (no siblings):** Predict which parts of the component are generic vs specific. Generic code is logic whose structure would be identical in a future sibling with different config/predicates — e.g., a tree walker that takes a node-type predicate, a factory that takes a config object, a collector that takes a filter function. If 2+ functions are identified as generic, extract them to a shared utility file from day one so future siblings reuse them without refactoring. If all logic is genuinely specific (no parameterizable structure), document why in the exploration report.
   Record all findings in the SIBLING PATTERN field of the Exploration Report. Additionally, check if any existing class already solves part of the problem or if an existing interface could gain a method. Record reuse findings in the EXISTING SOLUTIONS field.
   **Multi-layer sibling analysis (mandatory when Files table spans 2+ source layers):** When the task modifies files across multiple code layers (e.g. both `shared/src/storage/` and `mcp/src/`), run sibling analysis independently at each layer where files are created or modified. At the MCP handler layer, the "closest sibling" is another tool handler in `server.ts` that has the same structural pattern (Zod arg parsing, try/catch, McpError mapping). At the storage layer, the closest sibling is another method on the same class or a peer store. At the adapter layer, the closest sibling is another adapter implementing a similar interface. Each layer's sibling pattern must be documented in the SIBLING PATTERN field and reflected in the task's step instructions — error handling patterns, argument validation patterns, and response formatting patterns from sibling handlers are as important as shared utility reuse.
7. **Cross-package duplication check** (conditional — if the task creates a new utility, helper, or factory function) — Grep the entire codebase for functionally equivalent code. Check `mcp/src/` and `shared/src/` — not just the target layer. If equivalent logic already exists in another package, the task must either (a) extract the shared logic to `shared/` and modify both consumers, or (b) justify the duplication in Architecture Notes. Record in the EXISTING SOLUTIONS field.
8. **Wiring completeness check** (conditional — composition root tasks, OR any task whose Files table includes a Modify row for the composition root, OR any task that changes the signature of a function called by the composition root) — For every function called in the wiring steps, verify that its return value is either (a) consumed by a subsequent step, or (b) the function is explicitly called for side effects only (document which side effects). If a function returns a rich object and only side effects are needed, note this in Architecture Notes as a follow-up to wire the return value when consumers are ready. When a non-composition-root task changes the signature of a function that the composition root calls (directly or via a closure), verify that the composition root's call site and any intermediary closures or wrappers are updated in the task's Files table and Steps.
   8b. **Stale marker detection** (mandatory — all task types) — for every file in the Files table (both Create and Modify), grep for `TODO`, `FIXME`, `HACK` comments. Also grep for phase references (`Phase [A-Z]`) and cross-reference against `documentation/tasks/progress/mvp-progress.md` (main workspace) to check if the phase is complete while the comment uses future tense. Record each finding as: `[marker] at [file:line] — ACTIONABLE (phase done, work can be done now) / INFORMATIONAL (future work, not yet relevant)`. If an actionable marker is in a file the task modifies, consider adding it to the task scope (present via scope expansion in A.4c). If outside the task's files, report as follow-up.
   8c. **Change-impact pattern scan** (mandatory — all task types) — identify the core change pattern of the task: what structural or behavioral change does it introduce? Then grep the ENTIRE codebase for all instances of the same pattern or assumption. This applies to every task type:
   - **Fix/patch tasks:** Define the broken pattern (e.g., `require("../../shared/")`). Grep for ALL files containing that pattern, not just the files the user mentioned or the first few matches. The fix must cover every instance.
   - **Greenfield tasks:** When creating a new file, adding an entry to a config, or wiring into an existing system — grep for all places that enumerate, count, or assert on the set being changed (e.g., a new hook file added to a directory means finding all tests/scripts that count files in that directory).
   - **Refactoring tasks:** Define the old pattern being replaced. Grep for all occurrences, including test files, scripts, configuration, and documentation.
   - **Any task modifying a directory's contents** (adding/removing files): grep test files for assertions on directory listings, file counts, or glob patterns that match that directory.
     Record every instance found with file path and line number. If the task's scope covers only a subset, Architecture Notes must justify the partial scope. Record in the CHANGE-PATTERN INSTANCES field of the Exploration Report.

**Batch B — fire in one parallel round after Batch A completes** (depends on interfaces, types, and library APIs discovered in Batch A):

9. **Read every domain type the component reads or writes** — copy full type definitions verbatim. Never write "see task NNN." For each type, flag every optional field (`?:`) that the implementation will access. Record these in the OPTIONAL FIELD HAZARDS section of the Exploration Report. The step instructions must use optional chaining (`?.`) and a fallback value when accessing these fields — verify this during C.5.
10. **For adapters wrapping a library**: determine sync vs async from the interface return type.
11. **Check branded types** — for every parameter, verify the correct branded type from `core/types/`. Check factory function usage.
12. **Plan the step breakdown** — count methods, assign to steps (max 2 per step, max 1 file per step). Record the mapping.
13. **Verify module resolution** — if config changes are proposed, read the relevant `tsconfig.json` and record `moduleResolution`. If uncertain → state as blocker.
14. **Trace consumers of modified types and function signatures** (conditional — if any file in the Files table is "Modify" and touches an interface, type, OR exported function signature) — Two sub-checks:
    **(14a) Type/interface consumer trace:** Grep for all importers of any modified interface or type. Classify each as "will break" (uses removed/changed members) or "compatible" (unaffected). If breakage is expected, add "Modify" rows to the Files table for each broken consumer.
    **(14c) Caller chain trace (mandatory when any exported function gains, removes, or changes a parameter, or changes its input object shape):** For every function whose signature changes, Grep the entire codebase for all direct callers (search for the function name followed by `(`). For each caller: (i) determine whether the caller needs updating to pass the new parameter through, (ii) if the caller is itself an exported function or closure that must change its own signature or capture to accommodate the new parameter, trace THAT function's callers recursively. Continue until reaching a system boundary (MCP handler, CLI entry point, test setup). Every file in the chain must appear as a "Modify" row in the Files table. Pay special attention to **closures and wrappers** — a zero-arg closure that wraps a function gaining a new parameter cannot remain zero-arg; either it must accept the parameter, or the closure must be inlined/removed in the handler. Record the full caller chain with file paths in the CALLER CHAIN ANALYSIS field of the Exploration Report. This check catches the specific failure mode where a function deep in the call stack gains a parameter but intermediate wrappers (closures in the composition root, helper functions in payload builders) are not updated.
    14b. **Scope-adjacent string reference scan** (conditional — if any file in the Files table is "Modify") — for every function name, type name, interface name, or constant name being modified or renamed: grep the full codebase for string-literal occurrences beyond import statements. Check: dispatch tables using string keys (e.g. `Record<string, Handler>` entries), error messages referencing the name, log statements, test descriptions (`it("should ... [name] ...")`, `describe("[name]"...)`), comments in other files, and documentation. Flag any that would become stale after the modification. Classify each as: "in-scope fix" (add to task scope) or "follow-up" (report to user). Record in the SCOPE-ADJACENT REFERENCES field of the Exploration Report. This catches references that consumer analysis (item 14) misses because they are string-based, not import-based.

15. **Existing test impact analysis** (mandatory — all task types) — for every file the task creates, modifies, or deletes, AND for every observable side effect of the proposed changes (file count changes in a directory, altered output format, changed config structure, new entries in a list/array, modified wiring):
    - Grep `**/*.test.ts`, `**/*.test.js`, and `**/__tests__/**` for references to the affected files, directories, or behaviors.
    - Read each matching test file. Identify every assertion that depends on state the task will change: hardcoded counts (`=== 12`, `.length === N`), specific file listings, expected output strings, directory snapshots, config shape assertions.
    - For each invalidated assertion: record the test file, line number, current asserted value, and the correct value after the task's changes.
    - Add affected test files as "Modify" rows in the Files table with a description of what changes (e.g., "update file count assertion from 12 to 19").
    - Record all findings in the TEST IMPACT field of the Exploration Report.
      This prevents the classic failure mode: a task's acceptance criteria say "existing tests pass" while the proposed changes silently break hardcoded assertions in those same tests.
      15b. **Quantitative change scan** (mandatory sub-item — triggers whenever item 15 or item 8c identifies a change that alters a countable quantity) — when the task changes how many files exist in a directory, how many entries are in a list, how many columns in a table, or any other enumerable quantity:
    - Determine the old count and the new count.
    - Grep the entire codebase for the old count as a literal number in test files, scripts, and configuration (e.g., `=== 12`, `length === 12`, `expect(12)`, `"12 scripts"`).
    - Grep for variable names, function names, test names, and comments that encode the count in natural language (e.g., `twelve_scripts`, `five_columns`, `TEN_ITEMS`).
    - Each match is a candidate for update. Classify as: "in-scope fix" (add to task) or "cosmetic follow-up" (suggest but don't block).
      Record in the TEST IMPACT field alongside item 15 findings.
      15c. **Test assertion ground-truth audit** (mandatory sub-item — triggers whenever item 15 finds a hardcoded literal in a test assertion) — for every hardcoded numeric or string literal found in a test assertion (counts, file lists, expected outputs, version strings), verify that literal against the actual source it describes:
    - Count the actual files on disk, query the actual database rows, read the actual config structure — whatever the literal claims to represent.
    - If the literal is already wrong before the task runs (stale assertion), record this explicitly in the TEST IMPACT field: `[test file]:[line] — ALREADY STALE: asserts [literal] but actual value is [actual] — silently broken since [reason or "unknown"]`.
    - When a test contains a stale literal, the task spec must state the pre-existing failure and ensure the step instructions fix it to the correct post-task value (not merely "replace old with new" where "old" is itself wrong).
    - If the test file can be run directly (e.g., `node test.js`), run it and confirm whether it currently passes or fails. If it fails, record the failure output.
      This catches the specific failure mode where a planner reads a hardcoded value from a test, assumes it is correct, and transcribes it into the task spec without independent verification.
      15d. **Test runner wiring check** (mandatory sub-item — for every test file the task modifies or references in a "Verify:" line) — verify whether the test file is included in the project's test runner command (`pnpm test`):
    - Read `package.json` `"test"` script and determine which test files it invokes (vitest config, explicit `node` invocations, glob patterns).
    - For each test file the task modifies: classify as "IN TEST SUITE" (invoked by `pnpm test`) or "EXCLUDED" (not invoked — standalone only).
    - Record findings in the TEST IMPACT field: `[test file] — [IN TEST SUITE | EXCLUDED from pnpm test — standalone invocation only]`.
    - If a test is EXCLUDED, the task spec's "Verify:" line must note this: "Run `node [test file]` (not in `pnpm test` — standalone verification)." A verify step that says "pnpm test passes" is misleading if the specific test being modified is not part of `pnpm test`.
    - If a test is EXCLUDED and was found to be silently broken (item 15c), flag this as a pre-existing gap: the test was broken and CI could not catch it.
    - **Test infrastructure gap closure:** If a test file is EXCLUDED and the task modifies or fixes it, evaluate whether the exclusion is intentional (requires special setup, environment, fixtures, or long runtime not suitable for CI) or an oversight (test can run alongside other integration tests with no special requirements). If the exclusion is an oversight, add a step and a "Modify" row for `package.json` to register the test in the root test command. If the exclusion is intentional, document the reason in the task's Architecture Notes. A fixed test that remains EXCLUDED is a fixed test that will silently break again.

16. **Copy/bundle target directory audit** (conditional — if any step uses `cpSync`, `copyFileSync`, `cp -r`, or any recursive directory copy/bundle operation) — for every source directory that will be copied or bundled:
    - Glob the full source directory tree (including all subdirectories) and list every file and subdirectory that will be included.
    - Flag `__tests__/`, `*.test.*`, `*.spec.*`, `node_modules/`, `.git/`, and other non-production content that the recursive operation would include.
    - If unwanted content exists, the task spec must either: (a) specify a `filter` function for `cpSync` that excludes test/non-production files, (b) use selective file copying instead of recursive directory copy, or (c) explicitly justify including the test files (e.g., the bundle is a development tool that ships tests).
    - Record findings in the COPY TARGET AUDIT field of the Exploration Report: list every subdirectory and its file count, flag non-production content, and state the chosen exclusion strategy.
      This catches the specific failure mode where a planner writes a recursive copy command without verifying what subdirectories exist in the source, resulting in test files, fixtures, or development artifacts being included in production bundles.

16b. **Modified file binding inventory** (mandatory — for every file in the Files table with action "Modify" where the task adds new code) — before writing implementation instructions: - Read the file and list all top-level `const`/`let`/`var` bindings, `import` statements, and function declarations that are relevant to the new code being added. - Identify the file's module type: CJS (`require`/`module.exports`) or ESM (`import`/`export`, `import.meta`). - For every value the new code needs (paths, references, config objects, helper functions): check if an existing binding already computes that value. If it does, the step instructions must say "use the existing `<bindingName>` (line N)" — never describe a new derivation for a value the file already computes. - If the new code introduces a binding name that shadows or duplicates an existing one, flag this as a conflict. - Record findings in the BINDING INVENTORY field of the Exploration Report: `[file] — module type: [CJS | ESM] — relevant bindings: [name (line N): description, ...]`.
This catches the specific failure mode where a planner describes a computation (e.g., "derive repoRoot from \_\_dirname") without checking that the file already has that exact binding, leading an executor to introduce a duplicate or conflicting definition.

17. **Behavior change analysis** (mandatory — for every file in the Files table with action "Modify" where the task changes the logic of an existing function, not just adds a new function/export to the file) — for each function being modified:
    - Read the function in its current state.
    - Identify every conditional branch, early return, guard clause, error handler, default value, and fallback in the function.
    - Compare the pre-change behavior against the post-change behavior. An "observable behavioral difference" is any change in: conditions under which code runs or does not run, values returned in edge cases, side effects triggered or suppressed, error paths taken.
    - Record each behavioral difference in a BEHAVIOR CHANGES field in the Exploration Report: `[file]:[function] — OLD: [what happened before] → NEW: [what happens now] — REASON: [why the change is correct]`.
    - If any behavioral difference exists, the task's Architecture Notes must include a **Behavior change:** bullet explaining the old behavior, the new behavior, and why the change is correct or necessary.
    - This is especially critical when: (a) a conditional is narrowed or widened (code that used to run in some cases no longer does, or vice versa), (b) a new always-available resource is introduced (bundled fallback, default config, injected dependency) that changes the function's effective reachability, (c) the combination of (a) and (b) creates a correctness requirement that did not exist before.
    - If no "Modify" rows change existing function logic (all modifications are pure additions — new functions, new exports, new imports), record "No behavior changes — modifications are additive only" and move on.

**Pre-read items** (already in context from §1 — extract findings, do not re-read):

18. **`shared/package.json`** — record dependencies and pinned versions.
19. **`eslint.config.mjs`** — record restricted-import rules for the target layer. If ESLint changes are needed, determine the exact structural change.
20. **Installer-managed content sync** (conditional — if any file in the Files table touches `.cursor/rules/AIC-architect.mdc`, `.claude/CLAUDE.md`, `integrations/claude/install.cjs` (`CLAUDE_MD_TEMPLATE`), `integrations/cursor/install.cjs` (`TRIGGER_RULE_TEMPLATE`), or `mcp/src/install-trigger-rule.ts`) — these files contain duplicated rule content that the installers write to user projects. Changes to shared sections in one file must propagate to the others. Diff the shared sections (architectural invariants, security, dependencies, commits, ESLint, tests, prompt commands) across the affected files. If any section has drifted, add "Modify" rows to the Files table for every file that needs updating. Record all findings in the INSTALLER SYNC field of the Exploration Report. The Cursor installer does NOT write `AIC-architect.mdc` (it is git-committed), so it is never at risk of being overwritten — but it IS the source of truth that templates must match.

### A.2 Produce the Exploration Report

**Write the report to a file**, not to the chat. Save to `documentation/tasks/.exploration-$EPOCH.md` (using the epoch value from §0 — this avoids number collisions when multiple planners run in parallel). This avoids slow chat streaming for a 200–300 line document and gives the user a better review surface (editor search, folding, scrolling).

Every field must be filled. Every field with pasted code must include a `Source:` line citing the exact file path read. If you cannot cite a source, write **"NOT VERIFIED — BLOCKER"**.

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

SIBLING PATTERN (mandatory — answer all applicable subsections):

When siblings exist with shared utilities:
- Closest sibling: [file path]
  Source: [verified via Read — full source code read]
- Shared utilities imported by sibling:
  - [utility file]: [functions: fn1, fn2, ...]
  - [factory file]: [factory function used]
- Structural pattern: [factory | class | other]
- Sibling-specific parts: [what the sibling customizes]
- REUSE MANDATE: New component MUST use same shared utilities and pattern.

When sibling exists WITHOUT shared utilities (second-of-its-kind):
- First sibling: [file path]
- Generic functions in sibling (differ only by predicate/config):
  - [function name]: [what varies per sibling] → extract to [target shared utility file]
- EXTRACTION MANDATE: Extract generic logic to shared utility BEFORE implementing.
  Add extraction + sibling refactor as prerequisite steps in the task.

When first of its kind (no siblings):
- SHARED CODE PREDICTION: Which functions are generic vs specific?
  - Generic (would be identical in future sibling with different config):
    [list functions — with what parameter would vary]
  - Specific (unique to this language/library): [list]
- EXTRACTION PLAN: If 2+ generic functions → extract to shared utility from
  day one. If all specific → "No extraction needed — [why]".

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

EXISTING SOLUTIONS (conditional — only if checklist item 6 triggered):
- [file path]: [what it already solves, fully or partially]
  Source: [verified via Read/Grep]
- Or: No existing solutions — this is genuinely new.
- Or: Not applicable — first component of this recipe type in this layer.

CONSUMER ANALYSIS (conditional — only if checklist item 14a triggered):
- [importer file path]: [will break — uses changed member X | compatible — unaffected]
  Source: [verified via Grep for import statements]
- Or: Not applicable — no existing interfaces or types are modified.

CALLER CHAIN ANALYSIS (conditional — only if checklist item 14c triggered):
- Changed function: [functionName] in [file path] — signature change: [describe]
  Callers (recursive chain):
  1. [caller file]:[line] — [callerFunction] calls [changedFunction] — NEEDS UPDATE: [what changes]
     1a. [upstream caller file]:[line] — [upstreamFunction] calls [callerFunction] — NEEDS UPDATE / NO CHANGE
  2. [another caller file]:[line] — [anotherCaller] — NEEDS UPDATE / NO CHANGE
  Boundary reached: [MCP handler | CLI entry | test setup] at [file]:[line]
  Files table impact: [N files added as "Modify" rows]
- Or: Not applicable — no exported function signatures change.

CHANGE-PATTERN INSTANCES (mandatory — all task types, from item 8c):
- Core change pattern: [exact pattern or structural change description]
- Instances found:
  - [file path]:[line] — [pattern match or assumption] — IN SCOPE / PARTIAL SCOPE (justified) / FOLLOW-UP
- Total instances: [N] — task covers: [M of N] — justification for partial scope: [reason or "full coverage"]
  Source: [verified via Grep — show the grep pattern used]
- Or: No codebase-wide pattern — change is isolated to the target file(s).

TEST IMPACT (mandatory — all task types, from items 15, 15b, 15c, and 15d):
- Observable side effects of proposed changes:
  - [side effect description, e.g. "hooks directory will contain 22 files instead of 19"]
- Affected test assertions:
  - [test file]:[line] — current: [assertion] — required: [new assertion] — reason: [why it breaks]
  - [test file]:[line] — function name `[name]` encodes stale count — rename to `[new name]`
- Quantitative changes:
  - Old count: [N] → New count: [M] — grep for literal `[N]` in test files: [results]
  - Names encoding old count: [list or "none found"]
- Ground-truth audit (from item 15c):
  - [test file]:[line] — literal [value] — verified against [source]: [CORRECT | ALREADY STALE — actual is [actual value]]
  - Test execution result: [PASS | FAIL — "[error message]" | NOT RUNNABLE — [reason]]
- Test runner wiring (from item 15d):
  - [test file] — [IN TEST SUITE | EXCLUDED from pnpm test — standalone invocation only]
  - Pre-existing gap: [test was broken AND excluded from CI — silent failure | None]
- Files table impact: [N test files added as "Modify" rows]
- Or: No test impact — proposed changes do not alter any observable state that tests assert on.

COPY TARGET AUDIT (conditional — from item 16, only if task includes recursive copy/bundle):
- Source directory: [path]
  - Subdirectories:
    - [subdir] — [N files] — [PRODUCTION | NON-PRODUCTION: __tests__, test fixtures, etc.]
  - Total files: [N production] + [M non-production]
- Exclusion strategy: [filter function | selective copy | justified inclusion | N/A]
- Or: Not applicable — task does not include recursive copy/bundle operations.

BEHAVIOR CHANGES (conditional — from item 17, for every "Modify" file where existing function logic changes):
- [file]:[function] — OLD: [what happened before] → NEW: [what happens now] — REASON: [why the change is correct]
- [file]:[function] — OLD: [what happened before] → NEW: [what happens now] — REASON: [why the change is correct]
- Or: No behavior changes — modifications are additive only (new functions, new exports, new imports).

BINDING INVENTORY (conditional — from item 16b, for every "Modify" file where new code is added):
- [file path] — module type: [CJS | ESM]
  - Relevant bindings:
    - `[name]` (line [N]): [brief description — e.g. "repo root path"]
    - `[name]` (line [N]): [brief description]
  - New code reuses: `[bindingName]` (line [N]) — task step must say "use existing"
  - Conflicts: [none | `[newName]` would shadow existing `[existingName]` at line N]
- Or: Not applicable — no modified files receive new code that could conflict with existing bindings.

APPROACH EVALUATION (conditional — only if recipe fit required deliberation OR component is a composition root):
- Approach A: [description] — files: [count], new artifacts: [count]
- Approach B: [description] — files: [count], new artifacts: [count]
- Chosen: [A or B] — [why]
- Or: Not applicable — recipe fit is obvious, single clear approach.

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

INSTALLER SYNC (conditional — only if checklist item 19 triggered):
- Source of truth: `.cursor/rules/AIC-architect.mdc`
- Template files checked:
  - `integrations/claude/install.cjs` (`CLAUDE_MD_TEMPLATE`): [IN SYNC | DRIFT — section X differs]
  - `integrations/cursor/install.cjs` (`TRIGGER_RULE_TEMPLATE`): [IN SYNC | DRIFT — section X differs]
  - `mcp/src/install-trigger-rule.ts`: [IN SYNC | DRIFT — section X differs]
  - `.claude/CLAUDE.md`: [IN SYNC | DRIFT — section X differs]
- Files table impact: [N files added as "Modify" rows]
- Or: Not applicable — task does not touch installer-managed content.

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
6. **Installer sync check** (conditional — only if INSTALLER SYNC section is present) — for each template file listed, read both the source-of-truth file and the template, and confirm the shared sections match. If drift is found and the exploration report says "IN SYNC," fix the report and add the drifted files to the Files table.

For every discrepancy found, fix the exploration file (use targeted edits on `documentation/tasks/.exploration-$EPOCH.md`) before proceeding. Do NOT present unchecked claims to the user.

### A.4 Resolve design decisions

Work through this checklist using the verified Exploration Report. Every item must have a single definitive answer — no "or", "optionally", "depending on".

**Constructor parameters:** For each parameter, state WHY it's needed:

- Generates timestamps? → needs `Clock`
- Generates entity IDs? → needs `IdGenerator`
- Executes SQL? → needs `ExecutableDb`
- Reads/writes files? → check layer constraints (storage bans `node:fs`)

**Conditional dependencies:** For each dependency the component creates or wires, ask: "Is this always needed, or only when certain project characteristics hold?" If a dependency is only relevant under certain conditions (e.g., a language provider only matters when the project has files of that language; a WASM grammar only matters for a specific file extension), the component must NOT eagerly instantiate it. Instead:

- Accept it as an **injected parameter** (optional or via an array) — never create it internally
- The **composition root** decides at runtime whether to create it, based on observable project state (e.g., file extension scan)
- If async initialization is required (WASM, network), it stays in the composition root's `main()` — the bootstrap functions remain sync

This prevents wasting startup time and memory on resources the project never uses. As more language providers, external integrations, or heavy adapters are added, this scales linearly only for what the project actually needs.

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

**Dispatch pattern:** If any logic in the component has 3+ branches — whether dispatching on an enum, a type discriminator, or ordered predicate matching (path prefix tiers, conditional scoring maps, node-type checks) — choose `Record<Enum, Handler>` for exhaustive enum dispatch or a handler array for predicate-based dispatch. Write the chosen pattern and show the data structure in the step instructions. Review the algorithm sketch from A.0/A.1: any list of "X => value, Y => value, Z => value, else => default" with 3+ entries is a dispatch pattern that needs this treatment.

**Forward effect simulation (mandatory — all task types):** For every proposed change in the task, trace the causal chain forward: "What observable state changes after this task is executed?" Then trace who observes that state. This catches impacts that item-specific checks miss because they look backward (who imports this type?) rather than forward (who asserts on this directory's file count?).

Walk through each change:

1. **What changes:** new file created, file modified, file deleted, directory contents altered, config entry added/removed, wiring changed, output format altered.
2. **Who observes the change:** tests that assert on the affected state, scripts that enumerate the affected directory, config consumers that parse the affected format, downstream components that depend on the changed wiring.
3. **What breaks:** hardcoded counts, expected output strings, directory snapshots, config shape assertions, function names that encode assumptions.

Cross-reference findings against the TEST IMPACT and CHANGE-PATTERN INSTANCES fields from the Exploration Report. If forward simulation reveals impacts not already captured by items 8c, 15, and 15b, update those fields. If the TEST IMPACT field says "No test impact" but forward simulation finds observers of the changed state, re-run item 15 with the newly discovered observers.

**Function signature chain simulation (mandatory sub-step when any exported function's signature changes):** For every function whose input type, parameter list, or return type changes: list every caller found by item 14c's caller chain trace. For each caller, answer: "Does this caller pass the new parameter through from its own caller, or does it originate the value?" If the caller originates the value, it is a **boundary** — verify it has access to the needed data (e.g., an MCP handler has access to parsed args; a CLI function has access to argv). If the caller passes through, verify its own signature or closure capture changes to accommodate the new parameter. If a caller is a zero-arg closure or wrapper that can no longer be zero-arg, the task must either (a) parameterize the closure, (b) inline the closure into the handler, or (c) restructure the call. The task file must specify which option, not leave it to the executor.

**Research delegation (optional depth boost):** At any point during A.4, if the planner encounters a question that its exploration checklist cannot answer — an approach evaluation with 2+ viable candidates, a sibling analysis for a first-of-kind component where shared code prediction is speculative, or a cross-package duplication check that requires understanding intent — it can delegate to the `aic-researcher` skill protocol. Read `.claude/skills/aic-researcher/SKILL.md` and run the appropriate protocol (codebase analysis or gap/improvement analysis). Use the research findings to make the decision. This is optional — only when the planner judges it needs deeper investigation than its checklist provides.

### A.4b Simplicity sweep

After resolving all decisions, review the plan for over-engineering. For every new artifact the plan introduces, answer one question:

- **Each new file in Files table:** "Can this live in an existing file?" If an existing file in the same layer/directory handles the same concern, add to it instead.
- **Each new interface:** "Does an existing interface already cover this responsibility?" If it can gain a method, prefer that.
- **Each new type/branded type:** "Is this type used in more than one place?" If used only by the component being built, consider inlining or using an existing type.

**Red flag:** If the plan creates 3+ new files for a single-concern component (beyond source + test), justify each file or simplify.

Record any simplifications made. If simplification changes the STEP PLAN or FILES, update them before proceeding.

### A.4c Scope expansion recommendation (all task types)

After exploration completes (A.1 through A.4b), if the exploration discovered issues beyond the original task scope — stale markers in modified files (item 8b), change-pattern instances not in original scope (item 8c), scope-adjacent string references that would go stale (item 14b), consumer breakage beyond the minimum fix (item 14), test assertions invalidated by the changes (items 15, 15b), pre-existing stale test assertions (item 15c), tests excluded from the test runner (item 15d), sibling improvements, actionable TODOs in touched files, or for documentation tasks: parallel section asymmetry, structural mismatches, scope-adjacent inconsistencies, mirror document divergences (items 5b-5e, item 11) — present three scope tiers to the user before proceeding to the user checkpoint:

> **Exploration found issues beyond the original scope.** Choose a scope tier:
>
> **Minimal (original scope only):** Implement only the original task. Found issues are reported as follow-up items.
>
> - Changes: [list the original changes]
> - Issues deferred: [count and brief summary]
>
> **Recommended (original + high-impact findings):** Implement the original task plus fixes for issues that directly affect correctness or consistency of the modified code/document. Typically: stale markers in modified files, string references that would break, consumer fixes for type breakage.
>
> - Additional changes: [list each with one-line rationale]
> - Issues deferred: [count and brief summary of remaining low-priority items]
>
> **Comprehensive (full sweep):** Implement the original task plus fix all found issues, including sibling improvements, actionable TODOs, and broader refactoring opportunities.
>
> - Additional changes: [list each with one-line rationale]
> - Issues deferred: None
>
> **"Pick a tier, or tell me a custom scope."**

Wait for the user's response. Update the task scope accordingly before writing the task file in Pass 2. If the user picks Minimal, the deferred issues are listed in a `## Follow-up Items` section at the end of the task file for future planning.

If the user picks Recommended or Comprehensive, re-run the A.4b simplicity sweep on all newly added files — those files were not present during the original A.4b run. If simplification reduces the newly added scope, present the change before proceeding to A.5.

**When to skip this checkpoint:** If exploration found zero issues beyond the original scope (no stale markers, no scope-adjacent references, no consumer breakage beyond what the task already covers), skip A.4c entirely and proceed to A.5. Do not present empty tiers.

This checkpoint prevents two failure modes: under-scoping (applying a change too narrowly, leaving stale references and broken consumers) and over-scoping (the planner expanding scope silently without user consent).

### A.5 User checkpoint

The full Exploration Report is in `documentation/tasks/.exploration-$EPOCH.md` (written in A.2). **Present a decisions-focused summary in chat**, not the full report. The summary must include every design decision so the user can approve the plan without opening the file for routine components. Say:

> **Pass 1 complete.** Full report: `documentation/tasks/.exploration-$EPOCH.md`
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

The Exploration Report is on disk at `documentation/tasks/.exploration-$EPOCH.md`. If context has been truncated and you need to re-read report sections, use Read with offset/limit to target specific sections rather than re-reading the entire file.

### C.2 Mapping table

Mechanically map the Exploration Report to the template:

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
| BEHAVIOR CHANGES               | Architecture Notes ("Behavior change:" bullets for each observable difference)    |
| BINDING INVENTORY              | Steps ("use existing `name` (line N)" directives for reused bindings)             |
| RESEARCH DOCUMENT              | Header `> **Research:**` line (path to `documentation/research/` file)            |

**Research auto-reference rule:** If the planner produced or used a research document during this planning session (from §0b delegation or user-provided), the `> **Research:**` line MUST appear in the task header with the exact path. If no research document exists, omit the line entirely. Never write the line with an empty value.

### C.3 Write prohibitions (internalize before writing)

Violating any of these causes the mechanical review (C.5) to reject and force a rewrite:

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
- Never describe SQL query modifications with prose only when the bind-parameter order changes — show the complete `.all(...)` or `.run(...)` argument list with all bound parameters in positional order, so the executor can verify placeholder-to-argument alignment mechanically
- Never write a recursive copy command (`cpSync`, `cp -r`) for a directory without verifying the full directory tree in the Exploration Report — if the COPY TARGET AUDIT is absent or says "Not applicable" when the step uses recursive copy = fail
- Never describe a new value derivation (e.g., "compute repoRoot from \_\_dirname") when the target file already has an existing binding for that value — the step must say "use the existing `<name>` (line N)" instead

### C.4 Save the task file

Save to: `documentation/tasks/$EPOCH-kebab-case-name.md`

Use the epoch value from §0 as a temporary identifier. The final sequential number (NNN) is assigned at merge time in §6. Use `$EPOCH` in the `# Task` heading as well (e.g. `# Task 1741209600: Component Name`).

Use the task file template below.

---

### C.5 Mechanical review

Immediately after saving the task file, run every check below yourself using Grep and Read. Tool output is objective evidence — "0 matches = pass". After the self-check, an independent review agent (C.5b) provides a second pair of eyes to catch confirmation bias.

**Step 1: Re-read ground truth + run mechanical checks A–W in one parallel batch.** Fire all of these in a single round of tool calls:

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

B. **SIGNATURE CROSS-CHECK:** For each method in the class code block, compare against the interface source file — parameter names, types (including readonly), return types must match exactly. Additionally, for every optional field (`?:`) in dependent types that the implementation accesses, verify the step instructions use optional chaining (`?.`) and a fallback value. If the exploration report has an OPTIONAL FIELD HAZARDS section, cross-check every entry against the step text.

C. **DEPENDENT TYPES:** If the component reads/writes/returns any domain type, are type definitions present inline (Tier 0 verbatim, Tier 1 signature+path, Tier 2 path-only)? Never "see task NNN", never empty.

D. **STEP COUNT:** Grep step headers. For each step, count the number of distinct file paths mentioned in the step's instructions AND its verify line — any step with 3+ methods or 2+ distinct file paths = fail. Documentation-only steps are not exempt: a step updating 9 documentation files is 9 files and must be split into steps of 1 file each. The "1 file per step" rule exists so executors never context-switch mid-step.

E. **CONFIG CHANGES:** Grep for "None" in Config Changes section. Must be either "None" with no caveats or exact diffs. Grep for "if not present" = fail.

F. **FILES TABLE:** For each "Create" row, Glob the path — if the file exists = fail.

G. **SELF-CONTAINED:** Grep for "see Task", "defined in task", "see task" (case-insensitive). Any match = fail.

H. **CONSTRUCTOR BRANDED TYPES:** For each constructor param representing a domain value, verify the type is a branded type from `core/types/`. Raw `string`/`number` = fail.

I. **VERIFY INSTRUCTIONS:** Read each step's "Verify:" line. Confirm the referenced artifact exists or will exist by that step.

J. **TEST TABLE ↔ STEP CROSS-CHECK:** Grep each Tests table row name in the step instructions. Grep each test name from steps in the Tests table. Mismatches = fail.

K. **LIBRARY API ACCURACY (scope: external npm packages only):** Re-read the `.d.ts` files for every external library the task uses. For every method or constructor call in the task file's code blocks that targets an npm package API, Grep the corresponding `.d.ts` file in `node_modules/` for that exact method name — report the match count. 0 matches = fail (training-data hallucination). Also cross-check class names, import paths, and constructor signatures against ground truth. If no `.d.ts` was re-read for an external library the task uses = fail. This check covers the npm package layer only — check S covers the project's internal interfaces.

L. **WIRING ACCURACY (composition roots only):** Re-read each concrete class source file. Every `new ClassName(...)` call in the task must match actual constructor signature.

M. **SIMPLICITY CHECK:** Count "Create" rows in the Files table. For a single-concern component (one interface, one class), more than 3 "Create" rows (source + test + one config/migration) requires justification in Architecture Notes. If no justification = fail.

N. **CONSUMER COMPLETENESS (conditional — only if task modifies existing interfaces, types, OR exported function signatures):** For each modified interface/type, Grep the codebase for importers. Every importer that will break must appear as a "Modify" row in the Files table. For each modified function signature, verify every caller found by item 14c appears as a "Modify" row. Missing consumers or callers = fail. If no interfaces, types, or function signatures are modified, this check passes automatically.

O. **CONDITIONAL DEPENDENCY LOADING (conditional — composition roots and bootstrap functions):** For each `new` or `await X.create()` call in the wiring steps, check: is this dependency always needed, or only when certain project characteristics hold (specific file extensions, config flags)? If the dependency is conditional but the task eagerly creates it inside a bootstrap function = fail. The task must accept it as an injected parameter and create it conditionally in `main()`. If no conditional dependencies exist, this check passes automatically.

P. **SIBLING PATTERN REUSE AND SHARED CODE PREDICTION (mandatory):** Three sub-checks based on sibling status:
**(P1) Siblings with shared utilities:** Verify the task's code blocks import the same shared utilities the sibling uses (Grep for each utility function name). If the task's Interface/Signature shows a manual class but the sibling uses a factory = fail. If shared walkers or helpers are missing = fail.
**(P2) Sibling without shared utilities (second-of-its-kind):** Verify the Files table includes a "Create" or "Modify" row for a shared utility file AND a "Modify" row for the first sibling's refactor. If the task copies inline code from the sibling instead of extracting = fail.
**(P3) First of its kind:** Verify the exploration report's SHARED CODE PREDICTION section identifies generic vs specific functions. If 2+ generic functions are identified but the task inlines them instead of extracting to a shared utility = fail. If the prediction says "No extraction needed," verify the justification is present. If no prediction section exists = fail.

Q. **TRANSFORMER BENCHMARK STEP (conditional — pipeline transformer recipe only):** Grep the Steps section for "Benchmark verification" or "token-reduction-benchmark". If the task adds a `ContentTransformer` and wires it in `create-pipeline-deps.ts`, a benchmark verification step must exist that: (1) runs the token reduction benchmark, (2) notes from test output whether the baseline was auto-ratcheted or unchanged (the test auto-updates `baseline.json` when tokens decrease — no manual editing). If the task uses the pipeline transformer recipe but has no benchmark step = fail. If the task does not add a transformer, this check passes automatically.

R. **TRANSFORMER SAFETY TESTS (conditional — pipeline transformer recipe only):** Grep the Tests table and step instructions for test names matching `safety_` pattern. If the task adds a `ContentTransformer` with `fileExtensions = []` (non-format-specific), at least one safety test per sensitive file type (Python, YAML, JSX) must exist. If the task adds a format-specific transformer, at least one safety test per listed extension must exist. If no transformer is added, this check passes automatically.

S. **CODE BLOCK API EXTRACTION (scope: internal project interfaces and types — mandatory, all task types):** Extract every unique method call (`.methodName(` pattern) and constructor call (`new ClassName(` pattern) from ALL TypeScript code blocks in the task file (Interface/Signature, Steps, inline code). For each call, identify whether it targets a project interface, type definition, or storage class in `shared/src/` — then Grep that source file for the exact name. Report each name with its source file and Grep match count. Any name with 0 matches = fail. This check catches the specific failure mode where a planner writes a method call that exists in an underlying npm library but not in the project's own wrapper (e.g. calling `.get()` on `ExecutableDb` when that interface only exposes `.run()` and `.all()`). Check K covers the npm package `.d.ts` layer; check S covers the project's own type system.

T. **DATABASE NORMALIZATION (conditional — tasks that create or modify a migration):** Verify the NORMALIZATION ANALYSIS section in the exploration report is present and complete. For each SQL statement (CREATE TABLE, ALTER TABLE) in the task file's Steps section, check:
**(T1) 1NF — atomic columns:** Grep for TEXT columns that store comma-separated lists, JSON arrays of queryable data, or multiple values. Pattern indicators: column comments mentioning "list", "array", "comma-separated", or INSERT statements that concatenate values with `||` or `','`. Any multi-value column without a junction table = fail.
**(T2) 2NF — no partial dependencies:** If any table has a composite PRIMARY KEY, verify every non-key column depends on the full composite key. If a column depends on only one part of the composite key, it belongs in a separate table = fail.
**(T3) 3NF — no transitive dependencies:** For each table, check if any non-key column determines another non-key column. Classic indicators: `status_text` alongside `status_code`, `category_name` alongside `category_id`, any `_name` or `_label` column that could be a lookup. Transitive dependency without extraction to a lookup table = fail unless the exploration report's NORMALIZATION ANALYSIS documents a justified exception.
**(T4) Lookup tables for repeated strings:** Grep for columns typed TEXT that hold a bounded set of repeated values (statuses, severities, categories, types). If a column has a known finite domain (e.g. `'error' | 'warning' | 'info'`) used across many rows and no reference table exists = flag (warn, not hard fail — the exploration report may justify inline storage for very small domains like 2–3 values).
**(T5) No redundant/derivable columns:** Check if any column's value can be computed from other columns in the same table or via a JOIN. Stored computed values without justification = fail.
If the task does not create or modify a migration, this check passes automatically.

U. **ACCEPTANCE CRITERIA ACHIEVABILITY (mandatory — all task types):** For each acceptance criterion in the task file:

- If the criterion references an existing test (e.g., "install.test.js passes"), read that test file and verify that the task's proposed changes do not invalidate any assertion in it. If the changes break the test AND the task does not include steps to update the test = fail (self-contradicting acceptance criteria).
- If the criterion references a command (e.g., "pnpm lint passes"), verify no proposed changes introduce patterns that would fail that command.
- If the criterion says "all existing tests pass," cross-reference against the TEST IMPACT field in the Exploration Report. If TEST IMPACT lists affected tests that are NOT updated in the Files table = fail.
- If the criterion is structurally unreachable (e.g., asserts a count that the changes make impossible) = fail.
- If a "Verify:" line invokes a test file (e.g., `node integrations/cursor/__tests__/install.test.js`), verify that test currently passes by running it or by auditing its hardcoded literals against actual source (item 15c). If the test is already broken before the task runs, the acceptance criterion must explicitly state this and scope verification to the post-fix state: "After applying steps 1–N, run [test] — expected: exits 0." A verify step that assumes the test passes pre-task when it does not = fail.
- If a "Verify:" line invokes a test that is EXCLUDED from `pnpm test` (item 15d), the acceptance criterion must use the standalone invocation (`node [test]`) and note the exclusion. An acceptance criterion that says "pnpm test passes" does not verify an excluded test = misleading (warn, not hard fail — but the task must have a separate verify step for the excluded test).

W. **CALLER CHAIN COMPLETENESS (conditional — only if the Exploration Report has a CALLER CHAIN ANALYSIS field):** For each function whose signature changes, verify the full caller chain from the Exploration Report is covered in the task:

- Every file in the chain must appear as a "Modify" row in the Files table.
- Every intermediate wrapper or closure that must change must have explicit step instructions for how it changes (parameterized, inlined, or restructured — not left to the executor).
- The chain must terminate at a system boundary (MCP handler, CLI entry point, or test). If the chain does not reach a boundary, the trace is incomplete = fail.
- Cross-check: for each file in the caller chain, Grep the Steps section for that file path. If a chain file is in the Files table but has no step instructions = fail.
  If no CALLER CHAIN ANALYSIS field exists (no function signatures changed), this check passes automatically.

V. **EXISTING TEST COMPATIBILITY (mandatory — all task types):** Cross-reference the Exploration Report's TEST IMPACT and CHANGE-PATTERN INSTANCES fields against the task file:

- For every test file listed in TEST IMPACT as having invalidated assertions: verify it appears as a "Modify" row in the Files table, and verify the Steps section includes instructions to update the specific assertions. Missing test file = fail. Present in Files table but no step instructions for the specific assertion update = fail.
- For every quantitative change in TEST IMPACT (old count → new count): verify the task includes the correct new count in its step instructions. Wrong new count = fail.
- For every name encoding a stale assumption (from item 15b): verify the task renames it or the exploration report justifies keeping it. Stale name without justification = fail.
- If the Exploration Report's TEST IMPACT says "No test impact," verify the CHANGE-PATTERN INSTANCES field does not reveal untested impacts. Contradictory fields = fail (re-run item 15).
- For every assertion marked "ALREADY STALE" in the ground-truth audit (item 15c): verify the task acknowledges the pre-existing failure and fixes the literal to the correct post-task value (not to the stale value). If the task transcribes a stale literal as if it were correct = fail.
- For every test file marked "EXCLUDED from pnpm test" (item 15d): verify the task's "Verify:" lines use standalone invocation, not `pnpm test`. If a verify step implies `pnpm test` covers an excluded test = fail.
- For every test file marked "EXCLUDED" that the task modifies or fixes: verify the task evaluates whether the exclusion is an oversight or intentional (item 15d gap closure). If the task fixes a broken EXCLUDED test but does not either (a) add a step to register it in `pnpm test`, or (b) document in Architecture Notes why the exclusion is intentional = fail.

X. **COPY TARGET COMPLETENESS (conditional — only if any step uses `cpSync`, `copyFileSync`, `cp -r`, or recursive directory copy/bundle):** For every recursive copy operation in the task's Steps:

- Verify the Exploration Report has a COPY TARGET AUDIT field for the source directory. If absent = fail.
- Glob the source directory and verify the audit lists every subdirectory. If the audit is incomplete (subdirectories exist that are not listed) = fail.
- If non-production content exists (`__tests__/`, `*.test.*`, `*.spec.*`, `node_modules/`), verify the task specifies an exclusion strategy (filter function, selective copy, or explicit justification). If the task uses recursive copy on a directory containing tests with no exclusion = fail.
  If no recursive copy operations exist, this check passes automatically.

Y. **BINDING REUSE (conditional — only if any step adds new code to an existing file):** For every "Modify" file where the task adds new code:

- If the step instructions describe computing a value (path derivation, config lookup, helper result) that an existing binding in the file already provides, verify the step says "use the existing `<name>` (line N)." If the step describes a new derivation for an already-computed value = fail.
- If the step introduces a new `const`/`let` binding, verify it does not duplicate or shadow an existing binding with the same name or semantics. Duplicate binding = fail.
- Verify the Exploration Report has a BINDING INVENTORY field for the file. If the task adds code to the file but no binding inventory was recorded = fail.
  If no modified files receive new code, this check passes automatically.

Z. **BEHAVIOR CHANGE DOCUMENTATION (mandatory — all tasks with "Modify" rows that change existing function logic):** For every "Modify" row in the Files table where the task changes existing control flow (conditionals, early returns, guard clauses, error paths, default values, fallbacks) rather than only adding new functions or exports:

- Re-read the function in its current state.
- Identify each behavioral difference between current and proposed code: conditions narrowed or widened, fallbacks added or removed, error paths changed, side effects gated differently.
- Verify Architecture Notes documents each behavioral difference with a "Behavior change:" bullet that states: old behavior, new behavior, and why the change is correct.
- If the task changes a conditional, default, early return, or error path but Architecture Notes has no corresponding "Behavior change:" note = fail.
- If no "Modify" rows change existing function logic (all modifications are pure additions), this check passes automatically.
- Verify the Exploration Report has a BEHAVIOR CHANGES field. If "Modify" rows change function logic but no BEHAVIOR CHANGES field exists = fail.

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
15. Conditional dependency loading — conditional (check O)
16. Sibling pattern reuse — conditional (check P)
17. Transformer benchmark step — conditional (check Q)
18. Transformer safety tests — conditional (check R)
19. Code block API accuracy (check S)
20. Database normalization — conditional (check T)
21. Acceptance criteria achievability (check U)
22. Existing test compatibility (check V)
23. Caller chain completeness — conditional (check W)
24. Copy target completeness — conditional (check X)
25. Binding reuse — conditional (check Y)
26. Behavior change documentation — conditional (check Z)

### C.5b Independent verification agent

After the self-check (C.5 Steps 1–2) passes with all applicable checks at 100%, spawn an independent review agent to eliminate confirmation bias. The planner checking its own work is structurally weaker than a fresh agent with zero prior assumptions — the planner "knows" what it meant to write and tends to confirm rather than challenge. A fresh agent literally reads the interface, sees which methods exist, and flags any that don't.

**Spawn a `generalPurpose` subagent** with a prompt built from these components (fill in the bracketed values from the current task):

1. **Role:** "You are an independent task-file reviewer. You have NO prior context about what the planner intended. Your only job is to find factual errors by cross-checking the task file against actual source files."

2. **Inputs:** Provide the task file path and every source file path the task references (interfaces, types, migrations, `.d.ts` files, modified files). List these explicitly — the subagent must read them fresh.

3. **Instructions — six checks:**
   - **API calls:** Read the task file. For every TypeScript code block, extract every `.methodName(` call and every `new ClassName(` call. For each, Grep the corresponding interface or `.d.ts` file for that name. Report: `[name] — [source file] — FOUND / NOT FOUND`.
   - **SQL columns:** For every SQL statement in the task file, read the migration file. Verify every column name in the SQL appears in the `CREATE TABLE`. Report: `[column] in [table] — FOUND / NOT FOUND`.
   - **SQL normalization (if task creates/modifies a migration):** For each CREATE TABLE, check: (a) no column stores comma-separated or multi-value data (1NF), (b) no partial key dependencies in composite PKs (2NF), (c) no non-key column that determines another non-key column without a lookup table (3NF), (d) repeated string-domain columns have a reference table or documented justification. Report: `[table] — [NF level] PASS / VIOLATION ([detail])`.
   - **File paths:** For every "Modify" row in the Files table, Glob for the path. Report: `[path] — EXISTS / DOES NOT EXIST`.
   - **Signature match:** For each method in the class code block, read the interface source file. Verify parameter names, types, and return types match exactly. Report: `[method] — MATCH / MISMATCH ([detail])`.
   - **Acceptance criteria vs test assertions:** For each acceptance criterion that references an existing test file (e.g., "X.test.ts passes"), read that test file. For each hardcoded count, expected string, or directory assertion in the test, check whether the task's proposed changes would invalidate it. If the task modifies a directory's contents but the test asserts on file count — verify the task updates that count. Report: `[test file] — [assertion at line N] — COMPATIBLE / INVALIDATED ([detail])`.
   - **Test assertion ground-truth:** For each hardcoded numeric literal in a test assertion that the task references or modifies, independently verify the literal against actual source (count files on disk, query actual data, read actual config). Report: `[test file]:[line] — asserts [value] — actual is [actual value] — CORRECT / STALE`.
   - **Test runner wiring:** For each test file the task modifies or references in a "Verify:" line, check whether it appears in `package.json` `"test"` script (either as an explicit `node` invocation or covered by vitest/jest config). Report: `[test file] — IN TEST SUITE / EXCLUDED`.
   - **Coverage completeness:** Read the Exploration Report's CHANGE-PATTERN INSTANCES field. For each instance marked "IN SCOPE," verify the corresponding file appears as a row in the task's Files table. Report: `[file] — IN SCOPE in report — IN FILES TABLE / MISSING`.
   - **Test impact completeness:** Read the Exploration Report's TEST IMPACT field. For each test file listed as having invalidated assertions, verify it appears as a "Modify" row in the task's Files table. Report: `[test file] — IN TEST IMPACT — IN FILES TABLE / MISSING`.
   - **Caller chain completeness:** Read the Exploration Report's CALLER CHAIN ANALYSIS field (if present). For each file in the caller chain, verify it appears as a "Modify" row in the task's Files table and has step instructions. For each intermediate closure or wrapper, verify the task specifies how it changes (parameterized, inlined, or restructured). Report: `[file] — IN CALLER CHAIN — IN FILES TABLE / MISSING` and `[closure/wrapper] — RESTRUCTURE SPECIFIED / UNSPECIFIED`.
   - **Copy target audit:** For each recursive copy operation in the Steps, glob the source directory and list all subdirectories. If `__tests__/` or test files exist and the task has no exclusion strategy, report: `[source dir] — contains [subdir] with [N] test files — NO EXCLUSION STRATEGY`.
   - **Binding reuse:** For each "Modify" file where the task adds new code, read the file and list all top-level bindings. If the task's step instructions describe deriving a value that an existing binding already provides, report: `[file]:[line] — existing binding [name] provides [value] — task step describes redundant derivation`.
   - **Behavior change completeness:** For each "Modify" file where the task changes existing function logic (not just adding new functions), read the current function. Identify every conditional, guard, early return, default value, and error path. Compare against the task's proposed changes. For each observable behavioral difference (conditions under which code runs/doesn't run, values returned, side effects triggered), check whether Architecture Notes documents it with a "Behavior change:" bullet. Report: `[file]:[function] — [behavioral difference] — DOCUMENTED / UNDOCUMENTED`.

4. **Output format:** Return a structured list of findings: each finding has type (api/sql/path/signature/coverage/test-impact/ground-truth/test-wiring/copy-target/binding-reuse/behavior-change), name, source file, and status (FOUND/NOT_FOUND or MATCH/MISMATCH or IN_FILES_TABLE/MISSING or CORRECT/STALE or IN_TEST_SUITE/EXCLUDED or REDUNDANT/OK or DOCUMENTED/UNDOCUMENTED). End with a summary: "PASS — all N findings confirmed" or "FAIL — M of N findings have errors" with the specific errors listed.

**If the subagent returns FAIL:** For each NOT_FOUND or MISMATCH finding, determine the root cause (wrong method name, training-data hallucination, outdated interface, typo). Fix the task file, re-run the specific C.5 check that corresponds to the finding, and re-spawn the subagent to confirm the fix. Do NOT proceed to C.6 until the independent review passes.

**If the subagent returns PASS:** Proceed to C.6.

**Cost justification:** One subagent spawn per task (~30s, minimal tokens). Compared to the cost of an executor implementing code based on a wrong API call, discovering it fails, blocking, replanning, and re-executing — the review agent pays for itself on the first error it catches.

### C.5c Independent Codebase Verification

After C.5b passes, spawn a verification agent that works **from the codebase outward** — independently discovering what the task _should_ contain, rather than checking what it _claims_. C.5b verifies the task's internal claims against source files; C.5c discovers external facts the task may have missed entirely. This is the structural fix for the "same context window" blind spot: the verifier has zero knowledge of the exploration report and derives its own findings.

**Spawn a `generalPurpose` subagent** with these instructions. Provide only the task file path, the project root path, and the project's architectural rules file (`.cursor/rules/AIC-architect.mdc`). Do NOT provide the exploration report.

**Category 1 — Dependency probes (run for every "Modify" row in the Files table where an exported function signature or interface changes):**

1. **Caller discovery:** For every function whose signature changes in the task's code blocks, grep the ENTIRE codebase (`shared/src/`, `mcp/src/`, `integrations/`) for callers (pattern: `functionName(` in all `.ts` files excluding `node_modules/` and `*.test.ts`). List every caller file path. Compare against the task's Files table. Report each caller file that is NOT in the Files table as `MISSING_CALLER: [file]:[line] calls [function]`.

2. **Consumer discovery:** For every interface that gains, removes, or changes a method, grep for all files that import that interface (pattern: `from.*[interface-file-stem]` or the interface name itself). For each importer, read the relevant lines and determine if it uses the changed member. Report each broken consumer NOT in the Files table as `MISSING_CONSUMER: [file] imports [interface] and uses [changed member]`.

3. **Parameter origin trace:** For every new parameter added to a function, trace backward: read each caller found in probe 1 and determine whether it passes the value through from its own caller or originates it. Continue recursively until reaching a system boundary (MCP handler, CLI entry, test). Report any intermediate function that needs a signature change but is NOT in the Files table as `MISSING_INTERMEDIARY: [file]:[function] must pass [param] through but is not in Files table`.

4. **Closure and wrapper detection:** For every function in the caller chain from probe 3, check whether it is called via a closure or wrapper (pattern: `const xxxFn = () => targetFunction(` or `const xxxFn = (args) => targetFunction(args`). A zero-arg closure wrapping a function that now requires a parameter cannot remain zero-arg. Report as `CLOSURE_BREAK: [file]:[line] — zero-arg closure wrapping [function] which now requires [param]`.

**Category 2 — Convention probes (run for every "Create" row in the Files table):**

5. **File naming:** Verify the filename is kebab-case. Interfaces must be `*.interface.ts`, tests `*.test.ts`, migrations `NNN-description.ts`. Report violations as `NAMING: [file] — expected [pattern]`.

6. **Layer placement:** Verify the file is in the correct directory for its declared layer. Core types in `core/types/`, interfaces in `core/interfaces/`, storage in `storage/`, adapters in `adapters/`. Report misplacements as `LAYER: [file] — should be in [correct dir]`.

7. **Interface design (ISP):** For every new interface, count methods in the code block. More than 5 methods = ISP violation. Report as `ISP: [interface] has [N] methods, max is 5`.

8. **Storage completeness:** For every new storage class (implements a `*Store` interface or has SQL), verify the task includes a migration step. For every new table, verify it is created via a migration file, not inline DDL. Report as `MIGRATION: [class] has no migration step` or `DDL: [step N] runs DDL outside migration`.

9. **Composition root wiring:** For every new class that implements a core interface and needs instantiation, verify the task includes a step to wire it in the composition root (`mcp/src/server.ts`). Report as `WIRING: [class] implements [interface] but no composition root step`.

10. **Layer boundary (hexagonal):** For every import statement in the task's TypeScript code blocks, verify it does not cross hexagonal boundaries: `core/` and `pipeline/` must NOT import from `adapters/`, `storage/`, `mcp/`, or external packages. Report as `BOUNDARY: [import] in [layer] violates hexagonal rule`.

11. **Branded types:** For every constructor parameter in the task's class code block that represents a domain value (path, ID, timestamp, token count, score, duration), verify it uses a branded type from `core/types/`, not raw `string` or `number`. Report as `BRANDED: [param] in [class] uses raw [type], should use [branded type]`.

12. **Test coverage for new code:** For every new public class or exported function, verify the task includes a corresponding test case in the Tests table and a test step. Report as `UNTESTED: [class/function] has no test case`.

13. **Directory impact:** For every new file being added to an existing directory, grep test files (`**/*.test.ts`, `**/*.test.js`) for assertions that reference that directory — file count assertions (pattern: `=== [number]`, `.length`), directory listings, glob patterns. Report as `DIR_IMPACT: [test file]:[line] asserts on [directory] contents — may break when [new file] is added`.

14. **Test assertion ground-truth:** For every hardcoded numeric count assertion found via item 13 (or present in any test file the task modifies), independently count the actual items on disk (files in directory, entries in config, etc.) and compare against the asserted value. Report as `STALE_ASSERTION: [test file]:[line] asserts [value] but actual count is [actual]` when they differ.

15. **Test runner wiring:** For every test file the task modifies or that a "Verify:" line invokes, check whether `package.json` `"test"` script includes it (search for the file name in the test command string). Report as `TEST_EXCLUDED: [test file] is not in pnpm test — standalone only` for files not found.

16. **Copy target contents:** For every recursive copy command (`cpSync`, `cp -r`) in the task's Steps, glob the source directory including subdirectories. If `__tests__/`, `*.test.*`, or `*.spec.*` files exist in any subdirectory and the task has no exclusion strategy (filter function, selective copy), report as `BUNDLE_TESTS: [source dir]/__tests__/ contains [N] test files — recursive copy would include them in bundle`.

17. **Binding conflicts:** For every "Modify" file where the task adds new const/let bindings or new value derivations, read the file and list its existing top-level bindings. If the task describes computing a value that an existing binding already provides (e.g., repoRoot, \_\_dirname, installScript), report as `REDUNDANT_BINDING: [file] already has [binding] at line [N] — task step describes redundant derivation`. If the task introduces a new binding with the same name as an existing one, report as `SHADOW_BINDING: [file] — new [name] shadows existing [name] at line [N]`.

**Output format:**

```
DEPENDENCY FINDINGS:
- [MISSING_CALLER | MISSING_CONSUMER | MISSING_INTERMEDIARY | CLOSURE_BREAK]: [detail]

CONVENTION FINDINGS:
- [NAMING | LAYER | ISP | MIGRATION | DDL | WIRING | BOUNDARY | BRANDED | UNTESTED | DIR_IMPACT | STALE_ASSERTION | TEST_EXCLUDED | BUNDLE_TESTS | REDUNDANT_BINDING | SHADOW_BINDING]: [detail]

SUMMARY: PASS (0 findings) | FAIL (N dependency + M convention findings)
```

**If the agent returns FAIL:**

- For each dependency finding: read the cited file and determine if it genuinely needs updating. If yes, add it to the Files table and create a corresponding Step. If the finding is a false positive (e.g., the caller already handles the case via optional chaining), document why it's safe to exclude.
- For each convention finding: fix the violation in the task file.
- Re-run C.5 checks on changed sections. Re-run C.5c to confirm all findings are resolved.

**If the agent returns PASS:** Proceed to C.5d (if triggered) or C.6.

### C.5d Adversarial Re-planning (complexity-gated)

This step triggers ONLY when the task exceeds a complexity threshold. Most tasks skip it entirely.

**Trigger condition (any one is sufficient):**

- The Files table spans 3+ distinct source directories at the second path level (e.g., `shared/src/storage/`, `shared/src/core/interfaces/`, `mcp/src/` = 3 distinct)
- 3+ exported function or interface signatures change (count from the task's code blocks)
- The composition root (`mcp/src/server.ts`) appears as a "Modify" row AND the task modifies functions in 2+ other directories

If none of these conditions are met, skip C.5d and proceed to C.6.

**When triggered:** Spawn a `generalPurpose` subagent with:

- The component name and goal (from the task's `## Goal` section)
- The project root path
- Paths to: `documentation/project-plan.md`, `documentation/implementation-spec.md`, `.cursor/rules/AIC-architect.mdc`
- The instruction: "You are an independent planner. Given this goal, determine which files in the codebase need creating or modifying. Read the relevant interfaces, source files, and types. Produce a Files table (Action + Path + Description) and for each Modify row, state what changes. Do NOT read any existing task files — derive everything independently."

**Comparison:** Diff the adversarial agent's Files table against the planner's:

| Shadow finding       | Planner's table | Action                                                                                                                                                     |
| -------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File in both         | —               | Confirmed — no action                                                                                                                                      |
| File in shadow only  | Missing         | Investigate: read the file, determine if it genuinely needs changing. If yes = planner missed it → add to task. If no = shadow over-scoped → ignore        |
| File in planner only | —               | Verify: the planner may have found something the shadow missed (e.g., test impact, stale markers). If justified → keep. If unjustified → consider removing |

For each genuine miss found by the adversarial agent, add the file to the Files table, create a corresponding Step, and re-run the affected C.5 checks.

**If no discrepancies:** Proceed to C.6.

### C.6 Score and act

**Always fix to maximum score.** For every failing check, attempt a fix — regardless of the current score. Do not accept a less-than-perfect score just because it is "close enough." The goal is 100%.

**Verification pipeline order:** C.5 (self-check) → C.5b (document review) → C.5c (codebase verification) → C.5d (adversarial re-planning, if triggered). Each stage must pass before the next begins. Findings from later stages feed back into earlier checks: if C.5c adds files to the task, re-run relevant C.5 checks (D, N, W) on the updated task before proceeding.

1. **For each failing check or finding:** Determine the root cause, apply a targeted fix to the task file, and re-run that specific check to confirm resolution.
2. **After all fixes within a stage:** Re-run the full rubric for that stage. If new failures were introduced by the fixes, repeat.
3. **Iterate** until each stage reports PASS, then advance to the next.
4. **Genuinely unfixable:** A check is unfixable only when the component structurally cannot satisfy it (e.g. "Wiring accuracy" for a non-composition-root task, or "Library API accuracy" for a task that uses no external library). In this case, mark the check as N/A and exclude it from the denominator. Never mark a check N/A to avoid doing work — only when the check's precondition is structurally unmet.
5. **Proceed to §6** only when: C.5 score = M/M (100%), C.5b = PASS, C.5c = PASS, and C.5d = PASS or skipped.

---

## §6. Finalize, merge, and offer execution

After verification passes:

1. **Assign the final task number.** From the **main workspace root**, scan both `documentation/tasks/` and `documentation/tasks/done/` for the highest existing task number. Completed tasks are archived to `done/`, so you must check both directories:

   ```
   { ls documentation/tasks/ 2>/dev/null; ls documentation/tasks/done/ 2>/dev/null; } | grep -oE '^[0-9]+' | sort -rn | head -1
   ```

   Note: uses `-oE` (extended regex), not `-oP` (Perl regex), for macOS compatibility. Add 1 and zero-pad to 3 digits (e.g. `196`). This is the final NNN. If no numbered files exist, start at `001`.

2. **Rename and update in the worktree** (run with `working_directory` set to the worktree):
   - Rename the task file: `mv documentation/tasks/$EPOCH-name.md documentation/tasks/NNN-name.md`
   - Update the `# Task` heading inside the file: replace `# Task $EPOCH:` with `# Task NNN:`
   - Delete the exploration file: `rm -f documentation/tasks/.exploration-$EPOCH.md`

3. **Commit in the worktree** (run with `working_directory` set to the worktree):

   ```
   git add documentation/tasks/ && git commit -m "docs(tasks): plan task NNN — <component name>"
   ```

4. **Merge to main.** From the **main workspace root**:

   ```
   git merge --squash plan/$EPOCH && git commit -m "docs(tasks): plan task NNN — <component name>"
   ```

   If the merge has conflicts (rare for documentation-only changes), resolve them: read each conflicted file, fix conflict markers, stage, and commit. If unresolvable, tell the user.

5. **Clean up:**

   ```
   git worktree remove .git-worktrees/plan-$EPOCH && git branch -D plan/$EPOCH
   ```

6. **Announce:** "Task saved to `documentation/tasks/NNN-name.md`. Score: N/M (X%). Use the @aic-task-executor skill to execute it."

---

## §7. Review existing tasks

Triggered when the user asks to review one or more task files.

**Scope:**

- "review task 008" → single task
- "review tasks" / "review all tasks" → all pending in `documentation/tasks/` (skip `done/`)

**Step 7.0: Worktree setup.** Create a planning worktree from `main` using the same procedure as §0 steps 1–3. Store the epoch value. All subsequent §7 work — reading, rewriting, committing — happens in the worktree.

**Step 7a: Check for codebase drift.** For each file referenced in the task's Files table (both "Create" and "Modify" paths), check if the file or its directory has changed since the task was written. Use `git log -1 --format='%ai' -- <path>` for modified files and Glob for created files that now exist. If drift is detected, flag the specific files and re-read them before proceeding.

**Step 7b: Gather codebase state.** Run the Pass 1 exploration checklist once for the full batch. Use parallel Read calls. Cache the results.

**Step 7c: Evaluate each task.** Run the full 4-stage verification pipeline: C.5 mechanical checks (self), C.5b independent document review, C.5c independent codebase verification, and C.5d adversarial re-planning (if triggered by complexity thresholds). Use parallel Grep + Read calls. For multiple tasks, batch the Grep calls — up to 4 task files in parallel.

**Step 7d: Present findings.** For each task: score, guardrail violations table, specific fixes. If drift was detected in 7a, highlight affected sections. For multiple tasks: summary table first.

**Step 7e: Rewrite.** Ask: **"Rewrite all, rewrite specific tasks (list numbers), or skip?"**

When rewriting:

- Read original, apply fixes, re-read relevant source files
- Write corrected task in place (same path, same NNN)
- Do not change scope unless a guardrail requires it
- Fix every failing check regardless of original score.
- Re-run the full 4-stage pipeline after fixes. Iterate until all stages pass.
- Mark checks N/A only when the check's precondition is structurally unmet (see C.6 rule 4).
- If the review discovers a failure class not covered by the current probe library, note it as a candidate for feedback-driven probe accumulation (see Conventions).

After rewriting, commit in the worktree, merge to main, and clean up (same as §6 steps 3–5, but skip the renaming — rewritten tasks keep their existing NNN):

- Commit in the worktree: `git add documentation/tasks/ && git commit -m "docs(tasks): rewrite task NNN — <component name>"`
- From the main workspace root: `git merge --squash plan/$EPOCH && git commit -m "docs(tasks): rewrite task NNN — <component name>"`
- Clean up: `git worktree remove .git-worktrees/plan-$EPOCH && git branch -D plan/$EPOCH`
- If conflicts, resolve or tell the user.

Then announce: **"Task NNN rewritten. Score: N/M (X%). [Summary of changes]."**

---

## Task File Template

For **release-pipeline** recipe, replace the "Interface / Signature" and "Dependent Types" sections with the single "Publish specification" section defined in SKILL-recipes.md (package(s), entry points, build, trigger, secrets). All other sections (Goal, Architecture Notes, Files, Config Changes, Steps, Tests, Acceptance Criteria) apply.

For **fix/patch** recipe, when the fix is purely behavioral (same API, different implementation): replace the "Interface / Signature" section with a "Behavior Change" section (see SKILL-recipes.md for the required format), and omit "Dependent Types" when no type dependencies change. When the fix does change a function signature, keep "Interface / Signature" with before/after signatures.

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
- **Feedback-driven probe accumulation:** When a task review (§7), task execution, or post-hoc validation discovers a failure that the 4-stage verification pipeline (C.5 → C.5b → C.5c → C.5d) did not catch, extract the _failure class_ (e.g., "composition-root closure wrapping", "test file-count assertion", "sibling error-handling pattern mismatch") and add a targeted probe to C.5c's probe list. Each new probe specifies: trigger condition, grep pattern, and what to report. Over time, C.5c's probe library grows to cover every failure pattern observed in this codebase. When adding a probe, also check if an existing C.5 or C.5b check should have caught it — if so, strengthen that check's wording rather than duplicating coverage in C.5c.

## Common Rationalizations — STOP

If you catch yourself thinking any of these, you are rationalizing. Stop and follow the process.

| Thought                                                           | Reality                                                                                   |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| "This component is simple enough to plan from memory"             | Read the actual `.d.ts` files. Memory-based APIs are wrong 30%+ of the time.              |
| "The interface probably has these methods"                        | "Probably" means you have not read it. Read it.                                           |
| "I can skip the exploration report for this one"                  | The exploration report IS the plan's foundation. No shortcut.                             |
| "This does not fit any recipe, I will improvise"                  | Use the general-purpose recipe. It exists for this case. Never improvise.                 |
| "I will fill in the details later"                                | Every step must have exact code. "Later" means "never."                                   |
| "Similar to Task N"                                               | The executor may read tasks out of order. Repeat the code.                                |
| "Add appropriate error handling"                                  | Which errors? What handling? Be specific or the executor will guess wrong.                |
| "The existing code probably works this way"                       | Read the actual source. Assumptions cause the most rework.                                |
| "This is too complex to plan in detail"                           | Break it into smaller tasks. Complexity is not an excuse for vagueness.                   |
| "I know what the user wants"                                      | Verify with the exploration report and user gate. Do not assume intent.                   |
| "The planner does not need to verify, the executor will catch it" | The planner's verification prevents the executor from starting bad tasks. Catch it early. |
| "One more file will not hurt"                                     | Apply the simplicity test. Every new file costs maintenance.                              |
