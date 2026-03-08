// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { CompilationMeta } from "#core/types/compilation-types.js";
import type { TelemetryEvent } from "#core/types/telemetry-types.js";
import type { UUIDv7, ISOTimestamp, RepoId } from "#core/types/identifiers.js";

export function buildTelemetryEvent(
  meta: CompilationMeta,
  id: UUIDv7,
  compilationId: UUIDv7,
  timestamp: ISOTimestamp,
  repoId: RepoId,
): TelemetryEvent {
  const guardBlockedCount = meta.guard?.filesBlocked.length ?? 0;
  const guardFindingsCount = meta.guard?.findings.length ?? 0;
  return {
    id,
    compilationId,
    timestamp,
    repoId,
    summarisationTiers: meta.summarisationTiers,
    guardBlockedCount,
    guardFindingsCount,
    transformSavings: meta.transformTokensSaved,
  };
}
