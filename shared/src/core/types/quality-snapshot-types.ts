// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { TaskClass } from "@jatbas/aic-core/core/types/enums.js";
import type { Confidence, Percentage } from "@jatbas/aic-core/core/types/scores.js";
import type { ISOTimestamp, UUIDv7 } from "@jatbas/aic-core/core/types/identifiers.js";

export interface QualitySnapshotInsert {
  readonly id: UUIDv7;
  readonly compilationId: UUIDv7;
  readonly createdAt: ISOTimestamp;
  readonly tokenReductionRatio: Percentage;
  readonly selectionRatio: number;
  readonly budgetUtilisation: number;
  readonly cacheHit: boolean;
  readonly tierL0: number;
  readonly tierL1: number;
  readonly tierL2: number;
  readonly tierL3: number;
  readonly taskClass: TaskClass;
  readonly classifierConfidence: Confidence | null;
}

export interface QualitySnapshotRow {
  readonly createdAt: ISOTimestamp;
  readonly tokenReductionRatio: Percentage;
  readonly selectionRatio: Percentage;
  readonly budgetUtilisation: Percentage;
  readonly cacheHit: boolean;
  readonly tierL0: number;
  readonly tierL1: number;
  readonly tierL2: number;
  readonly tierL3: number;
  readonly taskClass: TaskClass;
  readonly classifierConfidence: Confidence | null;
  readonly feedbackCorrelation: number | null;
}
