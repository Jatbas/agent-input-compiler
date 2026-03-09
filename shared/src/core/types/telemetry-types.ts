// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { TelemetryStore } from "@jatbas/aic-core/core/interfaces/telemetry-store.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { IdGenerator } from "@jatbas/aic-core/core/interfaces/id-generator.interface.js";
import type { StringHasher } from "@jatbas/aic-core/core/interfaces/string-hasher.interface.js";
import type {
  UUIDv7,
  ISOTimestamp,
  RepoId,
} from "@jatbas/aic-core/core/types/identifiers.js";
import type { InclusionTier } from "@jatbas/aic-core/core/types/enums.js";

export interface TelemetryDeps {
  readonly telemetryStore: TelemetryStore;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly stringHasher: StringHasher;
}

export interface TelemetryEvent {
  readonly id: UUIDv7;
  readonly compilationId: UUIDv7;
  readonly timestamp: ISOTimestamp;
  readonly repoId: RepoId;
  readonly summarisationTiers: Readonly<Record<InclusionTier, number>>;
  readonly guardBlockedCount: number;
  readonly guardFindingsCount: number;
  readonly transformSavings: number;
}
