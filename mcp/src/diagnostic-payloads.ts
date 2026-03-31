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
import type { LoadConfigFromFile } from "@jatbas/aic-core/config/load-config-from-file.js";
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
  const budgetMaxTokens = input.budgetConfig.getMaxTokens();
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

function summaryForLastTool(
  statusStore: SqliteStatusStore,
  db: ExecutableDb,
  clock: Clock,
  lastConvId: string | null,
): ReturnType<SqliteStatusStore["getSummary"]> {
  if (lastConvId === null) {
    return statusStore.getSummary();
  }
  const scopedProjectId = statusStore.getProjectIdForConversation(
    toConversationId(lastConvId),
  );
  if (scopedProjectId === null) {
    return statusStore.getSummary();
  }
  const scopedStore = new SqliteStatusStore(scopedProjectId, db, clock);
  return scopedStore.getSummary();
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
} {
  const statusStore = new SqliteStatusStore(input.projectId, input.db, input.clock);
  const summary = summaryForLastTool(
    statusStore,
    input.db,
    input.clock,
    input.conversationIdForLast,
  );
  const last = summary.lastCompilation;
  const mapped = last === null ? null : snapshotToConversationLast(last);
  const lastPayload: Record<string, unknown> | null =
    mapped === null ? null : { ...mapped };
  return {
    compilationCount: summary.compilationsTotal,
    lastCompilation: lastPayload,
    promptSummary: {
      tokenCount: last?.tokensCompiled ?? null,
      guardPassed: null,
    },
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
