// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { Migration } from "@jatbas/aic-core/core/interfaces/migration.interface.js";

export const migration: Migration = {
  id: "004-spec-compile-cache",

  up(db: ExecutableDb): void {
    db.exec(`
CREATE TABLE IF NOT EXISTS spec_compile_cache (
  cache_key TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  compiled_spec TEXT NOT NULL,
  meta_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (project_id, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_spec_compile_cache_expires_at ON spec_compile_cache(expires_at);
`);
  },

  down(db: ExecutableDb): void {
    db.exec(`DROP INDEX IF EXISTS idx_spec_compile_cache_expires_at`);
    db.exec(`DROP TABLE IF EXISTS spec_compile_cache`);
  },
};
