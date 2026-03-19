# Task 207: AF04 — Remove dead code and redundant fallback paths

> **Status:** Pending
> **Phase:** AF (Model ID Resolution Simplification)
> **Layer:** integrations + mcp
> **Depends on:** AF03 (Simplify server-side resolution chain)

## Goal

Remove all remaining local copies of session model cache helpers and the unused server-side write path so that the shared module and the simplified resolution chain are the single source of truth; refactor the Cursor subagent test to use the shared module instead of duplicate helpers.

## Architecture Notes

- AF02 introduced `integrations/shared/session-model-cache.cjs` (isValidModelId, normalizeModelId, readSessionModelCache, writeSessionModelCache). All hooks already require from it.
- AF03 simplified server resolution to args → cache → detector; server no longer writes to the cache (hooks do). The function `_writeSessionModelCache` in compile-handler.ts is never called — dead code.
- MCP package publishes only `files: ["dist"]`; integrations/ is not in the tarball, so the server cannot require the shared .cjs at runtime. Server keeps its TypeScript `readSessionModelCache` and `normalizeModelId`; only the unused `_writeSessionModelCache` and `SessionModelEntry` (used only by it) are removed.
- Test file `AIC-subagent-model-id.test.cjs` currently defines local `isValidModelId`, `readCacheFallback`, and `writeJsonlEntry` — duplicate logic. Replace with `require("../../shared/session-model-cache.cjs")` and use `readSessionModelCache` / `writeSessionModelCache` for cache tests.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `mcp/src/handlers/compile-handler.ts` (remove _writeSessionModelCache and SessionModelEntry) |
| Modify | `integrations/cursor/__tests__/AIC-subagent-model-id.test.cjs` (use shared session-model-cache.cjs; remove local isValidModelId, readCacheFallback, writeJsonlEntry) |

## Interface / Signature

Not applicable — refactoring only. Before/after:

**compile-handler.ts:** Remove the function `_writeSessionModelCache` (lines 103–123) and the interface `SessionModelEntry` (lines 50–56) used only by it. Keep `sessionModelsPath`, `readSessionModelCache`, `normalizeModelId`, and `resolveAndCacheModelId` unchanged.

**AIC-subagent-model-id.test.cjs:** Add at top (after existing requires):

```javascript
const {
  readSessionModelCache,
  writeSessionModelCache,
  isValidModelId,
} = require(path.join(__dirname, "..", "..", "shared", "session-model-cache.cjs"));
```

Remove the local function definitions: `isValidModelId` (lines 58–62), `readCacheFallback` (lines 64–93), `writeJsonlEntry` (lines 95–106). Update all cache test cases to call `writeSessionModelCache(projectRoot, modelId, convId, "cursor")` and `readSessionModelCache(projectRoot, convId, "cursor")` instead of `writeJsonlEntry` and `readCacheFallback`. For `writeSessionModelCache` the signature is `(projectRoot, modelId, conversationId, editorId, timestamp)`; omit timestamp for tests so the module uses default. Use `readSessionModelCache(dir, convId, "cursor")` for read.

## Dependent Types

Not applicable — no new types. Existing types (AbsolutePath, EditorId) remain unchanged in compile-handler.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Remove dead write path from compile-handler

In `mcp/src/handlers/compile-handler.ts`, delete the interface `SessionModelEntry` (the block defining `readonly c: string; readonly m: string; readonly e?: string; readonly timestamp: string;`). Delete the function `_writeSessionModelCache` in full (including its body and the closing `}`). Do not remove `sessionModelsPath`, `readSessionModelCache`, or `normalizeModelId` — they are still used by `resolveAndCacheModelId`.

**Verify:** Grep for `_writeSessionModelCache` and `SessionModelEntry` in `mcp/src/handlers/compile-handler.ts` returns 0 matches.

### Step 2: Refactor AIC-subagent-model-id.test.cjs to use shared module

In `integrations/cursor/__tests__/AIC-subagent-model-id.test.cjs`: Add a require for `readSessionModelCache`, `writeSessionModelCache`, and `isValidModelId` from `path.join(__dirname, "..", "..", "shared", "session-model-cache.cjs")`. Remove the local function definitions: `isValidModelId`, `readCacheFallback`, `writeJsonlEntry`. In every test that currently calls `writeJsonlEntry(tmp, convId, modelId)`, replace with `writeSessionModelCache(tmp, modelId, convId || "", "cursor")`. In every test that currently calls `readCacheFallback(tmp, convId)`, replace with `readSessionModelCache(tmp, convId, "cursor")`. Keep the test list and test names unchanged; only the implementation of the cache helpers changes. Ensure the test file still creates and removes temp dirs with `fs.mkdtempSync` and `fs.rmSync(..., { recursive: true, force: true })`; the shared module handles mkdir and append for the cache file. For tests that write invalid JSON or other-editor entries, continue to use `fs.writeFileSync` or `fs.appendFileSync` on the cache file path when you need to simulate malformed or cross-editor data (the shared module does not write those). Preserve the structure of `cacheFallback_ignores_other_editor`: write a line with `e: "claude-code"` via direct `fs.appendFileSync` to the cache path, then use `writeSessionModelCache` for the cursor entry, then assert `readSessionModelCache(tmp, null, "cursor")` returns the cursor model.

**Verify:** Run `node integrations/cursor/__tests__/AIC-subagent-model-id.test.cjs`; all test names print "ok:" and exit 0.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| Existing AIC-subagent-model-id.test.cjs | All existing test names (modelId_trim, modelId_null_missing, modelId_normalizes_default_to_auto, normalizeModelId_standalone, cacheFallback_*) pass using shared readSessionModelCache/writeSessionModelCache |
| Existing compile-handler.test.ts | Resolution and handler behavior unchanged; no new test cases |
| pnpm lint / typecheck / test / knip | Zero errors, no new unused exports or deps |

## Acceptance Criteria

- [ ] _writeSessionModelCache and SessionModelEntry removed from compile-handler.ts
- [ ] AIC-subagent-model-id.test.cjs uses readSessionModelCache, writeSessionModelCache, isValidModelId from session-model-cache.cjs; local copies removed
- [ ] All test cases in AIC-subagent-model-id.test.cjs pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
