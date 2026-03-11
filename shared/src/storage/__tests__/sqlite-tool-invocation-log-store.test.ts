// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import {
  toUUIDv7,
  toISOTimestamp,
  toSessionId,
  toProjectId,
} from "@jatbas/aic-core/core/types/identifiers.js";
import { migration } from "../migrations/001-consolidated-schema.js";
import { SqliteToolInvocationLogStore } from "../sqlite-tool-invocation-log-store.js";

const TEST_PROJECT_ID = toProjectId("018f0000-0000-7000-8000-000000000001");

describe("SqliteToolInvocationLogStore", () => {
  let db: Database.Database;

  afterEach(() => {
    if (db) db.close();
  });

  it("sqlite_tool_invocation_log_store_record", () => {
    db = new Database(":memory:");
    const execDb = db as unknown as ExecutableDb;
    migration.up(execDb);
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(
      TEST_PROJECT_ID,
      "/test/project",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    );
    const store = new SqliteToolInvocationLogStore(TEST_PROJECT_ID, execDb);
    const entry = {
      id: toUUIDv7("00000000-0000-7000-8000-000000000001"),
      createdAt: toISOTimestamp("2026-03-07T12:00:00.000Z"),
      toolName: "aic_compile",
      sessionId: toSessionId("00000000-0000-7000-8000-000000000002"),
      paramsShape: '{"intent":"string","projectRoot":"string"}',
    };
    store.record(entry);
    const rows = execDb
      .prepare("SELECT * FROM tool_invocation_log WHERE id = ?")
      .all(entry.id) as readonly {
      id: string;
      created_at: string;
      tool_name: string;
      session_id: string;
      params_shape: string;
      project_id: string;
    }[];
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (row === undefined) expect.fail("expected one row");
    expect(row.id).toBe(entry.id);
    expect(row.created_at).toBe(entry.createdAt);
    expect(row.tool_name).toBe(entry.toolName);
    expect(row.session_id).toBe(entry.sessionId);
    expect(row.params_shape).toBe(entry.paramsShape);
    expect(row.project_id).toBe(TEST_PROJECT_ID);
  });
});
