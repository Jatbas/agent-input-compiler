// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { Migration } from "@jatbas/aic-core/core/interfaces/migration.interface.js";

export const migration: Migration = {
  id: "002-server-sessions",

  up(db): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS server_sessions (
        session_id  TEXT PRIMARY KEY,
        started_at  TEXT NOT NULL,
        stopped_at  TEXT,
        stop_reason TEXT,
        pid         INTEGER NOT NULL,
        version     TEXT NOT NULL
      )
    `);
  },

  down(db): void {
    db.exec("DROP TABLE IF EXISTS server_sessions");
  },
};
