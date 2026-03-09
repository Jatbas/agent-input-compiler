// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { UUIDv7 } from "@jatbas/aic-core/core/types/identifiers.js";
import type { GuardFinding } from "@jatbas/aic-core/core/types/guard-types.js";

export interface GuardStore {
  write(compilationId: UUIDv7, findings: readonly GuardFinding[]): void;
  queryByCompilation(compilationId: UUIDv7): readonly GuardFinding[];
}
