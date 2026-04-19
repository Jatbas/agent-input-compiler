// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { Migration } from "@jatbas/aic-core/core/interfaces/migration.interface.js";

export const migration: Migration = {
  id: "005-quality-snapshots",

  up(db: ExecutableDb): void {
    db.exec(`
CREATE TABLE IF NOT EXISTS quality_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  compilation_id TEXT NOT NULL REFERENCES compilation_log(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  token_reduction_ratio REAL NOT NULL,
  selection_ratio REAL NOT NULL,
  budget_utilisation REAL NOT NULL,
  cache_hit INTEGER NOT NULL CHECK (cache_hit IN (0, 1)),
  tier_l0 INTEGER NOT NULL,
  tier_l1 INTEGER NOT NULL,
  tier_l2 INTEGER NOT NULL,
  tier_l3 INTEGER NOT NULL,
  task_class TEXT NOT NULL CHECK (task_class IN ('refactor','bugfix','feature','docs','test','general')),
  classifier_confidence REAL,
  feedback_correlation REAL
);

CREATE INDEX IF NOT EXISTS idx_quality_project_time
  ON quality_snapshots(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_quality_task_class
  ON quality_snapshots(task_class);
`);
  },

  down(db: ExecutableDb): void {
    db.exec(`
DROP INDEX IF EXISTS idx_quality_project_time;
DROP INDEX IF EXISTS idx_quality_task_class;
DROP TABLE IF EXISTS quality_snapshots;
`);
  },
};
