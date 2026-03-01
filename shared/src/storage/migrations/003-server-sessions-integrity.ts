import type { Migration } from "#core/interfaces/migration.interface.js";
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
