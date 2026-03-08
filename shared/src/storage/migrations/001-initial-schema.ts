// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { Migration } from "@jatbas/aic-shared/core/interfaces/migration.interface.js";

export const migration: Migration = {
  id: "001-initial-schema",

  up(db): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id          TEXT PRIMARY KEY,
        applied_at  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS compilation_log (
        id                  TEXT PRIMARY KEY,
        intent              TEXT NOT NULL,
        task_class          TEXT NOT NULL,
        files_selected      INTEGER NOT NULL,
        files_total         INTEGER NOT NULL,
        tokens_raw          INTEGER NOT NULL,
        tokens_compiled     INTEGER NOT NULL,
        token_reduction_pct REAL NOT NULL,
        cache_hit           INTEGER NOT NULL DEFAULT 0,
        duration_ms         INTEGER NOT NULL,
        editor_id           TEXT NOT NULL,
        model_id            TEXT,
        created_at          TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS telemetry_events (
        id                  TEXT PRIMARY KEY,
        repo_id             TEXT NOT NULL,
        task_class          TEXT NOT NULL,
        tokens_raw          INTEGER NOT NULL,
        tokens_compiled     INTEGER NOT NULL,
        token_reduction_pct REAL NOT NULL,
        duration_ms         INTEGER NOT NULL,
        cache_hit           INTEGER NOT NULL DEFAULT 0,
        model_id            TEXT,
        editor_id           TEXT NOT NULL,
        files_selected      INTEGER NOT NULL,
        files_total         INTEGER NOT NULL,
        guard_findings      INTEGER NOT NULL DEFAULT 0,
        guard_blocks        INTEGER NOT NULL DEFAULT 0,
        transform_savings   INTEGER NOT NULL DEFAULT 0,
        tiers_json          TEXT NOT NULL DEFAULT '{}',
        created_at          TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cache_metadata (
        cache_key       TEXT PRIMARY KEY,
        file_path       TEXT NOT NULL,
        file_tree_hash  TEXT NOT NULL,
        created_at      TEXT NOT NULL,
        expires_at      TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS config_history (
        config_hash  TEXT PRIMARY KEY,
        config_json  TEXT NOT NULL,
        created_at   TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS guard_findings (
        id              TEXT PRIMARY KEY,
        compilation_id  TEXT NOT NULL REFERENCES compilation_log(id),
        type            TEXT NOT NULL,
        severity        TEXT NOT NULL,
        file            TEXT NOT NULL,
        line            INTEGER,
        message         TEXT NOT NULL,
        pattern         TEXT,
        created_at      TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS repomap_cache (
        project_root    TEXT PRIMARY KEY,
        repomap_json    TEXT NOT NULL,
        file_tree_hash  TEXT NOT NULL,
        total_files     INTEGER NOT NULL,
        total_tokens    INTEGER NOT NULL,
        built_at        TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS anonymous_telemetry_log (
        id            TEXT PRIMARY KEY,
        payload_json  TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'queued',
        created_at    TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_compilation_log_created_at
        ON compilation_log(created_at);
      CREATE INDEX IF NOT EXISTS idx_telemetry_events_created_at
        ON telemetry_events(created_at);
      CREATE INDEX IF NOT EXISTS idx_guard_findings_compilation_id
        ON guard_findings(compilation_id);
      CREATE INDEX IF NOT EXISTS idx_cache_metadata_expires_at
        ON cache_metadata(expires_at);
    `);
  },

  down(db): void {
    db.exec(`
      DROP TABLE IF EXISTS anonymous_telemetry_log;
      DROP TABLE IF EXISTS repomap_cache;
      DROP TABLE IF EXISTS guard_findings;
      DROP TABLE IF EXISTS config_history;
      DROP TABLE IF EXISTS cache_metadata;
      DROP TABLE IF EXISTS telemetry_events;
      DROP TABLE IF EXISTS compilation_log;
      DROP TABLE IF EXISTS schema_migrations;
    `);
  },
};
