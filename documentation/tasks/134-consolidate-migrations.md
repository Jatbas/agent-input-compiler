# Task 134: Consolidate All Migrations into One

> **Status:** Pending
> **Phase:** Maintenance / Technical Debt
> **Layer:** storage (migrations only)
> **Depends on:** 133-normalize-project-root-stores (Done)

## Goal

Replace the 14 incremental migration files (001–014) with a single `001-consolidated-schema.ts` that creates the final schema from scratch, and update every consumer to import only the consolidated migration.

## Architecture Notes

- Rule: every schema change requires a migration file in `shared/src/storage/migrations/`. Deleting old files is safe once the consolidated file is the only import in `open-database.ts` and all tests; no existing migrations are referenced anywhere else in production code.
- The consolidated migration id is `"001-consolidated-schema"`. The `SqliteMigrationRunner` checks whether the id appears in `schema_migrations`; since existing live DBs have ids `001-initial-schema` through `014-drop-project-root-columns` but not `"001-consolidated-schema"`, the runner will run `up()` once on upgrade. Because every `CREATE TABLE` uses `IF NOT EXISTS` and every `CREATE INDEX` uses `IF NOT EXISTS`, the up() is idempotent — it is a no-op on tables/indexes that already exist.
- Data migrations (006 backfill, 004 backfill, 013 backfill) are omitted from the consolidated `up()`: fresh installs have no rows to backfill; existing installs already ran those migrations.
- `migration-utils.ts` is retained; the consolidated migration does not use it (single DDL block, no conditional `ALTER TABLE`).
- ADR-007 (UUIDv7 PKs), ADR-008 (ISO timestamps), hexagonal boundary rules all apply.
- Schema is sourced directly from the live `~/.aic/aic.sqlite` using `.schema` — not reconstructed from migration diffs.

## Files

| Action | Path |
| ------ | ---- |
| Create | `shared/src/storage/migrations/001-consolidated-schema.ts` |
| Modify | `shared/src/storage/open-database.ts` (replace 14 migration imports with one) |
| Modify | `shared/src/storage/__tests__/sqlite-migration-runner.test.ts` (replace 14 imports; rewrite all per-migration test cases into consolidated equivalents) |
| Modify | `shared/src/storage/__tests__/sqlite-guard-store.test.ts` (replace 12 migration imports with one) |
| Modify | `shared/src/storage/__tests__/sqlite-config-store.test.ts` (replace 13 migration imports with one) |
| Modify | `shared/src/storage/__tests__/sqlite-compilation-log-store.test.ts` (replace 13 migration imports with one) |
| Modify | `shared/src/storage/__tests__/sqlite-tool-invocation-log-store.test.ts` (replace 13 migration imports with one) |
| Modify | `shared/src/storage/__tests__/sqlite-agentic-session-store.test.ts` (replace 13 migration imports with one) |
| Modify | `shared/src/storage/__tests__/sqlite-cache-store.test.ts` (replace 13 migration imports with one) |
| Modify | `shared/src/storage/__tests__/sqlite-telemetry-store.test.ts` (replace 12 migration imports with one) |
| Modify | `shared/src/storage/__tests__/ensure-project-id.test.ts` (replace 14 migration imports with one) |
| Modify | `shared/src/storage/__tests__/sqlite-status-store.test.ts` (replace 13 migration imports with one) |
| Modify | `shared/src/storage/__tests__/sqlite-session-store.test.ts` (replace 3 migration imports with one) |
| Modify | `shared/src/storage/__tests__/sqlite-file-transform-store.test.ts` (replace 13 migration imports with one) |
| Delete | `shared/src/storage/migrations/001-initial-schema.ts` |
| Delete | `shared/src/storage/migrations/002-server-sessions.ts` |
| Delete | `shared/src/storage/migrations/003-server-sessions-integrity.ts` |
| Delete | `shared/src/storage/migrations/004-normalize-telemetry.ts` |
| Delete | `shared/src/storage/migrations/005-trigger-source.ts` |
| Delete | `shared/src/storage/migrations/006-cache-datetime-format.ts` |
| Delete | `shared/src/storage/migrations/007-conversation-id.ts` |
| Delete | `shared/src/storage/migrations/008-session-state.ts` |
| Delete | `shared/src/storage/migrations/009-file-transform-cache.ts` |
| Delete | `shared/src/storage/migrations/010-tool-invocation-log.ts` |
| Delete | `shared/src/storage/migrations/011-global-project-root.ts` |
| Delete | `shared/src/storage/migrations/012-normalize-schema.ts` |
| Delete | `shared/src/storage/migrations/013-project-id-fk.ts` |
| Delete | `shared/src/storage/migrations/014-drop-project-root-columns.ts` |

## Migration Contract

The consolidated migration object:

```typescript
// Source of schema: sqlite3 ~/.aic/aic.sqlite ".schema" — live DB after all 14 migrations applied

import type { Migration } from "@jatbas/aic-core/core/interfaces/migration.interface.js";

export const migration: Migration = {
  id: "001-consolidated-schema",

  up(db): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id          TEXT PRIMARY KEY,
        applied_at  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        project_id   TEXT PRIMARY KEY,
        project_root TEXT NOT NULL UNIQUE,
        created_at   TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS server_sessions (
        session_id         TEXT PRIMARY KEY,
        started_at         TEXT NOT NULL,
        stopped_at         TEXT,
        stop_reason        TEXT,
        pid                INTEGER NOT NULL,
        version            TEXT NOT NULL,
        installation_ok    INTEGER,
        installation_notes TEXT
      );

      CREATE TABLE IF NOT EXISTS compilation_log (
        id             TEXT PRIMARY KEY,
        intent         TEXT NOT NULL,
        task_class     TEXT NOT NULL,
        files_selected INTEGER NOT NULL,
        files_total    INTEGER NOT NULL,
        tokens_raw     INTEGER NOT NULL,
        tokens_compiled INTEGER NOT NULL,
        cache_hit      INTEGER NOT NULL DEFAULT 0,
        duration_ms    INTEGER NOT NULL,
        editor_id      TEXT NOT NULL,
        model_id       TEXT,
        created_at     TEXT NOT NULL,
        session_id     TEXT REFERENCES server_sessions(session_id),
        config_hash    TEXT REFERENCES config_history(config_hash),
        trigger_source TEXT,
        conversation_id TEXT,
        project_id     TEXT REFERENCES projects(project_id)
      );

      CREATE TABLE IF NOT EXISTS telemetry_events (
        id              TEXT PRIMARY KEY,
        repo_id         TEXT NOT NULL,
        guard_findings  INTEGER NOT NULL DEFAULT 0,
        guard_blocks    INTEGER NOT NULL DEFAULT 0,
        transform_savings INTEGER NOT NULL DEFAULT 0,
        tiers_json      TEXT NOT NULL DEFAULT '{}',
        created_at      TEXT NOT NULL,
        compilation_id  TEXT REFERENCES compilation_log(id)
      );

      CREATE TABLE IF NOT EXISTS cache_metadata (
        cache_key      TEXT PRIMARY KEY,
        file_path      TEXT NOT NULL,
        file_tree_hash TEXT NOT NULL,
        created_at     TEXT NOT NULL,
        expires_at     TEXT NOT NULL,
        project_id     TEXT REFERENCES projects(project_id)
      );

      CREATE TABLE IF NOT EXISTS config_history (
        config_hash TEXT PRIMARY KEY,
        config_json TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        project_id  TEXT REFERENCES projects(project_id)
      );

      CREATE TABLE IF NOT EXISTS guard_findings (
        id             TEXT PRIMARY KEY,
        compilation_id TEXT NOT NULL REFERENCES compilation_log(id),
        type           TEXT NOT NULL,
        severity       TEXT NOT NULL,
        file           TEXT NOT NULL,
        line           INTEGER,
        message        TEXT NOT NULL,
        pattern        TEXT,
        created_at     TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS repomap_cache (
        project_root    TEXT PRIMARY KEY,
        repomap_json    TEXT NOT NULL,
        file_tree_hash  TEXT NOT NULL,
        total_files     INTEGER NOT NULL,
        total_tokens    INTEGER NOT NULL,
        built_at        TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS anonymous_telemetry_log (
        id           TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'queued',
        created_at   TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_state (
        session_id       TEXT PRIMARY KEY,
        task_intent      TEXT,
        steps_json       TEXT NOT NULL DEFAULT '[]',
        created_at       TEXT NOT NULL,
        last_activity_at TEXT NOT NULL,
        project_id       TEXT REFERENCES projects(project_id)
      );

      CREATE TABLE IF NOT EXISTS file_transform_cache (
        file_path           TEXT NOT NULL,
        content_hash        TEXT NOT NULL,
        transformed_content TEXT NOT NULL,
        tier_outputs_json   TEXT NOT NULL,
        created_at          TEXT NOT NULL,
        expires_at          TEXT NOT NULL,
        project_id          TEXT REFERENCES projects(project_id),
        PRIMARY KEY (file_path, content_hash)
      );

      CREATE TABLE IF NOT EXISTS tool_invocation_log (
        id           TEXT PRIMARY KEY,
        created_at   TEXT NOT NULL,
        tool_name    TEXT NOT NULL,
        session_id   TEXT NOT NULL,
        params_shape TEXT NOT NULL,
        project_id   TEXT REFERENCES projects(project_id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_root
        ON projects(project_root);
      CREATE INDEX IF NOT EXISTS idx_compilation_log_created_at
        ON compilation_log(created_at);
      CREATE INDEX IF NOT EXISTS idx_compilation_log_session_id
        ON compilation_log(session_id);
      CREATE INDEX IF NOT EXISTS idx_compilation_log_config_hash
        ON compilation_log(config_hash);
      CREATE INDEX IF NOT EXISTS idx_compilation_log_project_id
        ON compilation_log(project_id);
      CREATE INDEX IF NOT EXISTS idx_telemetry_events_created_at
        ON telemetry_events(created_at);
      CREATE INDEX IF NOT EXISTS idx_telemetry_events_compilation_id
        ON telemetry_events(compilation_id);
      CREATE INDEX IF NOT EXISTS idx_guard_findings_compilation_id
        ON guard_findings(compilation_id);
      CREATE INDEX IF NOT EXISTS idx_cache_metadata_expires_at
        ON cache_metadata(expires_at);
      CREATE INDEX IF NOT EXISTS idx_cache_metadata_project_id
        ON cache_metadata(project_id);
      CREATE INDEX IF NOT EXISTS idx_session_state_project_id
        ON session_state(project_id);
      CREATE INDEX IF NOT EXISTS idx_file_transform_cache_expires_at
        ON file_transform_cache(expires_at);
      CREATE INDEX IF NOT EXISTS idx_file_transform_cache_project_id
        ON file_transform_cache(project_id);
      CREATE INDEX IF NOT EXISTS idx_tool_invocation_log_project_id
        ON tool_invocation_log(project_id);
      CREATE INDEX IF NOT EXISTS idx_config_history_project_id
        ON config_history(project_id);
    `);
  },

  down(db): void {
    db.exec(`
      DROP TABLE IF EXISTS tool_invocation_log;
      DROP TABLE IF EXISTS file_transform_cache;
      DROP TABLE IF EXISTS session_state;
      DROP TABLE IF EXISTS anonymous_telemetry_log;
      DROP TABLE IF EXISTS repomap_cache;
      DROP TABLE IF EXISTS guard_findings;
      DROP TABLE IF EXISTS telemetry_events;
      DROP TABLE IF EXISTS cache_metadata;
      DROP TABLE IF EXISTS compilation_log;
      DROP TABLE IF EXISTS config_history;
      DROP TABLE IF EXISTS server_sessions;
      DROP TABLE IF EXISTS projects;
      DROP TABLE IF EXISTS schema_migrations;
    `);
  },
};
```

**Note on FK ordering:** `projects` and `server_sessions` are declared before the tables that reference them (`compilation_log` etc.) so SQLite FK constraints are satisfied without needing `PRAGMA foreign_keys = ON` during DDL. `config_history` is referenced by `compilation_log`, so it must be declared before `compilation_log`. Because SQLite FK enforcement is disabled by default and DDL with `CREATE TABLE IF NOT EXISTS` does not validate FKs at creation time, the ordering is belt-and-suspenders but correct.

## Config Changes

- **package.json:** no change
- **eslint.config.mjs:** no change

## Steps

### Step 1: Create the consolidated migration file

Create `shared/src/storage/migrations/001-consolidated-schema.ts` with the exact content from the **Migration Contract** section above.

The DDL is sourced from `sqlite3 ~/.aic/aic.sqlite ".schema"` (live database after all 14 migrations). Every `CREATE TABLE` statement uses `IF NOT EXISTS` and every `CREATE INDEX` statement uses `IF NOT EXISTS` so the `up()` is fully idempotent.

**Verify:** `pnpm typecheck` passes (no lint yet — consumers still import old files).

### Step 2: Update `open-database.ts`

In `shared/src/storage/open-database.ts`, replace all 14 migration imports and the 14-element array with:

```typescript
import { migration } from "@jatbas/aic-core/storage/migrations/001-consolidated-schema.js";
```

And update the `migrationRunner.run(...)` call:

```typescript
migrationRunner.run(db, [migration]);
```

Remove all 14 lines of the form `import { migration as migrationNNN } from "...NNN-...js"` and the corresponding `migrationNNN` entries in the array.

**Verify:** `pnpm typecheck` passes. `pnpm lint` passes.

### Step 3: Update the migration runner test

In `shared/src/storage/__tests__/sqlite-migration-runner.test.ts`:

1. Replace the 14 import lines at the top with:

```typescript
import { migration } from "../migrations/001-consolidated-schema.js";
```

2. Rewrite the test suite. The old tests exercised each individual migration in isolation — those tests are no longer meaningful because the old files will be deleted. Replace the entire `describe` block body with the following test cases:

```typescript
it("applies consolidated migration on fresh DB and records one row", () => {
  tmpDir = mkdtempSync(join(tmpdir(), "aic-migration-test-"));
  const dbPath = join(tmpDir, "aic.sqlite");
  const db = new Database(dbPath);
  const runner = new SqliteMigrationRunner(clock);
  runner.run(db, [migration]);
  db.close();

  const readDb = new Database(dbPath);
  const rows = readDb.prepare("SELECT id, applied_at FROM schema_migrations").all() as {
    id: string;
    applied_at: string;
  }[];
  readDb.close();

  expect(rows).toHaveLength(1);
  const row = rows[0];
  if (row === undefined) throw new AicError("expected one row", "TEST_SETUP");
  expect(row.id).toBe("001-consolidated-schema");
  expect(row.applied_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

it("skips already applied migration on second run", () => {
  tmpDir = mkdtempSync(join(tmpdir(), "aic-migration-test-"));
  const dbPath = join(tmpDir, "aic.sqlite");
  const db = new Database(dbPath);
  const runner = new SqliteMigrationRunner(clock);
  runner.run(db, [migration]);
  runner.run(db, [migration]);
  db.close();

  const readDb = new Database(dbPath);
  const rows = readDb.prepare("SELECT id FROM schema_migrations").all() as {
    id: string;
  }[];
  readDb.close();

  expect(rows).toHaveLength(1);
});

it("creates all expected tables", () => {
  const db = new Database(":memory:");
  const runner = new SqliteMigrationRunner(clock);
  runner.run(db, [migration]);

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as { name: string }[];
  const names = tables.map((t) => t.name);

  expect(names).toContain("schema_migrations");
  expect(names).toContain("compilation_log");
  expect(names).toContain("telemetry_events");
  expect(names).toContain("cache_metadata");
  expect(names).toContain("config_history");
  expect(names).toContain("guard_findings");
  expect(names).toContain("repomap_cache");
  expect(names).toContain("anonymous_telemetry_log");
  expect(names).toContain("server_sessions");
  expect(names).toContain("session_state");
  expect(names).toContain("file_transform_cache");
  expect(names).toContain("tool_invocation_log");
  expect(names).toContain("projects");
  db.close();
});

it("compilation_log has final column set — includes project_id, excludes project_root and token_reduction_pct", () => {
  const db = new Database(":memory:");
  migration.up(db);
  const cols = db.prepare("PRAGMA table_info(compilation_log)").all() as readonly { name: string }[];
  const names = cols.map((c) => c.name);
  expect(names).toContain("project_id");
  expect(names).toContain("session_id");
  expect(names).toContain("config_hash");
  expect(names).toContain("conversation_id");
  expect(names).toContain("trigger_source");
  expect(names).not.toContain("project_root");
  expect(names).not.toContain("token_reduction_pct");
  db.close();
});

it("telemetry_events has final column set — includes compilation_id, excludes legacy columns", () => {
  const db = new Database(":memory:");
  migration.up(db);
  const cols = db.prepare("PRAGMA table_info(telemetry_events)").all() as readonly { name: string }[];
  const names = cols.map((c) => c.name);
  expect(names).toContain("compilation_id");
  expect(names).not.toContain("task_class");
  expect(names).not.toContain("tokens_raw");
  expect(names).not.toContain("tokens_compiled");
  expect(names).not.toContain("token_reduction_pct");
  expect(names).not.toContain("duration_ms");
  expect(names).not.toContain("cache_hit");
  expect(names).not.toContain("model_id");
  expect(names).not.toContain("editor_id");
  expect(names).not.toContain("files_selected");
  expect(names).not.toContain("files_total");
  expect(names).not.toContain("project_root");
  db.close();
});

it("per-project tables have project_id FK and no project_root", () => {
  const db = new Database(":memory:");
  migration.up(db);
  const tables = ["compilation_log", "cache_metadata", "tool_invocation_log", "session_state", "file_transform_cache", "config_history"] as const;
  for (const table of tables) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as readonly { name: string }[];
    const names = cols.map((c) => c.name);
    expect(names).toContain("project_id");
    expect(names).not.toContain("project_root");
  }
  db.close();
});

it("down() drops all tables cleanly", () => {
  const db = new Database(":memory:");
  migration.up(db);
  migration.down(db);
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as { name: string }[];
  expect(tables).toHaveLength(0);
  db.close();
});
```

**Verify:** `pnpm test shared/src/storage/__tests__/sqlite-migration-runner.test.ts` — all test cases pass.

### Step 4: Update all other storage test files

For each file listed below, replace all individual migration imports with a single import of the consolidated migration, then update the `runner.run(db, [...])` call (or `migrationNNN.up(db)` chain) to use `[migration]` (a single-element array) or `migration.up(db)` (direct call).

**Files to update (replace imports and migration setup only — do not change assertions):**

- `shared/src/storage/__tests__/sqlite-guard-store.test.ts`
  - Remove: `import { migration as migration001 } from "../migrations/001-initial-schema.js"` through `migration012`
  - Add: `import { migration } from "../migrations/001-consolidated-schema.js";`
  - Replace the migration array `[migration001, ..., migration012]` with `[migration]`

- `shared/src/storage/__tests__/sqlite-config-store.test.ts`
  - Remove 13 migration imports (migration001 through migration011, migration013, migration014 — note: migration012 is absent from this file)
  - Add: `import { migration } from "../migrations/001-consolidated-schema.js";`
  - Replace `[migration001, ..., migration014]` with `[migration]`

- `shared/src/storage/__tests__/sqlite-compilation-log-store.test.ts`
  - Remove 13 migration imports (migration001 through migration005, migration007 through migration014 — note: migration006 is absent from this file)
  - Add: `import { migration } from "../migrations/001-consolidated-schema.js";`
  - Replace with `[migration]`

- `shared/src/storage/__tests__/sqlite-tool-invocation-log-store.test.ts`
  - Remove 13 migration imports (migration001 through migration011, migration013, migration014 — note: migration012 is absent from this file)
  - Add: `import { migration } from "../migrations/001-consolidated-schema.js";`
  - Replace with `[migration]`

- `shared/src/storage/__tests__/sqlite-agentic-session-store.test.ts`
  - Remove 13 migration imports (migration001 through migration011, migration013, migration014 — note: migration012 is absent from this file)
  - Add: `import { migration } from "../migrations/001-consolidated-schema.js";`
  - Replace with `[migration]`

- `shared/src/storage/__tests__/sqlite-cache-store.test.ts`
  - Remove 13 migration imports (migration001 through migration011, migration013, migration014 — note: migration012 is absent from this file)
  - Add: `import { migration } from "../migrations/001-consolidated-schema.js";`
  - Replace with `[migration]`

- `shared/src/storage/__tests__/sqlite-telemetry-store.test.ts`
  - Remove 12 migration imports (migration001 through migration012)
  - Add: `import { migration } from "../migrations/001-consolidated-schema.js";`
  - Replace with `[migration]`

- `shared/src/storage/__tests__/ensure-project-id.test.ts`
  - Remove 14 migration imports
  - Add: `import { migration } from "../migrations/001-consolidated-schema.js";`
  - Replace with `[migration]`

- `shared/src/storage/__tests__/sqlite-status-store.test.ts`
  - Remove 13 migration imports (migration001 through migration005, migration007 through migration014 — note: migration006 is absent from this file)
  - Add: `import { migration } from "../migrations/001-consolidated-schema.js";`
  - Replace with `[migration]`

- `shared/src/storage/__tests__/sqlite-session-store.test.ts`
  - Remove 3 migration imports (migration001, migration002, migration003)
  - Add: `import { migration } from "../migrations/001-consolidated-schema.js";`
  - Replace with `[migration]`

- `shared/src/storage/__tests__/sqlite-file-transform-store.test.ts`
  - Remove 13 migration imports (migration001 through migration011, migration013, migration014 — note: migration012 is absent from this file)
  - Add: `import { migration } from "../migrations/001-consolidated-schema.js";`
  - Replace with `[migration]`

**Verify:** `pnpm test shared/src/storage/` — all storage tests pass.

### Step 5: Delete the 14 obsolete migration files

Delete these files (use `git rm` to stage the deletions):

```
git rm shared/src/storage/migrations/001-initial-schema.ts
git rm shared/src/storage/migrations/002-server-sessions.ts
git rm shared/src/storage/migrations/003-server-sessions-integrity.ts
git rm shared/src/storage/migrations/004-normalize-telemetry.ts
git rm shared/src/storage/migrations/005-trigger-source.ts
git rm shared/src/storage/migrations/006-cache-datetime-format.ts
git rm shared/src/storage/migrations/007-conversation-id.ts
git rm shared/src/storage/migrations/008-session-state.ts
git rm shared/src/storage/migrations/009-file-transform-cache.ts
git rm shared/src/storage/migrations/010-tool-invocation-log.ts
git rm shared/src/storage/migrations/011-global-project-root.ts
git rm shared/src/storage/migrations/012-normalize-schema.ts
git rm shared/src/storage/migrations/013-project-id-fk.ts
git rm shared/src/storage/migrations/014-drop-project-root-columns.ts
```

**Verify:** `ls shared/src/storage/migrations/` lists only `001-consolidated-schema.ts` and `migration-utils.ts`.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

If knip reports `migration-utils.ts` as unused after the delete (because the consolidated file does not import it), keep the file — it is available for future migrations. If knip flags it as unused, note the finding and confirm with the user whether to delete it or add a knip ignore entry.

## Tests

| Test case | Description |
| --------- | ----------- |
| `applies consolidated migration on fresh DB and records one row` | Runs runner with `[migration]` on a file-backed DB; asserts `schema_migrations` has exactly one row with id `"001-consolidated-schema"` and a valid ISO timestamp |
| `skips already applied migration on second run` | Runs runner twice; asserts still one row |
| `creates all expected tables` | Runs `migration.up()` on `:memory:`; asserts all 13 domain tables + `schema_migrations` exist |
| `compilation_log has final column set` | Asserts `project_id`, `session_id`, `config_hash`, `conversation_id`, `trigger_source` present; `project_root` and `token_reduction_pct` absent |
| `telemetry_events has final column set` | Asserts `compilation_id` present; 11 legacy columns absent including `project_root` |
| `per-project tables have project_id FK and no project_root` | Asserts all 6 per-project tables have `project_id` and no `project_root` |
| `down() drops all tables cleanly` | Calls `up()` then `down()`; asserts zero tables remain |

## Acceptance Criteria

- [ ] All files created/modified/deleted per Files table
- [ ] `001-consolidated-schema.ts` exports `migration` with id `"001-consolidated-schema"`
- [ ] `up()` DDL matches the live DB schema exactly (verified via `.schema` output)
- [ ] All test cases in the Tests table pass
- [ ] No other file imports from `001-initial-schema.js` through `014-drop-project-root-columns.js`
- [ ] `open-database.ts` passes `[migration]` (single element) to `runner.run()`
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` outside allowed files
- [ ] No `let` in production code
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
