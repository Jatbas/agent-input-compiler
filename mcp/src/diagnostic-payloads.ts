// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { ProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import {
  toConversationId,
  type ConversationId,
} from "@jatbas/aic-core/core/types/identifiers.js";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { BudgetConfig } from "@jatbas/aic-core/core/interfaces/budget-config.interface.js";
import type {
  ConversationSummary,
  LastCompilationSnapshot,
  StatusAggregates,
  StatusTimeRangeDays,
} from "@jatbas/aic-core/core/types/status-types.js";
import {
  SqliteStatusStore,
  listProjectsFromDb,
} from "@jatbas/aic-core/storage/sqlite-status-store.js";
import { SqliteQualitySnapshotStore } from "@jatbas/aic-core/storage/sqlite-quality-snapshot-store.js";
import type { QualitySnapshotRow } from "@jatbas/aic-core/core/types/quality-snapshot-types.js";
import { TASK_CLASS } from "@jatbas/aic-core/core/types/enums.js";
import {
  SelectionTraceSchema,
  type SelectionTraceParsed,
} from "./schemas/selection-trace.schema.js";
import type { LoadConfigFromFile } from "@jatbas/aic-core/config/load-config-from-file.js";
import {
  CONTEXT_WINDOW_DEFAULT,
  RESERVED_RESPONSE_DEFAULT,
  TEMPLATE_OVERHEAD_DEFAULT,
} from "@jatbas/aic-core/pipeline/budget-allocator.js";
import { resolveBudgetUtilizationPercent } from "@jatbas/aic-core/core/resolve-display-total-budget.js";
import type { InstallScope } from "./detect-install-scope.js";
import { enumerateUtcDaysInclusive } from "./utc-calendar.js";

export function buildStatusPayload(input: {
  readonly projectId: ProjectId;
  readonly db: ExecutableDb;
  readonly clock: Clock;
  readonly configLoader: LoadConfigFromFile;
  readonly projectRoot: AbsolutePath;
  readonly budgetConfig: BudgetConfig;
  readonly installScope: InstallScope;
  readonly installScopeWarnings: readonly string[];
  readonly timeRangeDays: StatusTimeRangeDays | null;
}): Record<string, unknown> {
  const statusConfigResult = input.configLoader.load(input.projectRoot, null);
  const statusStore = new SqliteStatusStore(input.projectId, input.db, input.clock);
  const filter =
    input.timeRangeDays === null
      ? undefined
      : {
          notBeforeInclusive: input.clock.addMinutes(
            -Number(input.timeRangeDays) * 24 * 60,
          ),
        };
  const summary = statusStore.getGlobalSummary(filter);
  const projectSummary = statusStore.getSummary(filter);
  const rawMaxTokens = input.budgetConfig.getMaxTokens();
  const defaultCeiling =
    Number(rawMaxTokens) === 0
      ? CONTEXT_WINDOW_DEFAULT - RESERVED_RESPONSE_DEFAULT - TEMPLATE_OVERHEAD_DEFAULT
      : Number(rawMaxTokens);
  const budgetMaxTokens =
    summary.lastCompilation !== null
      ? summary.lastCompilation.allocatedTotalBudget
      : defaultCeiling;
  const budgetUtilizationPct =
    summary.lastCompilation !== null
      ? resolveBudgetUtilizationPercent(
          summary.lastCompilation.tokensCompiled,
          summary.lastCompilation.allocatedTotalBudget,
        )
      : null;
  return {
    ...summary,
    sessionTimeMs: projectSummary.sessionTimeMs,
    activeConversationId: projectSummary.activeConversationId,
    activeConversationCreatedAt: projectSummary.activeConversationCreatedAt,
    budgetMaxTokens,
    budgetUtilizationPct,
    installScope: input.installScope,
    installScopeWarnings: input.installScopeWarnings,
    projectEnabled: statusConfigResult.config.enabled,
    timeRangeDays: input.timeRangeDays,
  };
}

function snapshotToConversationLast(
  last: LastCompilationSnapshot,
): NonNullable<ConversationSummary["lastCompilationInConversation"]> {
  return {
    intent: last.intent,
    filesSelected: last.filesSelected,
    filesTotal: last.filesTotal,
    tokensCompiled: last.tokensCompiled,
    tokenReductionPct: Number(last.tokenReductionPct),
    created_at: last.created_at,
    editorId: last.editorId,
    modelId: last.modelId,
    allocatedTotalBudget: last.allocatedTotalBudget,
    durationMs: last.durationMs,
  };
}

const selectionTraceParseFailureState = { logged: false };

function logSelectionTraceParseFailureOnce(): void {
  if (selectionTraceParseFailureState.logged) return;
  selectionTraceParseFailureState.logged = true;
  process.stderr.write("aic_last: selection_trace_json rejected or invalid JSON\n");
}

function parseSelectionTraceColumn(raw: string | null): SelectionTraceParsed | null {
  if (raw === null) return null;
  const jsonResult:
    | { readonly ok: true; readonly value: unknown }
    | { readonly ok: false } = (():
    | { readonly ok: true; readonly value: unknown }
    | { readonly ok: false } => {
    try {
      return { ok: true, value: JSON.parse(raw) as unknown };
    } catch {
      return { ok: false };
    }
  })();
  if (!jsonResult.ok) {
    logSelectionTraceParseFailureOnce();
    return null;
  }
  const result = SelectionTraceSchema.safeParse(jsonResult.value);
  if (!result.success) {
    logSelectionTraceParseFailureOnce();
    return null;
  }
  return result.data;
}

function resolveSqliteStatusStoreForLastTool(
  startupStore: SqliteStatusStore,
  db: ExecutableDb,
  clock: Clock,
  conversationIdForLast: string | null,
): SqliteStatusStore {
  if (conversationIdForLast === null) {
    return startupStore;
  }
  const scopedProjectId = startupStore.getProjectIdForConversation(
    toConversationId(conversationIdForLast),
  );
  if (scopedProjectId === null) {
    return startupStore;
  }
  return new SqliteStatusStore(scopedProjectId, db, clock);
}

export function buildLastPayload(input: {
  readonly projectId: ProjectId;
  readonly db: ExecutableDb;
  readonly clock: Clock;
  readonly conversationIdForLast: string | null;
  readonly budgetConfig: BudgetConfig;
}): {
  readonly compilationCount: number;
  readonly lastCompilation: Record<string, unknown> | null;
  readonly promptSummary: {
    readonly tokenCount: number | null;
    readonly guardPassed: null;
  };
  readonly selection: SelectionTraceParsed | null;
  readonly lastBudgetMaxTokens: number;
  readonly budgetUtilizationPct: number | null;
  readonly sessionElapsedMs: number | null;
} {
  const startupStore = new SqliteStatusStore(input.projectId, input.db, input.clock);
  const store = resolveSqliteStatusStoreForLastTool(
    startupStore,
    input.db,
    input.clock,
    input.conversationIdForLast,
  );
  const summary = store.getSummary();
  const rawMaxTokens = input.budgetConfig.getMaxTokens();
  const defaultCeiling =
    Number(rawMaxTokens) === 0
      ? CONTEXT_WINDOW_DEFAULT - RESERVED_RESPONSE_DEFAULT - TEMPLATE_OVERHEAD_DEFAULT
      : Number(rawMaxTokens);
  const lastBudgetMaxTokens =
    summary.lastCompilation !== null
      ? summary.lastCompilation.allocatedTotalBudget
      : defaultCeiling;
  const traceRow = store.getLastCompilationRowWithTraceForLastTool();
  const last = summary.lastCompilation;
  const mapped = last === null ? null : snapshotToConversationLast(last);
  const lastPayload: Record<string, unknown> | null =
    mapped === null
      ? null
      : {
          ...mapped,
          cacheHit: traceRow?.cache_hit === 1,
          guardFindingCount: traceRow?.guard_finding_count ?? null,
          guardBlockCount: traceRow?.guard_block_count ?? null,
          guardScannedFileCount: mapped.filesSelected,
        };
  const selection =
    traceRow === null ? null : parseSelectionTraceColumn(traceRow.selection_trace_json);
  const budgetUtilizationPct =
    last === null
      ? null
      : resolveBudgetUtilizationPercent(last.tokensCompiled, last.allocatedTotalBudget);
  const sessionElapsedMs =
    summary.activeConversationId === null
      ? null
      : store.getSessionElapsedMsForId(summary.activeConversationId);
  return {
    compilationCount: summary.compilationsTotal,
    lastCompilation: lastPayload,
    promptSummary: {
      tokenCount: last?.tokensCompiled ?? null,
      guardPassed: null,
    },
    selection,
    lastBudgetMaxTokens,
    budgetUtilizationPct,
    sessionElapsedMs,
  };
}

function resolveConversationData(
  conversationId: ConversationId,
  statusStore: SqliteStatusStore,
  db: ExecutableDb,
  clock: Clock,
): { readonly summary: ConversationSummary | null; readonly projectRootStr: string } {
  const projectId = statusStore.getProjectIdForConversation(conversationId);
  if (projectId === null) return { summary: null, projectRootStr: "" };
  const root = statusStore.getProjectRoot(projectId);
  const projectStore = new SqliteStatusStore(projectId, db, clock);
  return {
    summary: projectStore.getConversationSummary(conversationId),
    projectRootStr: root ?? "",
  };
}

export function buildChatSummaryToolPayload(input: {
  readonly startupProjectId: ProjectId;
  readonly db: ExecutableDb;
  readonly clock: Clock;
  readonly conversationIdArg: string | undefined;
}): ConversationSummary {
  const idRaw =
    input.conversationIdArg !== undefined &&
    typeof input.conversationIdArg === "string" &&
    input.conversationIdArg.trim().length > 0
      ? input.conversationIdArg.trim()
      : null;
  const idForPayload = idRaw ?? "";
  const conversationId = idRaw !== null ? toConversationId(idRaw) : null;
  const statusStore = new SqliteStatusStore(
    input.startupProjectId,
    input.db,
    input.clock,
  );
  const { summary, projectRootStr } =
    conversationId !== null
      ? resolveConversationData(conversationId, statusStore, input.db, input.clock)
      : { summary: null, projectRootStr: "" };
  const empty: ConversationSummary = {
    conversationId: idForPayload,
    projectRoot: projectRootStr,
    compilationsInConversation: 0,
    cacheHitRatePct: null,
    avgReductionPct: null,
    totalTokensRaw: 0,
    totalTokensCompiled: 0,
    totalTokensSaved: null,
    lastCompilationInConversation: null,
    topTaskClasses: [],
    sessionElapsedMs: null,
  };
  return summary ?? empty;
}

export function buildProjectsPayload(
  db: ExecutableDb,
): ReturnType<typeof listProjectsFromDb> {
  return listProjectsFromDb(db);
}

export function buildProjectScopedChatSummaryCliRow(
  projectRootDisplay: string,
  summary: StatusAggregates,
  clock: Clock,
  sessionElapsedMs: number | null,
): ConversationSummary {
  const last = summary.lastCompilation;
  return {
    conversationId: "",
    projectRoot: projectRootDisplay,
    compilationsInConversation: summary.compilationsTotal,
    cacheHitRatePct: summary.cacheHitRatePct,
    avgReductionPct: summary.avgReductionPct,
    totalTokensRaw: summary.totalTokensRaw,
    totalTokensCompiled: summary.totalTokensCompiled,
    totalTokensSaved: summary.totalTokensSaved,
    lastCompilationInConversation:
      last === null ? null : snapshotToConversationLast(last),
    topTaskClasses: summary.topTaskClasses,
    sessionElapsedMs,
  };
}

function utcCalendarDayFromIsoTimestamp(ts: string): string {
  return ts.slice(0, 10);
}

function medianRatio(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) / 2);
  const picked = sorted[idx];
  return picked ?? 0;
}

function cacheHitRateForRows(rows: readonly QualitySnapshotRow[]): number {
  if (rows.length === 0) return 0;
  const hits = rows.reduce((acc, r) => acc + (r.cacheHit ? 1 : 0), 0);
  return hits / rows.length;
}

function stratumMetrics(rows: readonly QualitySnapshotRow[]): Record<string, unknown> {
  const compilations = rows.length;
  // cache hits use token_reduction_ratio=0; omit so median reflects real builds not cache hits
  const compileRows = rows.filter((r) => !r.cacheHit);
  return {
    compilations,
    medianTokenReduction: medianRatio(
      compileRows.map((r) => Number(r.tokenReductionRatio)),
    ),
    medianSelectionRatio: medianRatio(compileRows.map((r) => Number(r.selectionRatio))),
    medianBudgetUtilisation: medianRatio(rows.map((r) => Number(r.budgetUtilisation))),
    cacheHitRate: cacheHitRateForRows(rows),
  };
}

function tierDistributionFromRows(
  rows: readonly QualitySnapshotRow[],
): Record<string, number> {
  const sumL0 = rows.reduce((a, r) => a + r.tierL0, 0);
  const sumL1 = rows.reduce((a, r) => a + r.tierL1, 0);
  const sumL2 = rows.reduce((a, r) => a + r.tierL2, 0);
  const sumL3 = rows.reduce((a, r) => a + r.tierL3, 0);
  const total = sumL0 + sumL1 + sumL2 + sumL3;
  if (total === 0) {
    return { l0: 0, l1: 0, l2: 0, l3: 0 };
  }
  return {
    l0: sumL0 / total,
    l1: sumL1 / total,
    l2: sumL2 / total,
    l3: sumL3 / total,
  };
}

function classifierConfidenceFromRows(
  rows: readonly QualitySnapshotRow[],
): Record<string, unknown> {
  const samples = rows.flatMap((r) =>
    r.classifierConfidence === null ? [] : [Number(r.classifierConfidence)],
  );
  if (samples.length === 0) {
    return { available: false };
  }
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return { available: true, mean };
}

function seriesDailyFromRows(
  rows: readonly QualitySnapshotRow[],
  windowStartDay: string,
): readonly Record<string, unknown>[] {
  if (rows.length === 0) return [];
  const first = rows[0];
  if (first === undefined) return [];
  const endDay = rows.reduce((max, r) => {
    const d = utcCalendarDayFromIsoTimestamp(r.createdAt);
    return d > max ? d : max;
  }, utcCalendarDayFromIsoTimestamp(first.createdAt));
  return enumerateUtcDaysInclusive(windowStartDay, endDay).map((day) => {
    const bucket = rows.filter(
      (r) => utcCalendarDayFromIsoTimestamp(r.createdAt) === day,
    );
    const compileBucket = bucket.filter((r) => !r.cacheHit);
    return {
      day,
      compilations: bucket.length,
      medianTokenReduction: medianRatio(
        compileBucket.map((r) => Number(r.tokenReductionRatio)),
      ),
      medianSelectionRatio: medianRatio(
        compileBucket.map((r) => Number(r.selectionRatio)),
      ),
      medianBudgetUtilisation: medianRatio(
        bucket.map((r) => Number(r.budgetUtilisation)),
      ),
      cacheHitRate: cacheHitRateForRows(bucket),
    };
  });
}

export function buildQualityReportPayload(input: {
  readonly projectId: ProjectId;
  readonly db: ExecutableDb;
  readonly clock: Clock;
  readonly windowDays: number;
}): Record<string, unknown> {
  const store = new SqliteQualitySnapshotStore(input.projectId, input.db);
  const notBeforeInclusive = input.clock.addMinutes(-input.windowDays * 24 * 60);
  const rows = store.selectWindowRows({ notBeforeInclusive });
  const windowStartDay = utcCalendarDayFromIsoTimestamp(notBeforeInclusive);
  const byTaskClass = Object.values(TASK_CLASS).reduce<Record<string, unknown>>(
    (acc, taskClass) => ({
      ...acc,
      [taskClass]: stratumMetrics(rows.filter((r) => r.taskClass === taskClass)),
    }),
    {},
  );
  return {
    windowDays: input.windowDays,
    ...stratumMetrics(rows),
    tierDistribution: tierDistributionFromRows(rows),
    byTaskClass,
    classifierConfidence: classifierConfidenceFromRows(rows),
    seriesDaily: seriesDailyFromRows(rows, windowStartDay),
  };
}
