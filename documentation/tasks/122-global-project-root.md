# Task 122: W02 Schema migration 011 (columns only)

> **Status:** Pending
> **Phase:** Phase W (multi-project)
> **Layer:** storage
> **Depends on:** W01 (Cross-platform path normalisation)

## Goal

Add schema migration 011 that introduces the `project_root` column on eight per-project tables and the `projects` table. Schema-only DDL; no runtime backfill code. Existing rows receive `project_root = ''` via DEFAULT.

## Architecture Notes

- All SQL and schema changes live in `shared/src/storage/`. ADR-007 (UUIDv7), ADR-008 (timestamps). Migration runner is the only code path that applies schema changes.
- Idempotent up(): use `safeAddColumn` from `migration-utils` so re-run is safe; use `CREATE INDEX IF NOT EXISTS` and `CREATE TABLE IF NOT EXISTS`.
- down() is best-effort: drop `projects` table and the seven new indexes; do not remove columns from the eight tables (would require table recreate in SQLite).

## Files

| Action | Path |
| ------ | ---- |
| Create | `shared/src/storage/migrations/011-global-project-root.ts` |
| Modify | `shared/src/storage/open-database.ts` (add import and register migration011 in migrations array) |
| Modify | `shared/src/storage/__tests__/sqlite-migration-runner.test.ts` (add test that runs migrations 001–011 and asserts 011 applied and schema changes) |

## Migration specification

The migration file exports a `Migration` object conforming to the core interface:

```typescript
// Source: shared/src/core/interfaces/migration.interface.ts
import type { ExecutableDb } from "./executable-db.interface.js";

export interface Migration {
  readonly id: string;
  up(db: ExecutableDb): void;
  down(db: ExecutableDb): void;
}
```

Exact migration export (id, up, down):

```typescript
import type { Migration } from "@jatbas/aic-core/core/interfaces/migration.interface.js";
import { safeAddColumn } from "./migration-utils.js";

export const migration: Migration = {
  id: "011-global-project-root",

  up(db): void {
    const projectRootDef = "TEXT NOT NULL DEFAULT ''";
    safeAddColumn(db, "compilation_log", "project_root", projectRootDef);
    safeAddColumn(db, "cache_metadata", "project_root", projectRootDef);
    safeAddColumn(db, "guard_findings", "project_root", projectRootDef);
    safeAddColumn(db, "tool_invocation_log", "project_root", projectRootDef);
    safeAddColumn(db, "session_state", "project_root", projectRootDef);
    safeAddColumn(db, "file_transform_cache", "project_root", projectRootDef);
    safeAddColumn(db, "config_history", "project_root", projectRootDef);
    safeAddColumn(db, "telemetry_events", "project_root", projectRootDef);

    db.exec("CREATE INDEX IF NOT EXISTS idx_compilation_log_project_root ON compilation_log(project_root)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_cache_metadata_project_root ON cache_metadata(project_root)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_tool_invocation_log_project_root ON tool_invocation_log(project_root)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_session_state_project_root ON session_state(project_root)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_file_transform_cache_project_root ON file_transform_cache(project_root)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_config_history_project_root ON config_history(project_root)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_telemetry_events_project_root ON telemetry_events(project_root)");

    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        project_id   TEXT PRIMARY KEY,
        project_root TEXT NOT NULL UNIQUE,
        created_at   TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      )
    `);
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_root ON projects(project_root)");
  },

  down(db): void {
    db.exec("DROP TABLE IF EXISTS projects");
    db.exec("DROP INDEX IF EXISTS idx_compilation_log_project_root");
    db.exec("DROP INDEX IF EXISTS idx_cache_metadata_project_root");
    db.exec("DROP INDEX IF EXISTS idx_tool_invocation_log_project_root");
    db.exec("DROP INDEX IF EXISTS idx_session_state_project_root");
    db.exec("DROP INDEX IF EXISTS idx_file_transform_cache_project_root");
    db.exec("DROP INDEX IF EXISTS idx_config_history_project_root");
    db.exec("DROP INDEX IF EXISTS idx_telemetry_events_project_root");
  },
};
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// Source: shared/src/core/interfaces/executable-db.interface.ts
export interface ExecutableDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...args: unknown[]): void;
    all(...args: unknown[]): unknown[];
  };
}
```

### Tier 2 — path-only

| Type | Path | Factory |
|------|------|---------|
| `Migration` | `shared/src/core/interfaces/migration.interface.ts` | export shape: `{ id, up, down }` |

## Config Changes

- **shared/package.json:** None
- **eslint.config.mjs:** None

## Steps

### Step 1: Create migration 011

Create `shared/src/storage/migrations/011-global-project-root.ts` with the migration export shown in Migration specification. Use `safeAddColumn` from `./migration-utils.js` for each of the eight tables with column definition `TEXT NOT NULL DEFAULT ''`. Add the eight tables in this order: compilation_log, cache_metadata, guard_findings, tool_invocation_log, session_state, file_transform_cache, config_history, telemetry_events. Then add the seven indexes with `CREATE INDEX IF NOT EXISTS`, then create the `projects` table and `CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_root ON projects(project_root)`. Implement down() with `DROP TABLE IF EXISTS projects` and `DROP INDEX IF EXISTS` for each of the seven index names.

**Verify:** `pnpm typecheck` passes. File exists at `shared/src/storage/migrations/011-global-project-root.ts`.

### Step 2: Register migration in open-database

In `shared/src/storage/open-database.ts`, add: `import { migration as migration011 } from "@jatbas/aic-core/storage/migrations/011-global-project-root.js";`. Append `migration011` to the migrations array passed to `migrationRunner.run(db, [...])` (after migration010).

**Verify:** `pnpm typecheck` passes. Grep for `migration011` in open-database.ts shows the import and array entry.

### Step 3: Add migration 011 test

In `shared/src/storage/__tests__/sqlite-migration-runner.test.ts`, add imports for migration005 through migration011 (from the corresponding migration files). Add a test case `migration_011_applies_and_adds_project_root_columns`: create a temp DB path, instantiate Database, create SqliteMigrationRunner with the existing clock, run `runner.run(db, [migration001, migration002, migration003, migration004, migration005, migration006, migration007, migration008, migration009, migration010, migration011])`, close db. Reopen the DB from the same path, query `SELECT id FROM schema_migrations` and assert one row has `id = '011-global-project-root'`. Run `PRAGMA table_info(compilation_log)` and assert the result includes a column with `name = 'project_root'`. Query `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'` and assert one row. Close the DB. Use the same afterEach pattern (tmpDir, rmSync) as existing tests.

**Verify:** `pnpm test shared/src/storage/__tests__/sqlite-migration-runner.test.ts` passes.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| migration_011_applies_and_adds_project_root_columns | Run migrations 001–011; assert schema_migrations contains 011-global-project-root, compilation_log has project_root column, projects table exists |

## Acceptance Criteria

- [ ] Migration file created at `shared/src/storage/migrations/011-global-project-root.ts`
- [ ] open-database.ts imports and registers migration011
- [ ] Test migration_011_applies_and_adds_project_root_columns passes
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] Migration uses safeAddColumn for idempotent column add; no raw ALTER TABLE ADD COLUMN for project_root

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
