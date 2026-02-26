import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { toISOTimestamp } from "#core/types/identifiers.js";
import { SqliteMigrationRunner } from "./sqlite-migration-runner.js";
import { migration as migration001 } from "./migrations/001-initial-schema.js";

const clock = {
  now(): ReturnType<typeof toISOTimestamp> {
    return toISOTimestamp(new Date().toISOString());
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
    if (row === undefined) throw new Error("expected one row");
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
});
