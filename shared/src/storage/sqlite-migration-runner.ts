import type { ExecutableDb } from "#core/interfaces/executable-db.interface.js";
import type { MigrationRunner as IMigrationRunner } from "#core/interfaces/migration-runner.interface.js";
import type { Migration } from "#core/interfaces/migration.interface.js";
import type { Clock } from "#core/interfaces/clock.interface.js";

const SCHEMA_MIGRATIONS_BOOTSTRAP = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id          TEXT PRIMARY KEY,
    applied_at  TEXT NOT NULL
  );
`;

export class SqliteMigrationRunner implements IMigrationRunner {
  constructor(private readonly clock: Clock) {}

  run(db: ExecutableDb, migrations: ReadonlyArray<Migration>): void {
    db.exec(SCHEMA_MIGRATIONS_BOOTSTRAP);
    const applied = new Set(
      (db.prepare("SELECT id FROM schema_migrations").all() as { id: string }[]).map(
        (r) => r.id,
      ),
    );
    const sorted = migrations.toSorted((a, b) => (a.id < b.id ? -1 : 1));
    for (const migration of sorted) {
      if (applied.has(migration.id)) continue;
      migration.up(db);
      const appliedAt = this.clock.now();
      db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(
        migration.id,
        appliedAt,
      );
    }
  }
}
