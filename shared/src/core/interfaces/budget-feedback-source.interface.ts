// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ISOTimestamp, ProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import type { TokenCount } from "@jatbas/aic-core/core/types/units.js";
import type { Percentage } from "@jatbas/aic-core/core/types/scores.js";

export interface BudgetFeedbackSource {
  getRollingBudgetUtilisation(input: {
    readonly projectId: ProjectId;
    readonly notBeforeInclusive: ISOTimestamp;
    readonly budgetCeilingTokens: TokenCount;
  }): Percentage | null;
}
