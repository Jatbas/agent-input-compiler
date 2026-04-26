// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { StatusStore } from "@jatbas/aic-core/core/interfaces/status-store.interface.js";
import type { GlobalStatusQueries } from "@jatbas/aic-core/core/interfaces/global-status-queries.interface.js";
import type {
  ConversationSummary,
  StatusAggregates,
  GlobalStatusAggregates,
  ProjectListItem,
  LastCompilationSnapshot,
  StatusSummaryFilter,
} from "@jatbas/aic-core/core/types/status-types.js";
import type {
  ConversationId,
  ISOTimestamp,
} from "@jatbas/aic-core/core/types/identifiers.js";
import { toProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import { type AbsolutePath, toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { TRIGGER_SOURCE } from "@jatbas/aic-core/core/types/enums.js";
import { toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import { resolveDisplayTotalBudgetDenominator } from "@jatbas/aic-core/core/resolve-display-total-budget.js";

export function listProjectsFromDb(db: ExecutableDb): readonly ProjectListItem[] {
  const rows = db
    .prepare(
      `SELECT p.project_id, p.project_root, COALESCE(MAX(cl.created_at), p.last_seen_at) AS last_seen_at, COUNT(cl.id) as compilation_count
         FROM projects p
         LEFT JOIN compilation_log cl ON cl.project_id = p.project_id AND (cl.trigger_source IS NULL OR cl.trigger_source != ?)
         GROUP BY p.project_id`,
    )
    .all(TRIGGER_SOURCE.INTERNAL_TEST) as {
    readonly project_id: string;
    readonly project_root: string;
    readonly last_seen_at: string;
    readonly compilation_count: number;
  }[];
  return rows.map((row) => ({
    projectId: toProjectId(row.project_id),
    projectRoot: toAbsolutePath(row.project_root),
    lastSeenAt: row.last_seen_at,
    compilationCount: row.compilation_count,
  }));
}

type LastCompilationRow = {
  intent: string;
  files_selected: number;
  files_total: number;
  tokens_compiled: number;
  token_reduction_pct: number;
  created_at: string;
  editor_id: string;
  model_id: string | null;
  total_budget: number | null;
  duration_ms: number | null;
};

type LastCompilationRowWithTrace = LastCompilationRow & {
  selection_trace_json: string | null;
  cache_hit: number | null;
  guard_finding_count: number | null;
  guard_block_count: number | null;
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
  allocatedTotalBudget: number;
  durationMs: number | null;
} {
  return {
    intent: row.intent,
    filesSelected: row.files_selected,
    filesTotal: row.files_total,
    tokensCompiled: row.tokens_compiled,
    tokenReductionPct: Number(row.token_reduction_pct),
    created_at: row.created_at,
    editorId: row.editor_id,
    modelId: row.model_id,
    allocatedTotalBudget: resolveDisplayTotalBudgetDenominator(
      row.total_budget,
      row.model_id,
    ),
    durationMs: row.duration_ms,
  };
}

const SESSION_TIME_CAP_MS = 4 * 60 * 60 * 1000;

function mapTaskClassRow(r: { taskClass: string; count: number }): {
  readonly taskClass: string;
  readonly count: number;
} {
  return { taskClass: r.taskClass, count: r.count };
}

type CompilationLogScopeBinders = {
  readonly timeSql: string;
  readonly timeParams: readonly ISOTimestamp[];
  readonly triggerFilter: string;
  readonly projectSuffix: string;
  readonly scopeParams: () => unknown[];
  readonly todayParams: (todayDate: string) => unknown[];
};

function compilationLogScopeBinders(
  projectId: ProjectId | null,
  notBeforeInclusive: ISOTimestamp | null,
): CompilationLogScopeBinders {
  const timeSql = notBeforeInclusive !== null ? " AND created_at >= ? " : "";
  const timeParams: readonly ISOTimestamp[] =
    notBeforeInclusive !== null ? [notBeforeInclusive] : [];
  const triggerFilter = " (trigger_source IS NULL OR trigger_source != ?) ";
  const projectSuffix = projectId !== null ? " AND project_id = ?" : "";
  const scopeParams = (): unknown[] => [
    TRIGGER_SOURCE.INTERNAL_TEST,
    ...timeParams,
    ...(projectId !== null ? [projectId] : []),
  ];
  const todayParams = (todayDate: string): unknown[] => [
    todayDate,
    TRIGGER_SOURCE.INTERNAL_TEST,
    ...timeParams,
    ...(projectId !== null ? [projectId] : []),
  ];
  return { timeSql, timeParams, triggerFilter, projectSuffix, scopeParams, todayParams };
}

function readTelemetryDisabledForCompilationScope(
  db: ExecutableDb,
  projectId: ProjectId | null,
  clTimeSql: string,
  timeParams: readonly ISOTimestamp[],
): boolean {
  const telemetrySql =
    projectId !== null
      ? `SELECT COUNT(*) as c FROM telemetry_events te JOIN compilation_log cl ON te.compilation_id = cl.id WHERE cl.project_id = ? AND (cl.trigger_source IS NULL OR cl.trigger_source != ?)${clTimeSql}`
      : `SELECT COUNT(*) as c FROM telemetry_events te JOIN compilation_log cl ON te.compilation_id = cl.id WHERE (cl.trigger_source IS NULL OR cl.trigger_source != ?)${clTimeSql}`;
  const telemetryParams: unknown[] =
    projectId !== null
      ? [projectId, TRIGGER_SOURCE.INTERNAL_TEST, ...timeParams]
      : [TRIGGER_SOURCE.INTERNAL_TEST, ...timeParams];
  const telemetryCountRow = db.prepare(telemetrySql).all(...telemetryParams) as {
    c: number;
  }[];
  return (telemetryCountRow[0]?.c ?? 0) === 0;
}

function readGuardByTypeForCompilationScope(
  db: ExecutableDb,
  projectId: ProjectId | null,
  clTimeSql: string,
  timeParams: readonly ISOTimestamp[],
): Record<string, number> {
  const guardSql =
    projectId !== null
      ? `SELECT gf.type, COUNT(*) as cnt FROM guard_findings gf JOIN compilation_log cl ON gf.compilation_id = cl.id WHERE cl.project_id = ? AND (cl.trigger_source IS NULL OR cl.trigger_source != ?)${clTimeSql} GROUP BY gf.type`
      : `SELECT gf.type, COUNT(*) as cnt FROM guard_findings gf JOIN compilation_log cl ON gf.compilation_id = cl.id WHERE (cl.trigger_source IS NULL OR cl.trigger_source != ?)${clTimeSql} GROUP BY gf.type`;
  const guardParams: unknown[] =
    projectId !== null
      ? [projectId, TRIGGER_SOURCE.INTERNAL_TEST, ...timeParams]
      : [TRIGGER_SOURCE.INTERNAL_TEST, ...timeParams];
  const guardRows = db.prepare(guardSql).all(...guardParams) as {
    type: string;
    cnt: number;
  }[];
  return Object.fromEntries(
    guardRows.map((row): [string, number] => [row.type, row.cnt]),
  );
}

export class SqliteStatusStore implements StatusStore, GlobalStatusQueries {
  constructor(
    private readonly projectId: ProjectId,
    private readonly db: ExecutableDb,
    private readonly clock: Clock,
  ) {}

  getConversationSummary(conversationId: ConversationId): ConversationSummary | null {
    const countRows = this.db
      .prepare(
        "SELECT COUNT(*) as c FROM compilation_log WHERE conversation_id = ? AND (trigger_source IS NULL OR trigger_source != ?) AND project_id = ?",
      )
      .all(conversationId, TRIGGER_SOURCE.INTERNAL_TEST, this.projectId) as {
      c: number;
    }[];
    const count = countRows[0]?.c ?? 0;
    if (count === 0) return null;

    const cacheRateRows = this.db
      .prepare(
        "SELECT SUM(cache_hit=1)*100.0/NULLIF(COUNT(*),0) as rate FROM compilation_log WHERE conversation_id = ? AND (trigger_source IS NULL OR trigger_source != ?) AND project_id = ?",
      )
      .all(conversationId, TRIGGER_SOURCE.INTERNAL_TEST, this.projectId) as {
      rate: number | null;
    }[];
    const cacheHitRatePct = cacheRateRows[0]?.rate ?? null;

    const aggRows = this.db
      .prepare(
        `SELECT COALESCE(SUM(tokens_raw), 0) as raw,
                COALESCE(SUM(tokens_compiled), 0) as compiled
         FROM compilation_log WHERE conversation_id = ? AND (trigger_source IS NULL OR trigger_source != ?) AND project_id = ?`,
      )
      .all(conversationId, TRIGGER_SOURCE.INTERNAL_TEST, this.projectId) as {
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
         FROM compilation_log WHERE conversation_id = ? AND (trigger_source IS NULL OR trigger_source != ?) AND project_id = ?
         GROUP BY task_class ORDER BY count DESC LIMIT 3`,
      )
      .all(conversationId, TRIGGER_SOURCE.INTERNAL_TEST, this.projectId) as {
      taskClass: string;
      count: number;
    }[];
    const topTaskClasses = topRows.map(mapTaskClassRow);

    const lastRows = this.db
      .prepare(
        `SELECT intent, files_selected, files_total, tokens_compiled,
         COALESCE(CAST((tokens_raw - tokens_compiled) AS REAL) * 100.0 / NULLIF(tokens_raw, 0), 0) AS token_reduction_pct,
         created_at, editor_id, model_id, total_budget, duration_ms
         FROM compilation_log WHERE conversation_id = ? AND (trigger_source IS NULL OR trigger_source != ?) AND project_id = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .all(
        conversationId,
        TRIGGER_SOURCE.INTERNAL_TEST,
        this.projectId,
      ) as LastCompilationRow[];
    const lastRow = lastRows[0];
    const lastCompilationInConversation =
      lastRow === undefined ? null : mapLastCompilationRow(lastRow);

    const projectRootRows = this.db
      .prepare("SELECT project_root FROM projects WHERE project_id = ?")
      .all(this.projectId) as { project_root: string }[];
    const projectRoot = projectRootRows[0]?.project_root ?? "";

    return {
      conversationId,
      projectRoot,
      compilationsInConversation: count,
      cacheHitRatePct,
      avgReductionPct,
      totalTokensRaw,
      totalTokensCompiled,
      totalTokensSaved,
      lastCompilationInConversation,
      topTaskClasses,
      sessionElapsedMs: this.getSessionElapsedMsForId(conversationId),
    };
  }

  private getProjectSessionSummary(notBeforeInclusive: ISOTimestamp | null): {
    readonly sessionTimeMs: number | null;
    readonly activeConversationId: string | null;
    readonly activeConversationCreatedAt: string | null;
  } {
    const sessionWindowClause =
      notBeforeInclusive === null ? "" : " AND last_activity_at >= ? ";
    const sessionParams: readonly unknown[] =
      notBeforeInclusive === null
        ? [this.projectId]
        : [this.projectId, notBeforeInclusive];
    const sessionRows = this.db
      .prepare(
        `SELECT
           COUNT(*) AS session_count,
           COALESCE(SUM(
             CASE
               WHEN elapsed_ms < 0 THEN 0
               WHEN elapsed_ms > ? THEN ?
               ELSE elapsed_ms
             END
           ), 0) AS session_time_ms
         FROM (
           SELECT CAST((julianday(last_activity_at) - julianday(created_at)) * 86400000.0 AS INTEGER) AS elapsed_ms
           FROM session_state
           WHERE project_id = ?${sessionWindowClause}
         )`,
      )
      .all(SESSION_TIME_CAP_MS, SESSION_TIME_CAP_MS, ...sessionParams) as {
      session_count: number;
      session_time_ms: number;
    }[];
    const sessionRow = sessionRows[0];
    const sessionTimeMs =
      (sessionRow?.session_count ?? 0) > 0 ? (sessionRow?.session_time_ms ?? 0) : null;
    const conversationRows = this.db
      .prepare(
        "SELECT conversation_id FROM compilation_log WHERE project_id = ? AND conversation_id IS NOT NULL AND (trigger_source IS NULL OR trigger_source != ?) ORDER BY created_at DESC LIMIT 1",
      )
      .all(this.projectId, TRIGGER_SOURCE.INTERNAL_TEST) as {
      conversation_id: string;
    }[];
    const activeConversationId = conversationRows[0]?.conversation_id ?? null;
    const activeConversationCreatedRows =
      activeConversationId === null
        ? []
        : (this.db
            .prepare(
              "SELECT created_at FROM session_state WHERE session_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 1",
            )
            .all(activeConversationId, this.projectId) as { created_at: string }[]);
    const activeConversationCreatedAt =
      activeConversationCreatedRows[0]?.created_at ?? null;
    return { sessionTimeMs, activeConversationId, activeConversationCreatedAt };
  }

  private getAggregatesForScope(
    projectId: ProjectId | null,
    notBeforeInclusive: ISOTimestamp | null,
  ): StatusAggregates {
    const scope = compilationLogScopeBinders(projectId, notBeforeInclusive);
    const {
      timeSql,
      timeParams,
      triggerFilter,
      projectSuffix,
      scopeParams,
      todayParams,
    } = scope;
    const todayDate = this.clock.now().slice(0, 10);
    const compilationsTotalRow = this.db
      .prepare(
        `SELECT COUNT(*) as c FROM compilation_log WHERE${triggerFilter}${timeSql}${projectSuffix}`,
      )
      .all(...scopeParams()) as { c: number }[];
    const compilationsTotal = compilationsTotalRow[0]?.c ?? 0;
    const compilationsTodayRow = this.db
      .prepare(
        `SELECT COUNT(*) as c FROM compilation_log WHERE date(created_at) = date(?) AND${triggerFilter}${timeSql}${projectSuffix}`,
      )
      .all(...todayParams(todayDate)) as { c: number }[];
    const compilationsToday = compilationsTodayRow[0]?.c ?? 0;
    const cacheRateRow = this.db
      .prepare(
        `SELECT SUM(cache_hit=1)*100.0/NULLIF(COUNT(*),0) as rate FROM compilation_log WHERE${triggerFilter}${timeSql}${projectSuffix}`,
      )
      .all(...scopeParams()) as { rate: number | null }[];
    const cacheHitRatePct =
      compilationsTotal === 0 ? null : (cacheRateRow[0]?.rate ?? null);
    const tokenSumsRow = this.db
      .prepare(
        `SELECT COALESCE(SUM(tokens_raw), 0) as raw, COALESCE(SUM(tokens_compiled), 0) as compiled FROM compilation_log WHERE${triggerFilter}${timeSql}${projectSuffix}`,
      )
      .all(...scopeParams()) as { raw: number; compiled: number }[];
    const totalTokensRaw = tokenSumsRow[0]?.raw ?? 0;
    const totalTokensCompiled = tokenSumsRow[0]?.compiled ?? 0;
    const totalTokensSaved =
      compilationsTotal > 0 ? totalTokensRaw - totalTokensCompiled : null;
    const avgReductionPct =
      compilationsTotal > 0 && totalTokensRaw > 0
        ? ((totalTokensRaw - totalTokensCompiled) / totalTokensRaw) * 100
        : null;
    const clTimeSql = notBeforeInclusive !== null ? " AND cl.created_at >= ?" : "";
    const telemetryDisabled = readTelemetryDisabledForCompilationScope(
      this.db,
      projectId,
      clTimeSql,
      timeParams,
    );
    const guardByType = readGuardByTypeForCompilationScope(
      this.db,
      projectId,
      clTimeSql,
      timeParams,
    );
    const topRows = this.db
      .prepare(
        `SELECT task_class as taskClass, COUNT(*) as count FROM compilation_log WHERE${triggerFilter}${timeSql}${projectSuffix} GROUP BY task_class ORDER BY count DESC LIMIT 3`,
      )
      .all(...scopeParams()) as { taskClass: string; count: number }[];
    const topTaskClasses = topRows.map(mapTaskClassRow);
    const lastSql =
      "SELECT intent, files_selected, files_total, tokens_compiled, COALESCE(CAST((tokens_raw - tokens_compiled) AS REAL) * 100.0 / NULLIF(tokens_raw, 0), 0) AS token_reduction_pct, created_at, editor_id, model_id, total_budget, duration_ms FROM compilation_log WHERE" +
      triggerFilter +
      timeSql +
      projectSuffix +
      " ORDER BY created_at DESC LIMIT 1";
    const lastRows = this.db
      .prepare(lastSql)
      .all(...scopeParams()) as LastCompilationRow[];
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
    const projectSessionSummary =
      projectId === null
        ? {
            sessionTimeMs: null,
            activeConversationId: null,
            activeConversationCreatedAt: null,
          }
        : this.getProjectSessionSummary(notBeforeInclusive);
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
      sessionTimeMs: projectSessionSummary.sessionTimeMs,
      activeConversationId: projectSessionSummary.activeConversationId,
      activeConversationCreatedAt: projectSessionSummary.activeConversationCreatedAt,
    };
  }

  getGlobalSummary(filter?: StatusSummaryFilter): GlobalStatusAggregates {
    const notBeforeInclusive = filter?.notBeforeInclusive ?? null;
    const base = this.getAggregatesForScope(null, notBeforeInclusive);
    const distinctTimeSql = notBeforeInclusive !== null ? " AND created_at >= ?" : "";
    const distinctParams: unknown[] =
      notBeforeInclusive !== null
        ? [TRIGGER_SOURCE.INTERNAL_TEST, notBeforeInclusive]
        : [TRIGGER_SOURCE.INTERNAL_TEST];
    const projectCountRow = this.db
      .prepare(
        `SELECT COUNT(DISTINCT project_id) as c FROM compilation_log WHERE (trigger_source IS NULL OR trigger_source != ?)${distinctTimeSql}`,
      )
      .all(...distinctParams) as { c: number }[];
    const projectCount = projectCountRow[0]?.c ?? 0;
    const joinTimeSql = notBeforeInclusive !== null ? " AND cl.created_at >= ?" : "";
    const breakdownParams: unknown[] =
      notBeforeInclusive !== null
        ? [TRIGGER_SOURCE.INTERNAL_TEST, notBeforeInclusive]
        : [TRIGGER_SOURCE.INTERNAL_TEST];
    const projectsBreakdown: readonly ProjectListItem[] =
      projectCount > 1
        ? (
            this.db
              .prepare(
                `SELECT p.project_id, p.project_root, COALESCE(MAX(cl.created_at), p.last_seen_at) AS last_seen_at, COUNT(cl.id) as compilation_count
               FROM projects p
               LEFT JOIN compilation_log cl ON cl.project_id = p.project_id AND (cl.trigger_source IS NULL OR cl.trigger_source != ?)${joinTimeSql}
               GROUP BY p.project_id`,
              )
              .all(...breakdownParams) as {
              project_id: string;
              project_root: string;
              last_seen_at: string;
              compilation_count: number;
            }[]
          ).map((row) => ({
            projectId: toProjectId(row.project_id),
            projectRoot: toAbsolutePath(row.project_root),
            lastSeenAt: row.last_seen_at,
            compilationCount: row.compilation_count,
          }))
        : [];
    return {
      ...base,
      ...(projectsBreakdown.length > 0 ? { projectsBreakdown } : {}),
    };
  }

  getProjectIdForConversation(conversationId: ConversationId): ProjectId | null {
    const rows = this.db
      .prepare(
        "SELECT project_id FROM compilation_log WHERE conversation_id = ? AND (trigger_source IS NULL OR trigger_source != ?) ORDER BY created_at DESC LIMIT 1",
      )
      .all(conversationId, TRIGGER_SOURCE.INTERNAL_TEST) as {
      project_id: string;
    }[];
    const row = rows[0];
    return row?.project_id !== undefined ? toProjectId(row.project_id) : null;
  }

  getLastCompilationForProject(projectId: ProjectId): LastCompilationSnapshot | null {
    const lastRows = this.db
      .prepare(
        "SELECT intent, files_selected, files_total, tokens_compiled, COALESCE(CAST((tokens_raw - tokens_compiled) AS REAL) * 100.0 / NULLIF(tokens_raw, 0), 0) AS token_reduction_pct, created_at, editor_id, model_id, total_budget, duration_ms FROM compilation_log WHERE (trigger_source IS NULL OR trigger_source != ?) AND project_id = ? ORDER BY created_at DESC LIMIT 1",
      )
      .all(TRIGGER_SOURCE.INTERNAL_TEST, projectId) as LastCompilationRow[];
    const lastRow = lastRows[0];
    return lastRow === undefined ? null : mapLastCompilationRow(lastRow);
  }

  getProjectRoot(projectId: ProjectId): AbsolutePath | null {
    const rows = this.db
      .prepare("SELECT project_root FROM projects WHERE project_id = ?")
      .all(projectId) as { project_root: string }[];
    const row = rows[0];
    return row?.project_root !== undefined ? toAbsolutePath(row.project_root) : null;
  }

  listProjects(): readonly ProjectListItem[] {
    return listProjectsFromDb(this.db);
  }

  getSummary(filter?: StatusSummaryFilter): StatusAggregates {
    return this.getAggregatesForScope(this.projectId, filter?.notBeforeInclusive ?? null);
  }

  getSessionElapsedMsForId(sessionId: string): number | null {
    const rows = this.db
      .prepare(
        "SELECT created_at, last_activity_at FROM session_state WHERE session_id = ? AND project_id = ?",
      )
      .all(sessionId, this.projectId) as {
      created_at: string;
      last_activity_at: string;
    }[];
    const row = rows[0];
    if (row === undefined) return null;
    // last_activity_at equals created_at when the session is still active (not yet updated at end)
    const effectiveEnd =
      row.last_activity_at === row.created_at
        ? this.clock.now()
        : toISOTimestamp(row.last_activity_at);
    const raw = this.clock.durationMs(toISOTimestamp(row.created_at), effectiveEnd);
    if (raw < 0) return 0;
    return raw > SESSION_TIME_CAP_MS ? SESSION_TIME_CAP_MS : raw;
  }

  getLastCompilationRowWithTraceForLastTool(): LastCompilationRowWithTrace | null {
    const lastRows = this.db
      .prepare(
        `SELECT cl.intent, cl.files_selected, cl.files_total, cl.tokens_compiled,
         COALESCE(CAST((cl.tokens_raw - cl.tokens_compiled) AS REAL) * 100.0 / NULLIF(cl.tokens_raw, 0), 0) AS token_reduction_pct,
         cl.created_at, cl.editor_id, cl.model_id, cl.total_budget, cl.duration_ms, cl.selection_trace_json, cl.cache_hit,
         te.guard_findings AS guard_finding_count, te.guard_blocks AS guard_block_count
         FROM compilation_log cl
         LEFT JOIN telemetry_events te ON te.compilation_id = cl.id
         WHERE (cl.trigger_source IS NULL OR cl.trigger_source != ?) AND cl.project_id = ?
         ORDER BY cl.created_at DESC LIMIT 1`,
      )
      .all(TRIGGER_SOURCE.INTERNAL_TEST, this.projectId) as LastCompilationRowWithTrace[];
    return lastRows[0] ?? null;
  }
}
