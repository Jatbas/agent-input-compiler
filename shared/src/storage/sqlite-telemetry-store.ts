// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { TelemetryStore } from "@jatbas/aic-core/core/interfaces/telemetry-store.interface.js";
import type { TelemetryEvent } from "@jatbas/aic-core/core/types/telemetry-types.js";

export class SqliteTelemetryStore implements TelemetryStore {
  constructor(private readonly db: ExecutableDb) {}

  write(event: TelemetryEvent): void {
    const stmt = this.db.prepare(
      `INSERT INTO telemetry_events (
        id, compilation_id, repo_id,
        guard_findings, guard_blocks, transform_savings, tiers_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    stmt.run(
      event.id,
      event.compilationId,
      event.repoId,
      event.guardFindingsCount,
      event.guardBlockedCount,
      event.transformSavings,
      JSON.stringify(event.summarisationTiers),
      event.timestamp,
    );
  }
}
