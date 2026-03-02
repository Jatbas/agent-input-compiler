import type { Migration } from "#core/interfaces/migration.interface.js";

// Normalize cache_metadata timestamps to SQLite datetime format (YYYY-MM-DD HH:MM:SS)
// so expiry comparisons work; fixes same-day purge bug (ISO T vs space).
export const migration: Migration = {
  id: "006-cache-datetime-format",

  up(db): void {
    db.exec(`
      UPDATE cache_metadata SET
        created_at = CASE WHEN created_at LIKE '%T%' THEN replace(substr(created_at, 1, 19), 'T', ' ') ELSE created_at END,
        expires_at = CASE WHEN expires_at LIKE '%T%' THEN replace(substr(expires_at, 1, 19), 'T', ' ') ELSE expires_at END
    `);
  },

  down(_db): void {
    // MVP does not roll back
  },
};
