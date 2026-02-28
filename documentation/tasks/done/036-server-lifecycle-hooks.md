# Task 036: Server lifecycle hooks

> **Status:** Done
> **Phase:** 0.5 — Quality Release (Phase I — Live Wiring)
> **Layer:** mcp (composition root)
> **Depends on:** SessionTracker interface [Done], SqliteSessionStore [Done], Startup self-check (integrity) [Done]

## Goal

Register SIGINT and SIGTERM shutdown handlers so that when the MCP server process exits normally, the current server session is recorded as stopped with `stop_reason = 'graceful'` instead of being backfilled as a crash on next startup.

## Architecture Notes

- MVP spec §8b step 10: "Register shutdown handler (SIGINT / SIGTERM) — On signal: update server_sessions.stopped_at + stop_reason = 'graceful'".
- No new interface; we call existing `SessionTracker.stopSession(sessionId, stoppedAt, stopReason)`. All session state and DB updates already exist in `SqliteSessionStore`.
- `registerShutdownHandler` is a plain function in `mcp/src/server.ts` — same pattern as other composition-root helpers. It uses Node.js `process.on` and `process.exit`, which are allowed in the MCP composition root for process lifecycle (aic-mcp.mdc).
- Return value of `registerShutdownHandler` is the handler function so tests can invoke it and remove listeners for cleanup; production code ignores the return value.
- Guard flag (`let exited = false`) in the handler is the sole allowed exception for `let` in production code (boolean control flag to prevent double run when both SIGINT and SIGTERM fire).

## Files

| Action | Path                                                                                  |
| ------ | ------------------------------------------------------------------------------------- |
| Modify | `mcp/src/server.ts` (add registerShutdownHandler, wire after backfillCrashedSessions) |
| Modify | `mcp/src/__tests__/server.test.ts` (add shutdown handler test)                        |

## Interface / Signature

```typescript
// SessionTracker (existing — we call stopSession)
import type { SessionId, ISOTimestamp } from "#core/types/identifiers.js";
import type { StopReason } from "#core/types/enums.js";

export interface SessionTracker {
  startSession(
    sessionId: SessionId,
    startedAt: ISOTimestamp,
    pid: number,
    version: string,
    installationOk: boolean,
    installationNotes: string,
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
// mcp/src/server.ts — new export
import type { SessionTracker } from "@aic/shared/core/interfaces/session-tracker.interface.js";
import type { Clock } from "@aic/shared/core/interfaces/clock.interface.js";
import type { SessionId } from "@aic/shared/core/types/identifiers.js";
import { STOP_REASON } from "@aic/shared/core/types/enums.js";

export function registerShutdownHandler(
  sessionTracker: SessionTracker,
  sessionId: SessionId,
  clock: Clock,
): () => void;
```

## Dependent Types

### Tier 1 — signature + path

| Type           | Path                                            | Members / purpose            |
| -------------- | ----------------------------------------------- | ---------------------------- |
| `SessionId`    | `shared/src/core/types/identifiers.ts`          | factory: `toSessionId(uuid)` |
| `ISOTimestamp` | `shared/src/core/types/identifiers.ts`          | from `clock.now()`           |
| `StopReason`   | `shared/src/core/types/enums.ts`                | use `STOP_REASON.GRACEFUL`   |
| `Clock`        | `shared/src/core/interfaces/clock.interface.ts` | `now(): ISOTimestamp`        |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change. MCP composition root already allows Node.js `process` for lifecycle.

## Steps

### Step 1: Add registerShutdownHandler and wire in createMcpServer

In `mcp/src/server.ts`, add imports: `SessionTracker` from `@aic/shared/core/interfaces/session-tracker.interface.js`, `Clock` from `@aic/shared/core/interfaces/clock.interface.js`, `SessionId` from `@aic/shared/core/types/identifiers.js`, and `STOP_REASON` from `@aic/shared/core/types/enums.js`.

Implement and export function `registerShutdownHandler(sessionTracker: SessionTracker, sessionId: SessionId, clock: Clock): () => void`.

Implementation:

1. Declare a variable `let exited = false` (control flag — only exception to no-let rule).
2. Define `const handler = (): void => { if (exited) return; exited = true; sessionTracker.stopSession(sessionId, clock.now(), STOP_REASON.GRACEFUL); process.exit(0); }`.
3. Call `process.on("SIGINT", handler)` and `process.on("SIGTERM", handler)`.
4. Return `handler` (so tests can invoke it and call `process.off("SIGINT", handler); process.off("SIGTERM", handler)` for cleanup).

In `createMcpServer`, after the line `scope.sessionTracker.backfillCrashedSessions(startedAt);`, add:

```typescript
registerShutdownHandler(scope.sessionTracker, sessionId, scope.clock);
```

Do not capture or use the return value in production.

**Verify:** `pnpm typecheck` passes. `npx eslint mcp/src/server.ts` — zero errors.

### Step 2: Test shutdown handler

In `mcp/src/__tests__/server.test.ts`, add a test named `shutdown_handler_calls_stopSession_with_graceful`.

Test steps:

1. Create a mock `SessionTracker` with `vi.fn()` for `stopSession`; stub `startSession` and `backfillCrashedSessions` with `vi.fn()` so the mock is complete.
2. Create a mock `Clock` that returns the fixed string `"2026-02-28T12:00:00.000Z"` for `now()`.
3. Obtain a `sessionId` by calling `toSessionId("019504a0-0000-7000-8000-000000000000")`.
4. Import `registerShutdownHandler` from `../server.js`, `toSessionId` from `@aic/shared/core/types/identifiers.js`, and `STOP_REASON` from `@aic/shared/core/types/enums.js`. Call `const handler = registerShutdownHandler(mockSessionTracker, sessionId, mockClock)`.
5. Spy on `process.exit` with `vi.spyOn(process, "exit").mockImplementation(() => {})` so the test does not exit.
6. Invoke `handler()`.
7. Assert `mockSessionTracker.stopSession` was called exactly once with `(sessionId, mockClock.now(), STOP_REASON.GRACEFUL)` (or equivalent: first arg sessionId, second arg the same string as `mockClock.now()`, third arg `"graceful"` or `STOP_REASON.GRACEFUL`).
8. Restore `process.exit` with `mockRestore()`. Remove the registered listeners: `process.off("SIGINT", handler); process.off("SIGTERM", handler)` so other tests are not affected.

**Verify:** `pnpm vitest run mcp/src/__tests__/server.test.ts` — all tests pass including the new one.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                        | Description                                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| shutdown_handler_calls_stopSession_with_graceful | registerShutdownHandler’s returned handler calls stopSession(sessionId, clock.now(), STOP_REASON.GRACEFUL) and process.exit(0) is mocked so the test does not exit |

## Acceptance Criteria

- [ ] registerShutdownHandler is implemented and exported from server.ts
- [ ] createMcpServer calls registerShutdownHandler(scope.sessionTracker, sessionId, scope.clock) after backfillCrashedSessions
- [ ] On SIGINT or SIGTERM, the handler calls stopSession with GRACEFUL and then process.exit(0)
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] Only one `let` in the new code (the exited guard flag)
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
