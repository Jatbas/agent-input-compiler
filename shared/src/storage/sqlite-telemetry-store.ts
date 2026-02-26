import type { ExecutableDb } from "#core/interfaces/executable-db.interface.js";
import type { TelemetryStore } from "#core/interfaces/telemetry-store.interface.js";
import type { TelemetryEvent } from "#core/types/telemetry-types.js";

function tokenReductionPct(tokensRaw: number, tokensCompiled: number): number {
  if (tokensRaw <= 0) return 0;
  return ((tokensRaw - tokensCompiled) / tokensRaw) * 100;
}

export class SqliteTelemetryStore implements TelemetryStore {
  constructor(private readonly db: ExecutableDb) {}

  write(event: TelemetryEvent): void {
    const raw = Number(event.tokensRaw);
    const compiled = Number(event.tokensCompiled);
    const reductionPct = tokenReductionPct(raw, compiled);
    const stmt = this.db.prepare(
      `INSERT INTO telemetry_events (
        id, repo_id, task_class, tokens_raw, tokens_compiled, token_reduction_pct,
        duration_ms, cache_hit, model_id, editor_id, files_selected, files_total,
        guard_findings, guard_blocks, transform_savings, tiers_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    stmt.run(
      event.id,
      event.repoId,
      event.taskClass,
      event.tokensRaw,
      event.tokensCompiled,
      reductionPct,
      event.durationMs,
      event.cacheHit ? 1 : 0,
      event.model ?? null,
      "generic",
      event.filesSelected,
      event.filesTotal,
      event.guardFindingsCount,
      event.guardBlockedCount,
      0,
      JSON.stringify(event.summarisationTiers),
      event.timestamp,
    );
  }
}
