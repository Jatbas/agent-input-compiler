import type { ExecutableDb } from "#core/interfaces/executable-db.interface.js";
import type { Clock } from "#core/interfaces/clock.interface.js";
import type { StatusStore } from "#core/interfaces/status-store.interface.js";
import type { ConversationSummary, StatusAggregates } from "#core/types/status-types.js";
import type { ConversationId } from "#core/types/identifiers.js";

type LastCompilationRow = {
  intent: string;
  files_selected: number;
  files_total: number;
  tokens_compiled: number;
  token_reduction_pct: number;
  created_at: string;
  editor_id: string;
  model_id: string | null;
};

function mapLastCompilationRow(row: LastCompilationRow): {
  intent: string;
  filesSelected: number;
  filesTotal: number;
  tokensCompiled: number;
  tokenReductionPct: number;
  created_at: string;
  editorId: string;
  modelId: string | null;
} {
  return {
    intent: row.intent,
    filesSelected: row.files_selected,
    filesTotal: row.files_total,
    tokensCompiled: row.tokens_compiled,
    tokenReductionPct: row.token_reduction_pct,
    created_at: row.created_at,
    editorId: row.editor_id,
    modelId: row.model_id,
  };
}

function mapTaskClassRow(r: { taskClass: string; count: number }): {
  readonly taskClass: string;
  readonly count: number;
} {
  return { taskClass: r.taskClass, count: r.count };
}

export class SqliteStatusStore implements StatusStore {
  constructor(
    private readonly db: ExecutableDb,
    private readonly clock: Clock,
  ) {}

  getConversationSummary(conversationId: ConversationId): ConversationSummary | null {
    const countRows = this.db
      .prepare("SELECT COUNT(*) as c FROM compilation_log WHERE conversation_id = ?")
      .all(conversationId) as { c: number }[];
    const count = countRows[0]?.c ?? 0;
    if (count === 0) return null;

    const cacheRateRows = this.db
      .prepare(
        "SELECT SUM(cache_hit=1)*100.0/NULLIF(COUNT(*),0) as rate FROM compilation_log WHERE conversation_id = ?",
      )
      .all(conversationId) as { rate: number | null }[];
    const cacheHitRatePct = cacheRateRows[0]?.rate ?? null;

    const aggRows = this.db
      .prepare(
        `SELECT COALESCE(SUM(tokens_raw), 0) as raw,
                COALESCE(SUM(tokens_compiled), 0) as compiled
         FROM compilation_log WHERE conversation_id = ?`,
      )
      .all(conversationId) as {
      raw: number;
      compiled: number;
    }[];
    const aggRow = aggRows[0];
    const totalTokensRaw = aggRow?.raw ?? 0;
    const totalTokensCompiled = aggRow?.compiled ?? 0;
    const totalTokensSaved = totalTokensRaw - totalTokensCompiled;
    const avgReductionPct =
      totalTokensRaw > 0
        ? ((totalTokensRaw - totalTokensCompiled) / totalTokensRaw) * 100
        : null;

    const topRows = this.db
      .prepare(
        `SELECT task_class as taskClass, COUNT(*) as count
         FROM compilation_log WHERE conversation_id = ?
         GROUP BY task_class ORDER BY count DESC LIMIT 3`,
      )
      .all(conversationId) as { taskClass: string; count: number }[];
    const topTaskClasses = topRows.map(mapTaskClassRow);

    const lastRows = this.db
      .prepare(
        `SELECT intent, files_selected, files_total, tokens_compiled, token_reduction_pct, created_at, editor_id, model_id
         FROM compilation_log WHERE conversation_id = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .all(conversationId) as LastCompilationRow[];
    const lastRow = lastRows[0];
    const lastCompilationInConversation =
      lastRow === undefined ? null : mapLastCompilationRow(lastRow);

    return {
      conversationId,
      compilationsInConversation: count,
      cacheHitRatePct,
      avgReductionPct,
      totalTokensRaw,
      totalTokensCompiled,
      totalTokensSaved,
      lastCompilationInConversation,
      topTaskClasses,
    };
  }

  getSummary(): StatusAggregates {
    const compilationsTotalRow = this.db
      .prepare("SELECT COUNT(*) as c FROM compilation_log")
      .all() as { c: number }[];
    const compilationsTotal = compilationsTotalRow[0]?.c ?? 0;

    const todayDate = this.clock.now().slice(0, 10);
    const compilationsTodayRow = this.db
      .prepare(
        "SELECT COUNT(*) as c FROM compilation_log WHERE date(created_at) = date(?)",
      )
      .all(todayDate) as { c: number }[];
    const compilationsToday = compilationsTodayRow[0]?.c ?? 0;

    const cacheRateRow = this.db
      .prepare(
        "SELECT SUM(cache_hit=1)*100.0/NULLIF(COUNT(*),0) as rate FROM compilation_log",
      )
      .all() as { rate: number | null }[];
    const cacheHitRatePct =
      compilationsTotal === 0 ? null : (cacheRateRow[0]?.rate ?? null);

    const tokenSumsRow = this.db
      .prepare(
        "SELECT COALESCE(SUM(tokens_raw), 0) as raw, COALESCE(SUM(tokens_compiled), 0) as compiled FROM compilation_log",
      )
      .all() as { raw: number; compiled: number }[];
    const totalTokensRaw = tokenSumsRow[0]?.raw ?? 0;
    const totalTokensCompiled = tokenSumsRow[0]?.compiled ?? 0;
    const totalTokensSaved =
      compilationsTotal > 0 ? totalTokensRaw - totalTokensCompiled : null;
    const avgReductionPct =
      compilationsTotal > 0 && totalTokensRaw > 0
        ? ((totalTokensRaw - totalTokensCompiled) / totalTokensRaw) * 100
        : null;

    const telemetryCountRow = this.db
      .prepare("SELECT COUNT(*) as c FROM telemetry_events")
      .all() as { c: number }[];
    const telemetryDisabled = (telemetryCountRow[0]?.c ?? 0) === 0;

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
    const topTaskClasses = topRows.map(mapTaskClassRow);

    const lastRows = this.db
      .prepare(
        "SELECT intent, files_selected, files_total, tokens_compiled, token_reduction_pct, created_at, editor_id, model_id FROM compilation_log ORDER BY created_at DESC LIMIT 1",
      )
      .all() as LastCompilationRow[];
    const lastRow = lastRows[0];
    const lastCompilation = lastRow === undefined ? null : mapLastCompilationRow(lastRow);

    const sessionRows = this.db
      .prepare(
        "SELECT installation_ok, installation_notes FROM server_sessions ORDER BY started_at DESC LIMIT 1",
      )
      .all() as { installation_ok: number | null; installation_notes: string | null }[];
    const sessionRow = sessionRows[0];
    const installationOk =
      sessionRow === undefined ? null : sessionRow.installation_ok === 1;
    const installationNotes =
      sessionRow === undefined ? null : (sessionRow.installation_notes ?? null);

    return {
      compilationsTotal,
      compilationsToday,
      cacheHitRatePct,
      avgReductionPct,
      totalTokensRaw,
      totalTokensCompiled,
      totalTokensSaved,
      telemetryDisabled,
      guardByType,
      topTaskClasses,
      lastCompilation,
      installationOk,
      installationNotes,
    };
  }
}
