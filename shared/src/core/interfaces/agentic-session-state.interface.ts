// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type {
  SessionId,
  ISOTimestamp,
} from "@jatbas/aic-shared/core/types/identifiers.js";
import type { PreviousFile } from "@jatbas/aic-shared/core/types/session-dedup-types.js";
import type { SessionStep } from "@jatbas/aic-shared/core/types/session-dedup-types.js";

export interface AgenticSessionState {
  getPreviouslyShownFiles(
    sessionId: SessionId,
    fileLastModified?: Readonly<Record<string, ISOTimestamp>>,
  ): readonly PreviousFile[];
  getSteps(sessionId: SessionId): readonly SessionStep[];
  recordStep(sessionId: SessionId, step: SessionStep): void;
}
