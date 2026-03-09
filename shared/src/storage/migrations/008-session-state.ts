// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { Migration } from "@jatbas/aic-core/core/interfaces/migration.interface.js";

export const migration: Migration = {
  id: "008-session-state",

  up(db): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_state (
        session_id       TEXT PRIMARY KEY,
        task_intent      TEXT,
        steps_json       TEXT NOT NULL DEFAULT '[]',
        created_at       TEXT NOT NULL,
        last_activity_at TEXT NOT NULL
      )
    `);
  },

  down(db): void {
    db.exec("DROP TABLE IF EXISTS session_state");
  },
};
