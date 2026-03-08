// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { Migration } from "@jatbas/aic-shared/core/interfaces/migration.interface.js";
import { hasColumn } from "./migration-utils.js";

export const migration: Migration = {
  id: "003-server-sessions-integrity",

  up(db): void {
    if (!hasColumn(db, "server_sessions", "installation_ok")) {
      db.exec("ALTER TABLE server_sessions ADD COLUMN installation_ok INTEGER");
    }
    if (!hasColumn(db, "server_sessions", "installation_notes")) {
      db.exec("ALTER TABLE server_sessions ADD COLUMN installation_notes TEXT");
    }
  },

  down(_db): void {
    // MVP does not roll back this migration
  },
};
