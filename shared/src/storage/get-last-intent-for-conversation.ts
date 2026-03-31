// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type {
  ProjectId,
  ConversationId,
} from "@jatbas/aic-core/core/types/identifiers.js";

export function getLastNonGeneralIntentForConversation(
  db: ExecutableDb,
  projectId: ProjectId,
  conversationId: ConversationId,
): string | null {
  const row = db
    .prepare(
      `SELECT intent FROM compilation_log WHERE project_id = ? AND conversation_id = ? AND task_class != 'general' ORDER BY created_at DESC LIMIT 1`,
    )
    .get(projectId, conversationId) as { intent: string } | undefined;
  return row?.intent ?? null;
}
