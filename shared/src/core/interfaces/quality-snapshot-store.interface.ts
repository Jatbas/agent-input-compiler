// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import type {
  QualitySnapshotInsert,
  QualitySnapshotRow,
} from "@jatbas/aic-core/core/types/quality-snapshot-types.js";

export interface QualitySnapshotStore {
  record(input: QualitySnapshotInsert): void;
  selectWindowRows(input: {
    readonly notBeforeInclusive: ISOTimestamp;
  }): readonly QualitySnapshotRow[];
}
