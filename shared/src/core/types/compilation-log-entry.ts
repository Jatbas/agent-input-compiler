// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type {
  UUIDv7,
  ISOTimestamp,
  SessionId,
  ConversationId,
} from "@jatbas/aic-core/core/types/identifiers.js";
import type { TokenCount, Milliseconds } from "@jatbas/aic-core/core/types/units.js";
import type { Percentage, Confidence } from "@jatbas/aic-core/core/types/scores.js";
import type {
  TaskClass,
  EditorId,
  TriggerSource,
} from "@jatbas/aic-core/core/types/enums.js";
import type { SelectionTrace } from "@jatbas/aic-core/core/types/selection-trace.js";

export interface CompilationLogEntry {
  readonly id: UUIDv7;
  readonly intent: string;
  readonly taskClass: TaskClass;
  readonly filesSelected: number;
  readonly filesTotal: number;
  readonly tokensRaw: TokenCount;
  readonly tokensCompiled: TokenCount;
  readonly tokenReductionPct: Percentage;
  readonly cacheHit: boolean;
  readonly durationMs: Milliseconds;
  readonly editorId: EditorId;
  readonly modelId: string;
  readonly sessionId: SessionId | null;
  readonly configHash: string | null;
  readonly createdAt: ISOTimestamp;
  readonly triggerSource?: TriggerSource | null;
  readonly conversationId: ConversationId | null;
  readonly selectionTrace: SelectionTrace | null;
  readonly classifierConfidence: Confidence | null;
  readonly specificityScore: Confidence | null;
  readonly underspecificationIndex: Confidence | null;
}
