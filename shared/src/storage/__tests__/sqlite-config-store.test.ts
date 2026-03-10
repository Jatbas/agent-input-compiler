// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { AicError } from "@jatbas/aic-core/core/errors/aic-error.js";
import { toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import type { ISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import { toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { migration as migration001 } from "../migrations/001-initial-schema.js";
import { migration as migration002 } from "../migrations/002-server-sessions.js";
import { migration as migration003 } from "../migrations/003-server-sessions-integrity.js";
import { migration as migration004 } from "../migrations/004-normalize-telemetry.js";
import { migration as migration005 } from "../migrations/005-trigger-source.js";
import { migration as migration006 } from "../migrations/006-cache-datetime-format.js";
import { migration as migration007 } from "../migrations/007-conversation-id.js";
import { migration as migration008 } from "../migrations/008-session-state.js";
import { migration as migration009 } from "../migrations/009-file-transform-cache.js";
import { migration as migration010 } from "../migrations/010-tool-invocation-log.js";
import { migration as migration011 } from "../migrations/011-global-project-root.js";
import { SqliteConfigStore } from "../sqlite-config-store.js";

function mockClock(timestamps: readonly ISOTimestamp[]): { clock: Clock } {
  let index = 0;
  return {
    clock: {
      now(): ISOTimestamp {
        const ts = timestamps[index];
        if (ts === undefined) throw new AicError("mock clock exhausted", "TEST_SETUP");
        index += 1;
        return ts;
      },
      addMinutes(): ISOTimestamp {
        const ts = timestamps[index];
        if (ts === undefined) throw new AicError("mock clock exhausted", "TEST_SETUP");
        return ts;
      },
      durationMs() {
        return toMilliseconds(0);
      },
    },
  };
}

describe("SqliteConfigStore", () => {
  let db: Database.Database;

  afterEach(() => {
    if (db) db.close();
  });

  function setup(clock: Clock): SqliteConfigStore {
    db = new Database(":memory:");
    migration001.up(db);
    migration002.up(db);
    migration003.up(db);
    migration004.up(db);
    migration005.up(db);
    migration006.up(db);
    migration007.up(db);
    migration008.up(db);
    migration009.up(db);
    migration010.up(db);
    migration011.up(db);
    return new SqliteConfigStore(toAbsolutePath("/test/project"), db, clock);
  }

  it("getLatestHash empty returns null", () => {
    const { clock } = mockClock([toISOTimestamp("2026-02-25T10:00:00.000Z")]);
    const store = setup(clock);
    expect(store.getLatestHash()).toBeNull();
  });

  it("write then getLatestHash returns written hash", () => {
    const { clock } = mockClock([toISOTimestamp("2026-02-25T10:00:00.000Z")]);
    const store = setup(clock);
    store.writeSnapshot("hash-abc", '{"key":"value"}');
    expect(store.getLatestHash()).toBe("hash-abc");
  });

  it("latest wins", () => {
    const { clock } = mockClock([
      toISOTimestamp("2026-02-25T10:00:00.000Z"),
      toISOTimestamp("2026-02-25T10:01:00.000Z"),
    ]);
    const store = setup(clock);
    store.writeSnapshot("hash-first", "{}");
    store.writeSnapshot("hash-second", "{}");
    expect(store.getLatestHash()).toBe("hash-second");
  });

  it("sqlite_config_store_get_and_write", () => {
    const { clock } = mockClock([
      toISOTimestamp("2026-02-25T10:00:00.000Z"),
      toISOTimestamp("2026-02-25T10:01:00.000Z"),
    ]);
    db = new Database(":memory:");
    migration001.up(db);
    migration002.up(db);
    migration003.up(db);
    migration004.up(db);
    migration005.up(db);
    migration006.up(db);
    migration007.up(db);
    migration008.up(db);
    migration009.up(db);
    migration010.up(db);
    migration011.up(db);
    const storeA = new SqliteConfigStore(toAbsolutePath("/proj/a"), db, clock);
    const storeB = new SqliteConfigStore(toAbsolutePath("/proj/b"), db, clock);
    storeA.writeSnapshot("hash-a", "{}");
    storeB.writeSnapshot("hash-b", "{}");
    expect(storeA.getLatestHash()).toBe("hash-a");
    expect(storeB.getLatestHash()).toBe("hash-b");
  });
});
