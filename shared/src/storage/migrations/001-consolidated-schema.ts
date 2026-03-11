// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// Source of schema: sqlite3 ~/.aic/aic.sqlite ".schema" — live DB after all 14 migrations applied

import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { Migration } from "@jatbas/aic-core/core/interfaces/migration.interface.js";

export const migration: Migration = {
  id: "001-consolidated-schema",

  up(db: ExecutableDb): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id          TEXT PRIMARY KEY,
        applied_at  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        project_id   TEXT PRIMARY KEY,
        project_root TEXT NOT NULL UNIQUE,
        created_at   TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS server_sessions (
        session_id         TEXT PRIMARY KEY,
        started_at         TEXT NOT NULL,
        stopped_at         TEXT,
        stop_reason        TEXT,
        pid                INTEGER NOT NULL,
        version            TEXT NOT NULL,
        installation_ok    INTEGER,
        installation_notes TEXT
      );

      CREATE TABLE IF NOT EXISTS config_history (
        config_hash TEXT PRIMARY KEY,
        config_json TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        project_id  TEXT REFERENCES projects(project_id)
      );

      CREATE TABLE IF NOT EXISTS compilation_log (
        id             TEXT PRIMARY KEY,
        intent         TEXT NOT NULL,
        task_class     TEXT NOT NULL,
        files_selected INTEGER NOT NULL,
        files_total    INTEGER NOT NULL,
        tokens_raw     INTEGER NOT NULL,
        tokens_compiled INTEGER NOT NULL,
        cache_hit      INTEGER NOT NULL DEFAULT 0,
        duration_ms    INTEGER NOT NULL,
        editor_id      TEXT NOT NULL,
        model_id       TEXT,
        created_at     TEXT NOT NULL,
        session_id     TEXT REFERENCES server_sessions(session_id),
        config_hash    TEXT REFERENCES config_history(config_hash),
        trigger_source TEXT,
        conversation_id TEXT,
        project_id     TEXT REFERENCES projects(project_id)
      );

      CREATE TABLE IF NOT EXISTS telemetry_events (
        id              TEXT PRIMARY KEY,
        repo_id         TEXT NOT NULL,
        guard_findings  INTEGER NOT NULL DEFAULT 0,
        guard_blocks    INTEGER NOT NULL DEFAULT 0,
        transform_savings INTEGER NOT NULL DEFAULT 0,
        tiers_json      TEXT NOT NULL DEFAULT '{}',
        created_at      TEXT NOT NULL,
        compilation_id  TEXT REFERENCES compilation_log(id)
      );

      CREATE TABLE IF NOT EXISTS cache_metadata (
        cache_key      TEXT PRIMARY KEY,
        file_path      TEXT NOT NULL,
        file_tree_hash TEXT NOT NULL,
        created_at     TEXT NOT NULL,
        expires_at     TEXT NOT NULL,
        project_id     TEXT REFERENCES projects(project_id)
      );

      CREATE TABLE IF NOT EXISTS guard_findings (
        id             TEXT PRIMARY KEY,
        compilation_id TEXT NOT NULL REFERENCES compilation_log(id),
        type           TEXT NOT NULL,
        severity       TEXT NOT NULL,
        file           TEXT NOT NULL,
        line           INTEGER,
        message        TEXT NOT NULL,
        pattern        TEXT,
        created_at     TEXT NOT NULL
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
        id           TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'queued',
        created_at   TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_state (
        session_id       TEXT NOT NULL,
        task_intent      TEXT,
        steps_json       TEXT NOT NULL DEFAULT '[]',
        created_at       TEXT NOT NULL,
        last_activity_at TEXT NOT NULL,
        project_id       TEXT REFERENCES projects(project_id),
        PRIMARY KEY (session_id, project_id)
      );

      CREATE TABLE IF NOT EXISTS file_transform_cache (
        file_path           TEXT NOT NULL,
        content_hash        TEXT NOT NULL,
        transformed_content TEXT NOT NULL,
        tier_outputs_json   TEXT NOT NULL,
        created_at          TEXT NOT NULL,
        expires_at          TEXT NOT NULL,
        project_id          TEXT REFERENCES projects(project_id),
        PRIMARY KEY (file_path, content_hash)
      );

      CREATE TABLE IF NOT EXISTS tool_invocation_log (
        id           TEXT PRIMARY KEY,
        created_at   TEXT NOT NULL,
        tool_name    TEXT NOT NULL,
        session_id   TEXT NOT NULL,
        params_shape TEXT NOT NULL,
        project_id   TEXT REFERENCES projects(project_id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_root
        ON projects(project_root);
      CREATE INDEX IF NOT EXISTS idx_compilation_log_created_at
        ON compilation_log(created_at);
      CREATE INDEX IF NOT EXISTS idx_compilation_log_session_id
        ON compilation_log(session_id);
      CREATE INDEX IF NOT EXISTS idx_compilation_log_config_hash
        ON compilation_log(config_hash);
      CREATE INDEX IF NOT EXISTS idx_compilation_log_project_id
        ON compilation_log(project_id);
      CREATE INDEX IF NOT EXISTS idx_telemetry_events_created_at
        ON telemetry_events(created_at);
      CREATE INDEX IF NOT EXISTS idx_telemetry_events_compilation_id
        ON telemetry_events(compilation_id);
      CREATE INDEX IF NOT EXISTS idx_guard_findings_compilation_id
        ON guard_findings(compilation_id);
      CREATE INDEX IF NOT EXISTS idx_cache_metadata_expires_at
        ON cache_metadata(expires_at);
      CREATE INDEX IF NOT EXISTS idx_cache_metadata_project_id
        ON cache_metadata(project_id);
      CREATE INDEX IF NOT EXISTS idx_session_state_project_id
        ON session_state(project_id);
      CREATE INDEX IF NOT EXISTS idx_file_transform_cache_expires_at
        ON file_transform_cache(expires_at);
      CREATE INDEX IF NOT EXISTS idx_file_transform_cache_project_id
        ON file_transform_cache(project_id);
      CREATE INDEX IF NOT EXISTS idx_tool_invocation_log_project_id
        ON tool_invocation_log(project_id);
      CREATE INDEX IF NOT EXISTS idx_config_history_project_id
        ON config_history(project_id);
    `);
  },

  down(db: ExecutableDb): void {
    db.exec(`
      DROP TABLE IF EXISTS tool_invocation_log;
      DROP TABLE IF EXISTS file_transform_cache;
      DROP TABLE IF EXISTS session_state;
      DROP TABLE IF EXISTS anonymous_telemetry_log;
      DROP TABLE IF EXISTS repomap_cache;
      DROP TABLE IF EXISTS guard_findings;
      DROP TABLE IF EXISTS telemetry_events;
      DROP TABLE IF EXISTS cache_metadata;
      DROP TABLE IF EXISTS compilation_log;
      DROP TABLE IF EXISTS config_history;
      DROP TABLE IF EXISTS server_sessions;
      DROP TABLE IF EXISTS projects;
      DROP TABLE IF EXISTS schema_migrations;
    `);
  },
};
