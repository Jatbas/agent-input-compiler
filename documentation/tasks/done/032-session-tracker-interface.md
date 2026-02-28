# Task 032: SessionTracker interface

> **Status:** Done
> **Phase:** 0.5 (Phase I — Live Wiring)
> **Layer:** core
> **Depends on:** 002-server-sessions migration (Done)

## Goal

Add the SessionTracker core interface and StopReason enum so that SqliteSessionStore (later task) can implement server lifecycle tracking in the server_sessions table.

## Architecture Notes

- ADR-007: session_id is UUIDv7 (TEXT). ADR-008: timestamps are ISOTimestamp (YYYY-MM-DDTHH:mm:ss.sssZ).
- Core interface only — no storage or adapter in this task. Implementation (SqliteSessionStore) is a separate task.
- SessionTracker for Phase 0.5 covers server lifecycle only (startSession, stopSession, backfillCrashedSessions). Phase 1+ agentic methods are out of scope.

## Files

| Action | Path                                                      |
| ------ | --------------------------------------------------------- |
| Create | `shared/src/core/interfaces/session-tracker.interface.ts` |
| Modify | `shared/src/core/types/enums.ts` (add STOP_REASON)        |

## Interface / Signature

```typescript
// Interface to create in shared/src/core/interfaces/session-tracker.interface.ts
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

No class in this task — interface only. SqliteSessionStore will implement this interface in a later task.

## Dependent Types

### Tier 0 — verbatim

None — this task defines the interface; it does not implement it.

### Tier 1 — signature + path

None.

### Tier 2 — path-only

| Type           | Path                                   | Factory                      |
| -------------- | -------------------------------------- | ---------------------------- |
| `SessionId`    | `shared/src/core/types/identifiers.ts` | `toSessionId(raw)`           |
| `ISOTimestamp` | `shared/src/core/types/identifiers.ts` | `toISOTimestamp(raw)`        |
| `StopReason`   | `shared/src/core/types/enums.ts`       | Add in this task (see Steps) |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add STOP_REASON to enums

In `shared/src/core/types/enums.ts`, add a new `as const` object and type after the last existing export (`RULES_FINDING_SEVERITY`):

```typescript
export const STOP_REASON = {
  GRACEFUL: "graceful",
  CRASH: "crash",
} as const;
export type StopReason = (typeof STOP_REASON)[keyof typeof STOP_REASON];
```

**Verify:** `shared/src/core/types/enums.ts` exports `STOP_REASON` and `StopReason`; typecheck passes.

### Step 2: Create SessionTracker interface (startSession, stopSession)

Create `shared/src/core/interfaces/session-tracker.interface.ts` with imports from identifiers and enums, and the SessionTracker interface containing startSession and stopSession with the signatures from the Interface / Signature section.

**Verify:** File exists with both methods; `pnpm typecheck` passes from repo root.

### Step 3: Add backfillCrashedSessions to SessionTracker

In `shared/src/core/interfaces/session-tracker.interface.ts`, add the third method: backfillCrashedSessions(stoppedAt: ISOTimestamp): void.

**Verify:** Interface has all three methods; `pnpm typecheck` passes.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------- |
| (none)    | Interface-only task. SessionTracker is verified by implementation tests in the SqliteSessionStore task. |

## Acceptance Criteria

- [ ] session-tracker.interface.ts created with SessionTracker interface (startSession, stopSession, backfillCrashedSessions)
- [ ] STOP_REASON and StopReason added to shared/src/core/types/enums.ts
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
