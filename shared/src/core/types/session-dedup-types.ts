// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { RelativePath } from "@jatbas/aic-shared/core/types/paths.js";
import type { TokenCount, StepIndex } from "@jatbas/aic-shared/core/types/units.js";
import type { InclusionTier } from "@jatbas/aic-shared/core/types/enums.js";
import type { ISOTimestamp } from "@jatbas/aic-shared/core/types/identifiers.js";
import type { ToolOutput } from "@jatbas/aic-shared/core/types/compilation-types.js";

export interface PreviousFile {
  readonly path: RelativePath;
  readonly lastTier: InclusionTier;
  readonly lastStepIndex: StepIndex;
  readonly modifiedSince: boolean;
}

export interface SessionStep {
  readonly stepIndex: StepIndex;
  readonly stepIntent: string | null;
  readonly filesSelected: readonly RelativePath[];
  readonly tiers: Readonly<Record<string, InclusionTier>>;
  readonly tokensCompiled: TokenCount;
  readonly toolOutputs: readonly ToolOutput[];
  readonly completedAt: ISOTimestamp;
}
