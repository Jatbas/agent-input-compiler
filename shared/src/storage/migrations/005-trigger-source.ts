import type { Migration } from "#core/interfaces/migration.interface.js";
import { safeAddColumn } from "./migration-utils.js";

export const migration: Migration = {
  id: "005-trigger-source",

  up(db): void {
    safeAddColumn(db, "compilation_log", "trigger_source", "TEXT");
  },

  down(_db): void {
    // MVP does not roll back
  },
};
