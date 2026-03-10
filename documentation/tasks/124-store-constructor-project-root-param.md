# Task 124: Store constructor projectRoot param

> **Status:** Pending
> **Phase:** W — Global Server & Per-Project Isolation
> **Layer:** storage + mcp (wiring)
> **Depends on:** W01 (Cross-platform path normalisation)

## Goal

Add `projectRoot: AbsolutePath` as the first constructor parameter to all nine per-project store classes and update every call site and test so that W05 can use it in SQL. No SQL or interface changes in this task.

## Architecture Notes

- ADR-010: Use branded type `AbsolutePath` from `core/types/paths.ts`; constructor param is `AbsolutePath`, not raw string.
- Storage layer: no new dependencies; stores receive `projectRoot` and store it as `private readonly projectRoot: AbsolutePath`.
- `SqliteSessionStore` is excluded — it operates on `server_sessions` (server-level), not per-project.
- projectRoot added as first parameter so all 9 stores have consistent shape and W05 can use `this.projectRoot` in queries.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `shared/src/storage/sqlite-cache-store.ts` (add projectRoot param) |
| Modify | `shared/src/storage/sqlite-telemetry-store.ts` (add projectRoot param) |
| Modify | `shared/src/storage/sqlite-config-store.ts` (add projectRoot param) |
| Modify | `shared/src/storage/sqlite-guard-store.ts` (add projectRoot param) |
| Modify | `shared/src/storage/sqlite-compilation-log-store.ts` (add projectRoot param) |
| Modify | `shared/src/storage/sqlite-file-transform-store.ts` (add projectRoot param) |
| Modify | `shared/src/storage/sqlite-agentic-session-store.ts` (add projectRoot param) |
| Modify | `shared/src/storage/sqlite-tool-invocation-log-store.ts` (add projectRoot param) |
| Modify | `shared/src/storage/sqlite-status-store.ts` (add projectRoot param) |
| Modify | `shared/src/storage/create-project-scope.ts` (pass projectRoot to 6 store constructors) |
| Modify | `mcp/src/server.ts` (pass scope.projectRoot to ToolInvocationLogStore, AgenticSessionStore, StatusStore) |
| Modify | `shared/src/storage/__tests__/sqlite-cache-store.test.ts` (pass test projectRoot) |
| Modify | `shared/src/storage/__tests__/sqlite-telemetry-store.test.ts` (pass test projectRoot) |
| Modify | `shared/src/storage/__tests__/sqlite-config-store.test.ts` (pass test projectRoot) |
| Modify | `shared/src/storage/__tests__/sqlite-guard-store.test.ts` (pass test projectRoot) |
| Modify | `shared/src/storage/__tests__/sqlite-compilation-log-store.test.ts` (pass test projectRoot) |
| Modify | `shared/src/storage/__tests__/sqlite-file-transform-store.test.ts` (pass test projectRoot) |
| Modify | `shared/src/storage/__tests__/sqlite-agentic-session-store.test.ts` (pass test projectRoot) |
| Modify | `shared/src/storage/__tests__/sqlite-tool-invocation-log-store.test.ts` (pass test projectRoot) |
| Modify | `shared/src/storage/__tests__/sqlite-status-store.test.ts` (pass test projectRoot) |

## Interface / Signature

Store interfaces (CacheStore, TelemetryStore, ConfigStore, GuardStore, CompilationLogStore, FileTransformStore, AgenticSessionState, ToolInvocationLogStore, StatusStore) do not declare constructors. Only the concrete class constructors change.

Each of the 9 store classes gains the same new first parameter and field:

```typescript
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";

// In constructor: add as first parameter, store as private readonly
constructor(
  private readonly projectRoot: AbsolutePath,
  // ... existing params unchanged (db, clock, cacheDir, idGenerator as applicable)
) {}
```

Exact constructor signatures after change:

| Store | New constructor signature |
| ----- | ------------------------- |
| SqliteCacheStore | `(projectRoot: AbsolutePath, db: ExecutableDb, cacheDir: AbsolutePath, clock: Clock)` |
| SqliteTelemetryStore | `(projectRoot: AbsolutePath, db: ExecutableDb)` |
| SqliteConfigStore | `(projectRoot: AbsolutePath, db: ExecutableDb, clock: Clock)` |
| SqliteGuardStore | `(projectRoot: AbsolutePath, db: ExecutableDb, idGenerator: IdGenerator, clock: Clock)` |
| SqliteCompilationLogStore | `(projectRoot: AbsolutePath, db: ExecutableDb)` |
| SqliteFileTransformStore | `(projectRoot: AbsolutePath, db: ExecutableDb, clock: Clock)` |
| SqliteAgenticSessionStore | `(projectRoot: AbsolutePath, db: ExecutableDb)` |
| SqliteToolInvocationLogStore | `(projectRoot: AbsolutePath, db: ExecutableDb)` |
| SqliteStatusStore | `(projectRoot: AbsolutePath, db: ExecutableDb, clock: Clock)` |

## Dependent Types

### Tier 2 — path-only

| Type | Path | Factory |
| ---- | ---- | ------- |
| AbsolutePath | shared/src/core/types/paths.ts | toAbsolutePath(raw) |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: SqliteCacheStore

In `shared/src/storage/sqlite-cache-store.ts`: add `projectRoot: AbsolutePath` as the first constructor parameter and `private readonly projectRoot: AbsolutePath` (ensure `AbsolutePath` is imported from `@jatbas/aic-core/core/types/paths.js`). In `shared/src/storage/__tests__/sqlite-cache-store.test.ts`: in the place where `SqliteCacheStore` is constructed, pass `toAbsolutePath("/test/project")` as the first argument.

**Verify:** `pnpm typecheck` passes; `pnpm test -- shared/src/storage/__tests__/sqlite-cache-store.test.ts` passes.

### Step 2: SqliteTelemetryStore

In `shared/src/storage/sqlite-telemetry-store.ts`: add `projectRoot: AbsolutePath` as the first constructor parameter and `private readonly projectRoot: AbsolutePath` (add import for `AbsolutePath` from `@jatbas/aic-core/core/types/paths.js`). In `shared/src/storage/__tests__/sqlite-telemetry-store.test.ts`: pass `toAbsolutePath("/test/project")` as the first argument to the store constructor.

**Verify:** `pnpm typecheck` passes; `pnpm test -- shared/src/storage/__tests__/sqlite-telemetry-store.test.ts` passes.

### Step 3: SqliteConfigStore

In `shared/src/storage/sqlite-config-store.ts`: add `projectRoot: AbsolutePath` as the first constructor parameter and `private readonly projectRoot: AbsolutePath` (add import for `AbsolutePath` from `@jatbas/aic-core/core/types/paths.js`). In `shared/src/storage/__tests__/sqlite-config-store.test.ts`: pass `toAbsolutePath("/test/project")` as the first argument to the store constructor.

**Verify:** `pnpm typecheck` passes; `pnpm test -- shared/src/storage/__tests__/sqlite-config-store.test.ts` passes.

### Step 4: SqliteGuardStore

In `shared/src/storage/sqlite-guard-store.ts`: add `projectRoot: AbsolutePath` as the first constructor parameter and `private readonly projectRoot: AbsolutePath` (add import for `AbsolutePath` from `@jatbas/aic-core/core/types/paths.js`). In `shared/src/storage/__tests__/sqlite-guard-store.test.ts`: pass `toAbsolutePath("/test/project")` as the first argument to the store constructor.

**Verify:** `pnpm typecheck` passes; `pnpm test -- shared/src/storage/__tests__/sqlite-guard-store.test.ts` passes.

### Step 5: SqliteCompilationLogStore

In `shared/src/storage/sqlite-compilation-log-store.ts`: add `projectRoot: AbsolutePath` as the first constructor parameter and `private readonly projectRoot: AbsolutePath` (add import for `AbsolutePath` from `@jatbas/aic-core/core/types/paths.js`). In `shared/src/storage/__tests__/sqlite-compilation-log-store.test.ts`: pass `toAbsolutePath("/test/project")` as the first argument to the store constructor.

**Verify:** `pnpm typecheck` passes; `pnpm test -- shared/src/storage/__tests__/sqlite-compilation-log-store.test.ts` passes.

### Step 6: SqliteFileTransformStore

In `shared/src/storage/sqlite-file-transform-store.ts`: add `projectRoot: AbsolutePath` as the first constructor parameter and `private readonly projectRoot: AbsolutePath` (add import for `AbsolutePath` from `@jatbas/aic-core/core/types/paths.js`). In `shared/src/storage/__tests__/sqlite-file-transform-store.test.ts`: pass `toAbsolutePath("/test/project")` as the first argument to the store constructor.

**Verify:** `pnpm typecheck` passes; `pnpm test -- shared/src/storage/__tests__/sqlite-file-transform-store.test.ts` passes.

### Step 7: SqliteAgenticSessionStore

In `shared/src/storage/sqlite-agentic-session-store.ts`: add `projectRoot: AbsolutePath` as the first constructor parameter and `private readonly projectRoot: AbsolutePath` (add import for `AbsolutePath` from `@jatbas/aic-core/core/types/paths.js`). In `shared/src/storage/__tests__/sqlite-agentic-session-store.test.ts`: pass `toAbsolutePath("/test/project")` as the first argument to the store constructor.

**Verify:** `pnpm typecheck` passes; `pnpm test -- shared/src/storage/__tests__/sqlite-agentic-session-store.test.ts` passes.

### Step 8: SqliteToolInvocationLogStore

In `shared/src/storage/sqlite-tool-invocation-log-store.ts`: add `projectRoot: AbsolutePath` as the first constructor parameter and `private readonly projectRoot: AbsolutePath` (add import for `AbsolutePath` from `@jatbas/aic-core/core/types/paths.js`). In `shared/src/storage/__tests__/sqlite-tool-invocation-log-store.test.ts`: pass `toAbsolutePath("/test/project")` as the first argument to the store constructor.

**Verify:** `pnpm typecheck` passes; `pnpm test -- shared/src/storage/__tests__/sqlite-tool-invocation-log-store.test.ts` passes.

### Step 9: SqliteStatusStore

In `shared/src/storage/sqlite-status-store.ts`: add `projectRoot: AbsolutePath` as the first constructor parameter and `private readonly projectRoot: AbsolutePath` (add import for `AbsolutePath` from `@jatbas/aic-core/core/types/paths.js`). In `shared/src/storage/__tests__/sqlite-status-store.test.ts`: pass `toAbsolutePath("/test/project")` as the first argument to the store constructor.

**Verify:** `pnpm typecheck` passes; `pnpm test -- shared/src/storage/__tests__/sqlite-status-store.test.ts` passes.

### Step 10: create-project-scope.ts wiring

In `shared/src/storage/create-project-scope.ts`: pass `projectRoot` as the first argument to each of these store constructors: `SqliteCacheStore`, `SqliteTelemetryStore`, `SqliteConfigStore`, `SqliteGuardStore`, `SqliteCompilationLogStore`, `SqliteFileTransformStore`. Do not change the `SqliteSessionStore` constructor call (it remains `new SqliteSessionStore(db)`).

**Verify:** `pnpm typecheck` passes.

### Step 11: mcp/src/server.ts wiring

In `mcp/src/server.ts`: at the call site for `SqliteToolInvocationLogStore`, add `scope.projectRoot` as the first argument (so the call becomes `new SqliteToolInvocationLogStore(scope.projectRoot, scope.db)`). At the call site for `SqliteAgenticSessionStore`, add `scope.projectRoot` as the first argument. At all three call sites for `SqliteStatusStore`, add `scope.projectRoot` as the first argument (so each becomes `new SqliteStatusStore(scope.projectRoot, scope.db, scope.clock)`).

**Verify:** `pnpm typecheck` passes.

### Step 12: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| sqlite-cache-store | Existing tests pass with projectRoot passed to constructor |
| sqlite-telemetry-store | Existing tests pass with projectRoot passed to constructor |
| sqlite-config-store | Existing tests pass with projectRoot passed to constructor |
| sqlite-guard-store | Existing tests pass with projectRoot passed to constructor |
| sqlite-compilation-log-store | Existing tests pass with projectRoot passed to constructor |
| sqlite-file-transform-store | Existing tests pass with projectRoot passed to constructor |
| sqlite-agentic-session-store | Existing tests pass with projectRoot passed to constructor |
| sqlite-tool-invocation-log-store | Existing tests pass with projectRoot passed to constructor |
| sqlite-status-store | Existing tests pass with projectRoot passed to constructor |

## Acceptance Criteria

- [ ] All files modified per Files table
- [ ] Each of the 9 store constructors has projectRoot as first parameter with type AbsolutePath
- [ ] create-project-scope passes projectRoot to the 6 per-project stores; SqliteSessionStore unchanged
- [ ] server.ts passes scope.projectRoot to SqliteToolInvocationLogStore, SqliteAgenticSessionStore, and SqliteStatusStore (all three StatusStore call sites)
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
