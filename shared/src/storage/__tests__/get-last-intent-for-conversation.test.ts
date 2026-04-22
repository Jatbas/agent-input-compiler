// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import {
  toConversationId,
  toISOTimestamp,
  toProjectId,
} from "@jatbas/aic-core/core/types/identifiers.js";
import { toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import { SqliteMigrationRunner } from "../sqlite-migration-runner.js";
import { migration as migration001 } from "../migrations/001-consolidated-schema.js";
import { migration as migration002 } from "../migrations/002-add-conversation-id-index.js";
import { migration as migration003 } from "../migrations/003-compilation-selection-trace.js";
import { migration as migration004 } from "../migrations/004-spec-compile-cache.js";
import { migration as migration005 } from "../migrations/005-quality-snapshots.js";
import { migration as migration006 } from "../migrations/006-classifier-scores.js";
import { migration as migration007 } from "../migrations/007-last-non-general-intent-index.js";
import { getLastNonGeneralIntentForConversation } from "../get-last-intent-for-conversation.js";

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

describe("getLastNonGeneralIntentForConversation", () => {
  let db: Database.Database;

  afterEach(() => {
    if (db) db.close();
  });

  function setupDb(): ExecutableDb {
    db = new Database(":memory:");
    const runner = new SqliteMigrationRunner(clock);
    runner.run(db, [
      migration001,
      migration002,
      migration003,
      migration004,
      migration005,
      migration006,
      migration007,
    ]);
    return db as unknown as ExecutableDb;
  }

  function insertProject(d: Database.Database, projectId: string): void {
    d.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(
      projectId,
      `/test/project/${projectId}`,
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    );
  }

  function insertLog(
    d: Database.Database,
    id: string,
    projectId: string,
    conversationId: string | null,
    taskClass: string,
    intent: string,
    createdAt: string,
  ): void {
    d.prepare(
      `INSERT INTO compilation_log (id, intent, task_class, files_selected, files_total, tokens_raw, tokens_compiled, cache_hit, duration_ms, editor_id, model_id, created_at, project_id, conversation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      intent,
      taskClass,
      0,
      0,
      0,
      0,
      0,
      0,
      "generic",
      null,
      createdAt,
      projectId,
      conversationId,
    );
  }

  it("get_last_intent_returns_most_recent_non_general", () => {
    const edb = setupDb();
    insertProject(db, "proj-1");
    insertLog(
      db,
      "018f-0001",
      "proj-1",
      "conv-abc",
      "general",
      "provide context for subagent",
      "2026-01-01T10:00:00.000Z",
    );
    insertLog(
      db,
      "018f-0002",
      "proj-1",
      "conv-abc",
      "bugfix",
      "fix IntentClassifier fallback storage",
      "2026-01-01T10:01:00.000Z",
    );
    insertLog(
      db,
      "018f-0003",
      "proj-1",
      "conv-abc",
      "feature",
      "add intent fallback compile handler",
      "2026-01-01T10:02:00.000Z",
    );
    const result = getLastNonGeneralIntentForConversation(
      edb,
      toProjectId("proj-1"),
      toConversationId("conv-abc"),
    );
    expect(result).toBe("add intent fallback compile handler");
  });

  it("get_last_intent_returns_null_when_only_general_exists", () => {
    const edb = setupDb();
    insertProject(db, "proj-1");
    insertLog(
      db,
      "018f-0001",
      "proj-1",
      "conv-abc",
      "general",
      "provide context for subagent",
      "2026-01-01T10:00:00.000Z",
    );
    const result = getLastNonGeneralIntentForConversation(
      edb,
      toProjectId("proj-1"),
      toConversationId("conv-abc"),
    );
    expect(result).toBeNull();
  });

  it("get_last_intent_returns_null_when_no_rows_for_conversation", () => {
    const edb = setupDb();
    insertProject(db, "proj-1");
    const result = getLastNonGeneralIntentForConversation(
      edb,
      toProjectId("proj-1"),
      toConversationId("conv-xyz"),
    );
    expect(result).toBeNull();
  });

  it("get_last_intent_scoped_to_project_id", () => {
    const edb = setupDb();
    insertProject(db, "proj-1");
    insertProject(db, "proj-2");
    insertLog(
      db,
      "018f-0001",
      "proj-1",
      "conv-abc",
      "bugfix",
      "fix something in proj-1",
      "2026-01-01T10:00:00.000Z",
    );
    insertLog(
      db,
      "018f-0002",
      "proj-2",
      "conv-abc",
      "feature",
      "add feature in proj-2",
      "2026-01-01T10:01:00.000Z",
    );
    const result = getLastNonGeneralIntentForConversation(
      edb,
      toProjectId("proj-1"),
      toConversationId("conv-abc"),
    );
    expect(result).toBe("fix something in proj-1");
  });

  it("explain_last_non_general_intent_avoids_temp_order_by", () => {
    setupDb();
    insertProject(db, "proj-1");
    insertLog(
      db,
      "018f-0b01",
      "proj-1",
      "conv-abc",
      "bugfix",
      "weak intent planner regression intent",
      "2026-01-01T10:00:00.000Z",
    );
    insertLog(
      db,
      "018f-0b02",
      "proj-1",
      "conv-abc",
      "general",
      "provide context for subagent",
      "2026-01-01T10:01:00.000Z",
    );
    const projectId = toProjectId("proj-1");
    const conversationId = toConversationId("conv-abc");
    const sql =
      "SELECT intent FROM compilation_log WHERE project_id = ? AND conversation_id = ? AND task_class != 'general' ORDER BY created_at DESC LIMIT 1";
    const planRows = db
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all(projectId, conversationId) as readonly { detail: string }[];
    const planText = planRows.map((r) => r.detail).join("\n");
    expect(planText).not.toContain("USE TEMP B-TREE FOR ORDER BY");
    expect(
      getLastNonGeneralIntentForConversation(
        db as unknown as ExecutableDb,
        projectId,
        conversationId,
      ),
    ).toBe("weak intent planner regression intent");
  });
});
