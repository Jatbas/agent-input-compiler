// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { AicError } from "#core/errors/aic-error.js";
import { toISOTimestamp } from "#core/types/identifiers.js";
import type { ISOTimestamp } from "#core/types/identifiers.js";
import { toMilliseconds } from "#core/types/units.js";
import type { Clock } from "#core/interfaces/clock.interface.js";
import { migration as migration001 } from "../migrations/001-initial-schema.js";
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
    return new SqliteConfigStore(db, clock);
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
});
