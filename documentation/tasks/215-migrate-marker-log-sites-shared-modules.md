# Task 215: Migrate All Marker and Log Sites to Shared Modules

> **Status:** Pending
> **Phase:** AH (Session Lifecycle Markers Simplification)
> **Layer:** integrations
> **Depends on:** AH03 (Extract shared session-markers module), AH04 (Extract shared session-log append module)

## Goal

Replace local fs/path operations for session markers, lock, and session-log in seven integration hook files with calls to `integrations/shared/session-markers.cjs` and `integrations/shared/session-log.cjs` so all marker and log sites use the shared modules.

## Architecture Notes

- Refactoring task: no new interfaces or types; only Modify rows. Call sites switch to existing shared API.
- Path convention: `integrations/claude/hooks/` and `integrations/cursor/hooks/` use `require("../../shared/...")`; `integrations/claude/plugin/scripts/` uses `require("../../../shared/...")`.
- Session-markers API: `acquireSessionLock(projectRoot)`, `releaseSessionLock(projectRoot)`, `writeSessionMarker(projectRoot, sessionId)`, `readSessionMarker(projectRoot)`, `clearSessionMarker(projectRoot)`, `isSessionAlreadyInjected(projectRoot, sessionId)`.
- Session-log API: `appendSessionLog(projectRoot, entry)` with `entry` shape `{ session_id, reason, duration_ms, timestamp }`; shared module validates and writes JSONL.
- AH06 adds unit tests for session markers and session log; this task relies on regression (existing tests pass).

## Files

| Action | Path |
| ------ | ---- |
| Modify | `integrations/claude/hooks/aic-session-start.cjs` |
| Modify | `integrations/claude/plugin/scripts/aic-session-start.cjs` |
| Modify | `integrations/claude/hooks/aic-prompt-compile.cjs` |
| Modify | `integrations/claude/plugin/scripts/aic-prompt-compile.cjs` |
| Modify | `integrations/claude/hooks/aic-session-end.cjs` |
| Modify | `integrations/claude/plugin/scripts/aic-session-end.cjs` |
| Modify | `integrations/cursor/hooks/AIC-session-end.cjs` |

## Interface / Signature

Shared module API used by this task (no new code; callers use these exports):

**session-markers.cjs:**
- `acquireSessionLock(projectRoot)` → boolean
- `releaseSessionLock(projectRoot)` → void
- `writeSessionMarker(projectRoot, sessionId)` → void
- `readSessionMarker(projectRoot)` → string
- `clearSessionMarker(projectRoot)` → void
- `isSessionAlreadyInjected(projectRoot, sessionId)` → boolean

**session-log.cjs:**
- `appendSessionLog(projectRoot, entry)` → void; `entry`: `{ session_id: string, reason: string, duration_ms: number, timestamp: string }`

## Dependent Types

Not applicable — CommonJS hook files; projectRoot is string, entry is plain object. Shared modules already define and validate their contracts.

## Config Changes

- **package.json:** No change
- **eslint.config.mjs:** No change

## Steps

### Step 1: Migrate Claude hooks aic-session-start.cjs

In `integrations/claude/hooks/aic-session-start.cjs`: Add `const { acquireSessionLock, releaseSessionLock, writeSessionMarker } = require("../../shared/session-markers.cjs");`. Remove `aicDir`, `markerPath`, `lockPath` and all direct `fs.mkdirSync`/`fs.openSync`/`fs.readFileSync`/`fs.writeFileSync`/`fs.unlinkSync` for marker and lock. At start of lock logic call `if (!acquireSessionLock(projectRoot)) return null;`. After successful `callAicCompile` and before returning call `writeSessionMarker(projectRoot, sessionId)`. In a `finally` block call `releaseSessionLock(projectRoot)`. Remove the `path` require if it is no longer used; keep `fs` only if still used for stdin (`fs.readFileSync(0, "utf8")`).

**Verify:** File requires session-markers and calls acquireSessionLock, writeSessionMarker, releaseSessionLock; no local path to `.aic`, `.session-context-injected`, or `.session-start-lock`.

### Step 2: Migrate Claude plugin aic-session-start.cjs

In `integrations/claude/plugin/scripts/aic-session-start.cjs`: Apply the same migration as Step 1 but use `require("../../../shared/session-markers.cjs")`.

**Verify:** Same as Step 1; require path is `../../../shared/session-markers.cjs`.

### Step 3: Migrate Claude hooks aic-prompt-compile.cjs

In `integrations/claude/hooks/aic-prompt-compile.cjs`: Add `const { isSessionAlreadyInjected } = require("../../shared/session-markers.cjs");`. Replace the block that sets `INJECTED_MARKER`, `markerContent`, and `alreadyInjected` with `const alreadyInjected = isSessionAlreadyInjected(projectRoot, sessionId);`. Remove any `path.join(projectRoot, ".aic", ".session-context-injected")` and `fs.existsSync`/`fs.readFileSync` for the marker.

**Verify:** File uses isSessionAlreadyInjected(projectRoot, sessionId); no local marker path or fs read for marker.

### Step 4: Migrate Claude plugin aic-prompt-compile.cjs

In `integrations/claude/plugin/scripts/aic-prompt-compile.cjs`: Apply the same migration as Step 3 but use `require("../../../shared/session-markers.cjs")`.

**Verify:** Same as Step 3; require path is `../../../shared/session-markers.cjs`.

### Step 5: Migrate Claude hooks aic-session-end.cjs

In `integrations/claude/hooks/aic-session-end.cjs`: Add `const { clearSessionMarker, releaseSessionLock } = require("../../shared/session-markers.cjs");`. Remove `markerPath` and the two try/catch blocks that call `fs.unlinkSync(markerPath)` and `fs.unlinkSync(path.join(projectRoot, ".aic", ".session-start-lock"))`. Replace with `clearSessionMarker(projectRoot);` and `releaseSessionLock(projectRoot);` (no try/catch — shared module swallows errors). Keep `appendPromptLog`, temp path, and `fs.unlinkSync(tempPath)` unchanged. Remove `path` require if no longer used.

**Verify:** File calls clearSessionMarker(projectRoot) and releaseSessionLock(projectRoot); no local marker or lock path or fs.unlinkSync for them.

### Step 6: Migrate Claude plugin aic-session-end.cjs

In `integrations/claude/plugin/scripts/aic-session-end.cjs`: Apply the same migration as Step 5 but use `require("../../../shared/session-markers.cjs")`.

**Verify:** Same as Step 5; require path is `../../../shared/session-markers.cjs`.

### Step 7: Migrate Cursor AIC-session-end.cjs

In `integrations/cursor/hooks/AIC-session-end.cjs`: Add `const { appendSessionLog } = require("../../shared/session-log.cjs");`. Remove the local `appendSessionLog` function (the one that builds `aicDir`, `logPath`, and calls `fs.appendFileSync`). Where the script currently calls `appendSessionLog(projectRoot, sessionId, reason, durationMs)`, replace with `appendSessionLog(projectRoot, { session_id: sessionId, reason, duration_ms: durationMs, timestamp: new Date().toISOString() });`. Remove `path` require if no longer used; keep `fs` and `os` for `cleanupTempFiles` and stdin read.

**Verify:** File requires session-log and calls appendSessionLog(projectRoot, entry) with the four fields; no local session-log path or fs.appendFileSync for session-log.jsonl.

### Step 8: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

**Verify:** All four commands exit 0.

## Tests

| Test case | Description |
| --------- | ----------- |
| regression_integration | Existing integration and hook tests pass unchanged |
| lint_typecheck_knip | pnpm lint, pnpm typecheck, pnpm knip pass |

## Acceptance Criteria

- [ ] All seven files modified per Files table
- [ ] Each file uses the correct require path to shared session-markers or session-log
- [ ] No local path construction or fs calls for `.session-context-injected`, `.session-start-lock`, or session-log.jsonl in the seven files
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
