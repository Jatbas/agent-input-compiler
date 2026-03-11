// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import Database from "better-sqlite3";
import { SqliteMigrationRunner } from "@jatbas/aic-core/storage/sqlite-migration-runner.js";
import { migration as migration001 } from "@jatbas/aic-core/storage/migrations/001-initial-schema.js";
import { migration as migration002 } from "@jatbas/aic-core/storage/migrations/002-server-sessions.js";
import { migration as migration003 } from "@jatbas/aic-core/storage/migrations/003-server-sessions-integrity.js";
import { migration as migration004 } from "@jatbas/aic-core/storage/migrations/004-normalize-telemetry.js";
import { migration as migration005 } from "@jatbas/aic-core/storage/migrations/005-trigger-source.js";
import { migration as migration006 } from "@jatbas/aic-core/storage/migrations/006-cache-datetime-format.js";
import { migration as migration007 } from "@jatbas/aic-core/storage/migrations/007-conversation-id.js";
import { migration as migration008 } from "@jatbas/aic-core/storage/migrations/008-session-state.js";
import { migration as migration009 } from "@jatbas/aic-core/storage/migrations/009-file-transform-cache.js";
import { migration as migration010 } from "@jatbas/aic-core/storage/migrations/010-tool-invocation-log.js";
import { migration as migration011 } from "@jatbas/aic-core/storage/migrations/011-global-project-root.js";
import { migration as migration012 } from "@jatbas/aic-core/storage/migrations/012-normalize-schema.js";
import { migration as migration013 } from "@jatbas/aic-core/storage/migrations/013-project-id-fk.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";

export function openDatabase(dbPath: string, clock: Clock): ExecutableDb {
  const db = new Database(dbPath) as unknown as ExecutableDb;
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
    migration010,
    migration011,
    migration012,
    migration013,
  ]);
  return db;
}

interface Closeable {
  close(): void;
}

export function closeDatabase(db: ExecutableDb): void {
  const closeable: Closeable = db as unknown as Closeable;
  closeable.close();
}
