// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AicError } from "@jatbas/aic-core/core/errors/aic-error.js";
import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import { toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import { SqliteMigrationRunner } from "../sqlite-migration-runner.js";
import { migration as migration001 } from "../migrations/001-initial-schema.js";
import { migration as migration002 } from "../migrations/002-server-sessions.js";
import { migration as migration003 } from "../migrations/003-server-sessions-integrity.js";
import { migration as migration004 } from "../migrations/004-normalize-telemetry.js";

const clock: Clock = {
  now(): ReturnType<typeof toISOTimestamp> {
    return toISOTimestamp("2025-01-15T10:00:00.000Z");
  },
  addMinutes() {
    return toISOTimestamp("2025-01-15T10:00:00.000Z");
  },
  durationMs() {
    return toMilliseconds(0);
  },
};

describe("SqliteMigrationRunner", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates schema_migrations, applies pending migration, records it", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-migration-test-"));
    const dbPath = join(tmpDir, "aic.sqlite");
    const db = new Database(dbPath);
    const runner = new SqliteMigrationRunner(clock);
    runner.run(db, [migration001]);
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
    expect(row.id).toBe("001-initial-schema");
    expect(row.applied_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("skips already applied migration on second run", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-migration-test-"));
    const dbPath = join(tmpDir, "aic.sqlite");
    const db = new Database(dbPath);
    const runner = new SqliteMigrationRunner(clock);
    runner.run(db, [migration001]);
    runner.run(db, [migration001]);
    db.close();

    const readDb = new Database(dbPath);
    const rows = readDb.prepare("SELECT id FROM schema_migrations").all() as {
      id: string;
    }[];
    readDb.close();

    expect(rows).toHaveLength(1);
  });

  it("applies_002_and_creates_server_sessions_table", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-migration-test-"));
    const dbPath = join(tmpDir, "aic.sqlite");
    const db = new Database(dbPath);
    const runner = new SqliteMigrationRunner(clock);
    runner.run(db, [migration001, migration002]);
    db.close();

    const readDb = new Database(dbPath);
    const migrationRows = readDb.prepare("SELECT id FROM schema_migrations").all() as {
      id: string;
    }[];
    expect(migrationRows).toHaveLength(2);
    expect(migrationRows.some((r) => r.id === "002-server-sessions")).toBe(true);

    const tableRows = readDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'server_sessions'",
      )
      .all() as { name: string }[];
    readDb.close();
    expect(tableRows).toHaveLength(1);
    expect(tableRows[0]?.name).toBe("server_sessions");
  });

  it("migration_003_adds_columns", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-migration-test-"));
    const dbPath = join(tmpDir, "aic.sqlite");
    const db = new Database(dbPath);
    const runner = new SqliteMigrationRunner(clock);
    runner.run(db, [migration001, migration002, migration003]);
    db.close();

    const readDb = new Database(dbPath);
    const columns = readDb.prepare("PRAGMA table_info(server_sessions)").all() as {
      name: string;
    }[];
    readDb.close();
    const names = columns.map((c) => c.name);
    expect(names).toContain("installation_ok");
    expect(names).toContain("installation_notes");
  });

  it("creates compilation_log and other MVP tables", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-migration-test-"));
    const dbPath = join(tmpDir, "aic.sqlite");
    const db = new Database(dbPath);
    const runner = new SqliteMigrationRunner(clock);
    runner.run(db, [migration001]);
    db.close();

    const readDb = new Database(dbPath);
    const tables = readDb
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[];
    readDb.close();

    const names = tables.map((t) => t.name);
    expect(names).toContain("schema_migrations");
    expect(names).toContain("compilation_log");
    expect(names).toContain("telemetry_events");
    expect(names).toContain("cache_metadata");
    expect(names).toContain("config_history");
    expect(names).toContain("guard_findings");
    expect(names).toContain("repomap_cache");
    expect(names).toContain("anonymous_telemetry_log");
  });

  it("migration_004_normalizes_telemetry", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-migration-test-"));
    const dbPath = join(tmpDir, "aic.sqlite");
    const db = new Database(dbPath);
    const runner = new SqliteMigrationRunner(clock);
    runner.run(db, [migration001, migration002, migration003, migration004]);
    db.close();

    const readDb = new Database(dbPath);
    const compilationCols = readDb
      .prepare("PRAGMA table_info(compilation_log)")
      .all() as {
      name: string;
    }[];
    const compilationNames = compilationCols.map((c) => c.name);
    expect(compilationNames).toContain("session_id");
    expect(compilationNames).toContain("config_hash");

    const telemetryCols = readDb.prepare("PRAGMA table_info(telemetry_events)").all() as {
      name: string;
    }[];
    const telemetryNames = telemetryCols.map((c) => c.name);
    expect(telemetryNames).toContain("compilation_id");
    expect(telemetryNames).not.toContain("task_class");
    expect(telemetryNames).not.toContain("tokens_raw");
    expect(telemetryNames).not.toContain("tokens_compiled");
    expect(telemetryNames).not.toContain("token_reduction_pct");
    expect(telemetryNames).not.toContain("duration_ms");
    expect(telemetryNames).not.toContain("cache_hit");
    expect(telemetryNames).not.toContain("model_id");
    expect(telemetryNames).not.toContain("editor_id");
    expect(telemetryNames).not.toContain("files_selected");
    expect(telemetryNames).not.toContain("files_total");

    const migrationRows = readDb.prepare("SELECT id FROM schema_migrations").all() as {
      id: string;
    }[];
    readDb.close();
    expect(migrationRows).toHaveLength(4);
    expect(migrationRows.some((r) => r.id === "004-normalize-telemetry")).toBe(true);
  });
});
