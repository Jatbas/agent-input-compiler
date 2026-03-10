// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { Migration } from "@jatbas/aic-core/core/interfaces/migration.interface.js";
import { hasColumn } from "./migration-utils.js";

export const migration: Migration = {
  id: "012-normalize-schema",

  up(db): void {
    if (hasColumn(db, "compilation_log", "token_reduction_pct")) {
      db.exec("ALTER TABLE compilation_log DROP COLUMN token_reduction_pct");
    }
  },

  down(db): void {
    if (!hasColumn(db, "compilation_log", "token_reduction_pct")) {
      db.exec(
        "ALTER TABLE compilation_log ADD COLUMN token_reduction_pct REAL NOT NULL DEFAULT 0.0",
      );
    }
  },
};
