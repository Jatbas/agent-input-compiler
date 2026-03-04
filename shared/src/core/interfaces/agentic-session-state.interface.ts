import type { SessionId, ISOTimestamp } from "#core/types/identifiers.js";
import type { PreviousFile } from "#core/types/session-dedup-types.js";
import type { SessionStep } from "#core/types/session-dedup-types.js";

export interface AgenticSessionState {
  getPreviouslyShownFiles(
    sessionId: SessionId,
    fileLastModified?: Readonly<Record<string, ISOTimestamp>>,
  ): readonly PreviousFile[];
  getSteps(sessionId: SessionId): readonly SessionStep[];
  recordStep(sessionId: SessionId, step: SessionStep): void;
}
