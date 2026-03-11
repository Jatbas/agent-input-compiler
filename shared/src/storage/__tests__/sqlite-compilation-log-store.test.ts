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
import { toPercentage } from "@jatbas/aic-core/core/types/scores.js";
import {
  EDITOR_ID,
  TASK_CLASS,
  TRIGGER_SOURCE,
} from "@jatbas/aic-core/core/types/enums.js";
import { migration as migration001 } from "../migrations/001-initial-schema.js";
import { migration as migration002 } from "../migrations/002-server-sessions.js";
import { migration as migration003 } from "../migrations/003-server-sessions-integrity.js";
import { migration as migration004 } from "../migrations/004-normalize-telemetry.js";
import { migration as migration005 } from "../migrations/005-trigger-source.js";
import { migration as migration007 } from "../migrations/007-conversation-id.js";
import { migration as migration008 } from "../migrations/008-session-state.js";
import { migration as migration009 } from "../migrations/009-file-transform-cache.js";
import { migration as migration010 } from "../migrations/010-tool-invocation-log.js";
import { migration as migration011 } from "../migrations/011-global-project-root.js";
import { migration as migration012 } from "../migrations/012-normalize-schema.js";
import { migration as migration013 } from "../migrations/013-project-id-fk.js";
import { migration as migration014 } from "../migrations/014-drop-project-root-columns.js";
import { SqliteCompilationLogStore } from "../sqlite-compilation-log-store.js";

const TEST_PROJECT_ID = toProjectId("018f0000-0000-7000-8000-000000000001");

describe("SqliteCompilationLogStore", () => {
  let db: Database.Database;

  afterEach(() => {
    if (db) db.close();
  });

  function setup(): SqliteCompilationLogStore {
    db = new Database(":memory:");
    migration001.up(db);
    migration002.up(db);
    migration003.up(db);
    migration004.up(db);
    migration005.up(db);
    migration007.up(db);
    migration008.up(db);
    migration009.up(db);
    migration010.up(db);
    migration011.up(db);
    migration012.up(db);
    migration013.up(db);
    migration014.up(db);
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
      tokenReductionPct: toPercentage(80),
      cacheHit: false,
      durationMs: toMilliseconds(150),
      editorId: EDITOR_ID.GENERIC,
      modelId: "gpt-4",
      sessionId: null,
      configHash: null,
      createdAt: toISOTimestamp("2026-02-27T12:00:00.000Z"),
      conversationId: null,
      triggerSource: TRIGGER_SOURCE.INTERNAL_TEST,
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
      tokenReductionPct: toPercentage(80),
      cacheHit: false,
      durationMs: toMilliseconds(150),
      editorId: EDITOR_ID.GENERIC,
      modelId: "gpt-4",
      sessionId: null,
      configHash: null,
      createdAt: toISOTimestamp("2026-02-27T12:00:00.000Z"),
      conversationId: null,
      triggerSource: TRIGGER_SOURCE.INTERNAL_TEST,
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
      tokenReductionPct: toPercentage(0),
      cacheHit: true,
      durationMs: toMilliseconds(0),
      editorId: EDITOR_ID.GENERIC,
      modelId: "",
      sessionId: null,
      configHash: null,
      createdAt: toISOTimestamp("2026-02-27T12:00:00.000Z"),
      conversationId: null,
      triggerSource: TRIGGER_SOURCE.INTERNAL_TEST,
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
      "INSERT INTO config_history (config_hash, config_json, created_at) VALUES (?, ?, ?)",
    ).run(configHash, "{}", "2026-02-28T12:00:00.000Z");
    const entry: CompilationLogEntry = {
      id: toUUIDv7("00000000-0000-7000-8000-000000000003"),
      intent: "test",
      taskClass: TASK_CLASS.REFACTOR,
      filesSelected: 1,
      filesTotal: 1,
      tokensRaw: toTokenCount(100),
      tokensCompiled: toTokenCount(50),
      tokenReductionPct: toPercentage(50),
      cacheHit: false,
      durationMs: toMilliseconds(100),
      editorId: EDITOR_ID.GENERIC,
      modelId: "",
      sessionId: sid,
      configHash,
      createdAt: toISOTimestamp("2026-02-28T12:00:00.000Z"),
      conversationId: null,
      triggerSource: TRIGGER_SOURCE.INTERNAL_TEST,
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
      tokenReductionPct: toPercentage(0),
      cacheHit: false,
      durationMs: toMilliseconds(0),
      editorId: EDITOR_ID.GENERIC,
      modelId: "",
      sessionId: null,
      configHash: null,
      createdAt: toISOTimestamp("2026-02-28T12:00:00.000Z"),
      triggerSource: TRIGGER_SOURCE.CLI,
      conversationId: null,
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
      tokenReductionPct: toPercentage(0),
      cacheHit: false,
      durationMs: toMilliseconds(0),
      editorId: EDITOR_ID.GENERIC,
      modelId: "",
      sessionId: null,
      configHash: null,
      createdAt: toISOTimestamp("2026-02-28T12:00:00.000Z"),
      conversationId: convId,
      triggerSource: TRIGGER_SOURCE.INTERNAL_TEST,
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
      tokenReductionPct: toPercentage(0),
      cacheHit: false,
      durationMs: toMilliseconds(0),
      editorId: EDITOR_ID.GENERIC,
      modelId: "",
      sessionId: null,
      configHash: null,
      createdAt: toISOTimestamp("2026-02-28T12:00:00.000Z"),
      conversationId: null,
    };
    store.record(entry);
    const row = db
      .prepare("SELECT trigger_source FROM compilation_log WHERE id = ?")
      .get(entry.id) as { trigger_source: string | null };
    expect(row).toBeDefined();
    expect(row.trigger_source).toBeNull();
  });
});
