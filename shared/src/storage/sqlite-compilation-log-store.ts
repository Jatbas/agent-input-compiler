// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { CompilationLogStore } from "@jatbas/aic-core/core/interfaces/compilation-log-store.interface.js";
import type { CompilationLogEntry } from "@jatbas/aic-core/core/types/compilation-log-entry.js";

export class SqliteCompilationLogStore implements CompilationLogStore {
  constructor(
    private readonly projectRoot: AbsolutePath,
    private readonly db: ExecutableDb,
  ) {}

  record(entry: CompilationLogEntry): void {
    const stmt = this.db.prepare(
      `INSERT INTO compilation_log (
        id, intent, task_class, files_selected, files_total,
        tokens_raw, tokens_compiled, token_reduction_pct, cache_hit,
        duration_ms, editor_id, model_id, session_id, config_hash, created_at, trigger_source, conversation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    stmt.run(
      entry.id,
      entry.intent,
      entry.taskClass,
      entry.filesSelected,
      entry.filesTotal,
      entry.tokensRaw,
      entry.tokensCompiled,
      entry.tokenReductionPct,
      entry.cacheHit ? 1 : 0,
      entry.durationMs,
      entry.editorId,
      entry.modelId || null,
      entry.sessionId,
      entry.configHash,
      entry.createdAt,
      entry.triggerSource ?? null,
      entry.conversationId ?? null,
    );
  }
}
