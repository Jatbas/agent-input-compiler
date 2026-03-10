// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import {
  toISOTimestamp,
  toConversationId,
} from "@jatbas/aic-core/core/types/identifiers.js";
import { toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
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
import { SqliteStatusStore } from "../sqlite-status-store.js";

const stubClock: Clock = {
  now: () => toISOTimestamp("2025-06-15T12:00:00.000Z"),
  addMinutes: () => toISOTimestamp("2025-06-15T12:00:00.000Z"),
  durationMs: () => toMilliseconds(0),
};

const TEST_PROJECT_ROOT = "/test/project";

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
    cache_hit: 0,
    duration_ms: 100,
    editor_id: "generic",
    model_id: null,
    created_at: "2026-02-26T12:00:00.000Z",
    conversation_id: null as string | null,
    trigger_source: null as string | null,
    project_root: TEST_PROJECT_ROOT,
    ...overrides,
  };
  const conversationId = defaults.conversation_id ?? null;
  const triggerSource = defaults.trigger_source ?? null;
  const projectRoot = defaults.project_root as string;
  db.prepare(
    `INSERT INTO compilation_log (
      id, intent, task_class, files_selected, files_total, tokens_raw, tokens_compiled,
      cache_hit, duration_ms, editor_id, model_id, created_at, conversation_id, trigger_source, project_root
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    defaults.intent,
    defaults.task_class,
    defaults.files_selected,
    defaults.files_total,
    defaults.tokens_raw,
    defaults.tokens_compiled,
    defaults.cache_hit,
    defaults.duration_ms,
    defaults.editor_id,
    defaults.model_id,
    defaults.created_at,
    conversationId,
    triggerSource,
    projectRoot,
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
    migration005.up(db);
    migration007.up(db);
    migration008.up(db);
    migration009.up(db);
    migration010.up(db);
    migration011.up(db);
    migration012.up(db);
    store = new SqliteStatusStore(
      toAbsolutePath(TEST_PROJECT_ROOT),
      db as unknown as ExecutableDb,
      stubClock,
    );
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
    expect(summary.totalTokensRaw).toBe(0);
    expect(summary.totalTokensCompiled).toBe(0);
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
    expect(summary.totalTokensRaw).toBe(45000);
    expect(summary.totalTokensCompiled).toBe(7200);
    expect(summary.totalTokensSaved).toBe(37800);
    expect(summary.avgReductionPct).toBe(84);
    expect(summary.lastCompilation).not.toBeNull();
    if (summary.lastCompilation !== null) {
      expect(summary.lastCompilation.intent).toBe("fix auth");
      expect(summary.lastCompilation.filesSelected).toBe(8);
      expect(summary.lastCompilation.filesTotal).toBe(142);
      expect(summary.lastCompilation.tokensCompiled).toBe(7200);
      expect(summary.lastCompilation.tokenReductionPct).toBe(84);
      expect(summary.lastCompilation.created_at).toBe("2026-02-25T12:00:00.000Z");
      expect(summary.lastCompilation.editorId).toBe("cursor");
      expect(summary.lastCompilation.modelId).toBe("gpt-4");
    }
  });

  it("sqlite_status_store_telemetry_disabled_flag", () => {
    setup();
    const compilationId = "018c3d4e-0000-7000-8000-000000000001";
    insertCompilationLog(db, compilationId, {
      tokens_raw: 10000,
      tokens_compiled: 4000,
      token_reduction_pct: 60,
      duration_ms: 500,
    });
    const before = store.getSummary();
    expect(before.telemetryDisabled).toBe(true);
    expect(before.totalTokensSaved).toBe(6000);
    expect(before.avgReductionPct).toBe(60);
    insertTelemetryEvent(db, "018c3d4e-0000-7000-8000-000000000002", compilationId);
    const after = store.getSummary();
    expect(after.telemetryDisabled).toBe(false);
    expect(after.totalTokensSaved).toBe(6000);
    expect(after.avgReductionPct).toBe(60);
  });

  it("cache_hits_do_not_skew_avgReductionPct", () => {
    setup();
    insertCompilationLog(db, "018c3d4e-0000-7000-8000-000000000040", {
      tokens_raw: 10000,
      tokens_compiled: 200,
      token_reduction_pct: 98,
      cache_hit: 0,
    });
    insertCompilationLog(db, "018c3d4e-0000-7000-8000-000000000041", {
      tokens_raw: 10000,
      tokens_compiled: 200,
      token_reduction_pct: 0,
      cache_hit: 1,
    });
    insertCompilationLog(db, "018c3d4e-0000-7000-8000-000000000042", {
      tokens_raw: 10000,
      tokens_compiled: 200,
      token_reduction_pct: 0,
      cache_hit: 1,
    });
    const summary = store.getSummary();
    expect(summary.totalTokensRaw).toBe(30000);
    expect(summary.totalTokensCompiled).toBe(600);
    expect(summary.totalTokensSaved).toBe(29400);
    expect(summary.avgReductionPct).toBe(98);
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

  it("getConversationSummary_returns_null_when_no_rows", () => {
    setup();
    const result = store.getConversationSummary(toConversationId("conv-unknown"));
    expect(result).toBeNull();
  });

  it("getConversationSummary_returns_aggregates_when_rows_exist", () => {
    setup();
    insertCompilationLog(db, "018c3d4e-0000-7000-8000-000000000020", {
      conversation_id: "conv-1",
      intent: "fix auth",
      task_class: "refactor",
      tokens_raw: 1000,
      tokens_compiled: 400,
      token_reduction_pct: 60,
      created_at: "2026-02-26T12:00:00.000Z",
    });
    insertCompilationLog(db, "018c3d4e-0000-7000-8000-000000000021", {
      conversation_id: "conv-1",
      intent: "add test",
      task_class: "test",
      tokens_raw: 500,
      tokens_compiled: 200,
      token_reduction_pct: 60,
      created_at: "2026-02-26T12:01:00.000Z",
    });
    const result = store.getConversationSummary(toConversationId("conv-1"));
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.conversationId).toBe("conv-1");
    expect(result.compilationsInConversation).toBe(2);
    expect(result.totalTokensRaw).toBe(1500);
    expect(result.totalTokensCompiled).toBe(600);
    expect(result.totalTokensSaved).toBe(900);
    expect(result.avgReductionPct).toBe(60);
    expect(result.lastCompilationInConversation).not.toBeNull();
    if (result.lastCompilationInConversation !== null) {
      expect(result.lastCompilationInConversation.intent).toBe("add test");
      expect(result.lastCompilationInConversation.created_at).toBe(
        "2026-02-26T12:01:00.000Z",
      );
    }
    expect(result.topTaskClasses).toHaveLength(2);
    const refactor = result.topTaskClasses.find((t) => t.taskClass === "refactor");
    const testClass = result.topTaskClasses.find((t) => t.taskClass === "test");
    expect(refactor?.count).toBe(1);
    expect(testClass?.count).toBe(1);
  });

  it("getConversationSummary_cache_hits_do_not_skew_avgReductionPct", () => {
    setup();
    insertCompilationLog(db, "018c3d4e-0000-7000-8000-000000000050", {
      conversation_id: "conv-cache",
      tokens_raw: 5000,
      tokens_compiled: 100,
      token_reduction_pct: 98,
      cache_hit: 0,
    });
    insertCompilationLog(db, "018c3d4e-0000-7000-8000-000000000051", {
      conversation_id: "conv-cache",
      tokens_raw: 5000,
      tokens_compiled: 100,
      token_reduction_pct: 0,
      cache_hit: 1,
    });
    const result = store.getConversationSummary(toConversationId("conv-cache"));
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.totalTokensRaw).toBe(10000);
    expect(result.totalTokensCompiled).toBe(200);
    expect(result.totalTokensSaved).toBe(9800);
    expect(result.avgReductionPct).toBe(98);
  });

  it("getConversationSummary_ignores_other_conversations", () => {
    setup();
    insertCompilationLog(db, "018c3d4e-0000-7000-8000-000000000030", {
      conversation_id: "conv-a",
      tokens_raw: 100,
      tokens_compiled: 50,
    });
    insertCompilationLog(db, "018c3d4e-0000-7000-8000-000000000031", {
      conversation_id: "conv-b",
      tokens_raw: 200,
      tokens_compiled: 80,
    });
    const result = store.getConversationSummary(toConversationId("conv-a"));
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.compilationsInConversation).toBe(1);
    expect(result.totalTokensRaw).toBe(100);
    expect(result.totalTokensCompiled).toBe(50);
  });

  it("getSummary_excludes_internal_test", () => {
    setup();
    insertCompilationLog(db, "018c3d4e-0000-7000-8000-000000000060", {
      trigger_source: null,
      intent: "user intent",
      created_at: "2026-02-26T14:00:00.000Z",
    });
    insertCompilationLog(db, "018c3d4e-0000-7000-8000-000000000061", {
      trigger_source: "internal_test",
      intent: "internal test",
      created_at: "2026-02-26T14:01:00.000Z",
    });
    const summary = store.getSummary();
    expect(summary.compilationsTotal).toBe(1);
    expect(summary.lastCompilation).not.toBeNull();
    if (summary.lastCompilation !== null) {
      expect(summary.lastCompilation.intent).toBe("user intent");
    }
  });

  it("getConversationSummary_excludes_internal_test", () => {
    setup();
    insertCompilationLog(db, "018c3d4e-0000-7000-8000-000000000070", {
      conversation_id: "conv-excl",
      trigger_source: null,
      intent: "user compilation",
      created_at: "2026-02-26T15:00:00.000Z",
    });
    insertCompilationLog(db, "018c3d4e-0000-7000-8000-000000000071", {
      conversation_id: "conv-excl",
      trigger_source: "internal_test",
      intent: "internal test compilation",
      created_at: "2026-02-26T15:01:00.000Z",
    });
    const result = store.getConversationSummary(toConversationId("conv-excl"));
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.compilationsInConversation).toBe(1);
    expect(result.lastCompilationInConversation).not.toBeNull();
    if (result.lastCompilationInConversation !== null) {
      expect(result.lastCompilationInConversation.intent).toBe("user compilation");
    }
  });

  it("sqlite_status_store_summary_and_conversation", () => {
    setup();
    insertCompilationLog(db, "018c3d4e-0000-7000-8000-000000000080", {
      intent: "proj test",
      tokens_raw: 1000,
      tokens_compiled: 400,
      token_reduction_pct: 60,
    });
    const summary = store.getSummary();
    expect(summary.compilationsTotal).toBe(1);
    expect(summary.totalTokensRaw).toBe(1000);
    expect(summary.totalTokensCompiled).toBe(400);
    insertCompilationLog(db, "018c3d4e-0000-7000-8000-000000000081", {
      project_root: "/other/project",
      intent: "other project",
      tokens_raw: 9999,
      tokens_compiled: 9999,
    });
    const summaryAfter = store.getSummary();
    expect(summaryAfter.compilationsTotal).toBe(1);
    expect(summaryAfter.totalTokensRaw).toBe(1000);
  });
});
