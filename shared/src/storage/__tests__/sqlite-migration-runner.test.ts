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
import { migration } from "../migrations/001-consolidated-schema.js";
import { migration as migration002 } from "../migrations/002-add-conversation-id-index.js";
import { migration as migration003 } from "../migrations/003-compilation-selection-trace.js";
import { migration as migration004 } from "../migrations/004-spec-compile-cache.js";
import { migration as migration005 } from "../migrations/005-quality-snapshots.js";
import { migration as migration006 } from "../migrations/006-classifier-scores.js";
import { migration as migration007 } from "../migrations/007-last-non-general-intent-index.js";
import { migration as migration008 } from "../migrations/008-compilation-log-project-created-at-index.js";

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
    const runner = new SqliteMigrationRunner(clock);
    runner.run(db, [migration, migration002, migration003]);
    const cols = db.prepare("PRAGMA table_info(compilation_log)").all() as readonly {
      name: string;
    }[];
    const names = cols.map((c) => c.name);
    expect(names).toContain("project_id");
    expect(names).toContain("session_id");
    expect(names).toContain("config_hash");
    expect(names).toContain("conversation_id");
    expect(names).toContain("trigger_source");
    expect(names).toContain("selection_trace_json");
    expect(names).not.toContain("project_root");
    expect(names).not.toContain("token_reduction_pct");
    db.close();
  });

  it("telemetry_events has final column set — includes compilation_id, excludes legacy columns", () => {
    const db = new Database(":memory:");
    migration.up(db);
    const cols = db.prepare("PRAGMA table_info(telemetry_events)").all() as readonly {
      name: string;
    }[];
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
    const runner = new SqliteMigrationRunner(clock);
    runner.run(db, [migration, migration002, migration003, migration004]);
    const tables = [
      "compilation_log",
      "cache_metadata",
      "tool_invocation_log",
      "session_state",
      "file_transform_cache",
      "config_history",
      "spec_compile_cache",
    ] as const;
    for (const table of tables) {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as readonly {
        name: string;
      }[];
      const names = cols.map((c) => c.name);
      expect(names).toContain("project_id");
      expect(names).not.toContain("project_root");
    }
    db.close();
  });

  it("migration_runner_includes_005_through_008", () => {
    const db = new Database(":memory:");
    const runner = new SqliteMigrationRunner(clock);
    runner.run(db, [
      migration,
      migration002,
      migration003,
      migration004,
      migration005,
      migration006,
      migration007,
      migration008,
    ]);
    const ids = db.prepare("SELECT id FROM schema_migrations ORDER BY id").all() as {
      id: string;
    }[];
    expect(ids.map((r) => r.id)).toContain("005-quality-snapshots");
    expect(ids.map((r) => r.id)).toContain("006-classifier-scores");
    expect(ids.map((r) => r.id)).toContain("007-last-non-general-intent-index");
    expect(ids.map((r) => r.id)).toContain(
      "008-compilation-log-project-created-at-index",
    );
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
});
