// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { Migration } from "@jatbas/aic-core/core/interfaces/migration.interface.js";
import { safeAddColumn } from "./migration-utils.js";

export const migration: Migration = {
  id: "011-global-project-root",

  up(db): void {
    const projectRootDef = "TEXT NOT NULL DEFAULT ''";
    safeAddColumn(db, "compilation_log", "project_root", projectRootDef);
    safeAddColumn(db, "cache_metadata", "project_root", projectRootDef);
    safeAddColumn(db, "guard_findings", "project_root", projectRootDef);
    safeAddColumn(db, "tool_invocation_log", "project_root", projectRootDef);
    safeAddColumn(db, "session_state", "project_root", projectRootDef);
    safeAddColumn(db, "file_transform_cache", "project_root", projectRootDef);
    safeAddColumn(db, "config_history", "project_root", projectRootDef);
    safeAddColumn(db, "telemetry_events", "project_root", projectRootDef);

    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_compilation_log_project_root ON compilation_log(project_root)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_cache_metadata_project_root ON cache_metadata(project_root)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_tool_invocation_log_project_root ON tool_invocation_log(project_root)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_session_state_project_root ON session_state(project_root)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_file_transform_cache_project_root ON file_transform_cache(project_root)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_config_history_project_root ON config_history(project_root)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_telemetry_events_project_root ON telemetry_events(project_root)",
    );

    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        project_id   TEXT PRIMARY KEY,
        project_root TEXT NOT NULL UNIQUE,
        created_at   TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      )
    `);
    db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_root ON projects(project_root)",
    );
  },

  down(db): void {
    db.exec("DROP TABLE IF EXISTS projects");
    db.exec("DROP INDEX IF EXISTS idx_compilation_log_project_root");
    db.exec("DROP INDEX IF EXISTS idx_cache_metadata_project_root");
    db.exec("DROP INDEX IF EXISTS idx_tool_invocation_log_project_root");
    db.exec("DROP INDEX IF EXISTS idx_session_state_project_root");
    db.exec("DROP INDEX IF EXISTS idx_file_transform_cache_project_root");
    db.exec("DROP INDEX IF EXISTS idx_config_history_project_root");
    db.exec("DROP INDEX IF EXISTS idx_telemetry_events_project_root");
  },
};
