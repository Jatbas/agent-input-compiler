// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { FilePath } from "@jatbas/aic-core/core/types/paths.js";

export interface StatusRequest {
  readonly projectRoot: AbsolutePath;
  readonly configPath: FilePath | null;
  readonly dbPath: FilePath;
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
  readonly lastCompilation: {
    readonly intent: string;
    readonly filesSelected: number;
    readonly filesTotal: number;
    readonly tokensCompiled: number;
    readonly tokenReductionPct: number;
    readonly created_at: string;
    readonly editorId: string;
    readonly modelId: string | null;
  } | null;
  readonly installationOk: boolean | null;
  readonly installationNotes: string | null;
}

export type LastCompilationSnapshot = NonNullable<StatusAggregates["lastCompilation"]>;

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
  readonly lastCompilationInConversation: {
    readonly intent: string;
    readonly filesSelected: number;
    readonly filesTotal: number;
    readonly tokensCompiled: number;
    readonly tokenReductionPct: number;
    readonly created_at: string;
    readonly editorId: string;
    readonly modelId: string | null;
  } | null;
  readonly topTaskClasses: readonly {
    readonly taskClass: string;
    readonly count: number;
  }[];
}
