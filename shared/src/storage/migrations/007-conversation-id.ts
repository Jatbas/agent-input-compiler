// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { Migration } from "@jatbas/aic-shared/core/interfaces/migration.interface.js";
import { safeAddColumn } from "./migration-utils.js";

export const migration: Migration = {
  id: "007-conversation-id",

  up(db): void {
    safeAddColumn(db, "compilation_log", "conversation_id", "TEXT");
  },

  down(_db): void {
    // MVP does not roll back
  },
};
