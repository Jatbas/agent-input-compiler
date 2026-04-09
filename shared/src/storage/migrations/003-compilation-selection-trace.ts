// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { Migration } from "@jatbas/aic-core/core/interfaces/migration.interface.js";

function compilationLogHasColumn(db: ExecutableDb, columnName: string): boolean {
  const rows = db.prepare("PRAGMA table_info(compilation_log)").all() as readonly {
    name: string;
  }[];
  return rows.some((r) => r.name === columnName);
}

export const migration: Migration = {
  id: "003-compilation-selection-trace",

  up(db: ExecutableDb): void {
    if (compilationLogHasColumn(db, "selection_trace_json")) return;
    db.exec(`ALTER TABLE compilation_log ADD COLUMN selection_trace_json TEXT`);
  },

  down(db: ExecutableDb): void {
    if (!compilationLogHasColumn(db, "selection_trace_json")) return;
    db.exec(`ALTER TABLE compilation_log DROP COLUMN selection_trace_json`);
  },
};
