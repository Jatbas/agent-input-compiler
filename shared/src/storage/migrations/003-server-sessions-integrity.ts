import type { Migration } from "#core/interfaces/migration.interface.js";
import type { ExecutableDb } from "#core/interfaces/executable-db.interface.js";

function hasColumn(db: ExecutableDb, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

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
