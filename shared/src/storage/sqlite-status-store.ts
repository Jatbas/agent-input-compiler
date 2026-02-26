import type { ExecutableDb } from "#core/interfaces/executable-db.interface.js";
import type { StatusStore } from "#core/interfaces/status-store.interface.js";
import type { StatusAggregates } from "#core/types/status-types.js";

export class SqliteStatusStore implements StatusStore {
  constructor(private readonly db: ExecutableDb) {}

  getSummary(): StatusAggregates {
    const compilationsTotalRow = this.db
      .prepare("SELECT COUNT(*) as c FROM compilation_log")
      .all() as { c: number }[];
    const compilationsTotal = compilationsTotalRow[0]?.c ?? 0;

    const compilationsTodayRow = this.db
      .prepare(
        "SELECT COUNT(*) as c FROM compilation_log WHERE date(created_at) = date('now')",
      )
      .all() as { c: number }[];
    const compilationsToday = compilationsTodayRow[0]?.c ?? 0;

    const cacheRateRow = this.db
      .prepare(
        "SELECT SUM(cache_hit=1)*100.0/NULLIF(COUNT(*),0) as rate FROM compilation_log",
      )
      .all() as { rate: number | null }[];
    const cacheHitRatePct =
      compilationsTotal === 0 ? null : (cacheRateRow[0]?.rate ?? null);

    const telemetryCountRow = this.db
      .prepare("SELECT COUNT(*) as c FROM telemetry_events")
      .all() as { c: number }[];
    const hasTelemetry = (telemetryCountRow[0]?.c ?? 0) > 0;
    const telemetryRows = this.db
      .prepare(
        "SELECT AVG(token_reduction_pct) as avgPct, SUM(tokens_raw - tokens_compiled) as totalSaved FROM telemetry_events",
      )
      .all() as { avgPct: number | null; totalSaved: number | null }[];
    const telemetryRow = telemetryRows[0];
    const avgReductionPct = hasTelemetry ? (telemetryRow?.avgPct ?? null) : null;
    const totalTokensSaved = hasTelemetry ? (telemetryRow?.totalSaved ?? null) : null;
    const telemetryDisabled = !hasTelemetry;

    const guardRows = this.db
      .prepare("SELECT type, COUNT(*) as cnt FROM guard_findings GROUP BY type")
      .all() as { type: string; cnt: number }[];
    const guardByType = guardRows.reduce<Record<string, number>>(
      (acc, row) => ({ ...acc, [row.type]: row.cnt }),
      {},
    );

    const topRows = this.db
      .prepare(
        "SELECT task_class as taskClass, COUNT(*) as count FROM compilation_log GROUP BY task_class ORDER BY count DESC LIMIT 3",
      )
      .all() as { taskClass: string; count: number }[];
    const topTaskClasses = topRows.map((r) => ({
      taskClass: r.taskClass,
      count: r.count,
    }));

    const lastRows = this.db
      .prepare(
        "SELECT intent, files_selected, files_total, tokens_compiled, token_reduction_pct, created_at FROM compilation_log ORDER BY created_at DESC LIMIT 1",
      )
      .all() as {
      intent: string;
      files_selected: number;
      files_total: number;
      tokens_compiled: number;
      token_reduction_pct: number;
      created_at: string;
    }[];
    const lastRow = lastRows[0];
    const lastCompilation =
      lastRow === undefined
        ? null
        : {
            intent: lastRow.intent,
            filesSelected: lastRow.files_selected,
            filesTotal: lastRow.files_total,
            tokensCompiled: lastRow.tokens_compiled,
            tokenReductionPct: lastRow.token_reduction_pct,
            created_at: lastRow.created_at,
          };

    return {
      compilationsTotal,
      compilationsToday,
      cacheHitRatePct,
      avgReductionPct,
      totalTokensSaved,
      telemetryDisabled,
      guardByType,
      topTaskClasses,
      lastCompilation,
    };
  }
}
