// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type {
  GuardSeverity,
  GuardFindingType,
} from "@jatbas/aic-core/core/types/enums.js";
import type { RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import type { LineNumber } from "@jatbas/aic-core/core/types/units.js";

export interface GuardFinding {
  readonly severity: GuardSeverity;
  readonly type: GuardFindingType;
  readonly file: RelativePath;
  readonly line?: LineNumber;
  readonly message: string;
  readonly pattern?: string;
}

export interface GuardResult {
  readonly passed: boolean;
  readonly findings: readonly GuardFinding[];
  readonly filesBlocked: readonly RelativePath[];
  readonly filesRedacted: readonly RelativePath[];
  readonly filesWarned: readonly RelativePath[];
}
