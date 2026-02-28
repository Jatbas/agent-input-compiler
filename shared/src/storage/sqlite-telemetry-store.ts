import type { ExecutableDb } from "#core/interfaces/executable-db.interface.js";
import type { TelemetryStore } from "#core/interfaces/telemetry-store.interface.js";
import type { TelemetryEvent } from "#core/types/telemetry-types.js";

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
