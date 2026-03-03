import type { AbsolutePath } from "#core/types/paths.js";
import type { FilePath } from "#core/types/paths.js";

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

export interface ConversationSummary {
  readonly conversationId: string;
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
