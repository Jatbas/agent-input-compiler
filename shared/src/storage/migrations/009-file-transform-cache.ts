// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { Migration } from "@jatbas/aic-core/core/interfaces/migration.interface.js";

export const migration: Migration = {
  id: "009-file-transform-cache",

  up(db): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS file_transform_cache (
        file_path           TEXT NOT NULL,
        content_hash         TEXT NOT NULL,
        transformed_content  TEXT NOT NULL,
        tier_outputs_json     TEXT NOT NULL,
        created_at           TEXT NOT NULL,
        expires_at           TEXT NOT NULL,
        PRIMARY KEY (file_path, content_hash)
      )
    `);
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_file_transform_cache_expires_at ON file_transform_cache (expires_at)",
    );
  },

  down(db): void {
    db.exec("DROP TABLE IF EXISTS file_transform_cache");
  },
};
