# Task 218: Fix Cursor temp file cleanup leak

> **Status:** Pending
> **Phase:** AI (Phase 1.5)
> **Layer:** integrations (cursor hooks)
> **Depends on:** AI03 (Extract shared edited-files-cache module)

## Goal

Add cleanup of Cursor edited-files temp files on session end by calling the shared `cleanupEditedFiles("cursor", key)` from `AIC-session-end.cjs`, so temp files are removed and no longer accumulate in `os.tmpdir()` (matching Claude Code behavior).

## Architecture Notes

- Use existing `integrations/shared/edited-files-cache.cjs` (AI03). No new modules.
- Key derivation must match `AIC-after-file-edit-tracker.cjs` so the same file the tracker wrote is deleted.
- Call `cleanupEditedFiles("cursor", key)` after parsing input and after `cleanupTempFiles()` so gate/deny/prompt files are cleaned first, then edited-files.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `integrations/cursor/hooks/AIC-session-end.cjs` (add require, key derivation, cleanupEditedFiles call) |

## Interface / Signature

Shared module API used (no new interface):

```javascript
// From integrations/shared/edited-files-cache.cjs
const { cleanupEditedFiles } = require("../../shared/edited-files-cache.cjs");
cleanupEditedFiles(editorId, key);  // sync; ignores ENOENT
```

Key derivation (must match AIC-after-file-edit-tracker.cjs):

```javascript
const key =
  input.conversation_id ??
  input.conversationId ??
  input.session_id ??
  input.sessionId ??
  process.env.AIC_CONVERSATION_ID ??
  "default";
```

Add in `main()`: after parsing `input` (so `input` is available from the existing try/catch), derive `key` as above, then after `cleanupTempFiles()` call `cleanupEditedFiles("cursor", key)`.

## Dependent Types

None. Hook is CommonJS; only calls `cleanupEditedFiles("cursor", key)` with string arguments.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add edited-files cleanup to AIC-session-end.cjs

In `integrations/cursor/hooks/AIC-session-end.cjs`:

1. Add require after the existing `session-log.cjs` require:  
   `const { cleanupEditedFiles } = require("../../shared/edited-files-cache.cjs");`

2. In `main()`, after the block that parses `input` (the try/catch that sets `sessionId`, `reason`, `durationMs`), ensure `input` is in scope for the rest of `main`. If the parse fails, `input` is currently not defined; keep existing behavior (cleanup and exit). So: declare `let input = {};` before the try, and inside the try set `input = JSON.parse(raw)` so that after the try/catch we always have an object for `input`.

3. After deriving `sessionId`, `reason`, `durationMs`, derive `key` with:  
   `const key = input.conversation_id ?? input.conversationId ?? input.session_id ?? input.sessionId ?? process.env.AIC_CONVERSATION_ID ?? "default";`

4. After the existing `cleanupTempFiles();` call, add:  
   `cleanupEditedFiles("cursor", key);`

**Verify:** File contains the new require, key derivation, and `cleanupEditedFiles("cursor", key)` call; `main()` still exits 0 and calls `appendSessionLog` unchanged.

### Step 2: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| full_suite | Run `pnpm test`; no regressions. Existing edited-files-cache and integration tests cover the shared module. |

## Acceptance Criteria

- [ ] `AIC-session-end.cjs` requires `cleanupEditedFiles` from `../../shared/edited-files-cache.cjs`
- [ ] Key is derived with `input.conversation_id ?? input.conversationId ?? input.session_id ?? input.sessionId ?? process.env.AIC_CONVERSATION_ID ?? "default"`
- [ ] `cleanupEditedFiles("cursor", key)` is called after `cleanupTempFiles()` in `main()`
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all pass
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
