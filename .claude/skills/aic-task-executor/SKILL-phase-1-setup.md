# Phase 1: Setup and Internalize

### 1. Read, validate, and internalize the task

**Pre-read all inputs in one parallel batch** to eliminate extra rounds:

- The task file (e.g. `documentation/tasks/NNN-name.md`)
- `documentation/tasks/progress/aic-progress.md` (read from **main workspace**, not worktree — this file is gitignored)
- `shared/package.json`
- `eslint.config.mjs`
- `.cursor/rules/aic-architect.mdc`
- The research document at the path in `> **Research:**` header (if present in the task file)

**Validate** from the pre-read results:

- Status is `Pending` (do not re-execute `Done` or `Blocked` tasks)
- All dependencies listed in "Depends on" are actually `Done` in `documentation/tasks/progress/aic-progress.md` (read from main workspace)

If a dependency is not done, **stop and tell the user**.

**Sweep orphaned worktrees first (MANDATORY).** From the main workspace root — before running `git worktree add`:

```
bash .claude/skills/shared/scripts/cleanup-worktree.sh sweep
```

Removes every `.git-worktrees/<dir>` not in `git worktree list`, prunes stale git metadata, and deletes any orphan `plan/<epoch>` / `feat/<epoch>` / `feat/task-<NNN>-<epoch>` branch whose worktree dir is gone. Idempotent. Exit 0 required. Exit 1 → stop and tell the user (do not try to work around it with manual `rm -rf`).

**Create a worktree** to isolate all work (main stays on `main`; multiple executors can run in parallel):

```
EPOCH=$(date +%s)
# With a task file: use the task number as prefix
git worktree add -b feat/task-NNN-$EPOCH .git-worktrees/task-NNN-$EPOCH main
# Without a task file (ad-hoc): epoch only
git worktree add -b feat/$EPOCH .git-worktrees/$EPOCH main
```

**Store the epoch value** for branch/directory names. If worktree creation fails because the path or branch already exists despite the sweep (e.g. racing against another agent), remove just that one and retry:

```
bash .claude/skills/shared/scripts/cleanup-worktree.sh remove .git-worktrees/<dir-name>
# then retry the `git worktree add` above
```

**Install (build deferred)** in the worktree: `source .claude/skills/shared/scripts/ensure-supported-node.sh && pnpm install --prefer-offline --frozen-lockfile` (set `working_directory` to worktree path).

- `--prefer-offline` reuses pnpm's global content-addressable store (`~/Library/pnpm/store` on macOS) instead of refetching every tarball, turning a cold install into a near-local copy. Saves roughly 20–60s per worktree depending on cache state.
- `--frozen-lockfile` is the CI-equivalent strict mode — it fails loudly if `pnpm-lock.yaml` and `package.json` disagree instead of mutating the lockfile mid-execution. This is the correct default for a deterministic worktree; a plan that legitimately changes dependencies must have a dedicated step that explicitly removes the flag.
- `pnpm build` is **deferred, not skipped.** Most tasks only need TypeScript source on disk — `pnpm lint`, `pnpm typecheck`, `pnpm test` (via vitest) and `pnpm knip` all read `src/` directly, so a cold `pnpm build` before §3 is wasted work (saves roughly 15–40s). Run `pnpm build` **lazily, on first demand**, when any of the following is true:
  - A §3 step or §4a/§4b check invokes a compiled binary from `dist/` (e.g. `node mcp/dist/server.js`, `node integrations/claude/plugin/scripts/*.cjs` that requires rebuilt artifacts, any smoke test that spawns the published CLI).
  - A §4b Dimension 21 "Non-TS assets" check needs to confirm the asset was copied to `dist/`.
  - The task's Steps or Tests table explicitly references a `dist/` artifact.
  - You modified `package.json` `files`, `tsconfig*.json`, or a bundler/packaging script and the verification needs to see the effect.
- When in doubt, run it — `pnpm build` is cheap after the first typecheck populates `tsbuildinfo` caches. The optimization is not "never build," it is "don't build before you know you need it."

**Supported-Node shim — prefix every `pnpm` or `node` invocation.** The repo pins `engines.node=">=22"` (`package.json`, `mcp/package.json`, `shared/package.json`) with `.npmrc engine-strict=true`. Cursor's bundled helper Node 22 at `/Applications/Cursor.app/.../helpers` already satisfies the floor, so under normal Cursor shells the shim is a no-op; it only mutates `PATH` if the active Node is older than 22 (e.g. a system Node pushed onto PATH by another tool). Each agent `Shell` call spawns a fresh shell — env vars do **not** persist — so you must prefix every pnpm/node invocation throughout this phase and later phases with `source .claude/skills/shared/scripts/ensure-supported-node.sh && ...`. This includes `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm knip`, `pnpm lint:clones`, and any direct `node script.js` call. **Concurrent-agent caveat:** `better-sqlite3` rebuilds its native binary for the active Node major on every `pnpm install`, so two agents on different Node majors (e.g. this agent on Node 22 and another on Node 24) will repeatedly clobber each other's `better_sqlite3.node` — keep concurrent agents on the same Node major. The MCP startup preflight surfaces an ABI mismatch with an actionable remediation message when this happens.

**Worktree caveat — `pnpm knip`:** Knip mis-resolves entry files when cwd is under `.git-worktrees/` (reports false "unused files" for scripts and tests that are fine on the real repo root). Whenever a task step or §4a requires `pnpm knip`, run it from the **main workspace root** — not the worktree. All other toolchain commands (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm lint:clones`) work correctly in the worktree. If knip passes on the main workspace root, record it as passed and move on — do not investigate worktree-specific knip failures.

**Verify HEAD:** `git rev-parse --abbrev-ref HEAD` in worktree. Must match created branch — if not, stop.

**Store** the worktree absolute path and branch name for use throughout.

**If a task file exists,** update status to `In Progress` in the **main workspace** copy (`documentation/tasks/NNN-name.md`). Task files are gitignored — all task file operations happen on main workspace only.

### 2. Internalize the task

Before writing any code, absorb these sections from the pre-read task file.

**Quick doc-mode pre-check.** The task file's `Layer:` header field was in the §1 pre-read. If it says `documentation`, skip directly to §2b now — the code-specific internalization below does not apply.

**Task quality gate — run the mechanical pre-flight wrapper before absorbing design decisions (defense in depth — the planner is supposed to run the equivalent gates in Pass 2 §C.5, but the executor independently re-runs them so planner skips cannot silently ship):**

Run the wrapper against the task file (not the worktree copy — the task file lives on the main workspace because `documentation/tasks/` is gitignored):

```
bash .claude/skills/shared/scripts/executor-preflight.sh <task-file>
```

`executor-preflight.sh` runs three sub-gates in parallel, waits for all, prints ordered per-gate results, and writes a pass/fail record to `.aic/gate-log.jsonl`:

- `ambiguity-scan.sh` — enforces the banned-phrase set (Cat 1-8 + P) from `SKILL-guardrails.md "No ambiguity"`. Hedging ("if needed", "may want", "probably"), examples-as-instructions ("e.g.", "such as"), delegation ("decide whether", "alternatively"), vague qualifiers ("appropriate", "etc."), state hedges ("if not present"), escape clauses ("in a later task", "follow-up task", "populated later"), false alternatives, tool-conditional scope, and plan-failure patterns ("TBD", "implement later") all fail with exit 1.
- `deferral-probe.sh` — catches the cross-task obligation leak observed in task 322: any hardcoded `null` / `false` / `0` / `""` / `''` / `[]` / `undefined` / `None` assigned to a task-introduced field must be either registered under `## Follow-up Items` with a named successor task (`task NNN` or `pending/NNN-*`), or justified as permanent in `## Architecture Notes` / `## Goal` with explicit wording (`remains null`, `stays null`, `always null`, `permanently null`, `never populated`). Exit 1 = unhonoured deferral.
- `architectural-invariants.sh` — enforces the 8 planner-task discipline triggers defined in `.claude/skills/shared/prompts/architectural-invariants-reference.md` (DRY/SRP/LABEL/BRAND/DIP/OCP/SCOPE/PERSIST). Missing required discipline bullets fail with exit 1.

Wrapper exit 1 → **stop and tell the user.** Quote the wrapper output (which sub-gate fired, file, line, pattern/field, fix hint) so the user can decide whether to fix the task file, re-plan, or discard. Do not guess; do not paper over. Do not execute implementation steps after a failing preflight gate. A failing gate here means the planner's Pass 2 §C.5 gates were skipped or bypassed — the correct response is to flag it to the user, not to silently execute an ambiguous or under-specified task file.

**Checkpoint enforcement.** `checkpoint-log.sh` refuses to accept `aic-task-executor setup-complete` unless a fresh executor-preflight success record exists in `.aic/gate-log.jsonl` within 30 minutes (success rows include `ts`, `gate`, `target`, `status`). Enforcement has two modes:

- **Task-scoped (preferred, task-correct):** export `CHECKPOINT_TASK_FILE=<abs-path-to-task-file>` before invoking `checkpoint-log.sh`. The script compares the exported path against the `target` field of the latest `executor-preflight` `status:"ok"` record; a preflight success for a _different_ task will not satisfy the gate even if it is within the 30-minute window. Always use this mode — it is the only mode that cannot be fooled by an unrelated preflight from a concurrent agent or an earlier task in the same session.
- **Recency-only (back-compat):** if `CHECKPOINT_TASK_FILE` is unset, the script falls back to the legacy behaviour and accepts any recent `executor-preflight` success. This path exists only so pre-existing callers keep working; do not rely on it.

Emergency bypass is `CHECKPOINT_ALLOW_NO_GATE=1`; checkpoint records still append normally and bypass warnings are emitted to stderr. Use bypass only when a documented reason blocks the wrapper (e.g. a CI replay of a historical task) and always cite the reason to the user first.

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

**Check `**Predecessor contracts:**` (if present).** When Architecture Notes carries a `**Predecessor contracts:**` bullet (the planner writes this whenever the task has `Depends on:` or `Prerequisite:` and consumes outputs from that predecessor), verify each listed contract is actually honored in the current workspace:

- Named DB column exists with the declared nullability and domain (grep migrations; inspect schema if needed).
- Named enum value exists in the referenced `*.ts as const` object.
- Named interface method exists with the declared signature.
- Null-vs-zero semantics: if the contract says "writes `NULL` until Task M populates it", tests downstream must assert the `NULL` / `available: false` path, not the populated path.

Any contract the workspace fails to honor (column missing, enum drift, signature mismatch, assumption wrong) → **stop and tell the user** before writing code. Predecessor drift is the single most common cause of downstream-task rework.

**Check `**Unit contract:**` (if present).** When Architecture Notes carries a `**Unit contract:**` bullet listing each named numeric slot and its domain, internalize every slot's declared domain before writing code. Downstream enforcement lives in §3 (Implement) — this step just ensures you have the contract in working memory.

**If a research document was pre-read,** absorb its findings as additional context — it may contain API signatures, env var names, edge cases, or design rationale not captured in the task's Architecture Notes. Task file takes precedence over research recommendations if they conflict.

**Cross-check prerequisites:** Verify listed dependencies exist. Confirm ESLint changes have matching steps. Mismatch → **stop and tell the user.**

**Build the touched-files list.** Extract every file path from the task's **Files table** (both "Create" and "Modify" rows).

Note: `documentation/tasks/` is gitignored — progress updates, status changes, and moves to `done/` happen on **main workspace** only and must NOT be staged.

Add auto-ratcheting benchmark files and config files from Config Changes if applicable.

**This is your commit allowlist.** Only these files may be staged in §5c.

### 2.5. Verify external assumptions

Scan Steps and Architecture Notes for claims about external systems. Verify each against actual evidence using `.claude/skills/shared/SKILL-investigation.md` (**Runtime Evidence Checklist** + **Codebase Investigation Depth**).

Scan the task's Steps and Architecture Notes for claims about external system behavior — anything describing what an external system sends, how files are deployed, what runtime state looks like, or what an API returns. For each such claim, verify it against actual evidence. Read `.claude/skills/shared/SKILL-investigation.md` and apply the Runtime Evidence Checklist (database state, deployed files, bootstrap/lifecycle, cache/file system, documentation cross-check, external system behavior, library API shapes). This catches tasks that are technically correct but based on stale or wrong assumptions about runtime state — the most common cause of "the fix didn't work" after execution.

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

**Emit the setup-complete checkpoint now.** Run this exactly — substitute only `<abs-task-file-path>` (the task file you ran preflight against in §2; omit `CHECKPOINT_TASK_FILE` only for ad-hoc tasks with no task file, in which case the gate falls back to recency-only):

```
echo "CHECKPOINT: aic-task-executor/setup-complete — complete"
CHECKPOINT_TASK_FILE=<abs-task-file-path> \
  bash .claude/skills/shared/scripts/checkpoint-log.sh \
  aic-task-executor setup-complete <worktree-dir-or-short-note>
```

A non-zero exit means the gate rejected the checkpoint — re-read the stderr message, rerun `executor-preflight.sh` for the current task if recency expired, and try again. Do not proceed to Phase 3 until this command exits 0.

Phase 1 complete. Read `SKILL-phase-3-implement.md` and execute it immediately.
