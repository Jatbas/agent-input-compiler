// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { Migration } from "@jatbas/aic-core/core/interfaces/migration.interface.js";

export const migration: Migration = {
  id: "009-compilation-log-total-budget",

  up(db: ExecutableDb): void {
    db.exec(`ALTER TABLE compilation_log ADD COLUMN total_budget INTEGER`);
  },

  down(db: ExecutableDb): void {
    db.exec(`ALTER TABLE compilation_log DROP COLUMN IF EXISTS total_budget`);
  },
};
