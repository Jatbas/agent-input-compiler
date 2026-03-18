// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { TelemetryEvent } from "@jatbas/aic-core/core/types/telemetry-types.js";
import {
  toUUIDv7,
  toISOTimestamp,
  toRepoId,
  toProjectId,
} from "@jatbas/aic-core/core/types/identifiers.js";
import { INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";
import { migration } from "../migrations/001-consolidated-schema.js";
import { SqliteTelemetryStore } from "../sqlite-telemetry-store.js";

const COMPILATION_ID = "018c3d4e-0000-7000-8000-000000000100";
const TEST_PROJECT_ID = toProjectId("018f0000-0000-7000-8000-000000000099");

function insertCompilationLog(db: Database.Database, id: string): void {
  db.prepare(
    "INSERT OR IGNORE INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
  ).run(TEST_PROJECT_ID, "/test", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
  db.prepare(
    `INSERT INTO compilation_log (
      id, intent, task_class, files_selected, files_total, tokens_raw, tokens_compiled,
      cache_hit, duration_ms, editor_id, model_id, created_at, project_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    "test",
    "refactor",
    5,
    10,
    100,
    40,
    0,
    500,
    "generic",
    "gpt-4",
    "2026-02-25T10:00:00.000Z",
    TEST_PROJECT_ID,
  );
}

function makeEvent(overrides: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    id: toUUIDv7("018c3d4e-0000-7000-8000-000000000001"),
    compilationId: toUUIDv7(COMPILATION_ID),
    timestamp: toISOTimestamp("2026-02-25T10:00:00.000Z"),
    repoId: toRepoId("repo-hash-1"),
    summarisationTiers: {
      [INCLUSION_TIER.L0]: 1,
      [INCLUSION_TIER.L1]: 2,
      [INCLUSION_TIER.L2]: 1,
      [INCLUSION_TIER.L3]: 1,
    },
    guardBlockedCount: 0,
    guardFindingsCount: 0,
    transformSavings: 0,
    ...overrides,
  };
}

describe("SqliteTelemetryStore", () => {
  let db: Database.Database;
  let store: SqliteTelemetryStore;

  afterEach(() => {
    if (db) db.close();
  });

  function setup(): void {
    db = new Database(":memory:");
    migration.up(db);
    store = new SqliteTelemetryStore(db);
    insertCompilationLog(db, COMPILATION_ID);
  }

  it("sqlite_telemetry_store_write", () => {
    setup();
    const event = makeEvent();
    store.write(event);
    const rows = db
      .prepare(
        "SELECT id, compilation_id, repo_id, guard_findings, guard_blocks, transform_savings, tiers_json, created_at FROM telemetry_events WHERE id = ?",
      )
      .all(event.id) as readonly {
      id: string;
      compilation_id: string;
      repo_id: string;
      guard_findings: number;
      guard_blocks: number;
      transform_savings: number;
      tiers_json: string;
      created_at: string;
    }[];
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toBeDefined();
    if (row === undefined) return;
    expect(row.id).toBe(event.id);
  });

  it("write persists row", () => {
    setup();
    const event = makeEvent();
    store.write(event);
    const rows = db
      .prepare(
        "SELECT id, compilation_id, repo_id, guard_findings, guard_blocks, transform_savings, tiers_json, created_at FROM telemetry_events WHERE id = ?",
      )
      .all(event.id) as readonly {
      id: string;
      compilation_id: string;
      repo_id: string;
      guard_findings: number;
      guard_blocks: number;
      transform_savings: number;
      tiers_json: string;
      created_at: string;
    }[];
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toBeDefined();
    if (row === undefined) return;
    expect(row.id).toBe(event.id);
    expect(row.compilation_id).toBe(COMPILATION_ID);
    expect(row.repo_id).toBe(event.repoId);
    expect(row.guard_findings).toBe(0);
    expect(row.guard_blocks).toBe(0);
    expect(row.transform_savings).toBe(0);
    expect(row.created_at).toBe(event.timestamp);
  });

  it("multiple writes", () => {
    setup();
    const compilationId2 = "018c3d4e-0000-7000-8000-000000000101";
    insertCompilationLog(db, compilationId2);
    store.write(makeEvent({ id: toUUIDv7("018c3d4e-0000-7000-8000-000000000001") }));
    store.write(
      makeEvent({
        id: toUUIDv7("018c3d4e-0000-7000-8000-000000000002"),
        compilationId: toUUIDv7(compilationId2),
      }),
    );
    const rows = db.prepare("SELECT id FROM telemetry_events").all() as readonly {
      id: string;
    }[];
    expect(rows).toHaveLength(2);
  });

  it("duplicate id", () => {
    setup();
    const event = makeEvent({ id: toUUIDv7("018c3d4e-0000-7000-8000-000000000099") });
    store.write(event);
    expect(() => store.write(event)).toThrow();
  });
});
