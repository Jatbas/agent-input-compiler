// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { SessionTracker } from "@jatbas/aic-core/core/interfaces/session-tracker.interface.js";
import type { SessionId, ISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import type { StopReason } from "@jatbas/aic-core/core/types/enums.js";
import { STOP_REASON } from "@jatbas/aic-core/core/types/enums.js";

export class SqliteSessionStore implements SessionTracker {
  constructor(private readonly db: ExecutableDb) {}

  startSession(
    sessionId: SessionId,
    startedAt: ISOTimestamp,
    pid: number,
    version: string,
    installationOk: boolean,
    installationNotes: string,
  ): void {
    this.db
      .prepare(
        "INSERT INTO server_sessions (session_id, started_at, stopped_at, stop_reason, pid, version, installation_ok, installation_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        sessionId,
        startedAt,
        null,
        null,
        pid,
        version,
        installationOk ? 1 : 0,
        installationNotes,
      );
  }

  stopSession(
    sessionId: SessionId,
    stoppedAt: ISOTimestamp,
    stopReason: StopReason,
  ): void {
    this.db
      .prepare(
        "UPDATE server_sessions SET stopped_at = ?, stop_reason = ? WHERE session_id = ?",
      )
      .run(stoppedAt, stopReason, sessionId);
  }

  backfillCrashedSessions(stoppedAt: ISOTimestamp): void {
    this.db
      .prepare(
        "UPDATE server_sessions SET stopped_at = ?, stop_reason = ? WHERE stopped_at IS NULL",
      )
      .run(stoppedAt, STOP_REASON.CRASH);
  }
}
