// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as fs from "node:fs";
import * as path from "node:path";
import type { AbsolutePath } from "@jatbas/aic-shared/core/types/paths.js";
import type { ExecutableDb } from "@jatbas/aic-shared/core/interfaces/executable-db.interface.js";
import type { Clock } from "@jatbas/aic-shared/core/interfaces/clock.interface.js";
import type { IdGenerator } from "@jatbas/aic-shared/core/interfaces/id-generator.interface.js";
import type { CacheStore } from "@jatbas/aic-shared/core/interfaces/cache-store.interface.js";
import type { TelemetryStore } from "@jatbas/aic-shared/core/interfaces/telemetry-store.interface.js";
import type { ConfigStore } from "@jatbas/aic-shared/core/interfaces/config-store.interface.js";
import type { GuardStore } from "@jatbas/aic-shared/core/interfaces/guard-store.interface.js";
import type { CompilationLogStore } from "@jatbas/aic-shared/core/interfaces/compilation-log-store.interface.js";
import type { SessionTracker } from "@jatbas/aic-shared/core/interfaces/session-tracker.interface.js";
import type { FileTransformStore } from "@jatbas/aic-shared/core/interfaces/file-transform-store.interface.js";
import { toAbsolutePath } from "@jatbas/aic-shared/core/types/paths.js";
import { ensureAicDir } from "@jatbas/aic-shared/storage/ensure-aic-dir.js";
import { openDatabase } from "@jatbas/aic-shared/storage/open-database.js";
import { SqliteCacheStore } from "@jatbas/aic-shared/storage/sqlite-cache-store.js";
import { SqliteSessionStore } from "@jatbas/aic-shared/storage/sqlite-session-store.js";
import { SqliteTelemetryStore } from "@jatbas/aic-shared/storage/sqlite-telemetry-store.js";
import { SqliteConfigStore } from "@jatbas/aic-shared/storage/sqlite-config-store.js";
import { SqliteGuardStore } from "@jatbas/aic-shared/storage/sqlite-guard-store.js";
import { SqliteCompilationLogStore } from "@jatbas/aic-shared/storage/sqlite-compilation-log-store.js";
import { SqliteFileTransformStore } from "@jatbas/aic-shared/storage/sqlite-file-transform-store.js";
import { SystemClock } from "@jatbas/aic-shared/adapters/system-clock.js";
import { UuidV7Generator } from "@jatbas/aic-shared/adapters/uuid-v7-generator.js";

export interface ProjectScope {
  readonly db: ExecutableDb;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly cacheStore: CacheStore;
  readonly telemetryStore: TelemetryStore;
  readonly configStore: ConfigStore;
  readonly guardStore: GuardStore;
  readonly compilationLogStore: CompilationLogStore;
  readonly sessionTracker: SessionTracker;
  readonly fileTransformStore: FileTransformStore;
  readonly projectRoot: AbsolutePath;
}

export function createProjectScope(projectRoot: AbsolutePath): ProjectScope {
  const aicDir = ensureAicDir(projectRoot);
  const dbPath = path.join(aicDir, "aic.sqlite");
  const clock = new SystemClock();
  const db = openDatabase(dbPath, clock);
  const idGenerator = new UuidV7Generator(clock);
  const cacheDirPath = path.join(aicDir, "cache");
  fs.mkdirSync(cacheDirPath, { recursive: true });
  const cacheDir = toAbsolutePath(cacheDirPath);
  const cacheStore = new SqliteCacheStore(db, cacheDir, clock);
  const telemetryStore = new SqliteTelemetryStore(db);
  const configStore = new SqliteConfigStore(db, clock);
  const guardStore = new SqliteGuardStore(db, idGenerator, clock);
  const compilationLogStore = new SqliteCompilationLogStore(db);
  const sessionTracker = new SqliteSessionStore(db);
  const fileTransformStore = new SqliteFileTransformStore(db, clock);
  return {
    db,
    clock,
    idGenerator,
    cacheStore,
    telemetryStore,
    configStore,
    guardStore,
    compilationLogStore,
    sessionTracker,
    fileTransformStore,
    projectRoot,
  };
}
