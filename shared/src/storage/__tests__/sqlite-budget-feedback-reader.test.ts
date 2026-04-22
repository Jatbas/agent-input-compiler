// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
  toISOTimestamp,
  toProjectId,
  toUUIDv7,
} from "@jatbas/aic-core/core/types/identifiers.js";
import { toMilliseconds, toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { toPercentage } from "@jatbas/aic-core/core/types/scores.js";
import { TRIGGER_SOURCE } from "@jatbas/aic-core/core/types/enums.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import { SqliteMigrationRunner } from "../sqlite-migration-runner.js";
import { migration } from "../migrations/001-consolidated-schema.js";
import { migration as migration002 } from "../migrations/002-add-conversation-id-index.js";
import { migration as migration003 } from "../migrations/003-compilation-selection-trace.js";
import { migration as migration004 } from "../migrations/004-spec-compile-cache.js";
import { migration as migration005 } from "../migrations/005-quality-snapshots.js";
import { migration as migration006 } from "../migrations/006-classifier-scores.js";
import { migration as migration007 } from "../migrations/007-last-non-general-intent-index.js";
import { migration as migration008 } from "../migrations/008-compilation-log-project-created-at-index.js";
import { SqliteBudgetFeedbackReader } from "../sqlite-budget-feedback-reader.js";

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

const TEST_PROJECT_ID = toProjectId("018f0000-0000-7000-8000-000000000099");
const OTHER_PROJECT_ID = toProjectId("018f0000-0000-7000-8000-000000000088");

describe("SqliteBudgetFeedbackReader", () => {
  let db: Database.Database;

  afterEach(() => {
    if (db) db.close();
  });

  const runMigrations = (): void => {
    const runner = new SqliteMigrationRunner(clock);
    runner.run(db, [
      migration,
      migration002,
      migration003,
      migration004,
      migration005,
      migration006,
      migration007,
      migration008,
    ]);
  };

  const insertProject = (): void => {
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(
      TEST_PROJECT_ID,
      "/test",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    );
  };

  const insertCompilation = (args: {
    readonly id: ReturnType<typeof toUUIDv7>;
    readonly tokensCompiled: number;
    readonly createdAt: string;
    readonly triggerSource: string | null;
  }): void => {
    db.prepare(
      `INSERT INTO compilation_log (
      id, intent, task_class, files_selected, files_total, tokens_raw, tokens_compiled,
      cache_hit, duration_ms, editor_id, model_id, created_at, project_id, trigger_source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      args.id,
      "test",
      "refactor",
      5,
      10,
      args.tokensCompiled,
      args.tokensCompiled,
      0,
      500,
      "generic",
      "gpt-4",
      args.createdAt,
      TEST_PROJECT_ID,
      args.triggerSource,
    );
  };

  it("sqlite_budget_feedback_reader_returns_null_without_rows", () => {
    db = new Database(":memory:");
    runMigrations();
    const reader = new SqliteBudgetFeedbackReader(TEST_PROJECT_ID, db);
    const result = reader.getRollingBudgetUtilisation({
      projectId: TEST_PROJECT_ID,
      notBeforeInclusive: toISOTimestamp("2026-02-25T00:00:00.000Z"),
      budgetCeilingTokens: toTokenCount(100),
    });
    expect(result).toBeNull();
  });

  it("sqlite_budget_feedback_reader_mean_matches_inserted_compilations", () => {
    db = new Database(":memory:");
    runMigrations();
    insertProject();
    insertCompilation({
      id: toUUIDv7("018c3d4e-0000-7000-8000-000000000100"),
      tokensCompiled: 40,
      createdAt: "2026-02-25T09:00:00.000Z",
      triggerSource: null,
    });
    insertCompilation({
      id: toUUIDv7("018c3d4e-0000-7000-8000-000000000101"),
      tokensCompiled: 60,
      createdAt: "2026-02-25T09:15:00.000Z",
      triggerSource: null,
    });
    const reader = new SqliteBudgetFeedbackReader(TEST_PROJECT_ID, db);
    const result = reader.getRollingBudgetUtilisation({
      projectId: TEST_PROJECT_ID,
      notBeforeInclusive: toISOTimestamp("2026-02-25T00:00:00.000Z"),
      budgetCeilingTokens: toTokenCount(100),
    });
    expect(result).toEqual(toPercentage(0.5));
  });

  it("sqlite_budget_feedback_reader_clamps_when_tokens_exceed_ceiling", () => {
    db = new Database(":memory:");
    runMigrations();
    insertProject();
    insertCompilation({
      id: toUUIDv7("018c3d4e-0000-7000-8000-000000000102"),
      tokensCompiled: 200,
      createdAt: "2026-02-25T09:00:00.000Z",
      triggerSource: null,
    });
    const reader = new SqliteBudgetFeedbackReader(TEST_PROJECT_ID, db);
    const result = reader.getRollingBudgetUtilisation({
      projectId: TEST_PROJECT_ID,
      notBeforeInclusive: toISOTimestamp("2026-02-25T00:00:00.000Z"),
      budgetCeilingTokens: toTokenCount(100),
    });
    expect(result).toEqual(toPercentage(1));
  });

  it("sqlite_budget_feedback_reader_excludes_internal_test_trigger", () => {
    db = new Database(":memory:");
    runMigrations();
    insertProject();
    insertCompilation({
      id: toUUIDv7("018c3d4e-0000-7000-8000-000000000103"),
      tokensCompiled: 100,
      createdAt: "2026-02-25T09:00:00.000Z",
      triggerSource: TRIGGER_SOURCE.INTERNAL_TEST,
    });
    insertCompilation({
      id: toUUIDv7("018c3d4e-0000-7000-8000-000000000104"),
      tokensCompiled: 0,
      createdAt: "2026-02-25T09:05:00.000Z",
      triggerSource: null,
    });
    const reader = new SqliteBudgetFeedbackReader(TEST_PROJECT_ID, db);
    const result = reader.getRollingBudgetUtilisation({
      projectId: TEST_PROJECT_ID,
      notBeforeInclusive: toISOTimestamp("2026-02-25T00:00:00.000Z"),
      budgetCeilingTokens: toTokenCount(100),
    });
    expect(result).toEqual(toPercentage(0));
  });

  it("sqlite_budget_feedback_reader_returns_null_on_project_mismatch", () => {
    db = new Database(":memory:");
    runMigrations();
    const reader = new SqliteBudgetFeedbackReader(TEST_PROJECT_ID, db);
    const result = reader.getRollingBudgetUtilisation({
      projectId: OTHER_PROJECT_ID,
      notBeforeInclusive: toISOTimestamp("2026-02-25T00:00:00.000Z"),
      budgetCeilingTokens: toTokenCount(100),
    });
    expect(result).toBeNull();
  });
});
