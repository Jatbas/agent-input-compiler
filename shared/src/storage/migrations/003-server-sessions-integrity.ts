import type { Migration } from "#core/interfaces/migration.interface.js";

export const migration: Migration = {
  id: "003-server-sessions-integrity",

  up(db): void {
    db.exec("ALTER TABLE server_sessions ADD COLUMN installation_ok INTEGER");
    db.exec("ALTER TABLE server_sessions ADD COLUMN installation_notes TEXT");
  },

  down(_db): void {
    // MVP does not roll back this migration
  },
};
