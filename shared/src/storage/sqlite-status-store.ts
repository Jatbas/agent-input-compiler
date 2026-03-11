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
} from "@jatbas/aic-core/core/types/status-types.js";
import type { ConversationId } from "@jatbas/aic-core/core/types/identifiers.js";
import { toProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import { type AbsolutePath, toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { TRIGGER_SOURCE } from "@jatbas/aic-core/core/types/enums.js";

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
    tokenReductionPct: Number(row.token_reduction_pct),
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
         created_at, editor_id, model_id
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
    };
  }

  private getAggregatesForScope(projectId: ProjectId | null): StatusAggregates {
    const triggerFilter = " (trigger_source IS NULL OR trigger_source != ?) ";
    const projectSuffix = projectId !== null ? " AND project_id = ?" : "";
    const baseParams: unknown[] =
      projectId !== null
        ? [TRIGGER_SOURCE.INTERNAL_TEST, projectId]
        : [TRIGGER_SOURCE.INTERNAL_TEST];
    const compilationsTotalRow = this.db
      .prepare(
        `SELECT COUNT(*) as c FROM compilation_log WHERE${triggerFilter}${projectSuffix}`,
      )
      .all(...baseParams) as { c: number }[];
    const compilationsTotal = compilationsTotalRow[0]?.c ?? 0;
    const todayDate = this.clock.now().slice(0, 10);
    const compilationsTodayRow = this.db
      .prepare(
        `SELECT COUNT(*) as c FROM compilation_log WHERE date(created_at) = date(?) AND${triggerFilter}${projectSuffix}`,
      )
      .all(todayDate, ...baseParams) as { c: number }[];
    const compilationsToday = compilationsTodayRow[0]?.c ?? 0;
    const cacheRateRow = this.db
      .prepare(
        `SELECT SUM(cache_hit=1)*100.0/NULLIF(COUNT(*),0) as rate FROM compilation_log WHERE${triggerFilter}${projectSuffix}`,
      )
      .all(...baseParams) as { rate: number | null }[];
    const cacheHitRatePct =
      compilationsTotal === 0 ? null : (cacheRateRow[0]?.rate ?? null);
    const tokenSumsRow = this.db
      .prepare(
        `SELECT COALESCE(SUM(tokens_raw), 0) as raw, COALESCE(SUM(tokens_compiled), 0) as compiled FROM compilation_log WHERE${triggerFilter}${projectSuffix}`,
      )
      .all(...baseParams) as { raw: number; compiled: number }[];
    const totalTokensRaw = tokenSumsRow[0]?.raw ?? 0;
    const totalTokensCompiled = tokenSumsRow[0]?.compiled ?? 0;
    const totalTokensSaved =
      compilationsTotal > 0 ? totalTokensRaw - totalTokensCompiled : null;
    const avgReductionPct =
      compilationsTotal > 0 && totalTokensRaw > 0
        ? ((totalTokensRaw - totalTokensCompiled) / totalTokensRaw) * 100
        : null;
    const telemetrySql =
      projectId !== null
        ? "SELECT COUNT(*) as c FROM telemetry_events te JOIN compilation_log cl ON te.compilation_id = cl.id WHERE cl.project_id = ?"
        : "SELECT COUNT(*) as c FROM telemetry_events te JOIN compilation_log cl ON te.compilation_id = cl.id";
    const telemetryCountRow = this.db
      .prepare(telemetrySql)
      .all(...(projectId !== null ? [projectId] : [])) as { c: number }[];
    const telemetryDisabled = (telemetryCountRow[0]?.c ?? 0) === 0;
    const guardSql =
      projectId !== null
        ? "SELECT gf.type, COUNT(*) as cnt FROM guard_findings gf JOIN compilation_log cl ON gf.compilation_id = cl.id WHERE cl.project_id = ? GROUP BY gf.type"
        : "SELECT gf.type, COUNT(*) as cnt FROM guard_findings gf JOIN compilation_log cl ON gf.compilation_id = cl.id GROUP BY gf.type";
    const guardRows = this.db
      .prepare(guardSql)
      .all(...(projectId !== null ? [projectId] : [])) as {
      type: string;
      cnt: number;
    }[];
    const guardByType = guardRows.reduce<Record<string, number>>(
      (acc, row) => ({ ...acc, [row.type]: row.cnt }),
      {},
    );
    const topRows = this.db
      .prepare(
        `SELECT task_class as taskClass, COUNT(*) as count FROM compilation_log WHERE${triggerFilter}${projectSuffix} GROUP BY task_class ORDER BY count DESC LIMIT 3`,
      )
      .all(...baseParams) as { taskClass: string; count: number }[];
    const topTaskClasses = topRows.map(mapTaskClassRow);
    const lastSql =
      "SELECT intent, files_selected, files_total, tokens_compiled, COALESCE(CAST((tokens_raw - tokens_compiled) AS REAL) * 100.0 / NULLIF(tokens_raw, 0), 0) AS token_reduction_pct, created_at, editor_id, model_id FROM compilation_log WHERE" +
      triggerFilter +
      projectSuffix +
      " ORDER BY created_at DESC LIMIT 1";
    const lastRows = this.db.prepare(lastSql).all(...baseParams) as LastCompilationRow[];
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

  getGlobalSummary(): GlobalStatusAggregates {
    const base = this.getAggregatesForScope(null);
    const projectCountRow = this.db
      .prepare(
        "SELECT COUNT(DISTINCT project_id) as c FROM compilation_log WHERE (trigger_source IS NULL OR trigger_source != ?)",
      )
      .all(TRIGGER_SOURCE.INTERNAL_TEST) as { c: number }[];
    const projectCount = projectCountRow[0]?.c ?? 0;
    const projectsBreakdown: readonly ProjectListItem[] =
      projectCount > 1
        ? (
            this.db
              .prepare(
                `SELECT p.project_id, p.project_root, p.last_seen_at, COUNT(cl.id) as compilation_count
               FROM projects p
               LEFT JOIN compilation_log cl ON cl.project_id = p.project_id AND (cl.trigger_source IS NULL OR cl.trigger_source != ?)
               GROUP BY p.project_id`,
              )
              .all(TRIGGER_SOURCE.INTERNAL_TEST) as {
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
        "SELECT intent, files_selected, files_total, tokens_compiled, COALESCE(CAST((tokens_raw - tokens_compiled) AS REAL) * 100.0 / NULLIF(tokens_raw, 0), 0) AS token_reduction_pct, created_at, editor_id, model_id FROM compilation_log WHERE (trigger_source IS NULL OR trigger_source != ?) AND project_id = ? ORDER BY created_at DESC LIMIT 1",
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
    const rows = this.db
      .prepare(
        `SELECT p.project_id, p.project_root, p.last_seen_at, COUNT(cl.id) as compilation_count
         FROM projects p
         LEFT JOIN compilation_log cl ON cl.project_id = p.project_id AND (cl.trigger_source IS NULL OR cl.trigger_source != ?)
         GROUP BY p.project_id`,
      )
      .all(TRIGGER_SOURCE.INTERNAL_TEST) as {
      project_id: string;
      project_root: string;
      last_seen_at: string;
      compilation_count: number;
    }[];
    return rows.map((row) => ({
      projectId: toProjectId(row.project_id),
      projectRoot: toAbsolutePath(row.project_root),
      lastSeenAt: row.last_seen_at,
      compilationCount: row.compilation_count,
    }));
  }

  getSummary(): StatusAggregates {
    return this.getAggregatesForScope(this.projectId);
  }
}
