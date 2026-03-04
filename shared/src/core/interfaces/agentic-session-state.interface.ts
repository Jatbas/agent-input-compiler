import type { SessionId } from "#core/types/identifiers.js";
import type { PreviousFile } from "#core/types/session-dedup-types.js";
import type { SessionStep } from "#core/types/session-dedup-types.js";

export interface AgenticSessionState {
  getPreviouslyShownFiles(sessionId: SessionId): readonly PreviousFile[];
  recordStep(sessionId: SessionId, step: SessionStep): void;
}
