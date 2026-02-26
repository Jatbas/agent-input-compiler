import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { ExecutableDb } from "#core/interfaces/executable-db.interface.js";
import type { Clock } from "#core/interfaces/clock.interface.js";
import { toISOTimestamp } from "#core/types/identifiers.js";
import { toMilliseconds } from "#core/types/units.js";
import { migration as migration001 } from "../migrations/001-initial-schema.js";
import { SqliteStatusStore } from "../sqlite-status-store.js";

const stubClock: Clock = {
  now: () => toISOTimestamp("2025-06-15T12:00:00.000Z"),
  addMinutes: () => toISOTimestamp("2025-06-15T12:00:00.000Z"),
  durationMs: () => toMilliseconds(0),
};

describe("SqliteStatusStore", () => {
  let db: Database.Database;
  let store: SqliteStatusStore;

  afterEach(() => {
    if (db) db.close();
  });

  function setup(): void {
    db = new Database(":memory:");
    migration001.up(db);
    store = new SqliteStatusStore(db as unknown as ExecutableDb, stubClock);
  }

  it("sqlite_status_store_empty", () => {
    setup();
    const summary = store.getSummary();
    expect(summary.compilationsTotal).toBe(0);
    expect(summary.compilationsToday).toBe(0);
    expect(summary.cacheHitRatePct).toBeNull();
    expect(summary.lastCompilation).toBeNull();
    expect(summary.telemetryDisabled).toBe(true);
    expect(summary.avgReductionPct).toBeNull();
    expect(summary.totalTokensSaved).toBeNull();
    expect(summary.guardByType).toEqual({});
    expect(summary.topTaskClasses).toEqual([]);
  });

  it("sqlite_status_store_one_compilation", () => {
    setup();
    db.prepare(
      `INSERT INTO compilation_log (
        id, intent, task_class, files_selected, files_total, tokens_raw, tokens_compiled,
        token_reduction_pct, cache_hit, duration_ms, editor_id, model_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "018c3d4e-0000-7000-8000-000000000001",
      "fix auth",
      "refactor",
      8,
      142,
      45000,
      7200,
      84,
      0,
      1200,
      "cursor",
      "gpt-4",
      "2026-02-25T12:00:00.000Z",
    );
    const summary = store.getSummary();
    expect(summary.compilationsTotal).toBe(1);
    expect(summary.compilationsToday).toBe(0);
    expect(summary.lastCompilation).not.toBeNull();
    if (summary.lastCompilation !== null) {
      expect(summary.lastCompilation.intent).toBe("fix auth");
      expect(summary.lastCompilation.filesSelected).toBe(8);
      expect(summary.lastCompilation.filesTotal).toBe(142);
      expect(summary.lastCompilation.tokensCompiled).toBe(7200);
      expect(summary.lastCompilation.tokenReductionPct).toBe(84);
      expect(summary.lastCompilation.created_at).toBe("2026-02-25T12:00:00.000Z");
    }
  });

  it("sqlite_status_store_telemetry", () => {
    setup();
    db.prepare(
      `INSERT INTO telemetry_events (
        id, repo_id, task_class, tokens_raw, tokens_compiled, token_reduction_pct,
        duration_ms, cache_hit, editor_id, files_selected, files_total, guard_findings, guard_blocks, transform_savings, tiers_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "018c3d4e-0000-7000-8000-000000000002",
      "repo-hash",
      "refactor",
      10000,
      4000,
      60,
      500,
      0,
      "cursor",
      5,
      10,
      0,
      0,
      0,
      "{}",
      "2026-02-26T12:00:00.000Z",
    );
    const summary = store.getSummary();
    expect(summary.telemetryDisabled).toBe(false);
    expect(summary.avgReductionPct).toBe(60);
    expect(summary.totalTokensSaved).toBe(6000);
  });

  it("sqlite_status_store_guard_by_type", () => {
    setup();
    db.prepare(
      `INSERT INTO compilation_log (
        id, intent, task_class, files_selected, files_total, tokens_raw, tokens_compiled,
        token_reduction_pct, cache_hit, duration_ms, editor_id, model_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "018c3d4e-0000-7000-8000-000000000003",
      "intent",
      "refactor",
      1,
      1,
      100,
      50,
      50,
      0,
      100,
      "generic",
      null,
      "2026-02-26T12:00:00.000Z",
    );
    db.prepare(
      `INSERT INTO guard_findings (id, compilation_id, type, severity, file, line, message, pattern, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "018c3d4e-0000-7000-8000-000000000004",
      "018c3d4e-0000-7000-8000-000000000003",
      "secret",
      "block",
      "src/secret.ts",
      null,
      "secret",
      null,
      "2026-02-26T12:00:00.000Z",
    );
    db.prepare(
      `INSERT INTO guard_findings (id, compilation_id, type, severity, file, line, message, pattern, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "018c3d4e-0000-7000-8000-000000000005",
      "018c3d4e-0000-7000-8000-000000000003",
      "secret",
      "block",
      "src/other.ts",
      null,
      "secret",
      null,
      "2026-02-26T12:00:00.000Z",
    );
    db.prepare(
      `INSERT INTO guard_findings (id, compilation_id, type, severity, file, line, message, pattern, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "018c3d4e-0000-7000-8000-000000000006",
      "018c3d4e-0000-7000-8000-000000000003",
      "excluded-file",
      "block",
      "src/ignored.ts",
      null,
      "excluded",
      null,
      "2026-02-26T12:00:00.000Z",
    );
    const summary = store.getSummary();
    expect(summary.guardByType).toEqual({ secret: 2, "excluded-file": 1 });
  });
});
