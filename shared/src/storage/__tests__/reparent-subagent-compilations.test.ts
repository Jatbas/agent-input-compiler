// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import {
  toConversationId,
  toProjectId,
} from "@jatbas/aic-core/core/types/identifiers.js";
import { migration } from "../migrations/001-consolidated-schema.js";
import { reparentSubagentCompilations } from "../reparent-subagent-compilations.js";

describe("reparentSubagentCompilations", () => {
  let db: Database.Database;

  afterEach(() => {
    if (db) db.close();
  });

  function setupDb(): ExecutableDb {
    db = new Database(":memory:");
    migration.up(db);
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
  ): void {
    d.prepare(
      `INSERT INTO compilation_log (id, intent, task_class, files_selected, files_total, tokens_raw, tokens_compiled, cache_hit, duration_ms, editor_id, model_id, created_at, project_id, conversation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      "intent",
      "general",
      0,
      0,
      0,
      0,
      0,
      0,
      "generic",
      null,
      "2026-01-01T00:00:00.000Z",
      projectId,
      conversationId,
    );
  }

  it("reparent_updates_matching_rows", () => {
    const edb = setupDb();
    insertProject(db, "proj-1");
    insertLog(db, "018f0000-0000-7000-8000-000000000001", "proj-1", "child-abc");
    insertLog(db, "018f0000-0000-7000-8000-000000000002", "proj-1", "child-abc");
    insertLog(db, "018f0000-0000-7000-8000-000000000003", "proj-1", "other");
    const updated = reparentSubagentCompilations(
      edb,
      toProjectId("proj-1"),
      toConversationId("child-abc"),
      toConversationId("parent-xyz"),
    );
    expect(updated).toBe(2);
    const rows = db
      .prepare(
        "SELECT conversation_id FROM compilation_log WHERE project_id = ? ORDER BY id",
      )
      .all("proj-1") as readonly { conversation_id: string | null }[];
    expect(rows).toHaveLength(3);
    const parentRows = rows.filter((r) => r.conversation_id === "parent-xyz");
    const otherRows = rows.filter((r) => r.conversation_id === "other");
    expect(parentRows).toHaveLength(2);
    expect(otherRows).toHaveLength(1);
  });

  it("reparent_returns_zero_when_no_match", () => {
    const edb = setupDb();
    insertProject(db, "proj-1");
    insertLog(db, "018f0000-0000-7000-8000-000000000001", "proj-1", "only-me");
    const updated = reparentSubagentCompilations(
      edb,
      toProjectId("proj-1"),
      toConversationId("nonexistent-child"),
      toConversationId("parent-xyz"),
    );
    expect(updated).toBe(0);
  });

  it("reparent_scoped_to_project_id", () => {
    const edb = setupDb();
    insertProject(db, "proj-1");
    insertProject(db, "proj-2");
    insertLog(db, "018f0000-0000-7000-8000-000000000001", "proj-1", "child-abc");
    insertLog(db, "018f0000-0000-7000-8000-000000000002", "proj-2", "child-abc");
    const updated = reparentSubagentCompilations(
      edb,
      toProjectId("proj-1"),
      toConversationId("child-abc"),
      toConversationId("parent-xyz"),
    );
    expect(updated).toBe(1);
    const r1 = db
      .prepare("SELECT conversation_id FROM compilation_log WHERE id = ?")
      .get("018f0000-0000-7000-8000-000000000001") as { conversation_id: string | null };
    const r2 = db
      .prepare("SELECT conversation_id FROM compilation_log WHERE id = ?")
      .get("018f0000-0000-7000-8000-000000000002") as { conversation_id: string | null };
    expect(r1.conversation_id).toBe("parent-xyz");
    expect(r2.conversation_id).toBe("child-abc");
  });
});
