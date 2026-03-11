// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { Migration } from "@jatbas/aic-core/core/interfaces/migration.interface.js";
import { hasColumn } from "./migration-utils.js";

const PER_PROJECT_TABLES: readonly string[] = [
  "compilation_log",
  "cache_metadata",
  "tool_invocation_log",
  "session_state",
  "file_transform_cache",
  "config_history",
];

function hasIndex(db: Parameters<Migration["up"]>[0], indexName: string): boolean {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?")
    .all(indexName) as readonly { name: string }[];
  return rows.length > 0;
}

export const migration: Migration = {
  id: "014-drop-project-root-columns",

  up(db): void {
    for (const table of PER_PROJECT_TABLES) {
      const indexName = `idx_${table}_project_root`;
      if (hasIndex(db, indexName)) {
        db.exec(`DROP INDEX ${indexName}`);
      }
    }
    for (const table of PER_PROJECT_TABLES) {
      if (hasColumn(db, table, "project_root")) {
        db.exec(`ALTER TABLE ${table} DROP COLUMN project_root`);
      }
    }
  },

  down(db): void {
    for (const table of PER_PROJECT_TABLES) {
      if (!hasColumn(db, table, "project_root")) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN project_root TEXT`);
        db.exec(
          `CREATE INDEX IF NOT EXISTS idx_${table}_project_root ON ${table}(project_root)`,
        );
      }
    }
  },
};
