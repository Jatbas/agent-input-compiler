import Database from "better-sqlite3";
import { SqliteMigrationRunner } from "#storage/sqlite-migration-runner.js";
import { migration as migration001 } from "#storage/migrations/001-initial-schema.js";
import type { Clock } from "#core/interfaces/clock.interface.js";
import type { ExecutableDb } from "#core/interfaces/executable-db.interface.js";

export function openDatabase(dbPath: string, clock: Clock): ExecutableDb {
  const db = new Database(dbPath) as unknown as ExecutableDb;
  const migrationRunner = new SqliteMigrationRunner(clock);
  migrationRunner.run(db, [migration001]);
  return db;
}
