// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type {
  ProjectId,
  ConversationId,
} from "@jatbas/aic-core/core/types/identifiers.js";

export function reparentSubagentCompilations(
  db: ExecutableDb,
  projectId: ProjectId,
  childConversationId: ConversationId,
  parentConversationId: ConversationId,
): number {
  const stmt = db.prepare(
    `UPDATE compilation_log SET conversation_id = ? WHERE conversation_id = ? AND project_id = ?`,
  );
  stmt.run(parentConversationId, childConversationId, projectId);
  const countResult = db.prepare(`SELECT changes() AS cnt`).get() as { cnt: number };
  return countResult.cnt;
}
