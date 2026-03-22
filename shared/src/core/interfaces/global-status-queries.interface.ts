// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type {
  ConversationId,
  ProjectId,
} from "@jatbas/aic-core/core/types/identifiers.js";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type {
  GlobalStatusAggregates,
  ProjectListItem,
  LastCompilationSnapshot,
  StatusSummaryFilter,
} from "@jatbas/aic-core/core/types/status-types.js";

export interface GlobalStatusQueries {
  getGlobalSummary(filter?: StatusSummaryFilter): GlobalStatusAggregates;
  getProjectIdForConversation(conversationId: ConversationId): ProjectId | null;
  getLastCompilationForProject(projectId: ProjectId): LastCompilationSnapshot | null;
  getProjectRoot(projectId: ProjectId): AbsolutePath | null;
  listProjects(): readonly ProjectListItem[];
}
