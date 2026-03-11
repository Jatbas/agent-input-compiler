// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { AicError } from "@jatbas/aic-core/core/errors/aic-error.js";
import { toISOTimestamp, toProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import type { ISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import { toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import { migration } from "../migrations/001-consolidated-schema.js";
import { SqliteConfigStore } from "../sqlite-config-store.js";

const TEST_PROJECT_ID = toProjectId("018f0000-0000-7000-8000-000000000001");

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
    migration.up(db);
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(
      TEST_PROJECT_ID,
      "/test/project",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    );
    return new SqliteConfigStore(TEST_PROJECT_ID, db, clock);
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
    migration.up(db);
    const projectIdA = toProjectId("018f0000-0000-7000-8000-000000000010");
    const projectIdB = toProjectId("018f0000-0000-7000-8000-000000000011");
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(projectIdA, "/proj/a", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(projectIdB, "/proj/b", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    const storeA = new SqliteConfigStore(projectIdA, db, clock);
    const storeB = new SqliteConfigStore(projectIdB, db, clock);
    storeA.writeSnapshot("hash-a", "{}");
    storeB.writeSnapshot("hash-b", "{}");
    expect(storeA.getLatestHash()).toBe("hash-a");
    expect(storeB.getLatestHash()).toBe("hash-b");
  });
});
