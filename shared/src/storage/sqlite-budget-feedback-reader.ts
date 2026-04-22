// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { BudgetFeedbackSource } from "@jatbas/aic-core/core/interfaces/budget-feedback-source.interface.js";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { ISOTimestamp, ProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import type { TokenCount } from "@jatbas/aic-core/core/types/units.js";
import { TRIGGER_SOURCE } from "@jatbas/aic-core/core/types/enums.js";
import { toPercentage, type Percentage } from "@jatbas/aic-core/core/types/scores.js";

export class SqliteBudgetFeedbackReader implements BudgetFeedbackSource {
  constructor(
    private readonly projectId: ProjectId,
    private readonly db: ExecutableDb,
  ) {}

  getRollingBudgetUtilisation(input: {
    readonly projectId: ProjectId;
    readonly notBeforeInclusive: ISOTimestamp;
    readonly budgetCeilingTokens: TokenCount;
  }): Percentage | null {
    if (input.projectId !== this.projectId) {
      return null;
    }
    const ceiling = Number(input.budgetCeilingTokens);
    if (ceiling === 0) {
      return null;
    }
    const row = this.db
      .prepare(
        `SELECT AVG(CAST(tokens_compiled AS REAL) / CAST(? AS REAL)) AS mean_util
FROM compilation_log
WHERE project_id = ?
  AND created_at >= ?
  AND (trigger_source IS NULL OR trigger_source != ?)`,
      )
      .get(
        ceiling,
        this.projectId,
        input.notBeforeInclusive,
        TRIGGER_SOURCE.INTERNAL_TEST,
      ) as { mean_util: number | null } | undefined;
    if (row === undefined) {
      return null;
    }
    const rawMean = row.mean_util;
    if (rawMean === null) {
      return null;
    }
    const mean = Number(rawMean);
    if (Number.isNaN(mean)) {
      return null;
    }
    return toPercentage(Math.min(1, mean));
  }
}
