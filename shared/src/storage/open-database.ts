// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import Database from "better-sqlite3";
import { SqliteMigrationRunner } from "@jatbas/aic-core/storage/sqlite-migration-runner.js";
import { migration as migration001 } from "@jatbas/aic-core/storage/migrations/001-consolidated-schema.js";
import { migration as migration002 } from "@jatbas/aic-core/storage/migrations/002-add-conversation-id-index.js";
import { migration as migration003 } from "@jatbas/aic-core/storage/migrations/003-compilation-selection-trace.js";
import { migration as migration004 } from "@jatbas/aic-core/storage/migrations/004-spec-compile-cache.js";
import { migration as migration005 } from "@jatbas/aic-core/storage/migrations/005-quality-snapshots.js";
import { migration as migration006 } from "@jatbas/aic-core/storage/migrations/006-classifier-scores.js";
import { migration as migration007 } from "@jatbas/aic-core/storage/migrations/007-last-non-general-intent-index.js";
import { migration as migration008 } from "@jatbas/aic-core/storage/migrations/008-compilation-log-project-created-at-index.js";
import { migration as migration009 } from "@jatbas/aic-core/storage/migrations/009-compilation-log-total-budget.js";
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
  migrationRunner.run(db, [
    migration001,
    migration002,
    migration003,
    migration004,
    migration005,
    migration006,
    migration007,
    migration008,
    migration009,
  ]);
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
