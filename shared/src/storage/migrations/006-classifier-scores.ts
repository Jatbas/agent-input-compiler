// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { Migration } from "@jatbas/aic-core/core/interfaces/migration.interface.js";

export const migration: Migration = {
  id: "006-classifier-scores",

  up(db: ExecutableDb): void {
    db.exec(`
ALTER TABLE compilation_log ADD COLUMN classifier_confidence REAL;
ALTER TABLE compilation_log ADD COLUMN specificity_score REAL;
ALTER TABLE compilation_log ADD COLUMN underspecification_index REAL;
`);
  },

  down(db: ExecutableDb): void {
    db.exec(`
ALTER TABLE compilation_log DROP COLUMN IF EXISTS classifier_confidence;
ALTER TABLE compilation_log DROP COLUMN IF EXISTS specificity_score;
ALTER TABLE compilation_log DROP COLUMN IF EXISTS underspecification_index;
`);
  },
};
