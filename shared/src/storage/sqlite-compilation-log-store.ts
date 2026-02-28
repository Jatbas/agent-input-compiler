import type { ExecutableDb } from "#core/interfaces/executable-db.interface.js";
import type { CompilationLogStore } from "#core/interfaces/compilation-log-store.interface.js";
import type { CompilationLogEntry } from "#core/types/compilation-log-entry.js";

export class SqliteCompilationLogStore implements CompilationLogStore {
  constructor(private readonly db: ExecutableDb) {}

  record(entry: CompilationLogEntry): void {
    const stmt = this.db.prepare(
      `INSERT INTO compilation_log (
        id, intent, task_class, files_selected, files_total,
        tokens_raw, tokens_compiled, token_reduction_pct, cache_hit,
        duration_ms, editor_id, model_id, session_id, config_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    );
  }
}
