import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { ExecutableDb } from "#core/interfaces/executable-db.interface.js";
import type { Clock } from "#core/interfaces/clock.interface.js";
import { toISOTimestamp } from "#core/types/identifiers.js";
import { toMilliseconds } from "#core/types/units.js";
import { migration as migration001 } from "../migrations/001-initial-schema.js";
import { migration as migration002 } from "../migrations/002-server-sessions.js";
import { migration as migration003 } from "../migrations/003-server-sessions-integrity.js";
import { migration as migration004 } from "../migrations/004-normalize-telemetry.js";
import { SqliteStatusStore } from "../sqlite-status-store.js";

const stubClock: Clock = {
  now: () => toISOTimestamp("2025-06-15T12:00:00.000Z"),
  addMinutes: () => toISOTimestamp("2025-06-15T12:00:00.000Z"),
  durationMs: () => toMilliseconds(0),
};

function insertCompilationLog(
  db: Database.Database,
  id: string,
  overrides: Record<string, unknown> = {},
): void {
  const defaults = {
    intent: "test",
    task_class: "refactor",
    files_selected: 1,
    files_total: 1,
    tokens_raw: 100,
    tokens_compiled: 50,
    token_reduction_pct: 50,
    cache_hit: 0,
    duration_ms: 100,
    editor_id: "generic",
    model_id: null,
    created_at: "2026-02-26T12:00:00.000Z",
    ...overrides,
  };
  db.prepare(
    `INSERT INTO compilation_log (
      id, intent, task_class, files_selected, files_total, tokens_raw, tokens_compiled,
      token_reduction_pct, cache_hit, duration_ms, editor_id, model_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    defaults.intent,
    defaults.task_class,
    defaults.files_selected,
    defaults.files_total,
    defaults.tokens_raw,
    defaults.tokens_compiled,
    defaults.token_reduction_pct,
    defaults.cache_hit,
    defaults.duration_ms,
    defaults.editor_id,
    defaults.model_id,
    defaults.created_at,
  );
}

function insertTelemetryEvent(
  db: Database.Database,
  id: string,
  compilationId: string,
): void {
  db.prepare(
    `INSERT INTO telemetry_events (
      id, compilation_id, repo_id,
      guard_findings, guard_blocks, transform_savings, tiers_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, compilationId, "repo-hash", 0, 0, 0, "{}", "2026-02-26T12:00:00.000Z");
}

describe("SqliteStatusStore", () => {
  let db: Database.Database;
  let store: SqliteStatusStore;

  afterEach(() => {
    if (db) db.close();
  });

  function setup(): void {
    db = new Database(":memory:");
    migration001.up(db);
    migration002.up(db);
    migration003.up(db);
    migration004.up(db);
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
    expect(summary.installationOk).toBeNull();
    expect(summary.installationNotes).toBeNull();
  });

  it("sqlite_status_store_one_compilation", () => {
    setup();
    insertCompilationLog(db, "018c3d4e-0000-7000-8000-000000000001", {
      intent: "fix auth",
      task_class: "refactor",
      files_selected: 8,
      files_total: 142,
      tokens_raw: 45000,
      tokens_compiled: 7200,
      token_reduction_pct: 84,
      cache_hit: 0,
      duration_ms: 1200,
      editor_id: "cursor",
      model_id: "gpt-4",
      created_at: "2026-02-25T12:00:00.000Z",
    });
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
    const compilationId = "018c3d4e-0000-7000-8000-000000000001";
    insertCompilationLog(db, compilationId, {
      tokens_raw: 10000,
      tokens_compiled: 4000,
      token_reduction_pct: 60,
      duration_ms: 500,
    });
    insertTelemetryEvent(db, "018c3d4e-0000-7000-8000-000000000002", compilationId);
    const summary = store.getSummary();
    expect(summary.telemetryDisabled).toBe(false);
    expect(summary.avgReductionPct).toBe(60);
    expect(summary.totalTokensSaved).toBe(6000);
  });

  it("sqlite_status_store_guard_by_type", () => {
    setup();
    insertCompilationLog(db, "018c3d4e-0000-7000-8000-000000000003");
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

  it("getSummary_includes_installation", () => {
    setup();
    let summary = store.getSummary();
    expect(summary.installationOk).toBeNull();
    expect(summary.installationNotes).toBeNull();
    db.prepare(
      "INSERT INTO server_sessions (session_id, started_at, stopped_at, stop_reason, pid, version, installation_ok, installation_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "018c3d4e-0000-7000-8000-000000000010",
      "2026-02-28T12:00:00.000Z",
      null,
      null,
      1,
      "0.2.0",
      1,
      "",
    );
    summary = store.getSummary();
    expect(summary.installationOk).toBe(true);
    expect(summary.installationNotes).toBe("");
    db.prepare(
      "INSERT INTO server_sessions (session_id, started_at, stopped_at, stop_reason, pid, version, installation_ok, installation_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "018c3d4e-0000-7000-8000-000000000011",
      "2026-02-28T13:00:00.000Z",
      null,
      null,
      2,
      "0.2.0",
      0,
      "trigger rule not found",
    );
    summary = store.getSummary();
    expect(summary.installationOk).toBe(false);
    expect(summary.installationNotes).toBe("trigger rule not found");
  });
});
