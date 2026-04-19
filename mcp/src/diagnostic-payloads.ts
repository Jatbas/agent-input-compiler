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
import type { InstallScope } from "./detect-install-scope.js";
import type { UpdateInfo } from "./latest-version-check.js";

export function buildStatusPayload(input: {
  readonly projectId: ProjectId;
  readonly db: ExecutableDb;
  readonly clock: Clock;
  readonly configLoader: LoadConfigFromFile;
  readonly projectRoot: AbsolutePath;
  readonly budgetConfig: BudgetConfig;
  readonly updateInfo: UpdateInfo;
  readonly installScope: InstallScope;
  readonly installScopeWarnings: readonly string[];
  readonly timeRangeDays: StatusTimeRangeDays | null;
}): Record<string, unknown> {
  const statusConfigResult = input.configLoader.load(input.projectRoot, null);
  const statusStore = new SqliteStatusStore(input.projectId, input.db, input.clock);
  const summary =
    input.timeRangeDays === null
      ? statusStore.getGlobalSummary()
      : statusStore.getGlobalSummary({
          notBeforeInclusive: input.clock.addMinutes(
            -Number(input.timeRangeDays) * 24 * 60,
          ),
        });
  const rawMaxTokens = input.budgetConfig.getMaxTokens();
  const budgetMaxTokens =
    Number(rawMaxTokens) === 0
      ? CONTEXT_WINDOW_DEFAULT - RESERVED_RESPONSE_DEFAULT - TEMPLATE_OVERHEAD_DEFAULT
      : Number(rawMaxTokens);
  const budgetUtilizationPct =
    summary.lastCompilation !== null
      ? (summary.lastCompilation.tokensCompiled / budgetMaxTokens) * 100
      : null;
  return {
    ...summary,
    budgetMaxTokens,
    budgetUtilizationPct,
    updateAvailable: input.updateInfo.updateAvailable,
    updateMessage: input.updateInfo.updateMessage,
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
}): {
  readonly compilationCount: number;
  readonly lastCompilation: Record<string, unknown> | null;
  readonly promptSummary: {
    readonly tokenCount: number | null;
    readonly guardPassed: null;
  };
  readonly selection: SelectionTraceParsed | null;
} {
  const startupStore = new SqliteStatusStore(input.projectId, input.db, input.clock);
  const store = resolveSqliteStatusStoreForLastTool(
    startupStore,
    input.db,
    input.clock,
    input.conversationIdForLast,
  );
  const summary = store.getSummary();
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
        };
  const selection =
    traceRow === null ? null : parseSelectionTraceColumn(traceRow.selection_trace_json);
  return {
    compilationCount: summary.compilationsTotal,
    lastCompilation: lastPayload,
    promptSummary: {
      tokenCount: last?.tokensCompiled ?? null,
      guardPassed: null,
    },
    selection,
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
  };
}

function pad2Utc(n: number): string {
  return n < 10 ? `0${String(n)}` : String(n);
}

function daysInMonthUtc(year: number, month1to12: number): number {
  if (month1to12 === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  if (month1to12 === 4 || month1to12 === 6 || month1to12 === 9 || month1to12 === 11) {
    return 30;
  }
  return 31;
}

function incrementUtcCalendarDay(day: string): string {
  const segs = day.split("-");
  const y = Number(segs[0]);
  const mo = Number(segs[1]);
  const d = Number(segs[2]);
  const dim = daysInMonthUtc(y, mo);
  if (d < dim) {
    return `${String(y)}-${pad2Utc(mo)}-${pad2Utc(d + 1)}`;
  }
  if (mo < 12) {
    return `${String(y)}-${pad2Utc(mo + 1)}-01`;
  }
  return `${String(y + 1)}-01-01`;
}

function enumerateUtcDaysInclusive(startDay: string, endDay: string): readonly string[] {
  if (startDay > endDay) return [];
  const step = (current: string): readonly string[] =>
    current === endDay ? [current] : [current, ...step(incrementUtcCalendarDay(current))];
  return step(startDay);
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
  return {
    compilations,
    medianTokenReduction: medianRatio(rows.map((r) => Number(r.tokenReductionRatio))),
    medianSelectionRatio: medianRatio(rows.map((r) => Number(r.selectionRatio))),
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
    return {
      day,
      medianTokenReduction: medianRatio(bucket.map((r) => Number(r.tokenReductionRatio))),
      medianSelectionRatio: medianRatio(bucket.map((r) => Number(r.selectionRatio))),
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
  const compilations = rows.length;
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
    compilations,
    medianTokenReduction: medianRatio(rows.map((r) => Number(r.tokenReductionRatio))),
    medianSelectionRatio: medianRatio(rows.map((r) => Number(r.selectionRatio))),
    medianBudgetUtilisation: medianRatio(rows.map((r) => Number(r.budgetUtilisation))),
    cacheHitRate: cacheHitRateForRows(rows),
    tierDistribution: tierDistributionFromRows(rows),
    byTaskClass,
    classifierConfidence: classifierConfidenceFromRows(rows),
    seriesDaily: seriesDailyFromRows(rows, windowStartDay),
  };
}
