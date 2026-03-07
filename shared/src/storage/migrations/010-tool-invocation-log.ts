import type { Migration } from "#core/interfaces/migration.interface.js";

export const migration: Migration = {
  id: "010-tool-invocation-log",

  up(db): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tool_invocation_log (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        session_id TEXT NOT NULL,
        params_shape TEXT NOT NULL
      )
    `);
  },

  down(db): void {
    db.exec("DROP TABLE IF EXISTS tool_invocation_log");
  },
};
