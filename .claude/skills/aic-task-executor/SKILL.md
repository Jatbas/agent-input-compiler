---
name: aic-task-executor
description: Executes planner task files with steps, mechanical verification, progress updates, and isolated worktree commits.
---

# Task Executor

## Purpose

Execute a task file produced by the `aic-task-planner` skill. Read the task, internalize its specs, implement every step, verify with Grep-based mechanical checks for scoring, iterate until clean, finalize progress, and stage for commit.

**Announce at start:** "Using the task-executor skill on `<task file path>`."

## Editors

- **Cursor:** Attach the skill with `@` or invoke via `/`. Where this skill says to spawn subagents (e.g. documentation critics in §4-doc), use the **Task tool** with the specified `subagent_type`. You MUST use the Task tool for subagent work — never do it inline.
- **Claude Code:** Invoke with `/aic-task-executor`. Where this skill references multi-agent work, spawn separate agents. Never perform critic/explorer work inline.

## When to Use

- User says "execute task", "go", "implement task NNN"
- User references a task file in `documentation/tasks/`
- Immediately after the task-planner offers execution
- User attaches this skill for ad-hoc work (no task file)

## Ad-hoc Work (No Task File)

**When this skill is attached but no task file is referenced, the full process still applies.** The worktree, verification, and merge steps are NOT optional — they exist to protect the main branch from untested changes. For ad-hoc work:

- §1: Create a worktree (use the epoch-only naming: `.git-worktrees/$EPOCH`)
- §2: Skip task internalization (no task file to read)
- §3: Implement the user's request directly in the worktree
- §4: Run the full verification pass (§4a toolchain + §4b mechanical checks on all files you created/modified)
- §5: Report results, skip progress update, commit in the worktree
- §6: Propose merge to user

**NEVER skip §4 (verification) for ad-hoc work.** The most common failure mode is implementing the change, skipping verification, and committing directly to main. This skill exists to prevent that.

## Inputs

1. The task file path (e.g. `documentation/tasks/001-phase-b-core-interfaces.md`) — or the user's ad-hoc request
2. `.cursor/rules/AIC-architect.mdc` — active architectural rules
3. Existing source in `shared/src/` — current interfaces, types, patterns

## Process

### 1. Read, validate, and internalize the task

**Pre-read all inputs in one parallel batch** to eliminate extra rounds:

- The task file (e.g. `documentation/tasks/NNN-name.md`)
- `documentation/tasks/progress/aic-progress.md` (read from **main workspace**, not worktree — this file is gitignored)
- `shared/package.json`
- `eslint.config.mjs`
- `.cursor/rules/AIC-architect.mdc`
- The research document at the path in `> **Research:**` header (if present in the task file)

**Validate** from the pre-read results:

- Status is `Pending` (do not re-execute `Done` or `Blocked` tasks)
- All dependencies listed in "Depends on" are actually `Done` in `documentation/tasks/progress/aic-progress.md` (read from main workspace)

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

**Quick doc-mode pre-check.** The task file's `Layer:` header field was in the §1 pre-read. If it says `documentation`, skip directly to §2b now — the code-specific internalization below does not apply.

**Task quality gate — scan for ambiguity before absorbing design decisions:**

Before internalizing any section, scan every non-code instruction sentence in the Steps section, Verify lines, and test descriptions. Flag any sentence containing patterns from these categories:

- **Hedging:** "if needed", "if necessary", "as needed", "may be", "may want", "might", "you could", "could also", "should work", "probably", "likely", "possibly", "potentially", "perhaps", "try to", "ideally", "preferably", "feel free to"
- **Examples-as-instructions:** "e.g.", "for example", "for instance", "such as", "something like", "along the lines of", "similar to", "or similar", "or equivalent", "or comparable", "some kind of", "some sort of"
- **Delegation:** "decide whether", "choose between", "depending on", "up to you", "alternatively", "or alternatively", "whichever", "whatever works", "or optionally", "optionally"
- **Vague qualifiers:** "appropriate" (unspecified), "suitable", "reasonable", "etc.", "and so on"
- **State hedges:** "if not present", "if not already", "if it doesn't exist", "add if not present"
- **Escape clauses:** "or skip", "or ignore", "or leave for later", "if possible", "where possible", "mock or skip"
- **False alternatives:** " or " presenting two implementation choices, "or use", "or another"
- **Parenthesized hedges:** any `(...)` containing the above patterns

If you find any match: **stop and tell the user** that the task file contains unresolved decisions. List each ambiguous sentence and what decision it requires. Do not guess — the planner must resolve it. This prevents absorbing and acting on an ambiguous design.

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

**Build the touched-files list.** Extract every file path from the task's **Files table** (both "Create" and "Modify" rows).

Note: `documentation/tasks/` is gitignored and never committed. This includes `documentation/tasks/progress/aic-progress.md` (updated in §5b) and task files themselves. The progress update, task status change, and move to `done/` all happen on the **main workspace** filesystem only — they are NOT part of the commit allowlist and must NOT be staged.

If any step mentions auto-ratcheting benchmark files (e.g. `test/benchmarks/baseline.json`), add those too. If Config Changes lists modifications to `shared/package.json` or `eslint.config.mjs`, add those.

**This is your commit allowlist.** Only these files may be staged in §5c. Keep this list in mind throughout implementation — if you create or modify a file not on this list, either add it (with justification) or revert it before committing.

### 2.5. Verify external assumptions

After internalizing the task but before writing code, scan the task's Steps section and Architecture Notes for claims about external system behavior — anything describing what an external system sends, how files are deployed, what runtime state looks like, or what an API returns. For each such claim, verify it against actual evidence before proceeding.

Read `../shared/SKILL-investigation.md` and apply the **Runtime Evidence Checklist** to each claim (database state, deployed files, bootstrap/lifecycle, cache/file system, documentation cross-check, external system behavior, library API shapes). When the claim involves AIC codebase behavior, also apply the **Codebase Investigation Depth** requirements from the same file.

If any assumption cannot be verified (no evidence exists, or the evidence contradicts the claim), **stop and report to the user** before implementing. Include: (1) the exact claim from the task file, (2) what you checked, (3) what you found. This catches tasks that are technically correct but based on stale or wrong assumptions about runtime state — the most common cause of "the fix didn't work" after execution.

### 2b. Documentation and mixed-mode detection

**Classify the task into one of three execution modes** by examining the Files table:

**Pure documentation task** — all files in the Files table are `.md` files in `documentation/`, AND the task has a Change Specification section instead of Interface/Signature, AND the Layer field is absent or says "documentation":

- Execute §3-doc (documentation implementation) and §4-doc (documentation verification).
- Skip §3 (code implementation) and §4a-§4b (code verification).

**Mixed task** — the Files table contains BOTH code files (`.ts`, `.js`, `.cjs`, `.mjs`, config files) AND `.md` files in `documentation/`:

- Execute §3 (code implementation) for all code steps first.
- Then execute §3-mixed (documentation implementation within a code task) for documentation steps.
- Then execute §4a-§4b (code verification) for code files.
- Then execute §4-mixed (documentation verification within a code task) for doc files.
- The task file's documentation steps have Change Specifications produced by the planner (via the documentation-writer pipeline for SECTION EDIT changes, or directly for MECHANICAL changes). The executor applies these pre-verified edits and runs a verification pass.

**Pure code task** — no `.md` files in `documentation/` appear in the Files table:

- Execute §3 (code implementation) and §4a-§4b (code verification).
- Skip §3-doc, §3-mixed, §4-doc, §4-mixed.

**Detection heuristic:** Scan the Files table for any row where the path matches `documentation/*.md` or `documentation/**/*.md`. If at least one match exists AND at least one non-`.md` file also exists, classify as mixed. If all files match, classify as pure documentation. If none match, classify as pure code.

### 3-doc. Implement (documentation mode)

**This section replaces §3 for documentation tasks.** Work through the Steps section in order, applying the documentation-specific workflow. The Change Specification's target text was already verified by the documentation-writer skill's multi-agent pipeline during planning (Phase 1 explorers + Phase 2 writing + Phase 3 critics). The executor applies these pre-verified edits and then runs a SECOND adversarial review pass (4-doc-a) with fresh critics.

**Pre-write: internalize voice and context.**

Before editing any document, read in one parallel batch:

- The full target document (not just the sections being edited — you need the full voice and tone)
- The 2 most-related sibling documents (from the Cross-Reference Map in the task file)
- The Writing Standards section from the task file

Internalize: tone (formal/informal), sentence patterns, paragraph length, formatting conventions, terminology. Your edits must be indistinguishable from the surrounding text.

**Content format conventions (mandatory for all documentation edits):**

These rules are also documented in `.claude/skills/aic-documentation-writer/SKILL-standards.md` (the single source of truth for writing standards). Before writing any new content, check these formatting rules. Violations cause 4-doc-c failures:

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

**4-doc-a — Run the documentation-writer skill's Phase 3 (Adversarial Review).**

Instead of spawning subagents directly, delegate to the `aic-documentation-writer` skill's Phase 3. This provides the same verification (editorial quality, factual accuracy, cross-doc consistency, reader simulation) but from a single source of truth — the same protocol used during planning.

**How to run Phase 3:**

1. Read `.claude/skills/aic-documentation-writer/SKILL.md` (Phase 3 sections 3a through 3f).
2. Read `.claude/skills/aic-documentation-writer/SKILL-dimensions.md` (critic prompt templates).
3. Spawn 3-4 critics in parallel using the templates. Each critic receives: the path to the edited document, the paths to sibling documents, and the Change Specification from the task file.
   - **Critic 1 — Editorial quality** (`generalPurpose`): voice/tone match, sentence variety, paragraph cohesion, detail consistency, heading hierarchy, audience awareness, parallel section symmetry.
   - **Critic 2 — Factual re-verification** (`explore`, `fast`): independently re-verifies every technical claim in the edited sections against the codebase. This is a SECOND independent factual check — the first was during planning.
   - **Critic 3 — Cross-document consistency** (`explore`, `fast`): checks all key terms against sibling documents and mirror documents.
   - **Critic 4 — Reader simulation** (`generalPurpose`, conditional): spawn ONLY for user-facing documents (installation guides, getting started docs, user-facing READMEs). Skip for developer references.
4. Evaluate critic outputs per `SKILL.md` section 3d. Run double-blind factual reconciliation (3e) if the planner's Explorer 1 findings are available from the task's exploration report. Apply backward feedback loop (3f) if issues require target text revision.

**Why this is stronger than the previous approach:** The documentation-writer's Phase 3 includes anti-agreement enforcement (3c), double-blind factual reconciliation (3e), and a backward feedback loop (3f) — mechanisms that the previous inline subagent prompts lacked. The critic prompt templates in `SKILL-dimensions.md` are also more detailed and structured than the previous inline prompts.

**4-doc-b — Process critic results.**

Follow the documentation-writer skill's processing flow (SKILL.md section 3d). Read all critic outputs (3 or 4 depending on whether reader simulation was spawned). For each reported issue:

- **Editorial issues (Critic 1):** Fix them. Re-read the context around each fix to ensure the fix itself does not introduce new problems.
- **Factual issues — NOT FOUND or CONTRADICTED (Critic 2):** Investigate by reading the source file. Fix the document to match the codebase. If the codebase is wrong and the document is right, do NOT change the document — add this to the Blocked section instead.
- **Consistency divergences (Critic 3):** Fix the edited document to align with the authoritative source. If the sibling document is wrong, note this as a follow-up item (do not edit sibling documents outside the task scope).
- **Reader simulation findings (Critic 4, if spawned):** For each finding: if it is in the edited section, fix it (add a definition, clarify a prerequisite, simplify jargon). If it is in surrounding context outside the task scope, note as a follow-up item.
- **Anti-agreement check (SKILL.md section 3c):** If any critic reported zero issues on a substantial document, re-spawn with the strengthened adversarial mandate from `SKILL-dimensions.md`.
- **Double-blind factual reconciliation (SKILL.md section 3e):** If the task's exploration report contains Explorer 1 findings, compare them against Critic 2's findings. Resolve any discrepancies per section 3e.

**4-doc-c — Run mechanical verification.**

After fixing all critic-reported issues, run the mechanical checks:

| Dimension                          | Tool check                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Evidence                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1. Change specification compliance | Re-read the task's Change Specification. Re-read the edited document. Every specified change is present.                                                                                                                                                                                                                                                                                                                                                             | List each change — APPLIED or MISSING                                                                   |
| 2. Factual accuracy                | Re-run: grep codebase for every technical claim in edited sections                                                                                                                                                                                                                                                                                                                                                                                                   | List each claim — VERIFIED / NOT FOUND / CONTRADICTED                                                   |
| 3. Cross-document consistency      | Re-run: grep sibling docs for key terms in edited sections                                                                                                                                                                                                                                                                                                                                                                                                           | List each term — CONSISTENT or DIVERGENT                                                                |
| 4. Link validity                   | For every markdown link `[text](path)` in the document, Glob for the target                                                                                                                                                                                                                                                                                                                                                                                          | List each link — VALID or BROKEN                                                                        |
| 5. Writing quality                 | Critic 1 output — all issues resolved                                                                                                                                                                                                                                                                                                                                                                                                                                | List each issue — FIXED or ACCEPTED (with reason)                                                       |
| 6. No regressions                  | `git diff` the document — verify only intended sections changed                                                                                                                                                                                                                                                                                                                                                                                                      | Diff shows only changes matching the Change Specification                                               |
| 7. ToC-body structure match        | Parse the Table of Contents and body headings. Verify every ToC entry has a matching body heading and the order matches. Verify every body heading appears in the ToC. Flag mismatches. **This includes headings added by this task.**                                                                                                                                                                                                                               | List each ToC entry — MATCHES BODY / MISSING IN BODY / ORDER MISMATCH / MISSING IN TOC                  |
| 8. Scope-adjacent consistency      | For every key concept in the edited sections (package names, commands, component names), grep the FULL document for other occurrences. Verify they are consistent with the edited text                                                                                                                                                                                                                                                                               | List each concept — [location outside target] — CONSISTENT / STALE / CONTRADICTED                       |
| 9. Pre-existing issue scan         | Grep the full document for: "GAP", "TODO", "FIXME", "will be added", "future task". Also grep for "Phase [A-Z]" and cross-reference against `documentation/tasks/progress/aic-progress.md` (main workspace) for stale phase references                                                                                                                                                                                                                               | List each marker found — [type] at [location] — IN TARGET (should fix) / OUTSIDE TARGET (informational) |
| 10. Content format compliance      | Verify: (a) any group of 3+ definitions uses a table, not inline paragraph; (b) any new section has a ToC entry; (c) new section placement follows document flow logic (intro→concepts→procedures→reference→appendix)                                                                                                                                                                                                                                                | List each check — COMPLIANT / VIOLATION (describe)                                                      |
| 11. Cross-doc term ripple          | For every term/command/reference that was replaced in the target document (old value → new value), grep ALL files in `documentation/` for the old value. Classify each match as: non-historical (current description that should use the new value) or historical (daily log entry, task description, changelog — leave as-is). Non-historical stale references in the task's scoped files must be fixed; in out-of-scope files they are reported as follow-up items | List each old term — [file:line] — NON-HISTORICAL (fix or follow-up) / HISTORICAL (leave)               |
| 12. Intra-document consistency     | For each concept described in the edited sections (e.g. how hooks are deployed, when bootstrap runs), grep the FULL document for other sections that describe the same concept. Verify they agree. Flag contradictions where one section uses different verbs or descriptions for the same mechanism (e.g. "merged" vs "re-copied" for the same operation)                                                                                                           | List each concept — [section A says X] vs [section B says Y] — CONSISTENT / CONTRADICTED                |

Dimensions 1-7, 10, and 12 must be clean before proceeding. Dimensions 8-9 are reported but informational — pre-existing issues outside the task scope do not block completion. However, if dimension 8 reveals issues WITHIN the edited sections, those must be fixed before proceeding. Dimension 7 is now a **blocker** for all ToC mismatches introduced or left unfixed by this task — pre-existing mismatches outside the edited sections are informational only. Dimension 11 is blocking for non-historical stale references within the task's scoped files; out-of-scope non-historical references are reported as follow-up items. Dimension 12 is blocking — intra-document contradictions introduced or left unfixed by the task must be resolved.

**4-doc-d — Track first-pass quality.**

Same as code tasks: record whether each dimension was clean on first check or required a fix. Report in §5a (e.g. "12/12 first-pass clean" or "10/12 first-pass clean, fixed 2: factual claim about interface name, cross-doc stale reference"). Dimensions 8-9 and 11 (out-of-scope findings only) count toward the total even though they are informational — within-scope findings in those dimensions are still fixable and must be clean.

### 3-mixed. Implement documentation changes (mixed-mode tasks)

**This section runs AFTER §3 (code implementation) for mixed tasks only.** It applies the documentation steps from the task file using the same workflow as §3-doc, but scoped to the documentation files within a primarily code task.

**Pre-write: internalize voice and context.**

Before editing any documentation file, read in one parallel batch:

- The full target document (not just the sections being edited — you need the full voice and tone)
- The 2 most-related sibling documents in `documentation/` (identified from the task's documentation steps or by proximity — e.g., if editing `architecture.md`, read `project-plan.md` and `implementation-spec.md`)
- The Change Specification for this documentation step from the task file

Internalize: tone, sentence patterns, paragraph length, formatting conventions, terminology. Your edits must be indistinguishable from the surrounding text.

**Content format conventions:** The same content format rules from §3-doc apply. Violations cause §4-mixed failures:

- Definitions / glossaries: 3+ terms use a table. 1-2 terms may be inline.
- Comparisons: 2+ items across multiple dimensions use a table.
- Step-by-step procedures: numbered lists, not prose.
- New sections: must be added to the Table of Contents if one exists.
- Line-break preservation: match the source document's structure.

**For each documentation step in the Steps section:**

1. **Read the Change Specification.** Note: current text (to locate the edit point), rationale (to understand why), and target text (what to write).
2. **Apply the change.** Use targeted edits (StrReplace) to replace the current text with the target text.
3. **Per-edit quick check.** After each edit, re-read the edited section plus 5 lines before and 5 lines after. Verify:
   - The target text was applied correctly (no truncation, no duplication)
   - The transition from surrounding text to new text is smooth
   - No formatting inconsistencies introduced
   - If a new heading was added, it appears in the Table of Contents (if one exists)

After all documentation steps are complete, proceed to §4 (code verification) first, then §4-mixed (documentation verification).

### 4-mixed. Verify documentation changes (mixed-mode tasks)

**This section runs AFTER §4a-§4b (code verification) for mixed tasks only.** It verifies the documentation files modified during §3-mixed using the documentation-writer skill's quality pipeline — the same pipeline used for pure documentation tasks.

**4-mixed-a — Run the documentation-writer skill's Phase 3 (Adversarial Review).**

Delegate to the `aic-documentation-writer` skill's Phase 3. This provides editorial quality, factual accuracy, cross-doc consistency, and reader simulation verification via independent critics.

**How to run Phase 3:**

1. Read `.claude/skills/aic-documentation-writer/SKILL.md` (Phase 3 sections 3a through 3f).
2. Read `.claude/skills/aic-documentation-writer/SKILL-dimensions.md` (critic prompt templates).
3. Spawn 3-4 critics in parallel using the templates. Each critic receives: the path to the edited document, the paths to sibling documents, and the Change Specification from the task file.
   - **Critic 1 — Editorial quality** (`generalPurpose`): voice/tone match, sentence variety, paragraph cohesion, detail consistency, heading hierarchy, audience awareness.
   - **Critic 2 — Factual re-verification** (`explore`, `fast`): independently re-verifies every technical claim in the edited sections against the codebase.
   - **Critic 3 — Cross-document consistency** (`explore`, `fast`): checks all key terms against sibling documents.
   - **Critic 4 — Reader simulation** (`generalPurpose`, conditional): spawn ONLY for user-facing documents (installation guides, getting started docs, user-facing READMEs). Skip for developer references (architecture, implementation-spec, project-plan).
4. Evaluate critic outputs per `SKILL.md` section 3d. Apply backward feedback loop (3f) if issues require target text revision.

**Scaling by change complexity:** For MECHANICAL changes (name/path replacements only), run Critic 2 (factual spot-check) only — skip Critics 1, 3, 4. For SECTION EDIT changes, run the full critic set (3-4 critics). The change complexity classification is in the task file's documentation steps (from the planner's DOCUMENTATION IMPACT analysis).

**4-mixed-b — Process critic results.**

Follow the documentation-writer skill's processing flow (SKILL.md section 3d):

- **Editorial issues (Critic 1):** Fix them. Re-read context around each fix.
- **Factual issues — NOT FOUND or CONTRADICTED (Critic 2):** Investigate by reading the source file. Fix the document to match the codebase. If the codebase is wrong and the document is right, do NOT change the document — add to Blocked.
- **Consistency divergences (Critic 3):** Fix the edited document to align with the authoritative source. Note sibling fixes as follow-up items.
- **Reader simulation findings (Critic 4, if spawned):** Fix issues in the edited sections. Note surrounding context issues as follow-up items.

**4-mixed-c — Run mechanical verification on documentation files.**

Run the documentation-specific mechanical checks on each modified `.md` file. Use the same dimensions as §4-doc-c, but only for the documentation files in the task (not the entire document in depth — focus on the edited sections and their immediate context):

| Dimension                      | Method                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------- |
| 1. Change spec compliance      | Re-read the Change Specification vs actual document                              |
| 2. Factual accuracy            | Grep codebase for every technical claim in edited sections                       |
| 3. Cross-doc consistency       | Grep sibling docs for key terms in edited sections                               |
| 4. Link validity               | Glob for every markdown link target in the edited document                       |
| 5. Writing quality             | Critic 1 output — all issues resolved                                            |
| 6. No regressions              | git diff — only intended sections changed                                        |
| 7. ToC-body match              | Verify headings and ToC are consistent                                           |
| 10. Content format compliance  | Tables for 3+ definitions, ToC entries for new sections                          |
| 12. Intra-document consistency | Grep full document for concepts described in edited sections — no contradictions |

Dimensions 1-7, 10, and 12 must be clean. This is a subset of the full §4-doc-c table — dimensions 8, 9, and 11 are informational and are only reported in §5a, not blocking for mixed tasks where documentation is a secondary concern.

**4-mixed-d — Track first-pass quality.**

Record whether each documentation dimension was clean on first check or required a fix. Report separately from code dimensions in §5a (e.g. "Code: 20/20 first-pass clean. Docs: 9/9 first-pass clean" or "Code: 18/20. Docs: 8/9, fixed 1: factual claim about interface name").

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
5. **Circuit breaker:** If you find yourself introducing 3+ pieces of code not described in any step instruction or the Interface/Signature section to make the implementation compile or pass tests — type casts, adapter stubs, wrapper functions, or plumbing absent from every step instruction — stop. The task's approach is likely wrong. Go to **Blocked diagnostic** — list each piece of unlisted code you added and report that the approach needs re-evaluation.

**Per-file quick check (after writing each production file).** Before moving to the next step, run these 4 Grep commands on the file you just wrote. This catches the most common first-pass violations immediately — 4 tool calls (~1 second) that prevent an entire §4b rework cycle. Skip this for test files.

1. Grep for `\.push\(|\.splice\(|\.sort\(|\.reverse\(` — mutating methods (table row 3)
2. Grep for `/\*\*` — block comment style (table row 5)
3. Grep for `^\s*let ` — mutable bindings (table row 6)
4. Grep for `export const \w+ = \{` — check each match has a type annotation (table row 7)

If any match, fix in the same file before proceeding. Do NOT defer to §4b — fixing now prevents compound rework later.

**Prefer direct implementation over subagent dispatch.** Subagents require full context re-assembly, which is token-expensive and introduces cold-start latency. Implement steps directly using parallel tool calls (Read + Write + Shell) in a single message where possible. The task file provides all the context you need — Interface/Signature, Dependent Types, Architecture Notes — so there is no exploration overhead.

**Model selection (when subagents are used).** Use the least powerful model that can handle the work:

- **Mechanical implementation** (isolated functions, clear specs, 1-2 files): use `fast` model. Most implementation tasks are mechanical when the plan is well-specified.
- **Integration and judgment** (multi-file coordination, pattern matching, debugging): use default model.
- **Architecture, design, and review**: use the most capable available model.

Complexity signals: touches 1-2 files with a complete spec → `fast`. Touches multiple files with integration concerns → default. Requires design judgment or broad codebase understanding → most capable.

**Subagent status protocol.** When dispatching subagents for implementation work, require them to report one of four statuses:

- **DONE:** Proceed to verification.
- **DONE_WITH_CONCERNS:** The subagent completed the work but flagged doubts. Read the concerns before proceeding. If concerns are about correctness or scope, address them before verification. If they are observations (e.g. "this file is getting large"), note them and proceed.
- **NEEDS_CONTEXT:** The subagent needs information that was not provided. Provide the missing context and re-dispatch.
- **BLOCKED:** The subagent cannot complete the task. Assess the blocker: (1) context problem → provide more context and re-dispatch with the same model, (2) task requires more reasoning → re-dispatch with a more capable model, (3) task is too large → break into smaller pieces, (4) plan itself is wrong → escalate to the user.

Never ignore an escalation or force the same model to retry without changes. If the subagent said it is stuck, something needs to change.

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

**Known issue — knip false positives in `.git-worktrees/` paths.** Knip reports spurious "unused files" when the CWD is under a `.git-worktrees/` directory (a path-resolution bug in knip). If `pnpm knip` fails in the worktree but all other checks pass, run this two-step fallback instead of investigating:

1. From the **main workspace root**, run `git merge --no-commit --no-ff <branch> && pnpm knip; git merge --abort`.
2. If knip exits 0 on main with the merged code, the worktree failure is the known false positive — record "knip: pass (verified on main — worktree path false positive)" and proceed. If knip exits non-zero on main too, the failure is real — fix it.

Do NOT investigate the worktree knip failure further (cache clearing, debug mode, temp worktrees, etc.). The two-step fallback is sufficient and costs 1 tool call instead of 12+.

**4b — Re-read all files + mechanical checks in one parallel batch.**

Fire all of these in a single round of tool calls. All calls within a round are independent — do not batch a Grep that depends on a Read's output; if a check requires reading a file first, include the Read and the Grep in the same batch (they run in parallel, not sequentially):

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
| 19. Stale markers in modified files  | Grep all new/modified production files for `TODO`, `FIXME`, `HACK` comments. Also grep for phase references (`Phase [A-Z]`) and cross-reference against `documentation/tasks/progress/aic-progress.md` (main workspace) to check if the referenced phase is complete while the comment uses future tense. Report each as: `[marker] at [file:line] — ACTIONABLE (phase done) / INFORMATIONAL (future work)`. This check is informational — it does not block completion but is reported in §5a. If an actionable marker is in code the executor just wrote, fix it (the executor should not introduce stale markers). Pre-existing actionable markers in modified files are reported as follow-up items                                                                                                                                                                                                                                              | List each marker found with actionable/informational classification, or "0 stale markers found"                                                                                                                                                 |
| 20. Scope-adjacent string references | For every function, type, interface, constant, **or package name** that was renamed or had its behavior changed: grep the full codebase for string-literal occurrences of the old name. Check: dispatch table keys, error messages, log statements, test descriptions (`it("...")`), comments, **and infrastructure configs** (`vitest.config.ts` resolve aliases, `tsconfig.json` path mappings, `.github/workflows/*.yml` step commands, `package.json` scripts). Any string reference that still uses the old name or describes the old behavior = stale. This check is informational for pre-existing references but blocking if the executor's own changes introduced a rename without updating string references. **Package rename pitfall:** vitest/jest resolve aliases referencing the old package name will silently resolve to `dist/` instead of `src/`, causing `ENOENT` failures when `dist/` is stale or incomplete                   | List each string reference found — [file:line] — STALE / CURRENT, or "N/A — no renames or behavior changes in this task"                                                                                                                        |
| 21. Non-TS asset pipeline            | For tasks that introduce a runtime file read for a non-TS asset (e.g. `readFileSync` + `import.meta.url` for `.json`, `.wasm`): (a) verify the build script copies the asset from `src/` to `dist/`, (b) verify CI runs `pnpm build` before `pnpm test` (not just `tsc -b`), (c) verify `vitest.config.ts` aliases resolve the package to `src/` so tests find the asset. If no non-TS runtime assets were introduced, this check passes automatically                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | "[asset] — build copies: YES/NO — CI builds: YES/NO — vitest src alias: YES/NO", or "N/A — no non-TS runtime assets introduced"                                                                                                                 |

**4c — Confirm clean and track first-pass quality.**

After §4b, every dimension must be clean (all violations fixed, all re-checks passing). If a dimension reveals an architectural issue that cannot be fixed mechanically (e.g. signature mismatch, wrong layer boundary, missing DI), go to **Blocked diagnostic** — these indicate a task-file or design problem, not a code-style issue.

Track first-pass quality: for each dimension, record whether it was clean on first check or required a fix. This is informational — it helps calibrate the pre-write reference table and per-file quick checks over time but does not gate progress. Report the count in §5a (e.g. "21/21 first-pass clean" or "19/21 first-pass clean, fixed 2: readonly array in X, block comment in Y"). Dimensions 16–21 are conditional or informational — exclude conditional dimensions from the denominator when they don't apply (no transformer added, no migration created, no non-TS assets introduced). Dimensions 19–20 are informational and always count in the denominator but do not block progress for pre-existing issues. If the per-file quick check (§3) already caught and fixed a violation during implementation, that dimension still counts as first-pass clean — the quick check is part of the first pass.

Once all dimensions are confirmed clean, proceed to §5.

### 5. Finalize

When all dimensions are confirmed clean, complete these three sub-steps in order.

**5a — Report to the user:**

- What was implemented (files created/modified)
- Test results (pass count, confirming no regressions) — for code tasks and mixed tasks. For pure documentation tasks: subagent verification results instead.
- **First-pass quality: N/M** (from §4c or §4-doc-d or §4-mixed-d, where M = applicable dimensions) — list any dimensions that needed fixing and what was fixed. For mixed tasks, report code and documentation dimensions separately: "Code: N/M first-pass clean. Docs: N/M first-pass clean."
- **Benchmark impact** (transformer tasks only): "Token reduction: baseline X → actual Y (delta: -Z%). Baseline auto-ratcheted / unchanged." Include this only when dimension 16 applied
- **Verification subagent results** (documentation and mixed tasks): writing quality issues found/fixed, factual accuracy results, consistency results, reader simulation findings (if spawned). For mixed tasks, this covers the documentation-writer's Phase 3 critics run during §4-mixed-a.
- **Pre-existing issues detected** (documentation and mixed tasks, informational): list any GAP/TODO/FIXME markers, stale phase references, or other pre-existing problems found by dimension 9 that are outside the task scope. These inform the user of follow-up work but do not indicate a problem with the current task.
- **Scope-adjacent consistency** (documentation and mixed tasks): list any concepts from the edited sections that appear elsewhere in the document with stale or contradicted values (dimension 8 findings)
- **Cross-documentation term ripple** (documentation and mixed tasks): list any stale old terms found in other documentation files (dimension 11 findings). Non-historical references in out-of-scope files are follow-up items for the user.
- **Intra-document consistency** (documentation and mixed tasks): list any contradictions between sections of the same document that describe the same mechanism differently (dimension 12 findings)
- **Parallel section notes** (documentation and mixed tasks): if the writing quality subagent flagged asymmetry with a sibling section, summarize what differs and recommend whether a follow-up task should align them
- Review findings and fixes applied (if any)
- Any concerns or follow-up items

**5b — Update progress.**

Use the `aic-update-progress` skill to update `documentation/tasks/progress/aic-progress.md`.

**Main workspace only:** This file is under `documentation/tasks/` which is gitignored. Edit it in the **main workspace**, not the worktree. Use the main workspace root for Read/Write/Grep when running the update-progress skill. Do NOT stage or commit this file — it is never part of the worktree commit.

**Critical — daily log deduplication:** Before editing the daily log, grep `documentation/tasks/progress/aic-progress.md` (main workspace) for `### YYYY-MM-DD` with today's actual date. If a match exists, append to the existing entry — do NOT create a new heading. Only create a new `### YYYY-MM-DD` heading if grep returns zero matches. After the edit, grep again to confirm exactly one `### YYYY-MM-DD` heading for today's date. Do not put today's work under yesterday's date.

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
   c. Run `pnpm lint && pnpm typecheck && pnpm test`. If any fail, fix the issues, then stage only the fixed touched files and amend again (`git add <fixed files> && git commit --amend --no-edit`). This is the test-failure fix loop — run it at most twice (first retry + one more). If tests still fail after 2 fix-and-amend attempts, go to **Blocked diagnostic**.
   d. Run `git status --porcelain` again. Filter against touched-files list. If touched files are still dirty (lint-staged reformatted again), repeat from (b). This outer loop (steps a–d) is separate from (c)'s test-failure fix loop — it caps at 3 total iterations of (a–d). If touched files remain dirty after 3 iterations, something is structurally wrong; go to **Blocked diagnostic**.
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

**CRITICAL — No stash.** Never run `git stash` before merging. The user (or another agent) may be actively editing files on main. A stash would reset those files to HEAD, causing edits-in-progress to be silently lost — a race condition that cannot be recovered. Instead, let `git merge --squash` handle dirty working trees natively: git succeeds when dirty files don't overlap with the merge, and refuses when they do. This is safe by design.

**Step 1 — Squash merge.**

```
git merge --squash <branch>
```

**If the merge succeeds (exit 0):**

```
git commit -m "feat(<scope>): <what was built>"
```

The squash merge produces a single clean commit on main. Use the same commit message from 5c (or the user's adjusted version). Uncommitted changes to other files remain untouched in the working tree — exactly as they were before the merge.

**If the merge fails with "local changes would be overwritten":**

Git refused the merge because uncommitted files on main overlap with files the merge would modify. Do NOT stash. Instead:

1. Read the git error output — it lists the conflicting files.
2. Report to the user: "Cannot merge — these files have uncommitted changes that conflict with the merge: [list]. Please commit or stash them manually, then ask me to retry the merge."
3. Do NOT proceed. Do NOT delete the worktree. Wait for the user to resolve and re-request.

**If the merge succeeds but has content conflicts:**

1. List conflicted files: `git diff --name-only --diff-filter=U`
2. For each conflicted file, read it, resolve the conflict markers — prefer the feature branch changes and integrate main's additions where they don't overlap.
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

## Common Rationalizations — STOP

If you catch yourself thinking any of these, you are rationalizing. Stop and follow the process.

| Thought                                                         | Reality                                                                             |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| "This step is trivial, I can skip verification"                 | Trivial steps fail too. Verify everything.                                          |
| "I just wrote it so I know it is correct"                       | Re-read from disk. Memory is unreliable after 10+ files.                            |
| "Tests should pass now"                                         | "Should" means you have not run them. Run them.                                     |
| "The task file is probably wrong, I will improvise"             | Stop and report to the user. Never improvise.                                       |
| "I will fix this lint error later"                              | Fix it now. Deferred fixes compound.                                                |
| "One more try without going to Blocked"                         | If you have tried 2+ times, go to Blocked. More attempts waste tokens.              |
| "This workaround is fine, the task did not anticipate this"     | 3+ workarounds = circuit breaker. Report it.                                        |
| "I can skip the worktree for this small change"                 | The worktree protects main. Size does not matter.                                   |
| "Verification passed in §4a, no need for §4b mechanical checks" | §4a catches toolchain errors. §4b catches convention violations. Both are required. |
| "I will commit and fix the remaining issue after"               | All dimensions must be clean before committing.                                     |
| "The subagent said it succeeded"                                | Verify independently. Never trust subagent reports without evidence.                |
| "This debugging attempt will work"                              | Follow the systematic debugging skill. No guessing.                                 |
