// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { Migration } from "@jatbas/aic-core/core/interfaces/migration.interface.js";

export const migration: Migration = {
  id: "008-compilation-log-project-created-at-index",

  up(db: ExecutableDb): void {
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_compilation_log_project_created_at ON compilation_log(project_id, created_at);`,
    );
  },

  down(db: ExecutableDb): void {
    db.exec(`DROP INDEX IF EXISTS idx_compilation_log_project_created_at`);
  },
};
