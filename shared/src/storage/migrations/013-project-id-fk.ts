// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { Migration } from "@jatbas/aic-core/core/interfaces/migration.interface.js";
import { safeAddColumn } from "./migration-utils.js";

const PER_PROJECT_TABLES: readonly string[] = [
  "compilation_log",
  "cache_metadata",
  "tool_invocation_log",
  "session_state",
  "file_transform_cache",
  "config_history",
];

export const migration: Migration = {
  id: "013-project-id-fk",

  up(db): void {
    for (const table of PER_PROJECT_TABLES) {
      safeAddColumn(db, table, "project_id", "TEXT REFERENCES projects(project_id)");
    }

    for (const table of PER_PROJECT_TABLES) {
      db.exec(
        `UPDATE ${table} SET project_id = (SELECT p.project_id FROM projects p WHERE p.project_root = ${table}.project_root) WHERE project_id IS NULL`,
      );
    }

    for (const table of PER_PROJECT_TABLES) {
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_${table}_project_id ON ${table}(project_id)`,
      );
    }
  },

  down(db): void {
    for (const table of PER_PROJECT_TABLES) {
      db.exec(`DROP INDEX IF EXISTS idx_${table}_project_id`);
    }
  },
};
