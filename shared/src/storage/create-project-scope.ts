import * as fs from "node:fs";
import * as path from "node:path";
import type { AbsolutePath } from "#core/types/paths.js";
import type { ExecutableDb } from "#core/interfaces/executable-db.interface.js";
import type { Clock } from "#core/interfaces/clock.interface.js";
import type { IdGenerator } from "#core/interfaces/id-generator.interface.js";
import type { CacheStore } from "#core/interfaces/cache-store.interface.js";
import type { TelemetryStore } from "#core/interfaces/telemetry-store.interface.js";
import type { ConfigStore } from "#core/interfaces/config-store.interface.js";
import type { GuardStore } from "#core/interfaces/guard-store.interface.js";
import { toAbsolutePath } from "#core/types/paths.js";
import { ensureAicDir } from "#storage/ensure-aic-dir.js";
import { openDatabase } from "#storage/open-database.js";
import { SqliteCacheStore } from "#storage/sqlite-cache-store.js";
import { SqliteTelemetryStore } from "#storage/sqlite-telemetry-store.js";
import { SqliteConfigStore } from "#storage/sqlite-config-store.js";
import { SqliteGuardStore } from "#storage/sqlite-guard-store.js";
import { SystemClock } from "#adapters/system-clock.js";
import { UuidV7Generator } from "#adapters/uuid-v7-generator.js";

export interface ProjectScope {
  readonly db: ExecutableDb;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly cacheStore: CacheStore;
  readonly telemetryStore: TelemetryStore;
  readonly configStore: ConfigStore;
  readonly guardStore: GuardStore;
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
  return {
    db,
    clock,
    idGenerator,
    cacheStore,
    telemetryStore,
    configStore,
    guardStore,
    projectRoot,
  };
}
