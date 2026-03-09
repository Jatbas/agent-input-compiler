// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { Migration } from "@jatbas/aic-core/core/interfaces/migration.interface.js";
import { hasColumn, safeAddColumn } from "./migration-utils.js";

function safeDropColumn(
  db: Parameters<Migration["up"]>[0],
  table: string,
  column: string,
): void {
  if (hasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  }
}

export const migration: Migration = {
  id: "004-normalize-telemetry",

  up(db): void {
    safeAddColumn(
      db,
      "compilation_log",
      "session_id",
      "TEXT REFERENCES server_sessions(session_id)",
    );
    safeAddColumn(
      db,
      "compilation_log",
      "config_hash",
      "TEXT REFERENCES config_history(config_hash)",
    );
    safeAddColumn(
      db,
      "telemetry_events",
      "compilation_id",
      "TEXT REFERENCES compilation_log(id)",
    );

    // Best-effort backfill only if original columns still exist
    if (hasColumn(db, "telemetry_events", "task_class")) {
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
    }

    safeDropColumn(db, "telemetry_events", "task_class");
    safeDropColumn(db, "telemetry_events", "tokens_raw");
    safeDropColumn(db, "telemetry_events", "tokens_compiled");
    safeDropColumn(db, "telemetry_events", "token_reduction_pct");
    safeDropColumn(db, "telemetry_events", "duration_ms");
    safeDropColumn(db, "telemetry_events", "cache_hit");
    safeDropColumn(db, "telemetry_events", "model_id");
    safeDropColumn(db, "telemetry_events", "editor_id");
    safeDropColumn(db, "telemetry_events", "files_selected");
    safeDropColumn(db, "telemetry_events", "files_total");

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
