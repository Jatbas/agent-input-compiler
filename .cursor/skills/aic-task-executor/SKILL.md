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
- The research document at the path in `> **Research:**` header (if present in the task file)

**Validate** from the pre-read results:

- Status is `Pending` (do not re-execute `Done` or `Blocked` tasks)
- All dependencies listed in "Depends on" are actually `Done` in `documentation/mvp-progress.md`

If a dependency is not done, **stop and tell the user**.

**Create a worktree** to isolate all work. The main working tree stays on `main`, untouched — multiple executors can run in parallel, each in its own worktree.

Generate a unique name using the Unix epoch, with an optional task prefix for readability:

```
EPOCH=$(date +%s)
# With a task file: use the task number as prefix
git worktree add -b feat/task-NNN-$EPOCH .git-worktrees/task-NNN-$EPOCH main
# Without a task file (ad-hoc): epoch only
git worktree add -b feat/$EPOCH .git-worktrees/$EPOCH main
```

Examples: `.git-worktrees/task-011-1741209600` with branch `feat/task-011-1741209600`, or `.git-worktrees/1741209600` with branch `feat/1741209600` for ad-hoc work. **Store the epoch value** — you will use it in branch/directory names throughout.

If the worktree directory already exists (stale from a previous run), prune and retry:

```
git worktree prune && git worktree add ...
```

**Install dependencies in the worktree** (pnpm hard-links from the global store — fast, no re-downloads):

```
pnpm install
```

Run with `working_directory` set to the worktree absolute path.

**Verify the worktree HEAD:**

```
git rev-parse --abbrev-ref HEAD
```

Run with `working_directory` set to the worktree. Output must match the branch you created. If it does not match, stop and tell the user.

**Store the worktree absolute path** and **branch name**. You will need both throughout execution — all file operations and shell commands target the worktree.

**If a task file exists,** update its status to `In Progress` — edit the **main workspace** copy (at `documentation/tasks/NNN-name.md`, NOT in the worktree). Task files live in `documentation/tasks/` which is gitignored — they are never committed or present in worktrees. All task file operations (status update, move to `done/`) happen on the main workspace filesystem only.

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

**If a research document was pre-read (from `> **Research:**`),** absorb its key findings, evidence, and recommendations. Treat it as additional context that informs implementation decisions — it may contain API signatures, env var names, edge cases, or design rationale not captured in the task's Architecture Notes. Do not blindly follow research recommendations if they conflict with the task's explicit steps; the task file takes precedence.

**Cross-check prerequisites:** If Config Changes lists a dependency as "already at X", verify it's actually there (package.json is in context). If it lists an ESLint change, confirm the Steps section has a step for it. If anything doesn't match, **stop and tell the user** — the task file may need replanning.

**Build the touched-files list.** Extract every file path from the task's **Files table** (both "Create" and "Modify" rows). Then add the standard files that every task modifies:

- `documentation/mvp-progress.md` (progress update in §5b)

Note: task files (`documentation/tasks/`) are gitignored and never committed. The move to `done/` and status update happen on the main workspace filesystem only — they are NOT part of the commit allowlist.

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

### 2b. Documentation mode detection

**Check if this is a documentation task.** A task is a documentation task if:

- The task file's Layer field is absent or says "documentation"
- The task file has a **Change Specification** section instead of an Interface/Signature section
- The task file has a **Writing Standards** section instead of a Dependent Types section
- All files in the Files table are `.md` files in `documentation/`

If this is a documentation task, switch to the documentation execution workflow described in §3-doc below. Skip §3 (code implementation), §4a-§4b (code verification), and use §3-doc, §4-doc instead. §5 (finalize) and §6 (merge) remain the same.

If this is NOT a documentation task, skip §3-doc and §4-doc. Proceed to §3 as usual.

### 3-doc. Implement (documentation mode)

**This section replaces §3 for documentation tasks.** Work through the Steps section in order, applying the documentation-specific workflow.

**Pre-write: internalize voice and context.**

Before editing any document, read in one parallel batch:

- The full target document (not just the sections being edited — you need the full voice and tone)
- The 2 most-related sibling documents (from the Cross-Reference Map in the task file)
- The Writing Standards section from the task file

Internalize: tone (formal/informal), sentence patterns, paragraph length, formatting conventions, terminology. Your edits must be indistinguishable from the surrounding text.

**Content format conventions (mandatory for all documentation edits):**

Before writing any new content, check these formatting rules. Violations cause 4-doc-c failures:

- **Definitions / glossaries:** 3+ terms being defined must use a table (columns: Term, Definition), under a proper heading (e.g. `## Glossary`). Never inline multiple definitions as a bold-text paragraph. 1-2 terms may be defined inline if contextually appropriate.
- **Comparisons:** 2+ items being compared across multiple dimensions must use a table, not prose paragraphs.
- **Step-by-step procedures:** Must use numbered lists, not prose paragraphs.
- **New sections:** Any new `##` or `###` heading MUST be added to the Table of Contents if one exists. The ToC entry must appear in the correct position relative to other entries.
- **Placement:** When adding a new section, evaluate the document's existing flow (introduction → concepts → procedures → reference → appendix). Place the new section where it fits logically: glossaries/key terms go at the top (after intro, before or after ToC) or as an appendix; troubleshooting goes at the end of its parent section; reference material goes after procedural content. Never insert a new section at the first convenient gap without considering document flow.
- **Line-break preservation:** Preserve the source document's line-break structure. Do not wrap prose onto multiple lines unless the surrounding text does. If the current text is a single line, the target text must remain a single line.

**For each step in the Steps section:**

1. **Read the Change Specification for this step.** Note: current text (to locate the edit point), rationale (to understand why), and target text (what to write).
2. **Apply the change.** Use targeted edits (StrReplace) to replace the current text with the target text. Do not rewrite surrounding sections unless the step explicitly says to.
3. **Per-edit quick check.** After each edit, re-read the edited section plus 5 lines before and 5 lines after. Verify:
   - The target text was applied correctly (no truncation, no duplication)
   - The transition from surrounding text to new text is smooth (no jarring tone change)
   - No formatting inconsistencies introduced (heading level, bullet style, code block format, line-break structure)
   - If a new heading was added, it appears in the Table of Contents (if one exists)
   - If definitions or terms were added, they use the correct format (table for 3+, not inline paragraph)

**After all steps are complete, proceed to §4-doc.**

### 4-doc. Verify (documentation mode)

**This section replaces §4 for documentation tasks.** Run a verification pass using subagents and tool output as objective evidence.

**4-doc-a — Spawn three verification subagents in parallel.**

All three subagents receive: the path to the edited document, the paths to sibling documents, and the Change Specification from the task file.

**Subagent 1 — Writing quality** (`generalPurpose` subagent):

Prompt: "You are a writing quality reviewer. Read the document at [path]. For every section that was edited (see Change Specification below), check:

- Does the new text match the voice and tone of the surrounding text?
- Is the sentence structure varied (not monotonous 'X does Y. Z does W. A does B.')?
- Are paragraphs cohesive (one idea per paragraph, smooth transitions)?
- Is the level of detail consistent with neighboring sections?
- Are there ambiguous pronouns, dangling references, or undefined terms?
- Does the heading hierarchy make sense?
- **Audience awareness:** Identify the document's audience type (user-facing guide, developer reference, or mixed). Verify the edited text uses appropriate language and detail level for that audience. Flag user-facing text that dives into internal implementation details, or developer text that over-simplifies.
- **Parallel section symmetry:** If the edited section has a structural sibling (a section describing the same concept for a different target — e.g. 'Cursor' and 'Claude Code' both describe editor installation), compare the edited section against its sibling. Check ALL of:
  (a) Shared-concept ordering: subsections that exist in both (e.g. Trigger Rule, Hooks, Hook Lifecycle) must appear in the SAME ORDER.
  (b) Shared-concept naming: same semantic concept must use the SAME heading name in both sections.
  (c) Content parity: if one section has a subsection the other lacks, classify it as inherently target-specific or a gap.
  (d) Information density: flag 2x+ word count differences for equivalent subsections.
  (e) Unique-concept framing: unique subsections (inherent to one target) should be framed symmetrically in count and depth.
  Report each issue with the exact line or paragraph where it occurs. If no issues, state 'No writing quality issues found.'"

**Subagent 2 — Factual accuracy** (`explore` subagent, `fast` model):

Prompt: "Read the document at [path]. For every technical claim in the edited sections — interface names, type names, file paths, ADR references, component descriptions, architecture claims — grep the codebase to verify. Report: '[claim] — [source file:line] — VERIFIED / NOT FOUND / CONTRADICTED'. Check every claim, not just a sample."

**Subagent 3 — Cross-document consistency** (`explore` subagent, `fast` model):

Prompt: "Read the document at [path] and the sibling documents at [paths]. For every key term, component name, status claim, and architecture description in the edited sections, check that the same term/concept is used consistently in the sibling documents. Report: '[term] — [this doc says X] vs [sibling doc says Y] — CONSISTENT / DIVERGENT'. If no divergence, state 'All terms consistent.'

Additionally, if the task file mentions a mirror document (from `MIRROR DOCUMENT ANALYSIS` in the exploration report or from a Cross-Reference Map), read the mirror document and compare:

- Section structure: do corresponding sections exist with matching heading names and order?
- Content parity: are equivalent topics covered at comparable depth?
  Report structural divergences as: '[section] — TARGET has [X] / MIRROR has [Y] — ALIGNED / DIVERGENT'."

**Subagent 4 — Reader simulation** (`generalPurpose` subagent — spawn only for user-facing documents):

Prompt: "You are a first-time reader of this document. You have never seen this project before. Read the document at [path] from top to bottom, mentally following every instruction as if you were actually performing the steps.

For each instruction or section, report:

- **Undefined terms:** Words or concepts used without prior definition or link to a definition. Example: 'Run the AIC server' when 'AIC server' has not been explained.
- **Unclear prerequisites:** Steps that assume something is already done but the document doesn't say what. Example: 'Configure your editor' without saying what needs to be configured.
- **Missing context:** Points where you would ask 'wait, what does this mean?' or 'how do I do that?' Example: a command shown without explaining what it does or what output to expect.
- **Jargon without explanation:** Technical terms that a user installing the tool for the first time would not know. Example: 'MCP server', 'hooks', 'composition root' in a user-facing installation guide.
- **Dead ends:** Points where the instructions stop but the user's task is not complete, or where an error could occur with no guidance on what to do.

Focus on the edited sections (see Change Specification below) but also note issues in surrounding context that affect understanding of the edited sections. Report each finding with the exact sentence or paragraph. If the document is clear throughout, state 'No reader simulation issues found.'"

Skip this subagent for developer-facing documents (implementation specs, project plans, architecture docs) — those assume reader expertise. Spawn it for: installation guides, getting started docs, user-facing READMEs, and any document whose stated audience includes non-developers or first-time users.

**4-doc-b — Process subagent results.**

Read all subagent outputs (3 or 4 depending on whether reader simulation was spawned). For each reported issue:

- **Writing quality issues:** Fix them. Re-read the context around each fix to ensure the fix itself doesn't introduce new problems.
- **Factual inaccuracies (NOT FOUND or CONTRADICTED):** Fix the document to match the codebase. If the codebase is wrong and the document is right, do NOT change the document — add this to the Blocked section instead.
- **Consistency divergences:** Fix the edited document to align with the authoritative source. If the sibling document is wrong, note this as a follow-up item (do not edit sibling documents outside the task scope).
- **Reader simulation findings (if subagent 4 was spawned):** For each finding: if it is in the edited section, fix it (add a definition, clarify a prerequisite, simplify jargon). If it is in surrounding context outside the task scope, note as a follow-up item.

**4-doc-c — Run mechanical verification.**

After fixing all subagent-reported issues, run the mechanical checks:

| Dimension                          | Tool check                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Evidence                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1. Change specification compliance | Re-read the task's Change Specification. Re-read the edited document. Every specified change is present.                                                                                                                                                                                                                                                                                                                                                             | List each change — APPLIED or MISSING                                                                   |
| 2. Factual accuracy                | Re-run: grep codebase for every technical claim in edited sections                                                                                                                                                                                                                                                                                                                                                                                                   | List each claim — VERIFIED / NOT FOUND / CONTRADICTED                                                   |
| 3. Cross-document consistency      | Re-run: grep sibling docs for key terms in edited sections                                                                                                                                                                                                                                                                                                                                                                                                           | List each term — CONSISTENT or DIVERGENT                                                                |
| 4. Link validity                   | For every markdown link `[text](path)` in the document, Glob for the target                                                                                                                                                                                                                                                                                                                                                                                          | List each link — VALID or BROKEN                                                                        |
| 5. Writing quality                 | Subagent 1 output — all issues resolved                                                                                                                                                                                                                                                                                                                                                                                                                              | List each issue — FIXED or ACCEPTED (with reason)                                                       |
| 6. No regressions                  | `git diff` the document — verify only intended sections changed                                                                                                                                                                                                                                                                                                                                                                                                      | Diff shows only changes matching the Change Specification                                               |
| 7. ToC-body structure match        | Parse the Table of Contents and body headings. Verify every ToC entry has a matching body heading and the order matches. Verify every body heading appears in the ToC. Flag mismatches. **This includes headings added by this task.**                                                                                                                                                                                                                               | List each ToC entry — MATCHES BODY / MISSING IN BODY / ORDER MISMATCH / MISSING IN TOC                  |
| 8. Scope-adjacent consistency      | For every key concept in the edited sections (package names, commands, component names), grep the FULL document for other occurrences. Verify they are consistent with the edited text                                                                                                                                                                                                                                                                               | List each concept — [location outside target] — CONSISTENT / STALE / CONTRADICTED                       |
| 9. Pre-existing issue scan         | Grep the full document for: "GAP", "TODO", "FIXME", "will be added", "future task". Also grep for "Phase [A-Z]" and cross-reference against `mvp-progress.md` for stale phase references                                                                                                                                                                                                                                                                             | List each marker found — [type] at [location] — IN TARGET (should fix) / OUTSIDE TARGET (informational) |
| 10. Content format compliance      | Verify: (a) any group of 3+ definitions uses a table, not inline paragraph; (b) any new section has a ToC entry; (c) new section placement follows document flow logic (intro→concepts→procedures→reference→appendix)                                                                                                                                                                                                                                                | List each check — COMPLIANT / VIOLATION (describe)                                                      |
| 11. Cross-doc term ripple          | For every term/command/reference that was replaced in the target document (old value → new value), grep ALL files in `documentation/` for the old value. Classify each match as: non-historical (current description that should use the new value) or historical (daily log entry, task description, changelog — leave as-is). Non-historical stale references in the task's scoped files must be fixed; in out-of-scope files they are reported as follow-up items | List each old term — [file:line] — NON-HISTORICAL (fix or follow-up) / HISTORICAL (leave)               |
| 12. Intra-document consistency     | For each concept described in the edited sections (e.g. how hooks are deployed, when bootstrap runs), grep the FULL document for other sections that describe the same concept. Verify they agree. Flag contradictions where one section uses different verbs or descriptions for the same mechanism (e.g. "merged" vs "re-copied" for the same operation)                                                                                                           | List each concept — [section A says X] vs [section B says Y] — CONSISTENT / CONTRADICTED                |

Dimensions 1-7, 10, and 12 must be clean before proceeding. Dimensions 8-9 are reported but informational — pre-existing issues outside the task scope do not block completion. However, if dimension 8 reveals issues WITHIN the edited sections, those must be fixed before proceeding. Dimension 7 is now a **blocker** for all ToC mismatches introduced or left unfixed by this task — pre-existing mismatches outside the edited sections are informational only. Dimension 11 is blocking for non-historical stale references within the task's scoped files; out-of-scope non-historical references are reported as follow-up items. Dimension 12 is blocking — intra-document contradictions introduced or left unfixed by the task must be resolved.

**4-doc-d — Track first-pass quality.**

Same as code tasks: record whether each dimension was clean on first check or required a fix. Report in §5a (e.g. "12/12 first-pass clean" or "10/12 first-pass clean, fixed 2: factual claim about interface name, cross-doc stale reference"). Dimensions 8-9 and 11 (out-of-scope findings only) count toward the total even though they are informational — within-scope findings in those dimensions are still fixable and must be clean.

### 3. Implement

Work through the **Steps** section in order.

**Worktree context (applies to §3, §4, and §5).** All file operations target the worktree, not the main workspace:

- **Shell** commands: set `working_directory` to the worktree absolute path.
- **Read, Write, StrReplace**: use worktree-prefixed absolute paths (e.g. `<worktree>/shared/src/foo.ts`).
- **Grep, Glob**: set the `path` / `target_directory` to the worktree absolute path.
- When the task file says `shared/src/foo.ts`, the actual path is `<worktree>/shared/src/foo.ts`.

**Pre-write reference (rules NOT caught by ESLint).** Before writing each production file, scan this table. Every item causes a §4b failure and rework loop if missed. Internalize before your first keystroke.

| #   | Rule                | What to check                                                                                                                                        | Wrong                                          | Right                                                                 |
| --- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| 1   | Readonly arrays     | Every `T[]` has `readonly` — props, params, locals, returns, generics (e.g. `reduce<{ readonly files: readonly T[] }>`)                              | `items: string[]`                              | `readonly items: readonly string[]`                                   |
| 2   | Readonly properties | Every class and interface property                                                                                                                   | `id: string`                                   | `readonly id: string`                                                 |
| 3   | No mutating methods | No `.push()` `.splice()` `.sort()` `.reverse()` — use spread, reduce, `.toSorted()`, `.toReversed()`. Tests exempt                                   | `arr.push(x)`                                  | `[...arr, x]`                                                         |
| 4   | Branded types       | Factory functions for all domain values — never raw `string`/`number` for paths, tokens, scores, IDs                                                 | `path: string`                                 | `path: RelativePath`                                                  |
| 5   | Comment style       | Only `//` — ESLint catches `/* */` but NOT `/** */`                                                                                                  | `/** comment */`                               | `// comment`                                                          |
| 6   | No `let`            | `const` exclusively — reduce, ternary, helpers for accumulators. Only boolean flags in imperative closures exempt. Tests exempt                      | `let acc = []`                                 | `reduce(...)` or `const x = cond ? a : b`                             |
| 7   | Typed exports       | Explicit type annotation on exported const objects                                                                                                   | `export const x = {`                           | `export const x: Type = {`                                            |
| 8   | Return types        | Explicit return type on every exported function and method                                                                                           | `transform(c)`                                 | `transform(c): string`                                                |
| 9   | Signature match     | Params, types, return types EXACTLY match the interface — including `readonly` modifiers                                                             | Mismatched param type or missing `readonly`    | Exact match with interface file                                       |
| 10  | Immutable returns   | Never mutate inputs — always return new objects                                                                                                      | `input.x = y; return input`                    | `return { ...input, x: y }`                                           |
| 11  | Code clones         | Import existing shared utilities — never duplicate logic from sibling files                                                                          | Copy-paste from sibling                        | `import { fn } from "./shared.js"`                                    |
| 12  | SQL determinism     | No `date('now')` or `datetime('now')` in SQL — bind time from Clock                                                                                  | `date('now')`                                  | `? (bound from Clock)`                                                |
| 13  | DB normalization    | Schema at 3NF minimum — no multi-value columns (1NF), no partial key deps (2NF), no transitive deps (3NF), lookup tables for repeated string domains | `status TEXT` with repeated values across rows | FK to a reference table, or justified exception in Architecture Notes |

**Recipe-specific pitfalls** (check the ones matching your task's layer):

- **Pipeline transformers:** `readonly` on `fileExtensions` array AND internal lookup tables (e.g. `BLOCK_REPLACEMENTS`-style arrays). Readonly tuple types in `reduce` generic params. Format-specific transformers need at least one `safety_*` test per listed extension.
- **Storage:** No `date('now')` in SQL — always bind from Clock. Use branded type factories in tests (`toUUIDv7(...)`, `toISOTimestamp(...)`). Test zero-denominator edge cases for computed SQL columns. **Normalization:** every CREATE TABLE must be at 3NF minimum — no comma-separated or JSON-array TEXT columns for queryable data (use junction tables), no partial dependencies on composite keys (split tables), no transitive dependencies between non-key columns (extract to lookup tables). Repeated string-domain columns (statuses, categories, types) should reference a lookup table unless the domain has 2–3 values and the task's Architecture Notes justifies inline storage.
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

| Dimension                            | Tool check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Evidence required                                                                                                                                                                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Signature match                   | For interface components: re-read the interface file and implementation file side by side. Additionally, extract every `.methodName(` call from the implementation file and Grep the interface file for each method name — 0 matches = MISMATCH (catches training-data contamination where you call a method that exists on the underlying library but not on the project's interface wrapper). For composition roots: re-read the Wiring Specification and implementation — verify every `new ClassName(...)` call, every exported function signature, and every library import/call. `pnpm typecheck` is the primary safety net for method-level errors, but this mechanical extraction catches issues in untyped contexts (test casts, SQL column names, prose instructions)                                                                                                                                                                      | Interface components: list each method with param names, types, return types — MATCH or MISMATCH. List each extracted method call with Grep match count. Composition roots: list each constructor call and library API call — MATCH or MISMATCH |
| 2. Readonly / mutability             | Grep for `\.push\(`, `\.splice\(`, `\.sort\(`, `\.reverse\(` in new/modified production files (exclude `__tests__/` and `*.test.ts`). Grep for array types missing `readonly` (pattern: `: [A-Z]\w+\[\]` without preceding `readonly`) in new production files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Paste Grep output ("0 matches" = pass)                                                                                                                                                                                                          |
| 3. Branded types                     | Grep for factory function usage (`toTokenCount`, `toRelativePath`, etc.) in implementation AND test files. Grep for suspicious raw literals in type positions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Paste evidence of factory function usage or raw values found                                                                                                                                                                                    |
| 4. Comment style                     | Grep for `/\*\*` and `/\*[^/]` in new files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Paste Grep output ("0 matches" = pass)                                                                                                                                                                                                          |
| 5. DI & immutability                 | For interface components: re-read constructor — list each param and whether it's an interface or concrete class. For composition roots: verify that only the composition root file uses `new` for infrastructure classes — no `new` leaking into helpers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Interface components: list each constructor param with its type. Composition roots: list each `new` call and confirm it's in the composition root file                                                                                          |
| 6. Tests complete                    | Re-read test file — list every `it(` or `test(` name. Cross-check against Tests table in task file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Two-column list: Tests table row → matching test name (or MISSING)                                                                                                                                                                              |
| 7. Config changes                    | Re-read `shared/package.json` and `eslint.config.mjs` if task required changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | State each required change and whether it's present                                                                                                                                                                                             |
| 8. Lint + typecheck + tests + knip   | Reference the §4a output                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | "Passed in §4a with 0 errors, 0 warnings, no new knip findings" or paste output                                                                                                                                                                 |
| 9. ESLint gaps                       | Grep for untyped exported objects (`export const \w+ = {` without type annotation). Grep for `else if` chains (3+ branches) in new files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Paste Grep output ("0 matches" = pass)                                                                                                                                                                                                          |
| 10. Layer boundaries                 | Grep for banned import patterns in new files (e.g. `from ['"](?!#)\.\.` for cross-layer relative imports, specific banned packages)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Paste Grep output ("0 matches" = pass)                                                                                                                                                                                                          |
| 11. No `let` in production           | Grep for `^\s*let ` in new/modified production files (exclude `__tests__/` and `*.test.ts`). Only boolean control flags in imperative closures are acceptable — accumulators via `let` reassignment are NOT acceptable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Paste Grep output ("0 matches" = pass, or list each as justified boolean control flag)                                                                                                                                                          |
| 12. Zero code clones                 | Reference the `pnpm lint:clones` output from §4a. If clones are found, extract shared utilities (see `shared/src/pipeline/glob-match.ts`, `pattern-scanner.ts`) — never duplicate logic across files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | "0 clones found" from §4a output, or list each clone found and how it was eliminated                                                                                                                                                            |
| 13. SQL determinism                  | Grep for `date\('now'\)` and `datetime\('now'\)` in new/modified storage files. Any match = fail — pass the current time as a bound parameter from `Clock`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Paste Grep output ("0 matches" = pass)                                                                                                                                                                                                          |
| 14. Orphan test files                | Glob for `*.test.ts` files NOT under `__tests__/` directories in `shared/src/`, `mcp/src/`. Any match = potential orphan (vitest only runs `**/__tests__/**/*.test.ts`). Verify each is either (a) in the vitest include pattern, or (b) should be moved/deleted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | List each orphan found and resolution, or "0 orphans found"                                                                                                                                                                                     |
| 15. Conditional dependency loading   | For composition roots and bootstrap functions only: Grep new/modified files for `new ` and `.create(` calls. For each, determine if the dependency is always needed or only when certain project characteristics hold (specific file extensions, config flags, WASM grammars). If conditional but eagerly instantiated inside a bootstrap/factory function instead of injected as a parameter and conditionally created in `main()` = fail. If no composition root or bootstrap files were created/modified, this check passes automatically                                                                                                                                                                                                                                                                                                                                                                                                         | List each `new`/`.create()` call with "always needed" or "conditional — injected via [param]", or "N/A — no composition root files modified"                                                                                                    |
| 16. Transformer benchmark delta      | For tasks that add or modify a `ContentTransformer` and wire it in `create-pipeline-deps.ts`: run `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts` and note the actual `tokensCompiled` from the test output. The test auto-ratchets `baseline.json` when tokens decrease — no manual editing needed. Check the test stdout for "baseline ratcheted" (tokens improved) or unchanged delta. If the baseline was ratcheted, the updated `baseline.json` will appear in the git diff — commit it with the task. Also run `pnpm test shared/src/integration/__tests__/selection-quality-benchmark.test.ts` to verify file selection is unaffected. If no transformer was added or modified, this check passes automatically                                                                                                                                                                                                | "Benchmark: baseline N tokens → actual M tokens (delta: -X%). Baseline auto-ratcheted / unchanged." and "Selection quality: PASS (paths unchanged)"                                                                                             |
| 17. Transformer file-type safety     | For tasks that add a `ContentTransformer`: Grep the test file for test names matching `safety_` pattern. Verify that for non-format-specific transformers, at least one safety test exists per sensitive file type (Python indentation, YAML structure, JSX syntax). For format-specific transformers, at least one safety test per listed extension. If no transformer was added, this check passes automatically                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | List each `safety_*` test found, or "N/A — no transformer added"                                                                                                                                                                                |
| 18. Database normalization           | For tasks that create or modify a migration: re-read the migration file and check each CREATE TABLE / ALTER TABLE for normalization violations. **(a) 1NF:** Grep for TEXT columns storing comma-separated or multi-value data — any multi-value column without a junction table = fail. **(b) 2NF:** If composite PK exists, verify all non-key columns depend on the full key — partial dependency = fail. **(c) 3NF:** Check for non-key columns that determine other non-key columns (e.g. `status_code` + `status_text`) — transitive dependency without a lookup table = fail unless the task's Architecture Notes documents a justified exception. **(d) Lookup tables:** Flag TEXT columns with bounded repeated-value domains that lack a reference table (warn). **(e) Redundant columns:** Check for derivable values stored as columns — fail unless justified. If no migration was created or modified, this check passes automatically | For each table: "[table] — 1NF: PASS, 2NF: PASS, 3NF: PASS/VIOLATION ([detail]), Lookups: [list or none], Redundant: [list or none]", or "N/A — no migration files created or modified"                                                         |
| 19. Stale markers in modified files  | Grep all new/modified production files for `TODO`, `FIXME`, `HACK` comments. Also grep for phase references (`Phase [A-Z]`) and cross-reference against `mvp-progress.md` to check if the referenced phase is complete while the comment uses future tense. Report each as: `[marker] at [file:line] — ACTIONABLE (phase done) / INFORMATIONAL (future work)`. This check is informational — it does not block completion but is reported in §5a. If an actionable marker is in code the executor just wrote, fix it (the executor should not introduce stale markers). Pre-existing actionable markers in modified files are reported as follow-up items                                                                                                                                                                                                                                                                                            | List each marker found with actionable/informational classification, or "0 stale markers found"                                                                                                                                                 |
| 20. Scope-adjacent string references | For every function, type, interface, or constant that was renamed or had its behavior changed: grep the full codebase for string-literal occurrences of the old name. Check: dispatch table keys, error messages, log statements, test descriptions (`it("...")`), and comments. Any string reference that still uses the old name or describes the old behavior = stale. This check is informational for pre-existing references but blocking if the executor's own changes introduced a rename without updating string references                                                                                                                                                                                                                                                                                                                                                                                                                  | List each string reference found — [file:line] — STALE / CURRENT, or "N/A — no renames or behavior changes in this task"                                                                                                                        |

**4c — Confirm clean and track first-pass quality.**

After §4b, every dimension must be clean (all violations fixed, all re-checks passing). If a dimension reveals an architectural issue that cannot be fixed mechanically (e.g. signature mismatch, wrong layer boundary, missing DI), go to **Blocked diagnostic** — these indicate a task-file or design problem, not a code-style issue.

Track first-pass quality: for each dimension, record whether it was clean on first check or required a fix. This is informational — it helps calibrate the pre-write reference table and per-file quick checks over time but does not gate progress. Report the count in §5a (e.g. "20/20 first-pass clean" or "18/20 first-pass clean, fixed 2: readonly array in X, block comment in Y"). Dimensions 16–20 are conditional or informational — exclude conditional dimensions from the denominator when they don't apply (no transformer added, no migration created). Dimensions 19–20 are informational and always count in the denominator but do not block progress for pre-existing issues. If the per-file quick check (§3) already caught and fixed a violation during implementation, that dimension still counts as first-pass clean — the quick check is part of the first pass.

Once all dimensions are confirmed clean, proceed to §5.

### 5. Finalize

When all dimensions are confirmed clean, complete these three sub-steps in order.

**5a — Report to the user:**

- What was implemented (files created/modified)
- Test results (pass count, confirming no regressions) — for code tasks. For documentation tasks: subagent verification results instead.
- **First-pass quality: N/M** (from §4c or §4-doc-d, where M = applicable dimensions) — list any dimensions that needed fixing and what was fixed
- **Benchmark impact** (transformer tasks only): "Token reduction: baseline X → actual Y (delta: -Z%). Baseline auto-ratcheted / unchanged." Include this only when dimension 16 applied
- **Verification subagent results** (documentation tasks only): writing quality issues found/fixed, factual accuracy results, consistency results, reader simulation findings (if spawned)
- **Pre-existing issues detected** (documentation tasks only, informational): list any GAP/TODO/FIXME markers, stale phase references, or other pre-existing problems found by dimension 9 that are outside the task scope. These inform the user of follow-up work but do not indicate a problem with the current task.
- **Scope-adjacent consistency** (documentation tasks only): list any concepts from the edited sections that appear elsewhere in the document with stale or contradicted values (dimension 8 findings)
- **Cross-documentation term ripple** (documentation tasks only): list any stale old terms found in other documentation files (dimension 11 findings). Non-historical references in out-of-scope files are follow-up items for the user.
- **Intra-document consistency** (documentation tasks only): list any contradictions between sections of the same document that describe the same mechanism differently (dimension 12 findings)
- **Parallel section notes** (documentation tasks only): if the writing quality subagent flagged asymmetry with a sibling section, summarize what differs and recommend whether a follow-up task should align them
- Review findings and fixes applied (if any)
- Any concerns or follow-up items

**5b — Update progress.**

Use the `aic-update-mvp-progress` skill to update `documentation/mvp-progress.md`.

**Critical:** Use today's actual date for the daily log entry. If today's entry already exists, append to it. If it is a new day, create a new entry at the top of the Daily Log section (reverse chronological). Do not put today's work under yesterday's date.

**5c — Archive task, update status, commit, and show diff.**

Run these sequentially in one flow — no user gate between them:

1. **Archive the task file on the main workspace filesystem.** Task files are gitignored — this is a filesystem-only operation, not a git operation. Run from the **main workspace root** (not the worktree):
   ```
   mkdir -p documentation/tasks/done && mv documentation/tasks/NNN-name.md documentation/tasks/done/
   ```
   **Clean up research document:** If the archived task had a `> **Research:**` line, delete the referenced research file from the main workspace (e.g. `rm documentation/research/YYYY-MM-DD-title.md`). Research documents are consumed artifacts — once the task is done, the research is captured in the code and commit history.
2. **Edit the status at the NEW path** on the main workspace (`documentation/tasks/done/NNN-name.md`): change `> **Status:** In Progress` to `> **Status:** Done`. Do NOT edit the old path — the file no longer exists there.
3. **Verify the move** on the main workspace — confirm the old path is gone and the new path has the correct status:
   ```
   test ! -f documentation/tasks/NNN-name.md && head -3 documentation/tasks/done/NNN-name.md
   ```
   If the old file still exists, delete it: `rm documentation/tasks/NNN-name.md`.
4. **Worktree guard — verify the worktree HEAD before staging.**

   ```
   git rev-parse --abbrev-ref HEAD
   ```

   Run with `working_directory` set to the worktree. If the output does NOT match the stored branch name, go to **Blocked diagnostic**. **Never commit to main** — the worktree isolates all work until the user approves the merge in §6.

5. **Stage only touched files and commit in the worktree.**

   Use the touched-files list built in §2 — never `git add -A`. Stage each file explicitly:

   ```
   git add path/to/file1.ts path/to/file2.ts ... && git commit -m "feat(<scope>): <what was built>"
   ```

   Do NOT stage any `documentation/tasks/` paths — they are gitignored and not part of the commit.

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
   e. Run `git diff main...HEAD --stat` to produce the final file list for the merge proposal. Verify that `git rev-parse --abbrev-ref HEAD` still shows the stored branch name.

### 6. Merge and Clean Up

This step merges the feature branch into main and removes the worktree. All commands in §6 run from the **main workspace root** (not the worktree).

**6a — Propose merge:**

Present:

- The branch name (stored from §1)
- The worktree path (stored from §1)
- The list of files changed (from the `--stat` output in 5c)
- The commit message used
- Ask: **"Merge to main? (yes / adjust message / discard)"**

**Do NOT merge automatically.** Wait for the user's response.

**6b — On approval, merge and clean up:**

The main workspace is already on `main` — no checkout needed.

**Step 0 — Handle dirty working tree on main (data-safe stash).**

The user may have uncommitted changes on main (from other work, the planner, or editor activity). These must be preserved — never discarded.

```
git status --porcelain
```

If the output is non-empty (dirty working tree), stash the changes before merging:

```
git stash
```

**Store a flag** (`stashedBeforeMerge = true`) so you remember to restore them after the merge. If the working tree is clean, set `stashedBeforeMerge = false` and proceed directly to the merge.

**Step 1 — Squash merge.**

```
git merge --squash <branch>
```

**If the merge succeeds without conflicts:**

```
git commit -m "feat(<scope>): <what was built>"
```

The squash merge produces a single clean commit on main. Use the same commit message from 5c (or the user's adjusted version).

**If the merge has conflicts** (common when multiple executors modify `mvp-progress.md`):

1. List conflicted files: `git diff --name-only --diff-filter=U`
2. For each conflicted file, read it, resolve the conflict markers — prefer the feature branch changes and integrate main's additions where they don't overlap (e.g. new entries appended by another executor in `mvp-progress.md`).
3. Stage resolved files: `git add <resolved files>`
4. Verify no conflict markers remain: Grep for `<<<<<<<` in the resolved files (expect 0 matches).
5. Complete the commit: `git commit -m "feat(<scope>): <what was built>"`

If conflicts cannot be resolved automatically (semantic conflicts in code logic), show the user the conflicted files and conflict markers. Ask for guidance before committing.

**Step 2 — Remove worktree and branch.**

```
rm -rf <worktree-dir>
git worktree prune
git branch -D <branch>
```

Note: `git worktree remove` may not be available on all git versions. The `rm -rf` + `git worktree prune` sequence is universally safe and equivalent.

**Step 3 — Restore stashed changes (if stashedBeforeMerge).**

Skip this step if `stashedBeforeMerge = false`.

Lint-staged runs during the commit hook and may hold `index.lock` briefly. Remove it if stale before restoring:

```
rm -f .git/index.lock
```

Then restore the stashed changes:

```
git stash pop
```

Three possible outcomes:

a. **Clean pop (exit 0, no conflicts):** Done. The user's changes are back exactly as they were. The stash is auto-dropped.

b. **Pop with conflicts:** The stash was applied but not dropped (git keeps it as insurance). Resolve the conflicts:

1.  Run `git diff --name-only --diff-filter=U` to list conflicted files.
2.  For each file, read it, resolve the conflict markers. For additive files like `mvp-progress.md`, keep both the merged task changes and the stashed user changes.
3.  Stage resolved files: `git add <resolved files>`.
4.  Verify no conflict markers remain: Grep for `<<<<<<<` (expect 0 matches).
5.  Do NOT commit — the resolved files stay staged/unstaged in the working tree, matching the user's original pre-stash state (uncommitted changes).
6.  Drop the stash now that it's safely applied: `git stash drop`.

c. **Pop fails entirely (rare):** Do NOT drop the stash. Report to the user: "Your pre-merge changes are preserved in `git stash list` (stash@{0}). Run `git stash pop` manually when ready." The stash is the safety net — it is never dropped until changes are confirmed restored.

**6c — If the user says "discard":**

```
git worktree remove <worktree-dir>
git branch -D <branch>
```

Report that the worktree and branch were deleted and no changes were merged.

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
2. Append a `## Blocked` section to the task file (main workspace copy) with:
   - What you tried (specific code or command)
   - What went wrong (exact error message)
   - Whether the issue is in your code or the task file's spec
   - What decision you need from the user
3. Commit the partial work in the worktree so nothing is lost — stage only files from the touched-files list (run with `working_directory` set to the worktree):
   ```
   git add <touched files> && git commit -m "wip(task-NNN): blocked — <short reason>"
   ```
4. Change the task file status to `Blocked` (in the **main workspace** copy — task files are gitignored and not in worktrees).
5. Report to the user: include the worktree path and branch name so they know where the partial work lives. The user can resume later by re-entering the worktree, or discard it with `git worktree remove <worktree-dir> && git branch -D <branch>`.
6. **Wait for guidance**. Do not continue.

---

## Conventions

- Never skip a step — execute them in order
- Never add files or features not listed in the task
- Never modify the task file content (Steps, Signatures, etc.) — only update the Status field
- If something in the task file seems wrong, ask the user rather than silently fixing it
- All verification must pass before reporting success
- Evidence over claims — always read and report actual command output
- All work happens in a git worktree under `.git-worktrees/` — never commit directly to main. The main workspace stays on `main` throughout execution
- Merge only when the user approves — present the diff and wait for confirmation
- On discard, remove the worktree and delete the branch cleanly — main stays untouched
- Multiple executors can run in parallel — each in its own worktree. The planner operates on main; executors operate in worktrees — no conflicts between concurrent tasks
