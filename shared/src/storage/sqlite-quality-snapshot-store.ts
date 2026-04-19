// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { QualitySnapshotStore } from "@jatbas/aic-core/core/interfaces/quality-snapshot-store.interface.js";
import type {
  QualitySnapshotInsert,
  QualitySnapshotRow,
} from "@jatbas/aic-core/core/types/quality-snapshot-types.js";
import type { ISOTimestamp, ProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import { toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import { TASK_CLASS, type TaskClass } from "@jatbas/aic-core/core/types/enums.js";
import { toConfidence, toPercentage } from "@jatbas/aic-core/core/types/scores.js";

function taskClassFromQualitySnapshotSql(raw: string): TaskClass {
  if (raw === TASK_CLASS.REFACTOR) return TASK_CLASS.REFACTOR;
  if (raw === TASK_CLASS.BUGFIX) return TASK_CLASS.BUGFIX;
  if (raw === TASK_CLASS.FEATURE) return TASK_CLASS.FEATURE;
  if (raw === TASK_CLASS.DOCS) return TASK_CLASS.DOCS;
  if (raw === TASK_CLASS.TEST) return TASK_CLASS.TEST;
  return TASK_CLASS.GENERAL;
}

export class SqliteQualitySnapshotStore implements QualitySnapshotStore {
  constructor(
    private readonly projectId: ProjectId,
    private readonly db: ExecutableDb,
  ) {}

  record(input: QualitySnapshotInsert): void {
    this.db
      .prepare(
        `INSERT INTO quality_snapshots (id, project_id, compilation_id, created_at, token_reduction_ratio, selection_ratio, budget_utilisation, cache_hit, tier_l0, tier_l1, tier_l2, tier_l3, task_class, classifier_confidence, feedback_correlation) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        input.id,
        this.projectId,
        input.compilationId,
        input.createdAt,
        Number(input.tokenReductionRatio),
        input.selectionRatio,
        input.budgetUtilisation,
        input.cacheHit ? 1 : 0,
        input.tierL0,
        input.tierL1,
        input.tierL2,
        input.tierL3,
        input.taskClass,
        input.classifierConfidence,
        null,
      );
  }

  selectWindowRows(input: {
    readonly notBeforeInclusive: ISOTimestamp;
  }): readonly QualitySnapshotRow[] {
    const rows = this.db
      .prepare(
        `SELECT created_at, token_reduction_ratio, selection_ratio, budget_utilisation, cache_hit, tier_l0, tier_l1, tier_l2, tier_l3, task_class, classifier_confidence, feedback_correlation FROM quality_snapshots WHERE project_id = ? AND created_at >= ? ORDER BY created_at ASC`,
      )
      .all(this.projectId, input.notBeforeInclusive) as readonly {
      readonly created_at: string;
      readonly token_reduction_ratio: number;
      readonly selection_ratio: number;
      readonly budget_utilisation: number;
      readonly cache_hit: number;
      readonly tier_l0: number;
      readonly tier_l1: number;
      readonly tier_l2: number;
      readonly tier_l3: number;
      readonly task_class: string;
      readonly classifier_confidence: number | null;
      readonly feedback_correlation: number | null;
    }[];
    return rows.map((row) => ({
      createdAt: toISOTimestamp(row.created_at),
      tokenReductionRatio: toPercentage(row.token_reduction_ratio),
      selectionRatio: toPercentage(row.selection_ratio),
      budgetUtilisation: toPercentage(row.budget_utilisation),
      cacheHit: row.cache_hit === 1,
      tierL0: row.tier_l0,
      tierL1: row.tier_l1,
      tierL2: row.tier_l2,
      tierL3: row.tier_l3,
      taskClass: taskClassFromQualitySnapshotSql(row.task_class),
      classifierConfidence:
        row.classifier_confidence === null
          ? null
          : toConfidence(row.classifier_confidence),
      feedbackCorrelation: row.feedback_correlation,
    }));
  }
}
