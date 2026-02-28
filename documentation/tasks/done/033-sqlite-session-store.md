# Task 033: SqliteSessionStore

> **Status:** Done
> **Phase:** 0.5 — Quality Release (Phase I — Live Wiring)
> **Layer:** storage
> **Depends on:** SessionTracker interface, 002-server-sessions migration

## Goal

Implement the SessionTracker interface in storage so server sessions are persisted in the server_sessions table; MCP startup and shutdown can record and backfill sessions.

## Architecture Notes

- ADR-007: session_id is TEXT (UUIDv7 from caller). ADR-008: started_at/stopped_at are ISOTimestamp strings.
- Storage receives db via constructor only; no node:fs/node:path. All SQL in this file.
- Constructor: db only — sessionId and timestamps are supplied by the caller (composition root / hooks). No Clock or IdGenerator.

## Files

| Action | Path                                                        |
| ------ | ----------------------------------------------------------- |
| Create | `shared/src/storage/sqlite-session-store.ts`                |
| Create | `shared/src/storage/__tests__/sqlite-session-store.test.ts` |

## Interface / Signature

```typescript
import type { SessionId, ISOTimestamp } from "#core/types/identifiers.js";
import type { StopReason } from "#core/types/enums.js";

export interface SessionTracker {
  startSession(
    sessionId: SessionId,
    startedAt: ISOTimestamp,
    pid: number,
    version: string,
  ): void;
  stopSession(
    sessionId: SessionId,
    stoppedAt: ISOTimestamp,
    stopReason: StopReason,
  ): void;
  backfillCrashedSessions(stoppedAt: ISOTimestamp): void;
}
```

```typescript
import type { ExecutableDb } from "#core/interfaces/executable-db.interface.js";
import type { SessionTracker } from "#core/interfaces/session-tracker.interface.js";
import type { SessionId, ISOTimestamp } from "#core/types/identifiers.js";
import type { StopReason } from "#core/types/enums.js";

export class SqliteSessionStore implements SessionTracker {
  constructor(private readonly db: ExecutableDb) {}

  startSession(
    sessionId: SessionId,
    startedAt: ISOTimestamp,
    pid: number,
    version: string,
  ): void {}

  stopSession(
    sessionId: SessionId,
    stoppedAt: ISOTimestamp,
    stopReason: StopReason,
  ): void {}

  backfillCrashedSessions(stoppedAt: ISOTimestamp): void {}
}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
export interface ExecutableDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...args: unknown[]): void;
    all(...args: unknown[]): unknown[];
  };
}
```

Source: `shared/src/core/interfaces/executable-db.interface.ts`

### Tier 1 — signature + path

(No Tier 1 — store does not pass through interfaces it does not consume.)

### Tier 2 — path-only

| Type           | Path                                   | Factory                                      |
| -------------- | -------------------------------------- | -------------------------------------------- |
| `SessionId`    | `shared/src/core/types/identifiers.ts` | `toSessionId(raw)`                           |
| `ISOTimestamp` | `shared/src/core/types/identifiers.ts` | `toISOTimestamp(raw)`                        |
| `StopReason`   | `shared/src/core/types/enums.ts`       | `STOP_REASON.GRACEFUL` / `STOP_REASON.CRASH` |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create store and startSession

Create `shared/src/storage/sqlite-session-store.ts`. Implement the class with constructor `(private readonly db: ExecutableDb)`. Implement `startSession`: call `this.db.prepare("INSERT INTO server_sessions (session_id, started_at, stopped_at, stop_reason, pid, version) VALUES (?, ?, ?, ?, ?, ?)").run(sessionId, startedAt, null, null, pid, version)`. Add imports for SessionTracker, ExecutableDb, SessionId, ISOTimestamp, StopReason, and STOP_REASON from enums.

**Verify:** File exists; `startSession` runs without throw when given valid args and a DB with server_sessions table.

### Step 2: stopSession and backfillCrashedSessions

In the same file, implement `stopSession`: call `this.db.prepare("UPDATE server_sessions SET stopped_at = ?, stop_reason = ? WHERE session_id = ?").run(stoppedAt, stopReason, sessionId)`. Implement `backfillCrashedSessions`: call `this.db.prepare("UPDATE server_sessions SET stopped_at = ?, stop_reason = ? WHERE stopped_at IS NULL").run(stoppedAt, STOP_REASON.CRASH)`.

**Verify:** Both methods use bound parameters only; no string interpolation in SQL.

### Step 3: Tests

Create `shared/src/storage/__tests__/sqlite-session-store.test.ts`. Use in-memory Database (`:memory:`), run migration 001 and migration 002 up(db), then instantiate SqliteSessionStore(db). Add tests: (1) startSession_persists_row — call startSession with toSessionId/toISOTimestamp and fixed pid/version, then query server_sessions and assert one row with expected column values. (2) stopSession_updates_row — after startSession, call stopSession with same sessionId and stoppedAt/stopReason; assert row has stopped_at and stop_reason set. (3) backfillCrashedSessions_marks_open_sessions — insert two rows directly (one with stopped_at NULL, one with stopped_at set), call backfillCrashedSessions(stoppedAt), assert only the open row has stop_reason 'crash' and stopped_at set. (4) empty_backfill_no_op — call backfillCrashedSessions when no rows have stopped_at NULL; assert row count unchanged. (5) duplicate_startSession_throws — call startSession twice with the same sessionId; assert the second call throws.

**Verify:** `pnpm test shared/src/storage/__tests__/sqlite-session-store.test.ts` passes.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                   | Description                                                          |
| ------------------------------------------- | -------------------------------------------------------------------- |
| startSession_persists_row                   | One row in server_sessions after startSession with expected columns. |
| stopSession_updates_row                     | Row has stopped_at and stop_reason after stopSession.                |
| backfillCrashedSessions_marks_open_sessions | Orphaned rows get stopped_at and stop_reason 'crash'.                |
| empty_backfill_no_op                        | backfillCrashedSessions with no open rows leaves table unchanged.    |
| duplicate_startSession_throws               | Second startSession with same sessionId throws.                      |

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
