import type { Migration } from "#core/interfaces/migration.interface.js";

export const migration: Migration = {
  id: "004-normalize-telemetry",

  up(db): void {
    // Link compilations to their server session and config version
    db.exec(
      "ALTER TABLE compilation_log ADD COLUMN session_id TEXT REFERENCES server_sessions(session_id)",
    );
    db.exec(
      "ALTER TABLE compilation_log ADD COLUMN config_hash TEXT REFERENCES config_history(config_hash)",
    );

    // Link telemetry events to their compilation
    db.exec(
      "ALTER TABLE telemetry_events ADD COLUMN compilation_id TEXT REFERENCES compilation_log(id)",
    );

    // Best-effort backfill via UPDATE...FROM (SQLite 3.33+)
    db.exec(`
      UPDATE telemetry_events
      SET compilation_id = cl.id
      FROM compilation_log cl
      WHERE cl.task_class      = telemetry_events.task_class
        AND cl.tokens_raw      = telemetry_events.tokens_raw
        AND cl.tokens_compiled = telemetry_events.tokens_compiled
        AND cl.duration_ms     = telemetry_events.duration_ms
        AND cl.cache_hit       = telemetry_events.cache_hit
    `);

    // Drop duplicated columns from telemetry_events
    db.exec("ALTER TABLE telemetry_events DROP COLUMN task_class");
    db.exec("ALTER TABLE telemetry_events DROP COLUMN tokens_raw");
    db.exec("ALTER TABLE telemetry_events DROP COLUMN tokens_compiled");
    db.exec("ALTER TABLE telemetry_events DROP COLUMN token_reduction_pct");
    db.exec("ALTER TABLE telemetry_events DROP COLUMN duration_ms");
    db.exec("ALTER TABLE telemetry_events DROP COLUMN cache_hit");
    db.exec("ALTER TABLE telemetry_events DROP COLUMN model_id");
    db.exec("ALTER TABLE telemetry_events DROP COLUMN editor_id");
    db.exec("ALTER TABLE telemetry_events DROP COLUMN files_selected");
    db.exec("ALTER TABLE telemetry_events DROP COLUMN files_total");

    // Indexes for the new FK columns
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_compilation_log_session_id ON compilation_log(session_id)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_compilation_log_config_hash ON compilation_log(config_hash)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_telemetry_events_compilation_id ON telemetry_events(compilation_id)",
    );
  },

  down(_db): void {
    // Destructive migration; columns cannot be restored
  },
};
