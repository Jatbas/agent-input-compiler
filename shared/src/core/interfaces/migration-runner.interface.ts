import type { ExecutableDb } from "./executable-db.interface.js";
import type { Migration } from "./migration.interface.js";

export interface MigrationRunner {
  run(db: ExecutableDb, migrations: ReadonlyArray<Migration>): void;
}
