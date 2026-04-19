// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
  toISOTimestamp,
  toProjectId,
  toUUIDv7,
} from "@jatbas/aic-core/core/types/identifiers.js";
import { toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import { toPercentage } from "@jatbas/aic-core/core/types/scores.js";
import { AicError } from "@jatbas/aic-core/core/errors/aic-error.js";
import { TASK_CLASS } from "@jatbas/aic-core/core/types/enums.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import { SqliteMigrationRunner } from "../sqlite-migration-runner.js";
import { migration } from "../migrations/001-consolidated-schema.js";
import { migration as migration002 } from "../migrations/002-add-conversation-id-index.js";
import { migration as migration003 } from "../migrations/003-compilation-selection-trace.js";
import { migration as migration004 } from "../migrations/004-spec-compile-cache.js";
import { migration as migration005 } from "../migrations/005-quality-snapshots.js";
import { SqliteQualitySnapshotStore } from "../sqlite-quality-snapshot-store.js";

const TEST_PROJECT_ID = toProjectId("018f0000-0000-7000-8000-000000000099");
const COMPILATION_ID = toUUIDv7("018c3d4e-0000-7000-8000-000000000100");
const SNAPSHOT_ID = toUUIDv7("018c3d4e-0000-7000-8000-000000000101");

const clock: Clock = {
  now(): ReturnType<typeof toISOTimestamp> {
    return toISOTimestamp("2026-02-25T10:00:00.000Z");
  },
  addMinutes() {
    return toISOTimestamp("2026-02-25T10:00:00.000Z");
  },
  durationMs() {
    return toMilliseconds(0);
  },
};

describe("SqliteQualitySnapshotStore", () => {
  let db: Database.Database;

  afterEach(() => {
    if (db) db.close();
  });

  it("quality_snapshot_roundtrip", () => {
    db = new Database(":memory:");
    const runner = new SqliteMigrationRunner(clock);
    runner.run(db, [migration, migration002, migration003, migration004, migration005]);
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(
      TEST_PROJECT_ID,
      "/test",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    );
    db.prepare(
      `INSERT INTO compilation_log (
      id, intent, task_class, files_selected, files_total, tokens_raw, tokens_compiled,
      cache_hit, duration_ms, editor_id, model_id, created_at, project_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      COMPILATION_ID,
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
      "2026-02-25T09:00:00.000Z",
      TEST_PROJECT_ID,
    );
    const store = new SqliteQualitySnapshotStore(TEST_PROJECT_ID, db);
    store.record({
      id: SNAPSHOT_ID,
      compilationId: COMPILATION_ID,
      createdAt: toISOTimestamp("2026-02-25T10:00:00.000Z"),
      tokenReductionRatio: toPercentage(0.25),
      selectionRatio: 0.5,
      budgetUtilisation: 0.4,
      cacheHit: false,
      tierL0: 2,
      tierL1: 1,
      tierL2: 0,
      tierL3: 0,
      taskClass: TASK_CLASS.REFACTOR,
      classifierConfidence: null,
    });
    const countRow = db.prepare("SELECT COUNT(*) as c FROM quality_snapshots").get() as {
      c: number;
    };
    expect(countRow.c).toBe(1);
    const rows = store.selectWindowRows({
      notBeforeInclusive: toISOTimestamp("2026-02-25T00:00:00.000Z"),
    });
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (row === undefined) throw new AicError("expected row", "TEST_SETUP");
    expect(row.createdAt).toBe("2026-02-25T10:00:00.000Z");
    expect(Number(row.tokenReductionRatio)).toBe(0.25);
    expect(Number(row.selectionRatio)).toBe(0.5);
    expect(Number(row.budgetUtilisation)).toBe(0.4);
    expect(row.cacheHit).toBe(false);
    expect(row.tierL0).toBe(2);
    expect(row.tierL1).toBe(1);
    expect(row.tierL2).toBe(0);
    expect(row.tierL3).toBe(0);
    expect(row.taskClass).toBe(TASK_CLASS.REFACTOR);
    expect(row.classifierConfidence).toBeNull();
    expect(row.feedbackCorrelation).toBeNull();
  });
});
