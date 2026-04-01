# Phase 1: Setup and Internalize

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

**Create a worktree** to isolate all work (main stays on `main`; multiple executors can run in parallel):

```
EPOCH=$(date +%s)
# With a task file: use the task number as prefix
git worktree add -b feat/task-NNN-$EPOCH .git-worktrees/task-NNN-$EPOCH main
# Without a task file (ad-hoc): epoch only
git worktree add -b feat/$EPOCH .git-worktrees/$EPOCH main
```

**Store the epoch value** for branch/directory names. If worktree exists (stale), `git worktree prune` then retry.

**Install + build** in the worktree: `pnpm install && pnpm build` (set `working_directory` to worktree path).

**Verify HEAD:** `git rev-parse --abbrev-ref HEAD` in worktree. Must match created branch — if not, stop.

**Store** the worktree absolute path and branch name for use throughout.

**If a task file exists,** update status to `In Progress` in the **main workspace** copy (`documentation/tasks/NNN-name.md`). Task files are gitignored — all task file operations happen on main workspace only.

### 2. Internalize the task

Before writing any code, absorb these sections from the pre-read task file.

**Quick doc-mode pre-check.** The task file's `Layer:` header field was in the §1 pre-read. If it says `documentation`, skip directly to §2b now — the code-specific internalization below does not apply.

**Task quality gate — scan for ambiguity before absorbing design decisions:**

Before internalizing any section, scan every non-code instruction sentence in the Steps section, Verify lines, and test descriptions. Flag any sentence containing patterns from these categories:

- **Hedging:** "if needed/necessary/as needed", "may/might/could/should work", "probably/likely/possibly/potentially/perhaps", "try to/ideally/preferably/feel free"
- **Examples-as-instructions:** "e.g./for example/such as/something like/or similar/or equivalent/some kind of"
- **Delegation:** "decide whether/choose between/depending on/up to you/alternatively/whichever/whatever works"
- **Vague qualifiers / state hedges:** "appropriate/suitable/reasonable/etc.", "if not present/already/doesn't exist"
- **Escape clauses / false alternatives:** "or skip/ignore/leave for later", "if/where possible", " or " presenting two choices
- **Parenthesized hedges:** any `(...)` containing the above patterns

If any match: **stop and tell the user.** List each ambiguous sentence and what decision it requires.

**Read the Interface / Signature section** (or Wiring Specification for composition roots). For interface-implementing components: the exact interface (first code block), class declaration, constructor parameters, and method signatures (second code block). Return types including readonly modifiers. For composition roots: every concrete class constructor signature (from the wiring code block), every exported function signature, and every external library API (class names, import paths, method calls) — these are ground truth.

**Read the Dependent Types section.** Tiered system:

- **Tier 0 (verbatim):** Full definitions inline. Memorize every field.
- **Tier 1 (signature + path):** Type name + path listed. Read the source file on demand when you reach the step needing it.
- **Tier 2 (path-only):** Branded primitives / `as const` enums. Use the listed factory function. Read source only if factory call fails to typecheck.

Non-composition-root tasks: all types are Tier 0.

**Read the Config Changes section.** Note (using the pre-read `shared/package.json` and `eslint.config.mjs`):

- Which dependencies must exist (and verify they actually do — already in context from Step 1)
- Which ESLint changes must be applied (and in which step)
- If "None", confirm no config steps appear in the Steps section

**Read the Architecture Notes.** Note design decisions (e.g. "replace semantics, not append", "sync API only", "no Clock needed"). These constrain your implementation.

**If a research document was pre-read,** absorb its findings as additional context — it may contain API signatures, env var names, edge cases, or design rationale not captured in the task's Architecture Notes. Task file takes precedence over research recommendations if they conflict.

**Cross-check prerequisites:** Verify listed dependencies exist. Confirm ESLint changes have matching steps. Mismatch → **stop and tell the user.**

**Build the touched-files list.** Extract every file path from the task's **Files table** (both "Create" and "Modify" rows).

Note: `documentation/tasks/` is gitignored — progress updates, status changes, and moves to `done/` happen on **main workspace** only and must NOT be staged.

Add auto-ratcheting benchmark files and config files from Config Changes if applicable.

**This is your commit allowlist.** Only these files may be staged in §5c.

### 2.5. Verify external assumptions

Scan Steps and Architecture Notes for claims about external systems. Verify each against actual evidence using `../shared/SKILL-investigation.md` (**Runtime Evidence Checklist** + **Codebase Investigation Depth**).

Scan the task's Steps and Architecture Notes for claims about external system behavior — anything describing what an external system sends, how files are deployed, what runtime state looks like, or what an API returns. For each such claim, verify it against actual evidence. Read `../shared/SKILL-investigation.md` and apply the Runtime Evidence Checklist (database state, deployed files, bootstrap/lifecycle, cache/file system, documentation cross-check, external system behavior, library API shapes). This catches tasks that are technically correct but based on stale or wrong assumptions about runtime state — the most common cause of "the fix didn't work" after execution.

Unverifiable assumption → **stop and report**: (1) the claim, (2) what you checked, (3) what you found.

### 2b. Documentation and mixed-mode detection

**Classify the task into one of three execution modes** by examining the Files table:

**Pure documentation task** — all files in the Files table are `.md` files in `documentation/`, AND the task has a Change Specification section instead of Interface/Signature, AND the Layer field is absent or says "documentation":

- Execute §3-doc (documentation implementation) and §4-doc (documentation verification).
- Skip §3 (code implementation) and §4a-§4b (code verification).

**Mixed task** — the Files table contains BOTH code files (`.ts`, `.js`, `.cjs`, `.mjs`, config files) AND `.md` files in `documentation/`:

- Execute §3 → §3-mixed → §4a-§4b → §4-mixed (code first, then docs).
- The task file's documentation steps have Change Specifications produced by the planner (via the documentation-writer pipeline for SECTION EDIT changes, or directly for MECHANICAL changes). The executor applies these pre-verified edits and runs a verification pass — do not rewrite them.

**Pure code task** — no `.md` files in `documentation/` appear in the Files table:

- Execute §3 (code implementation) and §4a-§4b (code verification).
- Skip §3-doc, §3-mixed, §4-doc, §4-mixed.

**Detection heuristic:** Scan Files table for `documentation/**/*.md`. All match → pure doc. Some match + code files → mixed. None match → pure code.

---

Phase complete. Read `SKILL-phase-3-implement.md` and execute it immediately.
