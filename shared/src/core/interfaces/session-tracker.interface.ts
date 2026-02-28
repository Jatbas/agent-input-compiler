import type { SessionId, ISOTimestamp } from "#core/types/identifiers.js";
import type { StopReason } from "#core/types/enums.js";

export interface SessionTracker {
  startSession(
    sessionId: SessionId,
    startedAt: ISOTimestamp,
    pid: number,
    version: string,
  ): void;
  stopSession(
    sessionId: SessionId,
    stoppedAt: ISOTimestamp,
    stopReason: StopReason,
  ): void;
  backfillCrashedSessions(stoppedAt: ISOTimestamp): void;
}
