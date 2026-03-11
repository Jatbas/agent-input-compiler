# Task 141: Bounded runnerCache with watcher cleanup

> **Status:** Pending
> **Phase:** Phase 1.5 — Performance Optimizations (Phase Z — Memory Bounds)
> **Layer:** mcp
> **Depends on:** None (P09 is independent)

## Goal

Cap the `runnerCache` in `mcp/src/server.ts` at 10 entries with LRU eviction and ensure each cached runner's `WatchingRepoMapSupplier` (file watcher) is closed on eviction and on server shutdown so OS file handles are released and memory stays bounded.

## Architecture Notes

- Composition root modification only — all changes in `mcp/src/server.ts` and `mcp/src/__tests__/server.test.ts`. No shared interface or bootstrap signature changes.
- Use existing `createPipelineDeps` (returns `PipelineDepsWithoutRepoMap`) in `getRunner` instead of `createFullPipelineDeps`; build `WatchingRepoMapSupplier(FileSystemRepoMapSupplier(FastGlobAdapter(), IgnoreAdapter()), IgnoreAdapter())` manually and store it alongside the runner for lifecycle control.
- `registerShutdownHandler` gains an optional 5th parameter (runner cache); when present, handler iterates cache and calls `closeable.close()` before existing purgeExpired/stopSession. Backward compatible.
- Phase 1.5 Measurement note: after implementation, measure compilation latency (`aic://last` durationMs) and server RSS after 10 consecutive compilations; add an entry to the Daily Log in `documentation/mvp-progress.md`.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `mcp/src/server.ts` (runnerCache type and creation order; registerShutdownHandler 5th param; getRunner implementation) |
| Modify | `mcp/src/__tests__/server.test.ts` (shutdown_handler_closes_runner_cache_entries; getRunner_evicts_oldest_and_closes_when_at_capacity) |

## Wiring Specification (changes)

**registerShutdownHandler** — add optional 5th parameter; when provided, close all cache entries before existing logic:

```typescript
export function registerShutdownHandler(
  sessionTracker: SessionTracker,
  sessionId: SessionId,
  clock: Clock,
  cacheStore: CacheStore,
  runnerCache?: Map<string, { runner: CompilationRunner; closeable: Closeable }>,
): () => void {
  let exited = false;
  const handler = (): void => {
    if (exited) return;
    exited = true;
    try {
      if (runnerCache !== undefined) {
        for (const entry of runnerCache.values()) {
          entry.closeable.close();
        }
      }
      cacheStore.purgeExpired();
      sessionTracker.stopSession(sessionId, clock.now(), STOP_REASON.GRACEFUL);
    } catch {
      // Storage may already be closed (e.g. test teardown); exit anyway.
    }
    process.exit(0);
  };
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
  return handler;
}
```

**runnerCache and getRunner** — cache type and creation order; getRunner builds deps with createPipelineDeps + manual repo map supplier; LRU eviction at 10:

- `runnerCache`: type `Map<string, { runner: CompilationRunner; closeable: WatchingRepoMapSupplier }>`, created empty immediately after `startupScope.sessionTracker.backfillCrashedSessions(startedAt)` and before `registerShutdownHandler(...)` so it can be passed as the 5th argument.
- In `getRunner`: on cache hit return `cached.runner`. On cache miss: call `createPipelineDeps(scopeFileContentReader, scopeRulePackProvider, scopeBudgetConfig, additionalProviders, scopeHeuristicConfig)` to get `partial`; then `const ignoreAdapter = new IgnoreAdapter()`, `const inner = new FileSystemRepoMapSupplier(new FastGlobAdapter(), ignoreAdapter)`, `const repoMapSupplier = new WatchingRepoMapSupplier(inner, ignoreAdapter)`; `const scopeDeps = { ...partial, repoMapSupplier }`; create runner with `new CompilationRunnerImpl(scopeDeps, scope.clock, scope.cacheStore, scope.configStore, sha256Adapter, scope.guardStore, scope.compilationLogStore, scope.idGenerator, new SqliteAgenticSessionStore(scope.projectId, scope.db))`. Before `runnerCache.set(key, ...)`: if `runnerCache.size >= 10`, get first key with `runnerCache.keys().next().value`, if defined get entry, `runnerCache.delete(firstKey)`, call `entry.closeable.close()`. Then `runnerCache.set(key, { runner, closeable: repoMapSupplier })`. Return `runner`.

**Imports to add in server.ts:** `createPipelineDeps` from `@jatbas/aic-core/bootstrap/create-pipeline-deps.js`; `FileSystemRepoMapSupplier` from `@jatbas/aic-core/adapters/file-system-repo-map-supplier.js`; `WatchingRepoMapSupplier` from `@jatbas/aic-core/adapters/watching-repo-map-supplier.js`; `FastGlobAdapter` from `@jatbas/aic-core/adapters/fast-glob-adapter.js`; `IgnoreAdapter` from `@jatbas/aic-core/adapters/ignore-adapter.js`; `Closeable` from `@jatbas/aic-core/core/interfaces/closeable.interface.js`. Keep `createFullPipelineDeps` for the initial `deps` used by `InspectRunner` (unchanged).

## Dependent Types

### Tier 0 — verbatim

Not applicable — no new types; existing `CompilationRunner`, `ProjectScope`, `Closeable` already used or imported in server.

### Tier 1 — signature + path

| Type | Path | Members | Purpose |
| ---- | ---- | ------- | ------- |
| `PipelineDepsWithoutRepoMap` | `shared/src/bootstrap/create-pipeline-deps.ts` | same as PipelineStepsDeps minus repoMapSupplier | return of createPipelineDeps; spread with repoMapSupplier to form PipelineStepsDeps |

### Tier 2 — path-only

| Type | Path | Factory |
| ---- | ---- | ------- |
| `Closeable` | `shared/src/core/interfaces/closeable.interface.ts` | interface with close(): void |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add imports and create runnerCache before registerShutdownHandler

In `mcp/src/server.ts`: Add named imports for `createPipelineDeps` (from bootstrap/create-pipeline-deps), `FileSystemRepoMapSupplier`, `WatchingRepoMapSupplier`, `FastGlobAdapter`, `IgnoreAdapter`, and `Closeable` from the paths given in Wiring Specification. Do not remove `createFullPipelineDeps` (still used for the initial deps passed to InspectRunner). Immediately after `startupScope.sessionTracker.backfillCrashedSessions(startedAt);`, add creation of `runnerCache` as an empty `Map<string, { runner: CompilationRunner; closeable: WatchingRepoMapSupplier }>()`. Pass `runnerCache` as the 5th argument to the existing `registerShutdownHandler(...)` call.

**Verify:** File parses; `runnerCache` is in scope for the subsequent `registerShutdownHandler` call and for the later `getRunner` definition.

### Step 2: Extend registerShutdownHandler with optional 5th param and close-all loop

In `mcp/src/server.ts`: Update `registerShutdownHandler` signature to add optional 5th parameter `runnerCache?: Map<string, { runner: CompilationRunner; closeable: Closeable }>`. In the handler body, before `cacheStore.purgeExpired();`, add: when `runnerCache !== undefined`, iterate `runnerCache.values()` and for each entry call `entry.closeable.close()`.

**Verify:** Existing test that calls `registerShutdownHandler` with 4 args still passes. No behavioural change when 5th arg is omitted.

### Step 3: Refactor getRunner to use createPipelineDeps, manual repo map, LRU eviction, store { runner, closeable }

In `mcp/src/server.ts`: Change the type of the cache to `Map<string, { runner: CompilationRunner; closeable: WatchingRepoMapSupplier }>`. In `getRunner`: on cache hit return `cached.runner`. On cache miss: replace the `createFullPipelineDeps(...)` call with `createPipelineDeps(scopeFileContentReader, scopeRulePackProvider, scopeBudgetConfig, additionalProviders, scopeHeuristicConfig)` assigned to `partial`. Then create `ignoreAdapter = new IgnoreAdapter()`, `inner = new FileSystemRepoMapSupplier(new FastGlobAdapter(), ignoreAdapter)`, `repoMapSupplier = new WatchingRepoMapSupplier(inner, ignoreAdapter)`. Set `scopeDeps = { ...partial, repoMapSupplier }`. Keep the existing `new CompilationRunnerImpl(scopeDeps, ...)` call unchanged. Before `runnerCache.set(key, ...)`: if `runnerCache.size >= 10`, compute `firstKey = runnerCache.keys().next().value`; if `firstKey !== undefined`, get `evicted = runnerCache.get(firstKey)`, call `runnerCache.delete(firstKey)`, then call `evicted?.closeable.close()`. Then `runnerCache.set(key, { runner, closeable: repoMapSupplier })`. Return `runner`.

**Verify:** `pnpm typecheck` passes. Manual smoke: start server, trigger two distinct project roots (two temp dirs), confirm compilations succeed.

### Step 4: Add tests for eviction and shutdown closing cache entries

In `mcp/src/__tests__/server.test.ts`: Add test `shutdown_handler_closes_runner_cache_entries`: create a Map with one entry `{ runner: mockRunner, closeable: { close: vi.fn() } }`, call `registerShutdownHandler(mockSessionTracker, sessionId, mockClock, mockCacheStore, cache)`, invoke the returned handler, assert the mock `close` was called once. Remove the SIGINT/SIGTERM listeners after the test (same pattern as existing shutdown test). Add test `getRunner_evicts_oldest_and_closes_when_at_capacity`: create server with a temp dir; obtain 10 runners for 10 distinct project roots (10 temp dirs via registry.getOrCreate), then obtain an 11th runner for an 11th project root; spy on `WatchingRepoMapSupplier.prototype.close`; assert it was called at least once (eviction of the oldest entry) and that the cache has 10 entries. Use the same server/registry pattern as existing tests to get getRunner and scopes.

**Verify:** `pnpm test mcp/src/__tests__/server.test.ts` passes including the two new tests.

### Step 5: Measurement and final verification

Run 10 consecutive `aic_compile` invocations against the MCP server. Record `aic://last` resource `durationMs` from the last compilation and `process.memoryUsage().rss` after the 10th. Add one entry to the Daily Log section in `documentation/mvp-progress.md` with the task number (141), component name (P09 Bounded runnerCache), and the recorded durationMs and RSS values.

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

**Verify:** All pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| shutdown_handler_closes_runner_cache_entries | When registerShutdownHandler is called with 5th param a Map containing one entry with a mock closeable, invoking the handler calls closeable.close() once. |
| getRunner_evicts_oldest_and_closes_when_at_capacity | When cache already has 10 entries and getRunner is called for an 11th project root, the oldest entry is evicted, its closeable.close() is called, and the cache size remains 10. |

## Acceptance Criteria

- [ ] runnerCache is typed as Map<string, { runner: CompilationRunner; closeable: WatchingRepoMapSupplier }> and created before registerShutdownHandler; passed as 5th argument to registerShutdownHandler.
- [ ] registerShutdownHandler has optional 5th param; when present, handler calls closeable.close() on each cache entry before purgeExpired.
- [ ] getRunner uses createPipelineDeps plus manual FileSystemRepoMapSupplier and WatchingRepoMapSupplier; stores { runner, closeable }; evicts oldest when size >= 10 and calls evicted.closeable.close(); returns entry.runner.
- [ ] shutdown_handler_closes_runner_cache_entries and getRunner_evicts_oldest_and_closes_when_at_capacity pass.
- [ ] pnpm lint — zero errors, zero warnings
- [ ] pnpm typecheck — clean
- [ ] pnpm knip — no new unused files, exports, or dependencies
- [ ] Daily Log in documentation/mvp-progress.md has an entry for this task with durationMs and RSS after 10 compilations.

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
