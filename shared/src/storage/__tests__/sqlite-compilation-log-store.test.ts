import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { CompilationLogEntry } from "#core/types/compilation-log-entry.js";
import { toUUIDv7, toISOTimestamp } from "#core/types/identifiers.js";
import { toTokenCount, toMilliseconds } from "#core/types/units.js";
import { toPercentage } from "#core/types/scores.js";
import { EDITOR_ID, TASK_CLASS } from "#core/types/enums.js";
import { migration as migration001 } from "../migrations/001-initial-schema.js";
import { SqliteCompilationLogStore } from "../sqlite-compilation-log-store.js";

describe("SqliteCompilationLogStore", () => {
  let db: Database.Database;

  afterEach(() => {
    if (db) db.close();
  });

  function setup(): SqliteCompilationLogStore {
    db = new Database(":memory:");
    migration001.up(db);
    return new SqliteCompilationLogStore(db);
  }

  it("SqliteCompilationLogStore record inserts row", () => {
    const store = setup();
    const entry: CompilationLogEntry = {
      id: toUUIDv7("00000000-0000-7000-8000-000000000001"),
      intent: "summarise the user's message",
      taskClass: TASK_CLASS.REFACTOR,
      filesSelected: 5,
      filesTotal: 100,
      tokensRaw: toTokenCount(10000),
      tokensCompiled: toTokenCount(2000),
      tokenReductionPct: toPercentage(80),
      cacheHit: false,
      durationMs: toMilliseconds(150),
      editorId: EDITOR_ID.GENERIC,
      modelId: "gpt-4",
      createdAt: toISOTimestamp("2026-02-27T12:00:00.000Z"),
    };
    store.record(entry);
    const row = db
      .prepare("SELECT * FROM compilation_log WHERE id = ?")
      .get(entry.id) as {
      id: string;
      intent: string;
      task_class: string;
      files_selected: number;
      files_total: number;
      tokens_raw: number;
      tokens_compiled: number;
      token_reduction_pct: number;
      cache_hit: number;
      duration_ms: number;
      editor_id: string;
      model_id: string | null;
      created_at: string;
    };
    expect(row).toBeDefined();
    expect(row.id).toBe(entry.id);
    expect(row.intent).toBe(entry.intent);
    expect(row.task_class).toBe(entry.taskClass);
    expect(row.files_selected).toBe(entry.filesSelected);
    expect(row.tokens_raw).toBe(entry.tokensRaw);
    expect(row.tokens_compiled).toBe(entry.tokensCompiled);
    expect(row.cache_hit).toBe(0);
    expect(row.created_at).toBe(entry.createdAt);
  });

  it("SqliteCompilationLogStore empty intent zero tokens", () => {
    const store = setup();
    const entry: CompilationLogEntry = {
      id: toUUIDv7("00000000-0000-7000-8000-000000000002"),
      intent: "",
      taskClass: TASK_CLASS.GENERAL,
      filesSelected: 0,
      filesTotal: 0,
      tokensRaw: toTokenCount(0),
      tokensCompiled: toTokenCount(0),
      tokenReductionPct: toPercentage(0),
      cacheHit: true,
      durationMs: toMilliseconds(0),
      editorId: EDITOR_ID.GENERIC,
      modelId: "",
      createdAt: toISOTimestamp("2026-02-27T12:00:00.000Z"),
    };
    store.record(entry);
    const row = db
      .prepare("SELECT * FROM compilation_log WHERE id = ?")
      .get(entry.id) as {
      intent: string;
      tokens_raw: number;
      tokens_compiled: number;
    };
    expect(row).toBeDefined();
    expect(row.intent).toBe("");
    expect(row.tokens_raw).toBe(0);
    expect(row.tokens_compiled).toBe(0);
  });
});
