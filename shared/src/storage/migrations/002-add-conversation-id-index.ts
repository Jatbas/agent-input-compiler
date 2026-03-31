// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { Migration } from "@jatbas/aic-core/core/interfaces/migration.interface.js";

export const migration: Migration = {
  id: "002-add-conversation-id-index",

  up(db: ExecutableDb): void {
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_compilation_log_conversation_id ON compilation_log(conversation_id)`,
    );
  },

  down(db: ExecutableDb): void {
    db.exec(`DROP INDEX IF EXISTS idx_compilation_log_conversation_id`);
  },
};
