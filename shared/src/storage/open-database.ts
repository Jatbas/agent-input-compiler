// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import Database from "better-sqlite3";
import { SqliteMigrationRunner } from "@jatbas/aic-core/storage/sqlite-migration-runner.js";
import { migration } from "@jatbas/aic-core/storage/migrations/001-consolidated-schema.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";

export function openDatabase(dbPath: string, clock: Clock): ExecutableDb {
  const db = new Database(dbPath) as unknown as ExecutableDb;
  // enforce FK constraints regardless of better-sqlite3 version defaults
  db.prepare("PRAGMA foreign_keys = ON").run();
  if (dbPath !== ":memory:") {
    db.prepare("PRAGMA journal_mode = WAL").run();
    // Multiple MCP server instances share the database; wait instead of failing
    db.prepare("PRAGMA busy_timeout = 5000").run();
  }
  const migrationRunner = new SqliteMigrationRunner(clock);
  migrationRunner.run(db, [migration]);
  return db;
}

export function openDatabaseReadOnly(dbPath: string): ExecutableDb {
  return new Database(dbPath, {
    readonly: true,
    fileMustExist: true,
  }) as unknown as ExecutableDb;
}

interface Closeable {
  close(): void;
}

export function closeDatabase(db: ExecutableDb): void {
  const closeable: Closeable = db as unknown as Closeable;
  closeable.close();
}
