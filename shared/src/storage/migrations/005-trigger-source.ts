import type { Migration } from "#core/interfaces/migration.interface.js";
import type { ExecutableDb } from "#core/interfaces/executable-db.interface.js";

function hasColumn(db: ExecutableDb, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

function safeAddColumn(
  db: ExecutableDb,
  table: string,
  column: string,
  def: string,
): void {
  if (!hasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  }
}

export const migration: Migration = {
  id: "005-trigger-source",

  up(db): void {
    safeAddColumn(db, "compilation_log", "trigger_source", "TEXT");
  },

  down(_db): void {
    // MVP does not roll back
  },
};
