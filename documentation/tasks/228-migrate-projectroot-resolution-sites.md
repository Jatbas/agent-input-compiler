# Task 228: Migrate all projectRoot resolution sites

> **Status:** Pending
> **Phase:** AJ (Integration Shared Utilities Extraction)
> **Layer:** integrations
> **Depends on:** AJ01 (Extract shared resolveProjectRoot module)

## Goal

Replace inline `projectRoot` resolution in all integration hook files and install scripts with `require(...).resolveProjectRoot(parsed, options)` from `integrations/shared/resolve-project-root.cjs`, preserving behavior and verifying no regression.

## Architecture Notes

- **Root cause:** 23 files in `integrations/cursor/` and `integrations/claude/` each inline 2–4 lines to resolve project root (Cursor: `CURSOR_PROJECT_DIR || AIC_PROJECT_ROOT? || process.cwd()`; Claude: `parsed.cwd` then `CLAUDE_PROJECT_DIR || process.cwd()`; inject-conversation-id adds `toolInput.projectRoot`). Duplication and drift risk.
- **Why this fix:** AJ01 already provides `resolveProjectRoot(parsed, options)` with identical fallback semantics. Migrating every site to that single implementation removes duplication and keeps behavior unchanged.
- **Blast radius:** 23 files modified; 0 test assertion changes (env/cwd still control outcome); fix-verification via grep.

## Before/After Behavior

- **Before:** Each file assigns `projectRoot` from env/cwd/parsed inline (Cursor: `const projectRoot = process.env.CURSOR_PROJECT_DIR || process.cwd();` Claude: `cwdRaw.trim() ? cwdRaw.trim() : process.env.CLAUDE_PROJECT_DIR || process.cwd();`).
- **After:** Each file requires the shared module and sets `const projectRoot = resolveProjectRoot(parsed, options);` with the correct shape per location (Cursor: `null, { env: process.env }` or `useAicProjectRoot` / `toolInputOverride`; Claude: `parsed` or `parsed, { toolInputOverride }`). Return value remains a trimmed absolute path.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `integrations/cursor/hooks/AIC-compile-context.cjs` (add require, replace projectRoot) |
| Modify | `integrations/cursor/hooks/AIC-session-end.cjs` (add require, replace projectRoot) |
| Modify | `integrations/cursor/hooks/AIC-subagent-compile.cjs` (add require, replace projectRoot) |
| Modify | `integrations/cursor/hooks/AIC-before-submit-prewarm.cjs` (add require, replace projectRoot) |
| Modify | `integrations/cursor/hooks/AIC-inject-conversation-id.cjs` (add require, replace projectRoot with toolInputOverride) |
| Modify | `integrations/cursor/hooks/AIC-session-init.cjs` (add require, replace projectRoot with useAicProjectRoot: true) |
| Modify | `integrations/cursor/hooks/AIC-require-aic-compile.cjs` (add require, replace both projectRoot sites) |
| Modify | `integrations/claude/hooks/aic-session-start.cjs` (add require, replace projectRoot) |
| Modify | `integrations/claude/hooks/aic-session-end.cjs` (add require, replace projectRoot) |
| Modify | `integrations/claude/hooks/aic-pre-compact.cjs` (add require, replace projectRoot) |
| Modify | `integrations/claude/hooks/aic-subagent-inject.cjs` (add require, replace projectRoot) |
| Modify | `integrations/claude/hooks/aic-prompt-compile.cjs` (add require, replace projectRoot) |
| Modify | `integrations/claude/hooks/aic-inject-conversation-id.cjs` (add require, replace projectRoot with toolInputOverride) |
| Modify | `integrations/claude/hooks/aic-stop-quality-check.cjs` (add require, replace projectRoot) |
| Modify | `integrations/claude/plugin/scripts/aic-session-start.cjs` (add require ../../../shared, replace projectRoot) |
| Modify | `integrations/claude/plugin/scripts/aic-session-end.cjs` (add require ../../../shared, replace projectRoot) |
| Modify | `integrations/claude/plugin/scripts/aic-pre-compact.cjs` (add require ../../../shared, replace projectRoot) |
| Modify | `integrations/claude/plugin/scripts/aic-subagent-inject.cjs` (add require ../../../shared, replace projectRoot) |
| Modify | `integrations/claude/plugin/scripts/aic-prompt-compile.cjs` (add require ../../../shared, replace projectRoot) |
| Modify | `integrations/claude/plugin/scripts/aic-stop-quality-check.cjs` (add require ../../../shared, replace projectRoot) |
| Modify | `integrations/claude/install.cjs` (add require ../shared, replace projectRoot) |
| Modify | `integrations/cursor/install.cjs` (add require ../shared, replace projectRoot) |
| Modify | `integrations/cursor/uninstall.cjs` (require ../shared; use shared when no --project-root in argv, else keep argv parsing) |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Cursor hooks — standard resolution (4 files)

In each of `AIC-compile-context.cjs`, `AIC-session-end.cjs`, `AIC-subagent-compile.cjs`, `AIC-before-submit-prewarm.cjs`:

- Add at top (after existing requires): `const { resolveProjectRoot } = require("../../shared/resolve-project-root.cjs");`
- Remove the line that assigns `projectRoot` from `process.env.CURSOR_PROJECT_DIR || process.cwd()` (or the module-level `const projectRoot = ...`).
- Add (or keep in same place) the assignment: `const projectRoot = resolveProjectRoot(null, { env: process.env });` — in files that currently have module-level assignment, make it module-level; in files that assign inside a block, keep it in that block.

**Verify:** Grep each file for `resolveProjectRoot` — one require, one call. No remaining `process.env.CURSOR_PROJECT_DIR || process.cwd()` for projectRoot.

### Step 2: Cursor hooks — AIC-session-init and AIC-inject-conversation-id

In `AIC-session-init.cjs`: Add require for `../../shared/resolve-project-root.cjs`. Replace the `projectRoot` assignment (CURSOR_PROJECT_DIR || AIC_PROJECT_ROOT || process.cwd()) with `const projectRoot = resolveProjectRoot(null, { env: process.env, useAicProjectRoot: true });`

In `AIC-inject-conversation-id.cjs`: Add require for `../../shared/resolve-project-root.cjs`. Replace the block that sets `projectRoot` from toolInput.projectRoot || CURSOR_PROJECT_DIR || process.cwd() with `const projectRoot = resolveProjectRoot(null, { env: process.env, toolInputOverride: toolInput?.projectRoot });`

**Verify:** Both files call resolveProjectRoot with the correct options; no inline CURSOR_PROJECT_DIR or AIC_PROJECT_ROOT for projectRoot.

### Step 3: AIC-require-aic-compile.cjs (two sites)

Add `const { resolveProjectRoot } = require("../../shared/resolve-project-root.cjs");` at top. Replace the first projectRoot assignment (line ~15, inside the AIC_DEV_MODE check) with `const projectRoot = resolveProjectRoot(null, { env: process.env });` Replace the second (line ~111, inside process.stdin.on("end")) with the same call.

**Verify:** File contains no `process.env.CURSOR_PROJECT_DIR || process.cwd()` for projectRoot.

### Step 4: Claude hooks (7 files)

In each of `integrations/claude/hooks/aic-session-start.cjs`, `aic-session-end.cjs`, `aic-pre-compact.cjs`, `aic-subagent-inject.cjs`, `aic-prompt-compile.cjs`, `aic-stop-quality-check.cjs`:

- Add: `const { resolveProjectRoot } = require("../../shared/resolve-project-root.cjs");`
- Remove the 2–4 lines that compute `cwdRaw` and assign `projectRoot` from cwdRaw/CLAUDE_PROJECT_DIR/process.cwd().
- Add: `const projectRoot = resolveProjectRoot(parsed);` (parsed is already in scope in each file).

In `integrations/claude/hooks/aic-inject-conversation-id.cjs` only: Use `const projectRoot = resolveProjectRoot(parsed, { toolInputOverride: toolInput?.projectRoot });` and remove the inline cwdRaw/projectRoot block.

**Verify:** No remaining `parsed.cwd ?? parsed.input?.cwd` used to set projectRoot in these files (conversationId extraction may still use transcript_path).

### Step 5: Claude plugin/scripts (6 files)

In each of `integrations/claude/plugin/scripts/aic-session-start.cjs`, `aic-session-end.cjs`, `aic-pre-compact.cjs`, `aic-subagent-inject.cjs`, `aic-prompt-compile.cjs`, `aic-stop-quality-check.cjs`:

- Add: `const { resolveProjectRoot } = require("../../../shared/resolve-project-root.cjs");`
- Remove the inline cwdRaw and projectRoot assignment.
- Add: `const projectRoot = resolveProjectRoot(parsed);` (or with toolInputOverride for the inject-conversation-id variant if present; none of these six are inject-conversation-id).

**Verify:** Each file requires from `../../../shared/` and calls resolveProjectRoot(parsed); no inline CLAUDE_PROJECT_DIR or parsed.cwd for projectRoot.

### Step 6: Cursor and Claude install and Cursor uninstall

In `integrations/cursor/install.cjs`: Add `const { resolveProjectRoot } = require("../shared/resolve-project-root.cjs");` Replace `const projectRoot = process.cwd();` with `const projectRoot = resolveProjectRoot(null, { env: process.env });`

In `integrations/claude/install.cjs`: Add `const { resolveProjectRoot } = require("../shared/resolve-project-root.cjs");` Replace `const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();` with `const projectRoot = resolveProjectRoot({ cwd: "" }, { env: process.env });` so the shared module uses the Claude fallback chain (CLAUDE_PROJECT_DIR then process.cwd()).

In `integrations/cursor/uninstall.cjs`: Add at top `const { resolveProjectRoot: resolveProjectRootShared } = require("../shared/resolve-project-root.cjs");` Refactor the local `resolveProjectRoot` so it only parses argv for `--project-root`: rename it to `projectRootFromArgv()` and have it return the path when --project-root is present in argv, else return null. In `run()`, replace `const projectRoot = resolveProjectRoot();` with `const projectRoot = projectRootFromArgv() ?? resolveProjectRootShared(null, { env: process.env, useAicProjectRoot: true });` Remove the env-based logic (CURSOR_PROJECT_DIR, AIC_PROJECT_ROOT) from the local helper so only argv and the shared call remain.

**Verify:** install and uninstall use shared module; uninstall still honors --project-root when provided.

### Step 7: Fix-verification and final checks

Run from repo root:

- `grep -r "process\.env\.CURSOR_PROJECT_DIR || process\.cwd()" integrations/cursor/hooks/ integrations/cursor/install.cjs integrations/cursor/uninstall.cjs` — expected: 0 matches.
- `grep -r "process\.env\.CLAUDE_PROJECT_DIR || process\.cwd()" integrations/claude/` — expected: no matches in hook or install files (only shared module and tests may contain it).
- `pnpm lint && pnpm typecheck && pnpm test && pnpm knip` — all pass.

**Verify:** Zero inline resolution patterns in migrated files; lint, typecheck, test, knip pass.

## Tests

| Test case | Description |
| --------- | ----------- |
| cursor_require_aic_compile | AIC-require-aic-compile.test.cjs passes (env CURSOR_PROJECT_DIR still controls projectRoot) |
| claude_stop_quality_check | aic-stop-quality-check.test.cjs passes (parsed.cwd still controls projectRoot) |
| resolve_project_root_unit | resolve-project-root.test.cjs passes |
| fix_verification_no_inline_cursor | Grep finds no "process.env.CURSOR_PROJECT_DIR \|\| process.cwd()" in integrations/cursor/hooks or install.cjs or uninstall.cjs |
| fix_verification_no_inline_claude | Grep finds no inline parsed.cwd/CLAUDE_PROJECT_DIR projectRoot assignment in integrations/claude/hooks or plugin/scripts or install.cjs (excluding shared and __tests__) |

## Acceptance Criteria

- [ ] All 23 files modified per Files table; no new files.
- [ ] Each migrated file requires resolve-project-root.cjs from the correct relative path and calls resolveProjectRoot with the correct arguments.
- [ ] AIC-require-aic-compile.test.cjs, aic-stop-quality-check.test.cjs, resolve-project-root.test.cjs pass.
- [ ] Fix-verification greps show no remaining inline projectRoot resolution in the migrated integration files.
- [ ] `pnpm lint` — zero errors, zero warnings.
- [ ] `pnpm typecheck` — clean.
- [ ] `pnpm knip` — no new unused files, exports, or dependencies.

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work, stop. List the adaptations, report to the user, and re-evaluate before continuing.
