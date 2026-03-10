# Task 127: Store SQL project_root queries

> **Status:** Pending
> **Phase:** W — Global Server & Per-Project Isolation
> **Layer:** storage
> **Depends on:** W02 (Schema migration 011), W04 (Store constructor projectRoot param)

## Goal

Add `project_root` to all SQL in the 9 per-project stores so every INSERT includes the value and every SELECT/UPDATE/DELETE is scoped by `WHERE project_root = ?` (or `AND project_root = ?`), enabling per-project isolation when the database moves to a global path. No `OR project_root = ''` fallback.

## Architecture Notes

- ADR-007 / Project Plan: UUIDv7 and schema in storage. Migration 011 already added `project_root TEXT NOT NULL DEFAULT ''` and indexes to the 8 per-project tables; W04 added `projectRoot: AbsolutePath` to each store constructor.
- All SQL remains in `shared/src/storage/`. No pipeline or core changes. Bound parameter is always `this.projectRoot`.
- One commit per store and its test file (impl-spec §W05). Order by criticality: ToolInvocationLog → Config → Guard → AgenticSession → FileTransform → Telemetry → CompilationLog → Cache → Status.
- SqliteStatusStore: queries on `compilation_log`, `telemetry_events`, and `guard_findings` gain `project_root` filter; queries on `server_sessions` remain unscoped (server-level).

## Files

| Action | Path |
| ------ | ---- |
| Modify | `shared/src/storage/sqlite-tool-invocation-log-store.ts` |
| Modify | `shared/src/storage/__tests__/sqlite-tool-invocation-log-store.test.ts` |
| Modify | `shared/src/storage/sqlite-config-store.ts` |
| Modify | `shared/src/storage/__tests__/sqlite-config-store.test.ts` |
| Modify | `shared/src/storage/sqlite-guard-store.ts` |
| Modify | `shared/src/storage/__tests__/sqlite-guard-store.test.ts` |
| Modify | `shared/src/storage/sqlite-agentic-session-store.ts` |
| Modify | `shared/src/storage/__tests__/sqlite-agentic-session-store.test.ts` |
| Modify | `shared/src/storage/sqlite-file-transform-store.ts` |
| Modify | `shared/src/storage/__tests__/sqlite-file-transform-store.test.ts` |
| Modify | `shared/src/storage/sqlite-telemetry-store.ts` |
| Modify | `shared/src/storage/__tests__/sqlite-telemetry-store.test.ts` |
| Modify | `shared/src/storage/sqlite-compilation-log-store.ts` |
| Modify | `shared/src/storage/__tests__/sqlite-compilation-log-store.test.ts` |
| Modify | `shared/src/storage/sqlite-cache-store.ts` |
| Modify | `shared/src/storage/__tests__/sqlite-cache-store.test.ts` |
| Modify | `shared/src/storage/sqlite-status-store.ts` |
| Modify | `shared/src/storage/__tests__/sqlite-status-store.test.ts` |

## SQL change specification

Rule: every INSERT includes a `project_root` column bound to `this.projectRoot`. Every SELECT/UPDATE/DELETE that touches a per-project table adds `WHERE project_root = ?` or `AND project_root = ?` bound to `this.projectRoot`. No fallback for empty `project_root`. Tables and columns are defined in migration `011-global-project-root.ts`.

Stores and their tables:

- **SqliteToolInvocationLogStore** — `tool_invocation_log`: INSERT only.
- **SqliteConfigStore** — `config_history`: INSERT and SELECT (getLatestHash).
- **SqliteGuardStore** — `guard_findings`: INSERT only (DELETE/SELECT stay scoped by compilation_id per spec).
- **SqliteAgenticSessionStore** — `session_state`: INSERT, SELECT (getSteps, recordStep lookup), UPDATE.
- **SqliteFileTransformStore** — `file_transform_cache`: INSERT, SELECT (get), DELETE (invalidate, purgeExpired).
- **SqliteTelemetryStore** — `telemetry_events`: INSERT only.
- **SqliteCompilationLogStore** — `compilation_log`: INSERT only.
- **SqliteCacheStore** — `cache_metadata`: INSERT, SELECT (get, deleteRowAndBlobForKey, invalidateAll, purgeExpired), DELETE (all paths).
- **SqliteStatusStore** — `compilation_log`, `telemetry_events`, `guard_findings`: add `project_root` to all aggregation SELECTs. `server_sessions`: no change.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: SqliteToolInvocationLogStore

In `sqlite-tool-invocation-log-store.ts`, change the INSERT to include `project_root` in the column list and bind `this.projectRoot` as the last argument to `.run()`.

In `sqlite-tool-invocation-log-store.test.ts`, add `migration011.up(execDb)` after `migration010.up(execDb)`. Import migration011 from the migrations folder. Optionally assert the inserted row has the correct `project_root` value when reading back.

**Verify:** `pnpm test shared/src/storage/__tests__/sqlite-tool-invocation-log-store.test.ts` passes.

### Step 2: SqliteConfigStore

In `sqlite-config-store.ts`: (1) In `getLatestHash`, add `WHERE project_root = ?` to the SELECT and pass `this.projectRoot` as the sole bound parameter. (2) In `writeSnapshot`, add `project_root` to the INSERT column list and pass `this.projectRoot` in the `.run()` call (order: configHash, configJson, createdAt, projectRoot or insert project_root in the correct column position).

In `sqlite-config-store.test.ts`, add `migration011.up(db)` to the migration chain and ensure the test DB has the column. Add or adjust a test that two different projectRoot values do not see each other's config hash.

**Verify:** `pnpm test shared/src/storage/__tests__/sqlite-config-store.test.ts` passes.

### Step 3: SqliteGuardStore

In `sqlite-guard-store.ts`, add `project_root` to the INSERT column list for `guard_findings` and bind `this.projectRoot` in the insert `.run()` (after the existing 9 values). Do not change the DELETE or SELECT (queryByCompilation) per impl-spec.

In `sqlite-guard-store.test.ts`, add `migration011.up(db)` to the migration chain.

**Verify:** `pnpm test shared/src/storage/__tests__/sqlite-guard-store.test.ts` passes.

### Step 4: SqliteAgenticSessionStore

In `sqlite-agentic-session-store.ts`: (1) In `getSteps`, add `AND project_root = ?` to the SELECT and pass `sessionId` and `this.projectRoot` to `.all()`. (2) In `recordStep`, add `project_root` to the INSERT column list and bind `this.projectRoot` in the `.run()`; add `AND project_root = ?` to the SELECT that fetches existing row and pass `sessionId`, `this.projectRoot` to `.all()`; add `AND project_root = ?` to the UPDATE and pass the new values plus `this.projectRoot` to `.run()`.

In `sqlite-agentic-session-store.test.ts`, add `migration011.up(execDb)` to the migration chain. Add or adjust a test that two project roots do not see each other's session state.

**Verify:** `pnpm test shared/src/storage/__tests__/sqlite-agentic-session-store.test.ts` passes.

### Step 5: SqliteFileTransformStore

In `sqlite-file-transform-store.ts`: (1) In `get`, add `AND project_root = ?` to the SELECT and pass `filePath`, `contentHash`, `nowSql`, `this.projectRoot` to `.all()`. (2) In `set`, add `project_root` to the INSERT column list and bind `this.projectRoot` in `.run()`. (3) In `invalidate`, add `AND project_root = ?` to the DELETE and pass `filePath`, `this.projectRoot` to `.run()`. (4) In `purgeExpired`, add `AND project_root = ?` to the DELETE and pass `nowSql`, `this.projectRoot` to `.run()`.

In `sqlite-file-transform-store.test.ts`, add `migration011.up(db as unknown as ExecutableDb)` to the migration chain. Add or adjust a test that two project roots do not read or invalidate each other's cache entries.

**Verify:** `pnpm test shared/src/storage/__tests__/sqlite-file-transform-store.test.ts` passes.

### Step 6: SqliteTelemetryStore

In `sqlite-telemetry-store.ts`, add `project_root` to the INSERT column list for `telemetry_events` and bind `this.projectRoot` as the last argument to `stmt.run()`.

In `sqlite-telemetry-store.test.ts`, add `migration011.up(db)` to the migration chain (after the existing migration004 or equivalent so the table has the column).

**Verify:** `pnpm test shared/src/storage/__tests__/sqlite-telemetry-store.test.ts` passes.

### Step 7: SqliteCompilationLogStore

In `sqlite-compilation-log-store.ts`, add `project_root` to the INSERT column list for `compilation_log` and bind `this.projectRoot` as the last argument to `stmt.run()`.

In `sqlite-compilation-log-store.test.ts`, add `migration011.up(db)` to the migration chain.

**Verify:** `pnpm test shared/src/storage/__tests__/sqlite-compilation-log-store.test.ts` passes.

### Step 8: SqliteCacheStore

In `sqlite-cache-store.ts`: (1) In `get`, add `AND project_root = ?` to the SELECT and pass `key`, `nowSql`, `this.projectRoot` to `.all()`. (2) In `deleteRowAndBlobForKey`, add `AND project_root = ?` to both the SELECT and the DELETE; pass `key`, `this.projectRoot` for SELECT and `key`, `this.projectRoot` for DELETE. (3) In `set`, add `project_root` to the INSERT column list and bind `this.projectRoot` in `.run()`. (4) In `invalidateAll`, add `WHERE project_root = ?` to the SELECT and to the DELETE; pass `this.projectRoot` to both. (5) In `purgeExpired`, add `AND project_root = ?` to the first SELECT and first DELETE (expires_at); add `WHERE project_root = ?` to the second SELECT (file_path list); pass `this.projectRoot` where needed.

In `sqlite-cache-store.test.ts`, add `migration011.up(db)` to the migration chain. Add or adjust a test that two project roots do not read or invalidate each other's cache entries.

**Verify:** `pnpm test shared/src/storage/__tests__/sqlite-cache-store.test.ts` passes.

### Step 9: SqliteStatusStore

In `sqlite-status-store.ts`, add `AND project_root = ?` (or `WHERE project_root = ?` for queries that have no other predicate) to every query that reads from `compilation_log`, `telemetry_events`, or `guard_findings`. Bind `this.projectRoot` in each call. Do not change any query that reads from `server_sessions`.

Specifically: in `getConversationSummary`, add `AND project_root = ?` to all five compilation_log queries and pass `conversationId`, `TRIGGER_SOURCE.INTERNAL_TEST`, `this.projectRoot` (order as needed for the prepared statement). In `getSummary`, add `AND project_root = ?` to all compilation_log queries; add `WHERE project_root = ?` to the telemetry_events COUNT query; add `WHERE project_root = ?` to the guard_findings SELECT. Leave server_sessions queries unchanged.

In `sqlite-status-store.test.ts`, add `migration011.up(db)` to the migration chain. Ensure tests that assert aggregates or last compilation only see data for the store's project_root: insert rows with a given project_root and assert getSummary reflects only those.

**Verify:** `pnpm test shared/src/storage/__tests__/sqlite-status-store.test.ts` passes.

### Step 10: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| sqlite_tool_invocation_log_store_record | Record writes project_root; test runs migration011 |
| sqlite_config_store_get_and_write | getLatestHash and writeSnapshot scoped by project_root; test runs migration011 |
| sqlite_guard_store_write_and_query | write inserts project_root; test runs migration011 |
| sqlite_agentic_session_store_steps_and_record | getSteps, recordStep scoped by project_root; test runs migration011 |
| sqlite_file_transform_store_get_set_invalidate | get, set, invalidate, purgeExpired scoped by project_root; test runs migration011 |
| sqlite_telemetry_store_write | write inserts project_root; test runs migration011 |
| sqlite_compilation_log_store_record | record inserts project_root; test runs migration011 |
| sqlite_cache_store_get_set_invalidate | get, set, invalidateAll, purgeExpired scoped by project_root; test runs migration011 |
| sqlite_status_store_summary_and_conversation | getSummary and getConversationSummary only aggregate rows for store's project_root; test runs migration011 |

## Acceptance Criteria

- [ ] All 9 store files modified per Steps 1–9
- [ ] All 9 test files modified to run migration011 and assert project_root where applicable
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all store tests pass
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No SQL in codebase outside shared/src/storage/
- [ ] No `OR project_root = ''` in any query
- [ ] server_sessions queries in SqliteStatusStore unchanged

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
