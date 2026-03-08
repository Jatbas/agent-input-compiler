// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { UUIDv7 } from "#core/types/identifiers.js";
import type { GuardFinding } from "#core/types/guard-types.js";

export interface GuardStore {
  write(compilationId: UUIDv7, findings: readonly GuardFinding[]): void;
  queryByCompilation(compilationId: UUIDv7): readonly GuardFinding[];
}
