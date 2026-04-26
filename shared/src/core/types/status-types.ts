// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { Brand } from "@jatbas/aic-core/core/types/brand.js";
import type { ISOTimestamp, ProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { FilePath } from "@jatbas/aic-core/core/types/paths.js";

export const STATUS_TIME_RANGE_DAYS_MAX = 3660;

export type StatusTimeRangeDays = Brand<number, "StatusTimeRangeDays">;

export function toStatusTimeRangeDays(raw: number): StatusTimeRangeDays {
  return raw as StatusTimeRangeDays;
}

export interface StatusSummaryFilter {
  readonly notBeforeInclusive: ISOTimestamp;
}

export interface StatusRequest {
  readonly projectRoot: AbsolutePath;
  readonly configPath: FilePath | null;
  readonly dbPath: FilePath;
}

export interface LastCompilationSnapshot {
  readonly intent: string;
  readonly filesSelected: number;
  readonly filesTotal: number;
  readonly tokensCompiled: number;
  readonly tokenReductionPct: number;
  readonly created_at: string;
  readonly editorId: string;
  readonly modelId: string | null;
  readonly allocatedTotalBudget: number;
  readonly durationMs: number | null;
}

export interface StatusAggregates {
  readonly compilationsTotal: number;
  readonly compilationsToday: number;
  readonly cacheHitRatePct: number | null;
  readonly avgReductionPct: number | null;
  readonly totalTokensRaw: number;
  readonly totalTokensCompiled: number;
  readonly totalTokensSaved: number | null;
  readonly telemetryDisabled: boolean;
  readonly guardByType: Readonly<Record<string, number>>;
  readonly topTaskClasses: readonly {
    readonly taskClass: string;
    readonly count: number;
  }[];
  readonly lastCompilation: LastCompilationSnapshot | null;
  readonly installationOk: boolean | null;
  readonly installationNotes: string | null;
  readonly sessionTimeMs: number | null;
  readonly activeConversationId: string | null;
  readonly activeConversationCreatedAt: string | null;
}

export interface ProjectListItem {
  readonly projectId: ProjectId;
  readonly projectRoot: AbsolutePath;
  readonly lastSeenAt: string;
  readonly compilationCount: number;
}

export interface GlobalStatusAggregates extends StatusAggregates {
  readonly projectsBreakdown?: readonly ProjectListItem[];
}

export interface ConversationSummary {
  readonly conversationId: string;
  readonly projectRoot: string;
  readonly compilationsInConversation: number;
  readonly cacheHitRatePct: number | null;
  readonly avgReductionPct: number | null;
  readonly totalTokensRaw: number;
  readonly totalTokensCompiled: number;
  readonly totalTokensSaved: number | null;
  readonly lastCompilationInConversation: LastCompilationSnapshot | null;
  readonly topTaskClasses: readonly {
    readonly taskClass: string;
    readonly count: number;
  }[];
  readonly sessionElapsedMs: number | null;
}
