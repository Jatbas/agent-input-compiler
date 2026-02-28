# Task 031: 002-server-sessions migration

> **Status:** In Progress
> **Phase:** 0.5 Phase I — Live Wiring & Bug Fixes
> **Layer:** storage
> **Depends on:** MigrationRunner, 001-initial-schema

## Goal

Add migration 002 that creates the `server_sessions` table so the MCP server can record start/stop and crash detection per run (project-plan §13.2, §19).

## Architecture Notes

- All SQL in `shared/src/storage/`. Schema change only via migration; MigrationRunner applies in id order. ADR-007: UUIDv7 for session_id; ADR-008: timestamps as TEXT `YYYY-MM-DDTHH:mm:ss.sssZ`.
- Follow 001-initial-schema pattern: one file, export `const migration: Migration` with `id`, `up(db)`, `down(db)`. Wire in `open-database.ts` by adding the migration to the array passed to `migrationRunner.run()`.
- No new interface or store in this task; SqliteSessionStore and startup/shutdown writes are separate tasks.

## Files

| Action | Path                                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/storage/migrations/002-server-sessions.ts`                                                                  |
| Modify | `shared/src/storage/open-database.ts` (import migration002, add to migrations array)                                    |
| Modify | `shared/src/storage/__tests__/sqlite-migration-runner.test.ts` (add test for 002 applying and server_sessions existing) |

## Interface / Signature

```typescript
import type { ExecutableDb } from "./executable-db.interface.js";

export interface Migration {
  readonly id: string;
  up(db: ExecutableDb): void;
  down(db: ExecutableDb): void;
}
```

```typescript
// Migration object (no class). Export: export const migration: Migration = { ... }
// id: "002-server-sessions"
// up(db): db.exec(CREATE TABLE IF NOT EXISTS server_sessions (...))
// down(db): db.exec(DROP TABLE IF EXISTS server_sessions)
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

None.

### Tier 2 — path-only

None.

## Config Changes

- **package.json:** None.
- **eslint.config.mjs:** None.

## Steps

### Step 1: Create 002-server-sessions migration

Create `shared/src/storage/migrations/002-server-sessions.ts`. Import type `Migration` from `#core/interfaces/migration.interface.js`. Export `const migration: Migration` with:

- `id: "002-server-sessions"`
- `up(db)`: call `db.exec()` with a single SQL string that runs `CREATE TABLE IF NOT EXISTS server_sessions` with columns: `session_id TEXT PRIMARY KEY`, `started_at TEXT NOT NULL`, `stopped_at TEXT`, `stop_reason TEXT`, `pid INTEGER NOT NULL`, `version TEXT NOT NULL`.
- `down(db)`: call `db.exec("DROP TABLE IF EXISTS server_sessions")`

Do not add any index. Do not use `date('now')` or `datetime('now')`.

**Verify:** Run `pnpm typecheck` from repo root; no errors.

### Step 2: Wire migration in open-database

In `shared/src/storage/open-database.ts`: add import `import { migration as migration002 } from "#storage/migrations/002-server-sessions.js"`. Change the call to `migrationRunner.run(db, [migration001, migration002])`.

**Verify:** Run `pnpm typecheck`; no errors.

### Step 3: Add migration-runner test for 002

In `shared/src/storage/__tests__/sqlite-migration-runner.test.ts`: import `migration as migration002` from `../migrations/002-server-sessions.js`. Add a new test case `applies_002_and_creates_server_sessions_table`: create a temporary db path, open with `new Database(dbPath)`, instantiate `SqliteMigrationRunner` with the existing mock clock, call `runner.run(db, [migration001, migration002])`, close db, reopen db, query `SELECT id FROM schema_migrations` and assert the result has two rows and one row has `id === "002-server-sessions"`, then query `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'server_sessions'` and assert one row exists. Close db in afterEach (existing tmpDir cleanup).

**Verify:** Run `pnpm test -- shared/src/storage/__tests__/sqlite-migration-runner.test.ts`; all tests pass.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                     | Description                                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| applies_002_and_creates_server_sessions_table | Runner with [migration001, migration002] records 002 in schema_migrations and creates server_sessions table |

## Acceptance Criteria

- [ ] All files created/modified per Files table
- [ ] Migration id is "002-server-sessions"; up creates server_sessions with the six columns; down drops server_sessions
- [ ] open-database.ts runs [migration001, migration002]
- [ ] New migration-runner test passes
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No SQL outside shared/src/storage/
- [ ] No `date('now')` or `datetime('now')` in migration SQL

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
