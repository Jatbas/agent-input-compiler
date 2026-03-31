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

**Violating the letter of these rules is violating the spirit.** Reframing, reinterpreting, or finding loopholes in these rules is not cleverness — it is the exact failure mode they exist to prevent.

**If you do not know something with certainty, STOP and tell the user.** Never guess, assume, or improvise. This applies to:

- **Library APIs:** If you have not read the installed `.d.ts` files, you do not know the API. Do not write class names, import paths, or method signatures from memory. Read the actual type definitions first.
- **Template fit:** If the component does not match any specialized recipe (adapter, storage, pipeline, composition root, benchmark, release-pipeline), use the **general-purpose recipe** from `SKILL-recipes.md`. The general-purpose recipe requires a full component characterization and closest-recipe analysis — it is more rigorous, not less. Never improvise a task structure outside of a recipe.
- **TypeScript resolution:** If you propose changes to `package.json` exports, `tsconfig.json` paths, or module resolution, verify the change works. If you cannot verify, state the uncertainty.
- **Any exploration checklist item:** If a field in the Exploration Report cannot be filled with verified information, it is a **blocker**. Do not write "None" or skip it. Do not proceed to writing. Tell the user what you could not determine and why.

A confident-looking wrong plan is the worst possible output. An incomplete plan that says "I don't know X, here's what I need" is infinitely better. **Never trade correctness for completeness.**

## Simplicity Principle: Simplest Correct Path First

**The default is the simplest solution that is correct. Complexity must be justified.**

**Rules:**

- **Prefer extending over creating.** Before proposing a new interface, type, or file, check if an existing one can gain a method or field. Adding a method to an existing interface is simpler than creating a new interface + adapter + test file.
- **Prefer fewer files.** If a change can live in an existing file without making it unwieldy, put it there. A new file is a new import, a new mental context switch, and a new thing to maintain.
- **Prefer no abstraction over premature abstraction.** A branded type used in exactly one place, a utility function called once, an interface with one implementor that will never have a second — these are indirection, not abstraction. Inline until a second use case appears.
- **Prefer direct flow over transformation layers.** If data already has the right shape, pass it through. Don't create intermediate types or mapping functions unless the shapes genuinely differ.

**The simplicity test:** For every new file, new type, or new interface in the plan, ask: _"What happens if I don't create this and instead use what already exists?"_ If the answer is "nothing breaks, and the code is still clear" — don't create it.

## Autonomous Execution

Run each pass as a single continuous flow. Do NOT pause mid-pass to report status, explain what you will do next, or ask for confirmation. Completing one step within a pass means immediately starting the next — not sending a message and waiting.

**Legitimate user gates (these are the ONLY points where you stop and wait):**

- §1: User picks a component (wait for pick)
- §0b: Ambiguous intent (ask user)
- A.4c: Scope expansion tiers (wait for tier pick — skip if no expansion found)
- A.5: User checkpoint after Pass 1 (wait for "proceed")
- §0b step 6: Research-then-plan confirmation (wait for user decision)

**Everything else runs without pausing.** The entire exploration pass (A.1 through A.4b) runs as one continuous flow. The entire write pass (C.1 through C.6) runs as one continuous flow. **After Pass 2 verification completes (C.6), §6 (Finalize) runs immediately** — assign the task number, copy the file to the main workspace, and remove the worktree. The task is NOT complete until §6 finishes. Do not send status messages between steps within a pass.

**Anti-patterns:**

- Sending a message like "I've completed the exploration, now I'll write the task file..." between A.5 approval and Pass 2. The user already said "proceed" — just do it.
- Stopping after Pass 2 verification and reporting that the task file is in the worktree. The worktree is temporary — §6 copies the file to the main workspace and cleans up. Always run §6.

## When to Use

- User says "plan next task", "what's next", or "create a task"
- Before any multi-file implementation work
- When the user picks a component from `documentation/tasks/progress/aic-progress.md` — still run §1 ranking to validate the pick
- User says "review task NNN", "review tasks", or "review all tasks" — triggers the **Review** process (see §7)

## Inputs (read these every time)

1. `documentation/tasks/progress/aic-progress.md` — what is done, what is next (main workspace only — gitignored)
2. `documentation/project-plan.md` — architecture, ADRs, conventions
3. `documentation/implementation-spec.md` — detailed component specs
4. `documentation/security.md` — security constraints
5. `.cursor/rules/AIC-architect.mdc` — active architectural rules
6. Existing source in `shared/src/` — current interfaces, types, patterns

## Process Overview

The process has **two passes**, a finalization step, and user gates. Each pass produces a concrete deliverable. One user gate between passes keeps oversight without unnecessary round-trips. **§6 (Finalize) is mandatory — the task is not complete until the file is copied to the main workspace and the worktree is removed.**

| Step        | Deliverable                                                                     | User gate?          |
| ----------- | ------------------------------------------------------------------------------- | ------------------- |
| §1 Present  | User picks a component                                                          | Yes — wait for pick |
| Pass 1      | Exploration Report + all decisions resolved                                     | Yes — user reviews  |
| Pass 2      | Task file written + 4-stage verified (self → document → codebase → adversarial) | No — self-check     |
| §6 Finalize | Task file numbered, copied to main workspace, worktree removed                  | No — automatic      |

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

4. **All planning work (§1 through §6 or §7) happens in the worktree.** Set `working_directory` to the worktree for all Shell commands. Use worktree-prefixed absolute paths for Read, Write, StrReplace, Grep, and Glob. During planning, task files use `$EPOCH` as a temporary identifier (e.g. `documentation/tasks/1741209600-component-name.md`). The final sequential number (NNN) is assigned at finalization in §6. **Note:** Task files are gitignored (`documentation/tasks/` is in `.gitignore`), so they cannot be committed — §6 copies the final file directly to the main workspace.

5. After the task file is saved and verified (end of §6 or §7), assign the final task number, copy to the main workspace, and clean up the worktree. See §6 for the full procedure (§7 follows the same finalization steps).

---

## §0b. Intent Classification (mandatory — run first, before worktree setup)

Before planning, classify the user's request. The planner must auto-delegate to the `aic-researcher` skill when the request needs investigation, ensuring identical quality regardless of which skill the user invoked.

**Classification decision tree (evaluate in order, stop at first match):**

1. Does the user reference a specific component from `documentation/tasks/progress/aic-progress.md`, say "plan next task", "what's next", or name a concrete component to plan? → **Task planning** — proceed to §1.
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

### Runtime Verification Checklist

This checklist applies in two situations: (1) analysis-only requests (classification outcome #2 above) — run the full checklist then present findings; (2) during Pass 1 exploration when the component interacts with external systems (hooks, editor APIs, third-party tools, database state). In situation (2), integrate the relevant checklist items into Batch A/B exploration.

For each item that applies, collect **actual evidence** — not assumed state. If an item cannot be verified, report it as a blocker.

Read `../shared/SKILL-investigation.md` and apply the **Runtime Evidence Checklist** (database state, deployed files, bootstrap/lifecycle, cache/file system, documentation cross-check, external system behavior, library API shapes). When the investigation touches AIC codebase code, also apply the **Codebase Investigation Depth** requirements from the same file.

---

## §1. Recommend the best next task

**Pre-read all inputs in one parallel batch** — these are needed in Pass 1 regardless of which component the user picks, and pre-reading eliminates a full round of tool calls later:

- `documentation/tasks/progress/aic-progress.md` (read from main workspace — gitignored)
- `documentation/project-plan.md`
- `documentation/implementation-spec.md`
- `documentation/security.md`
- `.cursor/rules/AIC-architect.mdc`
- `shared/package.json`
- `eslint.config.mjs`
- `SKILL-recipes.md` (this file's sibling — static reference)
- `SKILL-guardrails.md` (this file's sibling — static reference)
- Research document from `documentation/research/` (optional — include if §0b produced one, or if the user provided a path)

From `documentation/tasks/progress/aic-progress.md`, identify all components with status `Not started` whose dependencies are `Done`.

**Rank** the unblocked components using these criteria (in priority order):

1. **Pattern-setter:** Is this the first component of its kind in the current phase? The first CLI command, first adapter, first storage class, etc. establishes the conventions that all subsequent siblings will follow. Pattern-setters always rank highest.
2. **Implicit prerequisites:** Will other unblocked components import from or depend on this one? Schemas before commands, shared utilities before consumers, composition roots before feature handlers. Components that unblock the most downstream work rank higher.
3. **Phase table order:** Within a phase, the row order in `documentation/tasks/progress/aic-progress.md` reflects intended implementation sequence. Earlier rows rank higher than later rows when the above criteria do not differentiate.

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

**Exploration scope principle:** Never limit exploration to match task scope — always explore broadly enough to detect scope-adjacent issues, stale artifacts, and downstream impacts.

**Batch A — fire in one parallel round** (no data dependencies; interface paths and library names come from the spec pre-read in §1):

1. **Read every interface the component implements** — copy the full interface verbatim.
2. **Read the target database schema + normalization analysis** — if the component touches a table, read the migration file. Record exact columns. Then verify normalization to at least 3NF:
   - **1NF:** No multi-value columns — use junction tables.
   - **2NF:** Every non-key column depends on the entire composite PK.
   - **3NF:** No transitive dependencies — extract to lookup tables.
   - **Lookup tables:** Repeated string-domain values → reference table with FK.
   - **No redundant columns:** Derivable values → compute at query time.
     Record all normalization findings in the NORMALIZATION ANALYSIS field. If a violation is found in an existing schema, flag as prerequisite fix or document the justified exception.
3. **Check existing files** — for every file the recipe pattern would create, check if it already EXISTS (Glob). Record each.
4. **Verify every external library API by reading installed `.d.ts` files** — locate under `node_modules/`, read them, record exact class names, constructor signatures, method signatures, and import paths. If not installed, search the web. This applies to ALL layers.
5. **Check recipe fit** — walk the decision tree below top-to-bottom. Stop at the **first** YES. Each question must be answered with evidence (file path, interface name, or concrete observation) — not assumption.

   **Recipe decision tree (evaluate in this order):**
   - Fixing a bug/broken pattern WITHOUT creating a new component? → **fix/patch**. Sub-check: if fix requires new adapter/storage/pipeline class, use that recipe + fix-specific items.
   - Wraps external library behind core interface? → **adapter**.
   - Implements `*Store` + executes SQL against `ExecutableDb`? → **storage**.
   - Implements `ContentTransformer` + wires into pipeline? → **pipeline transformer**.
   - Instantiates classes, opens DBs, registers handlers, starts process? → **composition root**.
   - Adds/modifies gold data, fixtures, benchmark tests in `test/benchmarks/`? → **benchmark**.
   - Configures npm publishing, CI, package metadata? → **release-pipeline**.
   - Creates/edits `.md` documentation file? → **documentation** (see `SKILL-recipes.md`). Sub-check: section-scoped task still requires full-document exploration.
   - None of the above? → **general-purpose** (requires full component characterization).

   Never improvise a task structure outside of a recipe. If the decision tree produces a surprising result, re-read `SKILL-recipes.md` for that recipe's "When to use" section to confirm.

6. **Sibling analysis, shared code reuse, and shared code prediction** (mandatory — all recipe types):
   **When siblings exist with shared utilities:** Read closest sibling source. Identify shared imports, structural pattern (factory vs class), and sibling-specific parts. New component MUST reuse the same shared utilities and pattern.
   **When sibling exists WITHOUT shared utilities (second-of-its-kind):** Compare needs against sibling's inline code. Structurally identical functions differing only in callbacks/predicates/config MUST be extracted to shared utility as a prerequisite. Add Create/Modify rows for shared utility and sibling refactor.
   **When first of its kind:** Predict generic vs specific parts. If 2+ generic functions → extract to shared utility from day one. If all specific → document why.
   Record in SIBLING PATTERN field. Check if existing class/interface could gain a method → record in EXISTING SOLUTIONS.
   **Multi-layer sibling analysis (when Files table spans 2+ source layers):** Run sibling analysis independently at each layer (MCP handler, storage, adapter). Each layer's sibling pattern must be documented and reflected in step instructions.
7. **Cross-package duplication check** (conditional — if the task creates a new utility, helper, or factory function) — Grep the entire codebase for functionally equivalent code. Check `mcp/src/` and `shared/src/` — not just the target layer. If equivalent logic already exists in another package, the task must either (a) extract the shared logic to `shared/` and modify both consumers, or (b) justify the duplication in Architecture Notes. Record in the EXISTING SOLUTIONS field.
8. **Wiring completeness check** (conditional — composition root tasks, OR any task whose Files table includes a Modify row for the composition root, OR any task that changes the signature of a function called by the composition root) — For every function called in the wiring steps, verify that its return value is either (a) consumed by a subsequent step, or (b) the function is explicitly called for side effects only (document which side effects). If a function returns a rich object and only side effects are needed, note this in Architecture Notes as a follow-up to wire the return value when consumers are ready. When a non-composition-root task changes the signature of a function that the composition root calls (directly or via a closure), verify that the composition root's call site and any intermediary closures or wrappers are updated in the task's Files table and Steps.
   8b. **Stale marker detection** (mandatory — all task types) — for every file in the Files table (both Create and Modify), grep for `TODO`, `FIXME`, `HACK` comments. Also grep for phase references (`Phase [A-Z]`) and cross-reference against `documentation/tasks/progress/aic-progress.md` (main workspace) to check if the phase is complete while the comment uses future tense. Record each finding as: `[marker] at [file:line] — ACTIONABLE (phase done, work can be done now) / INFORMATIONAL (future work, not yet relevant)`. If an actionable marker is in a file the task modifies, consider adding it to the task scope (present via scope expansion in A.4c). If outside the task's files, report as follow-up.
   8c. **Change-impact pattern scan** (mandatory) — identify the core change pattern and grep the ENTIRE codebase for all instances. Fix/patch: grep all files with the broken pattern. Greenfield: grep for enumerators/counters of the changed set. Refactoring: grep all occurrences including tests/scripts/docs. Directory changes: grep for file-count/listing assertions. Record every instance in CHANGE-PATTERN INSTANCES. Partial scope → justify in Architecture Notes.

**Batch B — fire in one parallel round after Batch A completes** (depends on interfaces, types, and library APIs discovered in Batch A):

9. **Read every domain type the component reads or writes** — copy full type definitions verbatim. Never write "see task NNN." For each type, flag every optional field (`?:`) that the implementation will access. Record these in the OPTIONAL FIELD HAZARDS section of the Exploration Report. The step instructions must use optional chaining (`?.`) and a fallback value when accessing these fields — verify this during C.5.
10. **For adapters wrapping a library**: determine sync vs async from the interface return type.
11. **Check branded types** — for every parameter, verify the correct branded type from `core/types/`. Check factory function usage.
12. **Plan the step breakdown** — count methods, assign to steps (max 2 per step, max 1 file per step). Record the mapping.
13. **Verify module resolution** — if config changes are proposed, read the relevant `tsconfig.json` and record `moduleResolution`. If uncertain → state as blocker.
14. **Trace consumers of modified types and function signatures** (conditional — if any file in the Files table is "Modify" and touches an interface, type, OR exported function signature) — Two sub-checks:
    **(14a) Type/interface consumer trace:** Grep for all importers of any modified interface or type. Classify each as "will break" (uses removed/changed members) or "compatible" (unaffected). If breakage is expected, add "Modify" rows to the Files table for each broken consumer.
    **(14c) Caller chain trace (mandatory when any exported function signature changes):** Grep for all direct callers. For each: (i) determine if it needs updating, (ii) if it's an exported function/closure, trace its callers recursively until reaching a system boundary (MCP handler, CLI entry, test). Every file in chain → "Modify" row. Zero-arg closures wrapping functions gaining parameters must be parameterized, inlined, or restructured. Record in CALLER CHAIN ANALYSIS field.
    14b. **Scope-adjacent string reference scan** (conditional — if any "Modify" file) — grep full codebase for string-literal occurrences of modified/renamed names beyond import statements. Check: dispatch tables, error messages, log statements, test descriptions, comments, documentation, and infrastructure configs (`vitest.config.ts`, `tsconfig.json`, `.github/workflows/*.yml`, `package.json` scripts). Classify as "in-scope fix" or "follow-up". Record in SCOPE-ADJACENT REFERENCES field. **Package rename pitfall:** when `package.json` `name` changes, resolve aliases referencing old name will silently break.

15. **Existing test impact analysis** (mandatory — all task types) — for every file the task creates, modifies, or deletes, AND for every observable side effect of the proposed changes (file count changes in a directory, altered output format, changed config structure, new entries in a list/array, modified wiring):
    - Grep `**/*.test.ts`, `**/*.test.js`, and `**/__tests__/**` for references to the affected files, directories, or behaviors.
    - Read each matching test file. Identify every assertion that depends on state the task will change: hardcoded counts (`=== 12`, `.length === N`), specific file listings, expected output strings, directory snapshots, config shape assertions.
    - For each invalidated assertion: record the test file, line number, current asserted value, and the correct value after the task's changes.
    - Add affected test files as "Modify" rows in the Files table with a description of what changes (e.g., "update file count assertion from 12 to 19").
    - Record all findings in the TEST IMPACT field of the Exploration Report.
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
      15d. **Test runner wiring check** (mandatory sub-item — for every test file the task modifies or references in a "Verify:" line) — classify each as "IN TEST SUITE" or "EXCLUDED" from `pnpm test`. Record in TEST IMPACT. EXCLUDED tests need standalone "Verify:" lines. If EXCLUDED + silently broken → flag as pre-existing gap. **Gap closure:** If task fixes an EXCLUDED test, evaluate if exclusion is intentional (document in Architecture Notes) or oversight (add step to register in `pnpm test`).

16. **Copy/bundle target directory audit** (conditional — if any step uses `cpSync`, `copyFileSync`, `cp -r`, or any recursive directory copy/bundle operation) — for every source directory that will be copied or bundled:
    - Glob the full source directory tree (including all subdirectories) and list every file and subdirectory that will be included.
    - Flag `__tests__/`, `*.test.*`, `*.spec.*`, `node_modules/`, `.git/`, and other non-production content that the recursive operation would include.
    - If unwanted content exists, the task spec must either: (a) specify a `filter` function for `cpSync` that excludes test/non-production files, (b) use selective file copying instead of recursive directory copy, or (c) explicitly justify including the test files (e.g., the bundle is a development tool that ships tests).
    - Record findings in the COPY TARGET AUDIT field of the Exploration Report: list every subdirectory and its file count, flag non-production content, and state the chosen exclusion strategy.

16b. **Non-TypeScript runtime asset check** (conditional — if any step introduces a runtime read for a non-TS file via `import.meta.url`/`__dirname`) — verify: (1) build script copies asset to `dist/`, (2) CI runs `pnpm build` before `pnpm test` (not just `tsc -b`), (3) `vitest.config.ts` aliases resolve to `src/`. Record in NON-TS ASSET PIPELINE field: `[asset] — build copies: [YES/NO] — CI builds before test: [YES/NO] — vitest alias to src: [YES/NO]`. Any NO = must fix in task.

16c. **Modified file binding inventory** (mandatory — for every "Modify" file where task adds new code) — read the file, list relevant bindings and module type (CJS/ESM). For every value the new code needs, check if an existing binding already computes it → step must say "use existing `<name>` (line N)". Flag shadowing/duplicate binding names as conflicts. Record in BINDING INVENTORY field.

17. **Behavior change analysis** (mandatory — for every file in the Files table with action "Modify" where the task changes the logic of an existing function, not just adds a new function/export to the file) — for each function being modified:
    - Read the function in its current state.
    - Identify every conditional branch, early return, guard clause, error handler, default value, and fallback in the function.
    - Compare the pre-change behavior against the post-change behavior. An "observable behavioral difference" is any change in: conditions under which code runs or does not run, values returned in edge cases, side effects triggered or suppressed, error paths taken.
    - Record each behavioral difference in a BEHAVIOR CHANGES field in the Exploration Report: `[file]:[function] — OLD: [what happened before] → NEW: [what happens now] — REASON: [why the change is correct]`.
    - If any behavioral difference exists, the task's Architecture Notes must include a **Behavior change:** bullet explaining the old behavior, the new behavior, and why the change is correct or necessary.
    - If no "Modify" rows change existing function logic (all modifications are pure additions — new functions, new exports, new imports), record "No behavior changes — modifications are additive only" and move on.

18. **Speculative verification tool execution** (mandatory — all task types) — if any proposed step, Files table description, or acceptance criterion depends on the output of a verification tool (`pnpm knip`, `pnpm lint`, `pnpm test`, `node --check`, a grep for unused exports, etc.) to determine its scope, the planner MUST run that tool during exploration and record the exact output. Never defer tool-dependent decisions to the executor with conditionals like "if knip reports unused" or "if lint shows errors." The planner runs the tool, reads the output, and writes the concrete scope.
    - For `pnpm knip`: run it against the workspace, record which files/exports it flags, and write exact ignore entries in the task.
    - For lint/typecheck: run the check on affected files, record specific errors, and write exact fixes.
    - For test runners: run relevant tests, record pass/fail status, and reference concrete outcomes in the task.
    - If a tool cannot be run during exploration (requires artifacts that do not yet exist, e.g. a bundle not yet created), the planner must determine the answer by static analysis instead — trace the entry points in knip config, read lint rules, etc. — and write a definitive scope. If static analysis is insufficient, flag it as a **BLOCKER** and tell the user.
      Record findings in a SPECULATIVE TOOL EXECUTION field of the Exploration Report: `[tool] — run during exploration: [YES (output summary) | NO (static analysis: result) | BLOCKER (reason)]`.

19. **File convention determination** (mandatory — for every file in the Files table with action "Modify" where the task writes code that has multiple valid idioms) — before writing step instructions that involve a common operation (loading JSON, reading files, importing modules, error handling), read the target file and determine which idiom it already uses. The step instructions must use the same idiom — never offer alternatives. Common idiom forks:
    - JSON loading: `require("./foo.json")` vs `JSON.parse(fs.readFileSync(...))` vs `import` assertion — check which the file already uses.
    - Module system: CJS `require`/`module.exports` vs ESM `import`/`export` — never mix.
    - Test framework: `assert` vs `expect` vs `it`/`describe` — match the file's existing framework.
    - Path computation: `__dirname` vs `import.meta.url` + `fileURLToPath` — match the module system.
      Record findings in the BINDING INVENTORY field alongside the existing binding analysis: `[file] — JSON loading idiom: [require | readFileSync+parse | import] — test framework: [assert | vitest | jest]`.

**Pre-read items** (already in context from §1 — extract findings, do not re-read):

18. **`shared/package.json`** — record dependencies and pinned versions.
19. **`eslint.config.mjs`** — record restricted-import rules for the target layer. If ESLint changes are needed, determine the exact structural change.
20. **Installer-managed content sync** (conditional — if any file touches `.cursor/rules/AIC-architect.mdc`, `.claude/CLAUDE.md`, `integrations/claude/install.cjs` `CLAUDE_MD_TEMPLATE`, `integrations/cursor/install.cjs` `TRIGGER_RULE_TEMPLATE`, or `mcp/src/install-trigger-rule.ts`) — diff shared sections across affected files. If drifted, add "Modify" rows. Record in INSTALLER SYNC field. `AIC-architect.mdc` is the source of truth.
21. **Documentation impact analysis** (mandatory — all non-documentation task types) — grep `documentation/` for every entity the task creates, modifies, or renames. For each match, classify as:
    - **WILL BECOME STALE** — document describes details the task changes.
    - **NEEDS UPDATE** — references name/path being renamed or behavior being modified.
    - **UNAFFECTED** — generic mention not dependent on changed details.
      Record in DOCUMENTATION IMPACT field. For STALE/UPDATE files, classify complexity:
    - **MECHANICAL** — name/path text replacement only.
    - **SECTION EDIT** — prose rewrite needed.

### A.2 Produce the Exploration Report

**Write the report to a file in the worktree**, not to the chat. Save to `<worktree>/documentation/tasks/.exploration-$EPOCH-slug.md` (use the worktree absolute path, the epoch value from §0, and a short kebab-case slug for the component). The worktree path is critical — if written to the main workspace by mistake, it will not be cleaned up when the worktree is removed. This avoids slow chat streaming for a 200–300 line document and gives the user a better review surface (editor search, folding, scrolling).

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

NON-TS ASSET PIPELINE (conditional — from item 16b, only if task introduces a runtime read of a non-TS file):
- [asset file] — build copies: [YES — cpSync in build script | NO — add copy step]
  CI builds before test: [YES — pnpm build in ci.yml before pnpm test | NO — add build step]
  Vitest alias resolves to src: [YES — alias maps package to shared/src | NO — update vitest.config.ts]
- Or: Not applicable — task does not introduce runtime reads of non-TS files.

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

DOCUMENTATION IMPACT (mandatory — all non-documentation task types, from item 21):
- Entities searched: [list of component/interface/function/type names grepped in documentation/]
  - [doc file]:[line] — "[excerpt of matching text]" — WILL BECOME STALE / NEEDS UPDATE / UNAFFECTED
  - Reason: [why this reference will or will not become incorrect after the task]
- Documentation files requiring changes: [count] — [list of file paths]
- Change complexity per file:
  - [doc file] — MECHANICAL (name/path replacement only) / SECTION EDIT (prose rewrite needed)
- Or: No documentation impact — grep returned 0 relevant matches for all entities.
  Source: [verified via Grep of documentation/ for each entity name]

SPECULATIVE TOOL EXECUTION (mandatory — from item 22):
- [tool command] — run during exploration: [YES — output: "[summary]" | NO — static analysis: [result] | BLOCKER — [reason]]
- Scope resolved: [exact list of entries/fixes determined, or "no tool-dependent scope in this task"]
- Or: Not applicable — no step, Files table row, or acceptance criterion depends on tool output for scope.

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

For every discrepancy found, fix the exploration file (use targeted edits on `<worktree>/documentation/tasks/.exploration-$EPOCH-slug.md`) before proceeding. Do NOT present unchecked claims to the user.

### A.4 Resolve design decisions

Work through this checklist using the verified Exploration Report. Every item must have a single definitive answer — no "or", "optionally", "depending on".

**Constructor parameters:** For each parameter, state WHY it's needed:

- Generates timestamps? → needs `Clock`
- Generates entity IDs? → needs `IdGenerator`
- Executes SQL? → needs `ExecutableDb`
- Reads/writes files? → check layer constraints (storage bans `node:fs`)

**Conditional dependencies:** If a dependency is only relevant under certain conditions, it must NOT be eagerly instantiated. Accept as injected parameter; composition root decides at runtime. Async init stays in `main()`. If unsure → **ask the user**.

**Method behavior:** For each method, write ONE sentence describing exact behavior. If the sentence contains "or", "optionally", or "depending on" — you haven't decided. Pick one or **ask the user**.

**Interface design (if creating new):** Exactly ONE interface. Never alternatives.

**Config changes:** State exactly what changes. For dependencies: "[package] already at [version]; no change" or "add [package] at [version]". For ESLint: show the exact config block or "no change needed."

**Constructor branded types:** Cross-reference the BRANDED CHECK in the Exploration Report.

**Layer constraints (HARD GATE):** Read the LAYER BLOCKERS section. If any blocker is YES, **STOP and ask the user**.

**Test strategy:** For each error/edge test, decide the exact mocking approach. ONE sentence: "Mock [dependency] to [throw/return X], then assert [expected outcome]." Never "mock or skip."

**Library API calls:** State the exact function call chain for every external library used. Not "e.g. X or equivalent" — the precise calls.

**Wiring verification (composition roots):** Verify every constructor signature against actual source. If source has changed since Exploration Report, re-read and update.

**Module resolution (if config changes):** Verify tsconfig supports proposed exports format.

**Dispatch pattern:** 3+ branches → `Record<Enum, Handler>` for enum dispatch or handler array for predicate dispatch. Write the chosen pattern in step instructions.

**Forward effect simulation (mandatory — all task types):** For every proposed change, trace forward: (1) what observable state changes, (2) who observes that state (tests, scripts, config consumers, downstream components), (3) what breaks (hardcoded counts, expected strings, directory snapshots, config assertions). Cross-reference against TEST IMPACT and CHANGE-PATTERN INSTANCES. If forward simulation reveals uncaptured impacts, update those fields and re-run item 15.

**Function signature chain simulation (mandatory when exported function signature changes):** For each caller in 14c's chain: does it pass through or originate the new param? Pass-through → verify its signature changes. Originator → verify it has access to data. Zero-arg closures → specify: parameterize, inline, or restructure. Task must specify the option.

**Research delegation (optional):** If exploration cannot answer a question (approach evaluation, first-of-kind prediction, cross-package dedup), delegate to `aic-researcher` skill. Read `.claude/skills/aic-researcher/SKILL.md` and run the appropriate protocol.

**Documentation change production (mandatory when DOCUMENTATION IMPACT has STALE/UPDATE files):**

- **MECHANICAL:** Write Change Specification directly (current text → target text).
- **SECTION EDIT:** Delegate to `aic-documentation-writer` Phase 2-3 for reviewed Change Specifications.

For each file: (1) add "Modify" row, (2) add documentation step at END of step list (1 file per step), (3) include Change Specification + Verify line. If user's scope tier excludes doc changes → defer to Follow-up Items.

### A.4b Simplicity sweep

After resolving all decisions, review the plan for over-engineering. For every new artifact the plan introduces, answer one question:

- **Each new file in Files table:** "Can this live in an existing file?" If an existing file in the same layer/directory handles the same concern, add to it instead.
- **Each new interface:** "Does an existing interface already cover this responsibility?" If it can gain a method, prefer that.
- **Each new type/branded type:** "Is this type used in more than one place?" If used only by the component being built, consider inlining or using an existing type.

**Red flag:** If the plan creates 3+ new files for a single-concern component (beyond source + test), justify each file or simplify.

Record any simplifications made. If simplification changes the STEP PLAN or FILES, update them before proceeding.

### A.4c Scope expansion recommendation (all task types)

After exploration completes (A.1 through A.4b), if the exploration discovered issues beyond the original task scope — stale markers in modified files (item 8b), change-pattern instances not in original scope (item 8c), scope-adjacent string references that would go stale (item 14b), consumer breakage beyond the minimum fix (item 14), test assertions invalidated by the changes (items 15, 15b), pre-existing stale test assertions (item 15c), tests excluded from the test runner (item 15d), documentation files that will become stale or need updates (item 21), sibling improvements, actionable TODOs in touched files, or for documentation tasks: parallel section asymmetry, structural mismatches, scope-adjacent inconsistencies, mirror document divergences (items 5b-5e, item 11) — present three scope tiers to the user before proceeding to the user checkpoint:

> **Exploration found issues beyond the original scope.** Choose a scope tier:
>
> **Minimal (original scope only):** Implement only the original task. Found issues are reported as follow-up items.
>
> - Changes: [list the original changes]
> - Issues deferred: [count and brief summary, including documentation files needing updates]
>
> **Recommended (original + high-impact findings):** Implement the original task plus fixes for issues that directly affect correctness or consistency of the modified code/document. Typically: stale markers in modified files, string references that would break, consumer fixes for type breakage, MECHANICAL documentation fixes (name/path replacements). SECTION EDIT documentation changes are deferred.
>
> - Additional changes: [list each with one-line rationale, including MECHANICAL doc fixes]
> - Issues deferred: [count and brief summary of remaining items, including SECTION EDIT doc changes]
>
> **Comprehensive (full sweep):** Implement the original task plus fix all found issues, including sibling improvements, actionable TODOs, broader refactoring, and all documentation changes (both MECHANICAL and SECTION EDIT with full Change Specifications produced via the documentation-writer pipeline).
>
> - Additional changes: [list each with one-line rationale, including all doc changes]
> - Issues deferred: None
>
> **"Pick a tier, or tell me a custom scope."**

Wait for the user's response. Update the task scope accordingly before writing the task file in Pass 2. If the user picks Minimal, the deferred issues are listed in a `## Follow-up Items` section at the end of the task file for future planning.

If the user picks Recommended or Comprehensive, re-run the A.4b simplicity sweep on all newly added files — those files were not present during the original A.4b run. If simplification reduces the newly added scope, present the change before proceeding to A.5.

**When to skip this checkpoint:** If exploration found zero issues beyond the original scope (no stale markers, no scope-adjacent references, no consumer breakage beyond what the task already covers), skip A.4c entirely and proceed to A.5. Do not present empty tiers.

### A.5 User checkpoint

The full Exploration Report is in `<worktree>/documentation/tasks/.exploration-$EPOCH-slug.md` (written in A.2). **Present a decisions-focused summary in chat**, not the full report. The summary must include every design decision so the user can approve the plan without opening the file for routine components. Say:

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

## Pass 2: Write + Verify

**Goal:** Mechanically map the Exploration Report + resolved decisions into the task file template, then immediately verify using Grep-based checks. No creative composition — if it's not in the report, don't add it; if it is, don't omit it.

### C.1 Confirm reference files in context

`SKILL-recipes.md` and `SKILL-guardrails.md` were pre-read during §1 and are already in context. Review the recipe matching the RECIPE field in the Exploration Report, and review all guardrails before writing. Do not re-read these files unless the context window has been truncated.

The Exploration Report is on disk at `<worktree>/documentation/tasks/.exploration-$EPOCH-slug.md`. If context has been truncated and you need to re-read report sections, use Read with offset/limit to target specific sections rather than re-reading the entire file.

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
| NON-TS ASSET PIPELINE          | Steps (build copy, CI build step, vitest alias) + Config Changes if needed        |
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
- Never make the scope of a step, Files table description, or acceptance criterion depend on tool output the planner did not collect during exploration — e.g., "add ignore entries if knip reports unused" or "fix any lint errors that appear." Run the tool in exploration item 22 and write the concrete scope. If the tool cannot run, resolve by static analysis or flag as a blocker.
- Never offer alternative idioms for a common operation when the target file already uses one — e.g., "use readFileSync or require for JSON" when the file uses `require`. Read the file in exploration item 23 and write the single correct idiom.

### C.4 Save the task file

Save to: `documentation/tasks/$EPOCH-kebab-case-name.md`

Use the epoch value from §0 as a temporary identifier. The final sequential number (NNN) is assigned at finalization in §6. Use `$EPOCH` in the `# Task` heading as well (e.g. `# Task 1741209600: Component Name`).

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
Cat 8 (tool-conditional scope): "if knip reports", "if knip flags", "if lint shows",
"if lint reports", "if test shows", "if test fails", "if typecheck reports",
"if [tool] reports", "if [tool] flags", "if [tool] shows",
"run [tool] and add", "run [tool] to determine", "check [tool] output"
Any Files table description, step instruction, or acceptance criterion whose scope depends on tool output the planner did not run during exploration = fail. The planner must resolve tool-dependent scope in exploration item 22 and write the concrete result.
Layer 2 — Grep for `" or "` in the task file — scanning ALL non-code text: step instructions, verify lines, Files table descriptions, Architecture Notes, acceptance criteria. Read each match. Does it present two alternative actions the executor must choose between? If yes = fail.
Acceptable "or": conditional behavior, conjunctions ("zero errors or warnings"), logical disjunction in code blocks.
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

AB. **SPECULATIVE TOOL EXECUTION COMPLETENESS (mandatory — all task types):** For every step, Files table description, and acceptance criterion, scan for tool-conditional language:

- Grep the task file for patterns: "if knip", "if lint", "if test", "if typecheck", "if [tool]", "run [tool] and", "run [tool] to determine", "check [tool] output". Any match outside a code block = fail.
- For every Files table row, verify its description does not contain conditionals that depend on unresolved tool output (e.g., "add entries if X reports Y"). Every description must be unconditional. If a description contains a conditional = fail.
- Verify the Exploration Report has a SPECULATIVE TOOL EXECUTION field (or says "Not applicable"). If any step's scope was determined by tool output but no SPECULATIVE TOOL EXECUTION field exists = fail.
- Cross-check: if the task includes a `knip.json` modification, verify the specific entries to add are listed in the step instructions (not deferred to the executor). If the step says "add entries" without listing exact paths = fail.

AC. **FILE CONVENTION CONSISTENCY (mandatory — "Modify" rows adding code):** Step instructions must specify one idiom matching the file's existing conventions (JSON loading, module system, test framework). Alternatives = fail. Missing convention note in BINDING INVENTORY = fail.

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
27. Documentation impact coverage — mandatory for non-doc tasks (check AA)

### C.5b Independent verification agent

After the self-check (C.5 Steps 1–2) passes at 100%, spawn an independent review agent.

**Spawn a `generalPurpose` subagent** with a prompt built from these components (fill in the bracketed values from the current task):

1. **Role:** "You are an independent task-file reviewer. You have NO prior context about what the planner intended. Your only job is to find factual errors by cross-checking the task file against actual source files."

2. **Inputs:** Provide the task file path and every source file path the task references (interfaces, types, migrations, `.d.ts` files, modified files). List these explicitly — the subagent must read them fresh.

3. **Instructions — checks (report FOUND/NOT_FOUND, MATCH/MISMATCH, or COMPATIBLE/INVALIDATED for each):**
   - **API calls:** Extract every `.methodName(` and `new ClassName(` from code blocks → Grep interface/`.d.ts` for each.
   - **SQL columns:** Verify every column in SQL statements appears in the migration `CREATE TABLE`.
   - **SQL normalization:** Check 1NF (no multi-value columns), 2NF (no partial key deps), 3NF (no transitive deps), lookup tables for repeated strings.
   - **File paths:** Glob every "Modify" row path → EXISTS / DOES NOT EXIST.
   - **Signature match:** Verify class methods match interface source exactly (params, types, returns).
   - **Acceptance criteria vs test assertions:** For criteria referencing test files, verify task changes don't invalidate assertions without updating them.
   - **Test assertion ground-truth:** Verify hardcoded literals against actual source → CORRECT / STALE.
   - **Test runner wiring:** Classify test files as IN TEST SUITE / EXCLUDED.
   - **Coverage completeness:** CHANGE-PATTERN INSTANCES "IN SCOPE" entries → verify in Files table.
   - **Test impact completeness:** TEST IMPACT invalidated tests → verify in Files table as "Modify" rows.
   - **Caller chain completeness:** CALLER CHAIN files → verify in Files table with step instructions.
   - **Copy target audit:** Glob recursive copy sources for test files without exclusion strategy.
   - **Binding reuse:** Check for redundant value derivations when existing bindings suffice.
   - **Behavior change completeness:** Verify Architecture Notes documents all observable behavioral differences in "Modify" files.
   - **Documentation impact completeness:** DOCUMENTATION IMPACT STALE/UPDATE files → verify in Files table or Follow-up.

4. **Output format:** Return a structured list of findings: each finding has type (api/sql/path/signature/coverage/test-impact/ground-truth/test-wiring/copy-target/binding-reuse/behavior-change/doc-impact), name, source file, and status (FOUND/NOT_FOUND or MATCH/MISMATCH or IN_FILES_TABLE/MISSING or CORRECT/STALE or IN_TEST_SUITE/EXCLUDED or REDUNDANT/OK or DOCUMENTED/UNDOCUMENTED or COVERED/MISSED). End with a summary: "PASS — all N findings confirmed" or "FAIL — M of N findings have errors" with the specific errors listed.

**If the subagent returns FAIL:** For each NOT_FOUND or MISMATCH finding, determine the root cause (wrong method name, training-data hallucination, outdated interface, typo). Fix the task file, re-run the specific C.5 check that corresponds to the finding, and re-spawn the subagent to confirm the fix. Do NOT proceed to C.6 until the independent review passes.

**If the subagent returns PASS:** Proceed to C.6.

### C.5c Independent Codebase Verification

**Spawn a `generalPurpose` subagent** with the task file path, the project root path, and `.cursor/rules/AIC-architect.mdc`. Do NOT provide the exploration report.

**Category 1 — Dependency probes (run for every "Modify" row where exported function/interface signature changes):**

1. **Caller discovery:** Grep entire codebase for callers of changed functions. Report callers NOT in Files table as `MISSING_CALLER`.
2. **Consumer discovery:** Grep for importers of changed interfaces. Report broken consumers NOT in Files table as `MISSING_CONSUMER`.
3. **Parameter origin trace:** For new params, trace callers recursively to system boundary. Report intermediaries needing signature changes as `MISSING_INTERMEDIARY`.
4. **Closure/wrapper detection:** Check if callers use zero-arg closures wrapping functions gaining params. Report as `CLOSURE_BREAK`.

**Category 2 — Convention probes (run for every "Create" row in the Files table):**

5. **File naming:** Kebab-case, `*.interface.ts`, `*.test.ts`, `NNN-description.ts`. Report: `NAMING`.
6. **Layer placement:** Correct directory for declared layer. Report: `LAYER`.
7. **ISP:** Interface methods ≤ 5. Report: `ISP`.
8. **Storage completeness:** Storage class → migration step required. Report: `MIGRATION` / `DDL`.
9. **Composition root wiring:** New interface implementor → wire in `mcp/src/server.ts`. Report: `WIRING`.
10. **Layer boundary:** No hexagonal violations in imports. Report: `BOUNDARY`.
11. **Branded types:** Domain-value params use branded types, not raw `string`/`number`. Report: `BRANDED`.
12. **Test coverage:** Every new class/function → test case in Tests table. Report: `UNTESTED`.
13. **Directory impact:** Grep test files for file-count/listing assertions on affected directories. Report: `DIR_IMPACT`.
14. **Test assertion ground-truth:** Verify hardcoded count assertions against actual disk state. Report: `STALE_ASSERTION`.
15. **Test runner wiring:** Check if test files are in `pnpm test`. Report: `TEST_EXCLUDED`.
16. **Copy target contents:** Glob recursive copy sources for `__tests__/`/test files without exclusion. Report: `BUNDLE_TESTS`.
17. **Binding conflicts:** Check for redundant/shadowed bindings in "Modify" files. Report: `REDUNDANT_BINDING` / `SHADOW_BINDING`.
18. **Non-TS asset pipeline:** Verify build copies asset, CI builds before test, vitest aliases to `src/`. Report: `MISSING_ASSET_COPY` / `CI_NO_BUILD` / `VITEST_ALIAS_STALE`.

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

**Comparison:** Diff the adversarial agent's Files table against the planner's. Files in both = confirmed. Files in shadow only = investigate (genuine miss → add to task; over-scoped → ignore). Files in planner only = verify justification. For each genuine miss, add to Files table, create Step, re-run affected C.5 checks.

**If no discrepancies:** Proceed to C.6.

### C.6 Score and act

**Always fix to maximum score.** For every failing check, attempt a fix — regardless of the current score. Do not accept a less-than-perfect score just because it is "close enough." The goal is 100%.

**Verification pipeline order:** C.5 (self-check) → C.5b (document review) → C.5c (codebase verification) → C.5d (adversarial re-planning, if triggered). Each stage must pass before the next begins. Findings from later stages feed back into earlier checks: if C.5c adds files to the task, re-run relevant C.5 checks (D, N, W) on the updated task before proceeding.

1. **For each failing check or finding:** Determine the root cause, apply a targeted fix to the task file, and re-run that specific check to confirm resolution.
2. **After all fixes within a stage:** Re-run the full rubric for that stage. If new failures were introduced by the fixes, repeat.
3. **Iterate** until each stage reports PASS, then advance to the next.
4. **Genuinely unfixable:** A check is unfixable only when the component structurally cannot satisfy it (e.g. "Wiring accuracy" for a non-composition-root task, or "Library API accuracy" for a task that uses no external library). In this case, mark the check as N/A and exclude it from the denominator. Never mark a check N/A to avoid doing work — only when the check's precondition is structurally unmet.
5. **Proceed to §6 immediately** when: C.5 score = M/M (100%), C.5b = PASS, C.5c = PASS, and C.5d = PASS or skipped. **Do NOT stop, report, or wait for the user** — §6 is mandatory finalization (copy task file to main workspace, clean up worktree). The task is incomplete until §6 finishes.

---

## §6. Finalize and offer execution (MANDATORY — never skip)

**This section is NOT optional.** After Pass 2 verification (C.6) completes, §6 MUST run immediately. The task file exists only in the worktree — if you stop before §6, the user has no task file in their main workspace. The worktree is temporary and will be deleted.

Task files live in `documentation/tasks/`, which is gitignored. They cannot be committed or merged — finalization copies the file directly from the worktree to the main workspace.

After verification passes:

1. **Assign the final sequential task number (NNN).** The task number is a short sequential integer (e.g. `265`), **NOT the epoch value** used during planning. From the **main workspace root** (not the worktree — gitignored files only exist in the main workspace), scan both `documentation/tasks/` and `documentation/tasks/done/` for the highest existing sequential task number. Completed tasks are archived to `done/`, so both directories must be checked. **Exclude epoch-prefixed filenames** (10+ digit numbers) — those are planning artifacts that were not properly renumbered:

   ```
   { ls documentation/tasks/ 2>/dev/null; ls documentation/tasks/done/ 2>/dev/null; } | grep -oE '^[0-9]+' | awk 'length <= 4' | sort -rn | head -1
   ```

   Note: uses `-oE` (extended regex), not `-oP` (Perl regex), for macOS compatibility. The `awk 'length <= 4'` filter excludes epoch timestamps (10 digits) that may exist from planners that failed to renumber. Add 1 to the result (e.g. if highest is `264`, NNN is `265`). Zero-pad to 3 digits only if under 100 (e.g. `007`). If no numbered files exist, start at `001`.

   **Validation guard:** If NNN is greater than 9999 or has 10+ digits, something went wrong — you are using the epoch, not the sequential number. Re-read this step and try again.

   **Parallel safety:** Multiple planners use unique `$EPOCH` identifiers during planning. The final NNN is assigned here, at the last possible moment. If a parallel planner saved a file between your scan and your copy (step 2), the numbers will collide — this is acceptable for the rare case and the user can rename manually.

2. **Update heading and copy to main workspace:**
   - In the worktree task file, update the `# Task` heading: replace `# Task $EPOCH:` with `# Task NNN:`.
   - Copy the task file to the main workspace: `cp <worktree>/documentation/tasks/$EPOCH-name.md <main-workspace>/documentation/tasks/NNN-name.md` (use absolute paths for both source and target).

3. **Clean up the worktree and exploration file.** The exploration file is an intermediate artifact — its findings are already mapped into the task file via C.2. Removing the worktree should delete it, but as a safety net also delete it from the main workspace in case it was accidentally written there. From the **main workspace root**:

   ```
   rm -f documentation/tasks/.exploration-$EPOCH*.md
   git worktree remove .git-worktrees/plan-$EPOCH && git branch -D plan/$EPOCH
   ```

4. **Announce:** "Task saved to `documentation/tasks/NNN-name.md`. Score: N/M (X%). Use the @aic-task-executor skill to execute it."

---

## §7. Review existing tasks

Triggered when the user asks to review one or more task files.

**Scope:**

- "review task 008" → single task
- "review tasks" / "review all tasks" → all pending in `documentation/tasks/` (skip `done/`)

**Step 7.0: Worktree setup.** Create a planning worktree from `main` using the same procedure as §0 steps 1–3. Store the epoch value. Use the worktree for code exploration (reading interfaces, types, source files). Task files are gitignored, so read and write them from the **main workspace** — the worktree will not have them.

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

After rewriting, rewritten task files are already in the main workspace (they were read from and written to it directly — task files are gitignored and never exist in the worktree). Clean up the worktree:

- From the main workspace root: `git worktree remove .git-worktrees/plan-$EPOCH && git branch -D plan/$EPOCH`

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

## Plan Failure Patterns — Never Write These

If any appear in step instructions, Files table, verify lines, or test descriptions = incomplete plan. Go back and resolve.

- "TBD", "TODO", "implement later", "in a future task"
- "add appropriate handling/tests", "handle edge cases" (without listing them)
- "similar to Task N", "see Task N" (repeat the code)
- "write tests for the above" without listing test cases
- "update as needed", "fix if broken", "refactor if necessary"

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
- **Feedback-driven probe accumulation:** When verification misses a failure, extract the failure class and add a targeted probe to C.5c (trigger condition, grep pattern, report format). Strengthen existing C.5/C.5b checks before adding to C.5c.

## Common Rationalizations — STOP

- Never skip subagent dispatch. Never skip evidence requirements. Never do inline what should be spawned.
- Never plan from memory — read `.d.ts`, interfaces, and source files. "Probably" = not verified.
- Never skip the exploration report, improvise outside recipes, or defer details to the executor. The worktree is temporary — §6 is mandatory.
