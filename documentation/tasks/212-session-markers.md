# Task 212: Extract shared session-markers module

> **Status:** Pending
> **Phase:** AH (Session Lifecycle Markers Simplification)
> **Layer:** integrations/shared
> **Depends on:** AH02 (Investigate hooks/plugin lock cleanup divergence)

## Goal

Create a single CommonJS module in `integrations/shared/session-markers.cjs` that centralises all session lock and marker path construction and fs operations used by Claude Code hooks, so AH05 can replace duplicated logic in four hook files with shared calls.

## Architecture Notes

- Phase AH target state (mvp-progress.md): one shared module exporting the six functions; all marker path and fs logic in one place. Marker files (`.session-context-injected`, `.session-start-lock`) are Claude Code only; Cursor does not use them.
- Same pattern as `prompt-log.cjs` and `session-model-cache.cjs`: path.join(projectRoot, ".aic", "<filename>"), fs.mkdirSync(.aic, { recursive: true, mode: 0o700 }) when creating files, try/catch where non-fatal.
- Lock semantics: fs.openSync(lockPath, "wx") for atomic acquire; on EEXIST, if marker has content then unlink lock (stale cleanup) and return false. releaseSessionLock and clearSessionMarker never throw (try/catch ignore).
- Standalone exported functions only; no class, no new interface or branded types (integration layer uses plain strings).

## Files

| Action | Path |
| ------ | ---- |
| Create | `integrations/shared/session-markers.cjs` |
| Create | `integrations/shared/__tests__/session-markers.test.cjs` |

## Interface / Signature

Contract (CommonJS; no TypeScript in this layer — signatures for implementation clarity):

```javascript
// Exports (module.exports = { ... }):
// acquireSessionLock(projectRoot: string): boolean
// releaseSessionLock(projectRoot: string): void
// writeSessionMarker(projectRoot: string, sessionId: string | null): void
// readSessionMarker(projectRoot: string): string
// clearSessionMarker(projectRoot: string): void
// isSessionAlreadyInjected(projectRoot: string, sessionId: string | null): boolean
```

Implementation requirements:

- **acquireSessionLock(projectRoot):** Ensure `path.join(projectRoot, ".aic")` exists via `fs.mkdirSync(..., { recursive: true, mode: 0o700 })`. Let lockPath = `path.join(projectRoot, ".aic", ".session-start-lock")`. Try `fs.openSync(lockPath, "wx")`, then `fs.closeSync(fd)`; return true. On catch (lock already exists or other error): let markerPath = `path.join(projectRoot, ".aic", ".session-context-injected")`; if `fs.existsSync(markerPath)` and `fs.readFileSync(markerPath, "utf8").trim().length > 0`, try `fs.unlinkSync(lockPath)` and catch ignore; return false. On any other error, return false.
- **releaseSessionLock(projectRoot):** lockPath = `path.join(projectRoot, ".aic", ".session-start-lock")`; try `fs.unlinkSync(lockPath)`; catch ignore.
- **writeSessionMarker(projectRoot, sessionId):** Ensure .aic exists (mkdirSync as above). markerPath = `path.join(projectRoot, ".aic", ".session-context-injected")`; `fs.writeFileSync(markerPath, sessionId ?? "", "utf8")`.
- **readSessionMarker(projectRoot):** markerPath = `path.join(projectRoot, ".aic", ".session-context-injected")`; if `fs.existsSync(markerPath)` return `fs.readFileSync(markerPath, "utf8").trim()`; else return "".
- **clearSessionMarker(projectRoot):** markerPath as above; try `fs.unlinkSync(markerPath)`; catch ignore.
- **isSessionAlreadyInjected(projectRoot, sessionId):** Return true only when sessionId != null and `readSessionMarker(projectRoot) === sessionId` (no need to double-check existsSync; readSessionMarker already returns "" when missing).

Use `const fs = require("fs")` and `const path = require("path")`. No other dependencies.

## Dependent Types

None — projectRoot and sessionId are plain strings in the integration layer. No types from shared/src/core.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Implement session-markers.cjs

Create `integrations/shared/session-markers.cjs` with SPDX and Copyright header matching `integrations/shared/prompt-log.cjs`. Implement the six functions exactly as specified in Interface / Signature. Use internal variables markerPath and lockPath derived from projectRoot so path construction lives in one place. Export all six via `module.exports = { acquireSessionLock, releaseSessionLock, writeSessionMarker, readSessionMarker, clearSessionMarker, isSessionAlreadyInjected }`.

**Verify:** File exists; `node -e "const m = require('./integrations/shared/session-markers.cjs'); console.log(Object.keys(m).sort().join(','))"` from repo root outputs the six names in alphabetical order.

### Step 2: Add session-markers.test.cjs

Create `integrations/shared/__tests__/session-markers.test.cjs`. Use a temporary directory as projectRoot: `fs.mkdtempSync(path.join(require("os").tmpdir(), "aic-session-markers-"))`. Tests: (1) acquire_release_roundtrip: acquireSessionLock returns true, releaseSessionLock runs, lock file no longer exists. (2) marker_write_read_clear: writeSessionMarker(projectRoot, "sid1"), readSessionMarker(projectRoot) === "sid1", clearSessionMarker(projectRoot), readSessionMarker(projectRoot) === "". (3) isSessionAlreadyInjected_true: after writeSessionMarker(projectRoot, "sid1"), isSessionAlreadyInjected(projectRoot, "sid1") === true. (4) isSessionAlreadyInjected_false: with no marker, isSessionAlreadyInjected(projectRoot, "sid1") === false; with marker "other", isSessionAlreadyInjected(projectRoot, "sid1") === false. (5) lock_blocks_second_caller: first acquireSessionLock returns true, second acquireSessionLock returns false; then releaseSessionLock. Clean up temp dir in afterEach or after all tests. Use require to load the module under test from the correct relative path (e.g. `require("../session-markers.cjs")`).

**Verify:** Run `node integrations/shared/__tests__/session-markers.test.cjs` or `pnpm test` with a pattern that includes this file; all tests pass.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| acquire_release_roundtrip | acquireSessionLock returns true; releaseSessionLock runs; lock file removed |
| lock_blocks_second_caller | First acquire true, second acquire false; releaseSessionLock |
| marker_write_read_clear | writeSessionMarker then readSessionMarker returns value; clearSessionMarker then readSessionMarker returns "" |
| isSessionAlreadyInjected_true | After writeSessionMarker(projectRoot, "sid1"), isSessionAlreadyInjected(projectRoot, "sid1") is true |
| isSessionAlreadyInjected_false | No marker or different sessionId yields false |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] All six functions implemented and exported with specified behavior
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports from adapters, storage, pipeline, or mcp
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
