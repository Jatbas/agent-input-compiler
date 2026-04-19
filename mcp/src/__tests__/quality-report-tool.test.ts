// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { z } from "zod";
import {
  toISOTimestamp,
  toProjectId,
  toUUIDv7,
} from "@jatbas/aic-core/core/types/identifiers.js";
import { toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import { toPercentage } from "@jatbas/aic-core/core/types/scores.js";
import { TASK_CLASS } from "@jatbas/aic-core/core/types/enums.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import { SqliteMigrationRunner } from "@jatbas/aic-core/storage/sqlite-migration-runner.js";
import { migration } from "@jatbas/aic-core/storage/migrations/001-consolidated-schema.js";
import { migration as migration002 } from "@jatbas/aic-core/storage/migrations/002-add-conversation-id-index.js";
import { migration as migration003 } from "@jatbas/aic-core/storage/migrations/003-compilation-selection-trace.js";
import { migration as migration004 } from "@jatbas/aic-core/storage/migrations/004-spec-compile-cache.js";
import { migration as migration005 } from "@jatbas/aic-core/storage/migrations/005-quality-snapshots.js";
import { SqliteQualitySnapshotStore } from "@jatbas/aic-core/storage/sqlite-quality-snapshot-store.js";
import { buildQualityReportPayload } from "../diagnostic-payloads.js";
import {
  QualityReportRequestSchema,
  toQualityReportWindowDays,
} from "../schemas/quality-report-request.schema.js";

const TEST_PROJECT_ID = toProjectId("018f0000-0000-7000-8000-000000000099");
const C1 = toUUIDv7("018c3d4e-0000-7000-8000-000000000101");
const C2 = toUUIDv7("018c3d4e-0000-7000-8000-000000000102");
const C3 = toUUIDv7("018c3d4e-0000-7000-8000-000000000103");
const S1 = toUUIDv7("018c3d4e-0000-7000-8000-000000000201");
const S2 = toUUIDv7("018c3d4e-0000-7000-8000-000000000202");
const S3 = toUUIDv7("018c3d4e-0000-7000-8000-000000000203");

const NOW = toISOTimestamp("2026-03-02T12:00:00.000Z");
const WINDOW_MINUTES = -2 * 24 * 60;
const NOT_BEFORE = toISOTimestamp("2026-02-28T12:00:00.000Z");

const goldenPayload: Record<string, unknown> = {
  windowDays: 2,
  compilations: 3,
  medianTokenReduction: 0.5,
  medianSelectionRatio: 0.4,
  medianBudgetUtilisation: 0.5,
  cacheHitRate: 2 / 3,
  tierDistribution: {
    l0: 0.25,
    l1: 0.375,
    l2: 0.125,
    l3: 0.25,
  },
  byTaskClass: {
    [TASK_CLASS.REFACTOR]: {
      compilations: 1,
      medianTokenReduction: 0.1,
      medianSelectionRatio: 0.2,
      medianBudgetUtilisation: 0.3,
      cacheHitRate: 0,
    },
    [TASK_CLASS.BUGFIX]: {
      compilations: 1,
      medianTokenReduction: 0.9,
      medianSelectionRatio: 0.6,
      medianBudgetUtilisation: 0.7,
      cacheHitRate: 1,
    },
    [TASK_CLASS.FEATURE]: {
      compilations: 1,
      medianTokenReduction: 0.5,
      medianSelectionRatio: 0.4,
      medianBudgetUtilisation: 0.5,
      cacheHitRate: 1,
    },
    [TASK_CLASS.DOCS]: {
      compilations: 0,
      medianTokenReduction: 0,
      medianSelectionRatio: 0,
      medianBudgetUtilisation: 0,
      cacheHitRate: 0,
    },
    [TASK_CLASS.TEST]: {
      compilations: 0,
      medianTokenReduction: 0,
      medianSelectionRatio: 0,
      medianBudgetUtilisation: 0,
      cacheHitRate: 0,
    },
    [TASK_CLASS.GENERAL]: {
      compilations: 0,
      medianTokenReduction: 0,
      medianSelectionRatio: 0,
      medianBudgetUtilisation: 0,
      cacheHitRate: 0,
    },
  },
  classifierConfidence: { available: false },
  seriesDaily: [
    {
      day: "2026-02-28",
      medianTokenReduction: 0,
      medianSelectionRatio: 0,
      medianBudgetUtilisation: 0,
      cacheHitRate: 0,
    },
    {
      day: "2026-03-01",
      medianTokenReduction: 0.1,
      medianSelectionRatio: 0.2,
      medianBudgetUtilisation: 0.3,
      cacheHitRate: 0.5,
    },
    {
      day: "2026-03-02",
      medianTokenReduction: 0.9,
      medianSelectionRatio: 0.6,
      medianBudgetUtilisation: 0.7,
      cacheHitRate: 1,
    },
  ],
};

describe("quality report payload", () => {
  let db: Database.Database | undefined;

  afterEach(() => {
    if (db !== undefined) {
      db.close();
      db = undefined;
    }
  });

  it("quality_report_payload_golden", () => {
    const clock: Clock = {
      now(): ReturnType<typeof toISOTimestamp> {
        return NOW;
      },
      addMinutes(minutes: number): ReturnType<typeof toISOTimestamp> {
        return minutes === WINDOW_MINUTES ? NOT_BEFORE : NOW;
      },
      durationMs(): ReturnType<Clock["durationMs"]> {
        return toMilliseconds(0);
      },
    };
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
    const insertCompilation = db.prepare(
      `INSERT INTO compilation_log (
      id, intent, task_class, files_selected, files_total, tokens_raw, tokens_compiled,
      cache_hit, duration_ms, editor_id, model_id, created_at, project_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insertCompilation.run(
      C1,
      "t1",
      "refactor",
      1,
      2,
      10,
      5,
      0,
      1,
      "generic",
      null,
      "2026-03-01T09:00:00.000Z",
      TEST_PROJECT_ID,
    );
    insertCompilation.run(
      C2,
      "t2",
      "feature",
      1,
      2,
      10,
      5,
      1,
      1,
      "generic",
      null,
      "2026-03-01T10:00:00.000Z",
      TEST_PROJECT_ID,
    );
    insertCompilation.run(
      C3,
      "t3",
      "bugfix",
      1,
      2,
      10,
      5,
      1,
      1,
      "generic",
      null,
      "2026-03-02T08:00:00.000Z",
      TEST_PROJECT_ID,
    );
    const store = new SqliteQualitySnapshotStore(TEST_PROJECT_ID, db);
    store.record({
      id: S1,
      compilationId: C1,
      createdAt: toISOTimestamp("2026-03-01T10:00:00.000Z"),
      tokenReductionRatio: toPercentage(0.1),
      selectionRatio: 0.2,
      budgetUtilisation: 0.3,
      cacheHit: false,
      tierL0: 1,
      tierL1: 0,
      tierL2: 0,
      tierL3: 0,
      taskClass: TASK_CLASS.REFACTOR,
      classifierConfidence: null,
    });
    store.record({
      id: S2,
      compilationId: C2,
      createdAt: toISOTimestamp("2026-03-01T20:00:00.000Z"),
      tokenReductionRatio: toPercentage(0.5),
      selectionRatio: 0.4,
      budgetUtilisation: 0.5,
      cacheHit: true,
      tierL0: 0,
      tierL1: 2,
      tierL2: 0,
      tierL3: 1,
      taskClass: TASK_CLASS.FEATURE,
      classifierConfidence: null,
    });
    store.record({
      id: S3,
      compilationId: C3,
      createdAt: toISOTimestamp("2026-03-02T08:00:00.000Z"),
      tokenReductionRatio: toPercentage(0.9),
      selectionRatio: 0.6,
      budgetUtilisation: 0.7,
      cacheHit: true,
      tierL0: 1,
      tierL1: 1,
      tierL2: 1,
      tierL3: 1,
      taskClass: TASK_CLASS.BUGFIX,
      classifierConfidence: null,
    });
    const payload = buildQualityReportPayload({
      projectId: TEST_PROJECT_ID,
      db,
      clock,
      windowDays: 2,
    });
    expect(payload).toEqual(goldenPayload);
  });

  it("quality_report_request_rejects_window_out_of_range", () => {
    expect(() => z.object(QualityReportRequestSchema).parse({ windowDays: 0 })).toThrow();
    expect(() =>
      z.object(QualityReportRequestSchema).parse({ windowDays: 400 }),
    ).toThrow();
  });

  it("toQualityReportWindowDays_clamps", () => {
    expect(toQualityReportWindowDays(999)).toBe(365);
    expect(toQualityReportWindowDays(-5)).toBe(1);
  });
});
