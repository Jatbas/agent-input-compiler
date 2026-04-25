// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { CompilationLogEntry } from "@jatbas/aic-core/core/types/compilation-log-entry.js";
import {
  toUUIDv7,
  toISOTimestamp,
  toSessionId,
  toConversationId,
  toProjectId,
} from "@jatbas/aic-core/core/types/identifiers.js";
import { toTokenCount, toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import { toRatio01, toConfidence } from "@jatbas/aic-core/core/types/scores.js";
import {
  EDITOR_ID,
  TASK_CLASS,
  TRIGGER_SOURCE,
} from "@jatbas/aic-core/core/types/enums.js";
import { migration } from "../migrations/001-consolidated-schema.js";
import { migration as migration003 } from "../migrations/003-compilation-selection-trace.js";
import { migration as migration006 } from "../migrations/006-classifier-scores.js";
import { migration as migration009 } from "../migrations/009-compilation-log-total-budget.js";
import { SqliteCompilationLogStore } from "../sqlite-compilation-log-store.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import {
  EXCLUSION_REASON,
  type SelectionTrace,
} from "@jatbas/aic-core/core/types/selection-trace.js";

const TEST_PROJECT_ID = toProjectId("018f0000-0000-7000-8000-000000000001");

describe("SqliteCompilationLogStore", () => {
  let db: Database.Database;

  afterEach(() => {
    if (db) db.close();
  });

  function setup(): SqliteCompilationLogStore {
    db = new Database(":memory:");
    migration.up(db);
    migration003.up(db);
    migration006.up(db);
    migration009.up(db);
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(
      TEST_PROJECT_ID,
      "/test/project",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    );
    return new SqliteCompilationLogStore(TEST_PROJECT_ID, db);
  }

  it("sqlite_compilation_log_store_record", () => {
    const store = setup();
    const entry: CompilationLogEntry = {
      id: toUUIDv7("00000000-0000-7000-8000-000000000099"),
      intent: "summarise the user's message",
      taskClass: TASK_CLASS.REFACTOR,
      filesSelected: 5,
      filesTotal: 100,
      tokensRaw: toTokenCount(10000),
      tokensCompiled: toTokenCount(2000),
      tokenReductionPct: toRatio01(0.8),
      cacheHit: false,
      durationMs: toMilliseconds(150),
      editorId: EDITOR_ID.GENERIC,
      modelId: "gpt-4",
      sessionId: null,
      configHash: null,
      createdAt: toISOTimestamp("2026-02-27T12:00:00.000Z"),
      conversationId: null,
      triggerSource: TRIGGER_SOURCE.INTERNAL_TEST,
      selectionTrace: null,
      classifierConfidence: null,
      specificityScore: null,
      underspecificationIndex: null,
      totalBudget: toTokenCount(32000),
    };
    store.record(entry);
    const row = db
      .prepare("SELECT id, intent, project_id FROM compilation_log WHERE id = ?")
      .get(entry.id) as { id: string; intent: string; project_id: string };
    expect(row).toBeDefined();
    expect(row.project_id).toBe(TEST_PROJECT_ID);
  });

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
      tokenReductionPct: toRatio01(0.8),
      cacheHit: false,
      durationMs: toMilliseconds(150),
      editorId: EDITOR_ID.GENERIC,
      modelId: "gpt-4",
      sessionId: null,
      configHash: null,
      createdAt: toISOTimestamp("2026-02-27T12:00:00.000Z"),
      conversationId: null,
      triggerSource: TRIGGER_SOURCE.INTERNAL_TEST,
      selectionTrace: null,
      classifierConfidence: null,
      specificityScore: null,
      underspecificationIndex: null,
      totalBudget: toTokenCount(32000),
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
      cache_hit: number;
      duration_ms: number;
      editor_id: string;
      model_id: string | null;
      session_id: string | null;
      config_hash: string | null;
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
    expect(row.session_id).toBeNull();
    expect(row.config_hash).toBeNull();
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
      tokenReductionPct: toRatio01(0),
      cacheHit: true,
      durationMs: toMilliseconds(0),
      editorId: EDITOR_ID.GENERIC,
      modelId: "",
      sessionId: null,
      configHash: null,
      createdAt: toISOTimestamp("2026-02-27T12:00:00.000Z"),
      conversationId: null,
      triggerSource: TRIGGER_SOURCE.INTERNAL_TEST,
      selectionTrace: null,
      classifierConfidence: null,
      specificityScore: null,
      underspecificationIndex: null,
      totalBudget: toTokenCount(32000),
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

  it("SqliteCompilationLogStore with session_id and config_hash", () => {
    const store = setup();
    const sid = toSessionId("018c3d4e-0000-7000-8000-000000000010");
    db.prepare(
      "INSERT INTO server_sessions (session_id, started_at, stopped_at, stop_reason, pid, version, installation_ok, installation_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(sid, "2026-02-28T12:00:00.000Z", null, null, 1, "0.2.0", 1, "");
    const configHash = "abc123def456";
    db.prepare(
      "INSERT INTO config_history (project_id, config_hash, config_json, created_at) VALUES (?, ?, ?, ?)",
    ).run(TEST_PROJECT_ID, configHash, "{}", "2026-02-28T12:00:00.000Z");
    const entry: CompilationLogEntry = {
      id: toUUIDv7("00000000-0000-7000-8000-000000000003"),
      intent: "test",
      taskClass: TASK_CLASS.REFACTOR,
      filesSelected: 1,
      filesTotal: 1,
      tokensRaw: toTokenCount(100),
      tokensCompiled: toTokenCount(50),
      tokenReductionPct: toRatio01(0.5),
      cacheHit: false,
      durationMs: toMilliseconds(100),
      editorId: EDITOR_ID.GENERIC,
      modelId: "",
      sessionId: sid,
      configHash,
      createdAt: toISOTimestamp("2026-02-28T12:00:00.000Z"),
      conversationId: null,
      triggerSource: TRIGGER_SOURCE.INTERNAL_TEST,
      selectionTrace: null,
      classifierConfidence: null,
      specificityScore: null,
      underspecificationIndex: null,
      totalBudget: toTokenCount(32000),
    };
    store.record(entry);
    const row = db
      .prepare("SELECT session_id, config_hash FROM compilation_log WHERE id = ?")
      .get(entry.id) as { session_id: string | null; config_hash: string | null };
    expect(row).toBeDefined();
    expect(row.session_id).toBe(sid);
    expect(row.config_hash).toBe(configHash);
  });

  it("record_with_trigger_source_persists_column", () => {
    const store = setup();
    const entry: CompilationLogEntry = {
      id: toUUIDv7("00000000-0000-7000-8000-000000000004"),
      intent: "test",
      taskClass: TASK_CLASS.REFACTOR,
      filesSelected: 0,
      filesTotal: 0,
      tokensRaw: toTokenCount(0),
      tokensCompiled: toTokenCount(0),
      tokenReductionPct: toRatio01(0),
      cacheHit: false,
      durationMs: toMilliseconds(0),
      editorId: EDITOR_ID.GENERIC,
      modelId: "",
      sessionId: null,
      configHash: null,
      createdAt: toISOTimestamp("2026-02-28T12:00:00.000Z"),
      triggerSource: TRIGGER_SOURCE.CLI,
      conversationId: null,
      selectionTrace: null,
      classifierConfidence: null,
      specificityScore: null,
      underspecificationIndex: null,
      totalBudget: toTokenCount(32000),
    };
    store.record(entry);
    const row = db
      .prepare("SELECT trigger_source FROM compilation_log WHERE id = ?")
      .get(entry.id) as { trigger_source: string | null };
    expect(row).toBeDefined();
    expect(row.trigger_source).toBe("cli");
  });

  it("sqlite_compilation_log_store_conversation_id", () => {
    const store = setup();
    const convId = toConversationId("conv-123");
    const entry: CompilationLogEntry = {
      id: toUUIDv7("00000000-0000-7000-8000-000000000006"),
      intent: "test",
      taskClass: TASK_CLASS.GENERAL,
      filesSelected: 0,
      filesTotal: 0,
      tokensRaw: toTokenCount(0),
      tokensCompiled: toTokenCount(0),
      tokenReductionPct: toRatio01(0),
      cacheHit: false,
      durationMs: toMilliseconds(0),
      editorId: EDITOR_ID.GENERIC,
      modelId: "",
      sessionId: null,
      configHash: null,
      createdAt: toISOTimestamp("2026-02-28T12:00:00.000Z"),
      conversationId: convId,
      triggerSource: TRIGGER_SOURCE.INTERNAL_TEST,
      selectionTrace: null,
      classifierConfidence: null,
      specificityScore: null,
      underspecificationIndex: null,
      totalBudget: toTokenCount(32000),
    };
    store.record(entry);
    const row = db
      .prepare("SELECT conversation_id FROM compilation_log WHERE id = ?")
      .get(entry.id) as { conversation_id: string | null };
    expect(row).toBeDefined();
    expect(row.conversation_id).toBe("conv-123");
  });

  it("record_without_trigger_source_stores_null", () => {
    const store = setup();
    const entry: CompilationLogEntry = {
      id: toUUIDv7("00000000-0000-7000-8000-000000000005"),
      intent: "test",
      taskClass: TASK_CLASS.GENERAL,
      filesSelected: 0,
      filesTotal: 0,
      tokensRaw: toTokenCount(0),
      tokensCompiled: toTokenCount(0),
      tokenReductionPct: toRatio01(0),
      cacheHit: false,
      durationMs: toMilliseconds(0),
      editorId: EDITOR_ID.GENERIC,
      modelId: "",
      sessionId: null,
      configHash: null,
      createdAt: toISOTimestamp("2026-02-28T12:00:00.000Z"),
      conversationId: null,
      selectionTrace: null,
      classifierConfidence: null,
      specificityScore: null,
      underspecificationIndex: null,
      totalBudget: toTokenCount(32000),
    };
    store.record(entry);
    const row = db
      .prepare("SELECT trigger_source FROM compilation_log WHERE id = ?")
      .get(entry.id) as { trigger_source: string | null };
    expect(row).toBeDefined();
    expect(row.trigger_source).toBeNull();
  });

  it("sqlite_compilation_log_store_selection_trace_round_trip", () => {
    const store = setup();
    const trace: SelectionTrace = {
      selectedFiles: [
        {
          path: toRelativePath("src/a.ts"),
          score: 0.9,
          signals: {
            pathRelevance: 0.1,
            importProximity: 0.2,
            symbolRelevance: 0.3,
            recency: 0.4,
            sizePenalty: 0.5,
            ruleBoostCount: 0,
            rulePenaltyCount: 0,
          },
        },
      ],
      excludedFiles: [
        {
          path: toRelativePath("src/b.ts"),
          score: 0,
          reason: EXCLUSION_REASON.BUDGET_EXCEEDED,
        },
      ],
    };
    const entry: CompilationLogEntry = {
      id: toUUIDv7("00000000-0000-7000-8000-000000000098"),
      intent: "trace test",
      taskClass: TASK_CLASS.GENERAL,
      filesSelected: 1,
      filesTotal: 2,
      tokensRaw: toTokenCount(100),
      tokensCompiled: toTokenCount(50),
      tokenReductionPct: toRatio01(0.5),
      cacheHit: false,
      durationMs: toMilliseconds(1),
      editorId: EDITOR_ID.GENERIC,
      modelId: "",
      sessionId: null,
      configHash: null,
      createdAt: toISOTimestamp("2026-02-28T12:00:00.000Z"),
      conversationId: null,
      triggerSource: TRIGGER_SOURCE.INTERNAL_TEST,
      selectionTrace: trace,
      classifierConfidence: null,
      specificityScore: null,
      underspecificationIndex: null,
      totalBudget: toTokenCount(32000),
    };
    store.record(entry);
    const raw = db
      .prepare("SELECT selection_trace_json FROM compilation_log WHERE id = ?")
      .get(entry.id) as { selection_trace_json: string | null };
    expect(raw.selection_trace_json).not.toBeNull();
    expect(JSON.parse(raw.selection_trace_json ?? "")).toEqual({
      selectedFiles: [
        {
          path: "src/a.ts",
          score: 0.9,
          signals: {
            pathRelevance: 0.1,
            importProximity: 0.2,
            symbolRelevance: 0.3,
            recency: 0.4,
            sizePenalty: 0.5,
            ruleBoostCount: 0,
            rulePenaltyCount: 0,
          },
        },
      ],
      excludedFiles: [
        {
          path: "src/b.ts",
          score: 0,
          reason: "budget_exceeded",
        },
      ],
    });
  });

  it("record_stores_classifier_confidence_specificity_and_underspecification", () => {
    const store = setup();
    const entry: CompilationLogEntry = {
      id: toUUIDv7("00000000-0000-7000-8000-000000000099"),
      intent: "fix auth middleware",
      taskClass: TASK_CLASS.BUGFIX,
      filesSelected: 1,
      filesTotal: 10,
      tokensRaw: toTokenCount(100),
      tokensCompiled: toTokenCount(50),
      tokenReductionPct: toRatio01(0.5),
      cacheHit: false,
      durationMs: toMilliseconds(10),
      editorId: EDITOR_ID.GENERIC,
      modelId: "",
      sessionId: null,
      configHash: null,
      createdAt: toISOTimestamp("2026-04-19T00:00:00.000Z"),
      conversationId: null,
      triggerSource: TRIGGER_SOURCE.INTERNAL_TEST,
      selectionTrace: null,
      classifierConfidence: toConfidence(0.5),
      specificityScore: toConfidence(0.333),
      underspecificationIndex: toConfidence(0.5),
      totalBudget: toTokenCount(32000),
    };
    store.record(entry);
    const row = db
      .prepare(
        "SELECT classifier_confidence, specificity_score, underspecification_index FROM compilation_log WHERE id = ?",
      )
      .get(entry.id) as {
      classifier_confidence: number | null;
      specificity_score: number | null;
      underspecification_index: number | null;
    };
    expect(row.classifier_confidence).toBeCloseTo(0.5);
    expect(row.specificity_score).toBeCloseTo(0.333);
    expect(row.underspecification_index).toBeCloseTo(0.5);
  });
});
