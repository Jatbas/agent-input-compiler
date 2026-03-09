// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { AbsolutePath, FilePath } from "@jatbas/aic-core/core/types/paths.js";
import type { TokenCount } from "@jatbas/aic-core/core/types/units.js";
import type { Percentage } from "@jatbas/aic-core/core/types/scores.js";
import type { ISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import type { TaskClassification } from "@jatbas/aic-core/core/types/task-classification.js";
import type { SelectedFile } from "@jatbas/aic-core/core/types/selected-file.js";
import type { GuardResult } from "@jatbas/aic-core/core/types/guard-types.js";
import type { TransformMetadata } from "@jatbas/aic-core/core/types/transform-types.js";
import type { InclusionTier } from "@jatbas/aic-core/core/types/enums.js";

export interface InspectRequest {
  readonly intent: string;
  readonly projectRoot: AbsolutePath;
  readonly configPath: FilePath | null;
  readonly dbPath: FilePath;
}

export interface PipelineTrace {
  readonly intent: string;
  readonly taskClass: TaskClassification;
  readonly rulePacks: readonly string[];
  readonly budget: TokenCount;
  readonly selectedFiles: readonly SelectedFile[];
  readonly guard: GuardResult | null;
  readonly transforms: readonly TransformMetadata[];
  readonly summarisationTiers: Readonly<Record<InclusionTier, number>>;
  readonly constraints: readonly string[];
  readonly tokenSummary: {
    readonly raw: TokenCount;
    readonly selected: TokenCount;
    readonly afterGuard: TokenCount;
    readonly afterTransforms: TokenCount;
    readonly afterLadder: TokenCount;
    readonly afterPrune: TokenCount;
    readonly promptTotal: TokenCount;
    readonly reductionPct: Percentage;
  };
  readonly compiledAt: ISOTimestamp;
}
