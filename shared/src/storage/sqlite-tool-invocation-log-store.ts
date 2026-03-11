// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { ToolInvocationLogStore } from "@jatbas/aic-core/core/interfaces/tool-invocation-log-store.interface.js";
import type { ToolInvocationLogEntry } from "@jatbas/aic-core/core/types/tool-invocation-log-entry.js";

export class SqliteToolInvocationLogStore implements ToolInvocationLogStore {
  constructor(
    private readonly projectId: ProjectId,
    private readonly db: ExecutableDb,
  ) {}

  record(entry: ToolInvocationLogEntry): void {
    this.db
      .prepare(
        "INSERT INTO tool_invocation_log (id, created_at, tool_name, session_id, params_shape, project_id) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        entry.id,
        entry.createdAt,
        entry.toolName,
        entry.sessionId,
        entry.paramsShape,
        this.projectId,
      );
  }
}
