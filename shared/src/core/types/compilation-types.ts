// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type {
  AbsolutePath,
  FilePath,
  RelativePath,
} from "@jatbas/aic-core/core/types/paths.js";
import type {
  TokenCount,
  Milliseconds,
  StepIndex,
} from "@jatbas/aic-core/core/types/units.js";
import type { Percentage, Confidence } from "@jatbas/aic-core/core/types/scores.js";
import type {
  SessionId,
  ConversationId,
  ISOTimestamp,
} from "@jatbas/aic-core/core/types/identifiers.js";
import type {
  TaskClass,
  EditorId,
  InclusionTier,
  ToolOutputType,
  TriggerSource,
} from "@jatbas/aic-core/core/types/enums.js";
import type { GuardResult } from "@jatbas/aic-core/core/types/guard-types.js";

export interface ToolOutput {
  readonly type: ToolOutputType;
  readonly content: string;
  readonly relatedFiles?: readonly RelativePath[];
}

export interface CompilationRequest {
  readonly intent: string;
  readonly projectRoot: AbsolutePath;
  readonly modelId: string | null;
  readonly editorId: EditorId;
  readonly configPath: FilePath | null;
  readonly sessionId?: SessionId;
  readonly stepIndex?: StepIndex;
  readonly stepIntent?: string;
  readonly previousFiles?: readonly RelativePath[];
  readonly toolOutputs?: readonly ToolOutput[];
  readonly conversationTokens?: TokenCount;
  readonly triggerSource?: TriggerSource;
  readonly conversationId?: ConversationId | null;
}

export interface CompilationMeta {
  readonly intent: string;
  readonly taskClass: TaskClass;
  readonly filesSelected: number;
  readonly filesTotal: number;
  readonly tokensRaw: TokenCount;
  readonly tokensCompiled: TokenCount;
  readonly tokenReductionPct: Percentage;
  readonly cacheHit: boolean;
  readonly durationMs: Milliseconds;
  readonly modelId: string;
  readonly editorId: EditorId;
  readonly transformTokensSaved: TokenCount;
  readonly summarisationTiers: Readonly<Record<InclusionTier, number>>;
  readonly guard: GuardResult | null;
  readonly contextCompleteness: Confidence;
  readonly classifierConfidence: Confidence | null;
}

export interface CachedCompilation {
  readonly key: string;
  readonly compiledPrompt: string;
  readonly tokenCount: TokenCount;
  readonly createdAt: ISOTimestamp;
  readonly expiresAt: ISOTimestamp;
  readonly fileTreeHash: string;
  readonly configHash: string;
}
