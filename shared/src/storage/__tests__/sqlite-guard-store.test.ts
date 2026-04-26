// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { AicError } from "@jatbas/aic-core/core/errors/aic-error.js";
import type { GuardFinding } from "@jatbas/aic-core/core/types/guard-types.js";
import type { UUIDv7 } from "@jatbas/aic-core/core/types/identifiers.js";
import {
  toUUIDv7,
  toISOTimestamp,
  toProjectId,
} from "@jatbas/aic-core/core/types/identifiers.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toLineNumber } from "@jatbas/aic-core/core/types/units.js";
import { toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import { GUARD_SEVERITY, GUARD_FINDING_TYPE } from "@jatbas/aic-core/core/types/enums.js";
import { migration } from "../migrations/001-consolidated-schema.js";
import { SqliteGuardStore } from "../sqlite-guard-store.js";

function mockIdGenerator(ids: readonly string[]): { generate(): UUIDv7 } {
  let index = 0;
  return {
    generate(): UUIDv7 {
      const id = ids[index];
      if (id === undefined)
        throw new AicError("mock id generator exhausted", "TEST_SETUP");
      index += 1;
      return toUUIDv7(id);
    },
  };
}

function mockIdGeneratorThrowsAfter(
  ids: readonly string[],
  throwAfterCount: number,
): { generate(): UUIDv7 } {
  let delegated = 0;
  const inner = mockIdGenerator(ids);
  return {
    generate(): UUIDv7 {
      if (delegated < throwAfterCount) {
        delegated += 1;
        return inner.generate();
      }
      throw new AicError("mock id generator throw", "TEST_SETUP");
    },
  };
}

function mockClock(timestamps: readonly string[]): Clock {
  let index = 0;
  return {
    now() {
      const ts = timestamps[index];
      if (ts === undefined) throw new AicError("mock clock exhausted", "TEST_SETUP");
      index += 1;
      return toISOTimestamp(ts);
    },
    addMinutes() {
      const ts = timestamps[Math.min(index, timestamps.length - 1)];
      if (ts === undefined) throw new AicError("mock clock exhausted", "TEST_SETUP");
      return toISOTimestamp(ts);
    },
    durationMs() {
      return toMilliseconds(0);
    },
  };
}

function makeFinding(overrides: Partial<GuardFinding> = {}): GuardFinding {
  return {
    severity: GUARD_SEVERITY.BLOCK,
    type: GUARD_FINDING_TYPE.SECRET,
    file: toRelativePath("src/secret.ts"),
    message: "secret detected",
    ...overrides,
  };
}

describe("SqliteGuardStore", () => {
  let db: Database.Database;

  afterEach(() => {
    if (db) db.close();
  });

  function setup(idGen: { generate(): UUIDv7 }, clock: Clock): SqliteGuardStore {
    db = new Database(":memory:");
    migration.up(db);
    return new SqliteGuardStore(db, idGen, clock);
  }

  const guardTestProjectId = toProjectId("018f0000-0000-7000-8000-000000000088");

  function ensureCompilationExists(compilationId: string): void {
    db.prepare(
      "INSERT OR IGNORE INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(
      guardTestProjectId,
      "/g",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    );
    db.prepare(
      `INSERT OR IGNORE INTO compilation_log (
        id, intent, task_class, files_selected, files_total, tokens_raw, tokens_compiled,
        cache_hit, duration_ms, editor_id, model_id, created_at, project_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      compilationId,
      "intent",
      "refactor",
      1,
      1,
      100,
      50,
      0,
      100,
      "generic",
      null,
      "2026-02-25T10:00:00.000Z",
      guardTestProjectId,
    );
  }

  it("sqlite_guard_store_write_and_query", () => {
    const compId = toUUIDv7("018c3d4e-0000-7000-8000-000000000001");
    const idGen = mockIdGenerator(["id-1", "id-2"]);
    const clock = mockClock(["2026-02-25T10:00:00.000Z"]);
    const store = setup(idGen, clock);
    ensureCompilationExists(compId);
    const findings: readonly GuardFinding[] = [
      makeFinding({ file: toRelativePath("a.ts"), message: "m1" }),
      makeFinding({
        file: toRelativePath("b.ts"),
        line: toLineNumber(10),
        pattern: "*.key",
      }),
    ];
    store.write(compId, findings);
    const got = store.queryByCompilation(compId);
    expect(got).toHaveLength(2);
    expect(got[0]?.file).toBe("a.ts");
    expect(got[0]?.message).toBe("m1");
    expect(got[1]?.file).toBe("b.ts");
    expect(got[1]?.line).toBe(10);
    expect(got[1]?.pattern).toBe("*.key");
  });

  it("query unknown returns []", () => {
    const idGen = mockIdGenerator([]);
    const clock = mockClock([]);
    const store = setup(idGen, clock);
    const got = store.queryByCompilation(
      toUUIDv7("018c3d4e-0000-7000-8000-000000000099"),
    );
    expect(got).toEqual([]);
  });

  it("replace on same compilation_id returns second set only", () => {
    const compId = toUUIDv7("018c3d4e-0000-7000-8000-000000000001");
    const idGen = mockIdGenerator(["id-1", "id-2"]);
    const clock = mockClock(["2026-02-25T10:00:00.000Z", "2026-02-25T10:01:00.000Z"]);
    const store = setup(idGen, clock);
    ensureCompilationExists(compId);
    const first: readonly GuardFinding[] = [makeFinding({ message: "first" })];
    const second: readonly GuardFinding[] = [makeFinding({ message: "second" })];
    store.write(compId, first);
    store.write(compId, second);
    const got = store.queryByCompilation(compId);
    expect(got).toHaveLength(1);
    expect(got[0]?.message).toBe("second");
  });

  it("empty findings write then query returns []", () => {
    const compId = toUUIDv7("018c3d4e-0000-7000-8000-000000000001");
    const idGen = mockIdGenerator([]);
    const clock = mockClock(["2026-02-25T10:00:00.000Z"]);
    const store = setup(idGen, clock);
    store.write(compId, []);
    const got = store.queryByCompilation(compId);
    expect(got).toEqual([]);
  });

  it("sqlite_guard_store_write_rolls_back_on_mid_batch_failure", () => {
    const compId = toUUIDv7("018c3d4e-0000-7000-8000-0000000000aa");
    const idGen = mockIdGenerator(["id-1", "id-2"]);
    const clock = mockClock([
      "2026-02-25T10:00:00.000Z",
      "2026-02-25T10:01:00.000Z",
      "2026-02-25T10:02:00.000Z",
    ]);
    const store = setup(idGen, clock);
    ensureCompilationExists(compId);
    store.write(compId, [
      makeFinding({ message: "first-a", file: toRelativePath("a.ts") }),
      makeFinding({ message: "first-b", file: toRelativePath("b.ts") }),
    ]);
    const store2 = new SqliteGuardStore(
      db,
      mockIdGeneratorThrowsAfter(["id-3"], 1),
      clock,
    );
    expect(() =>
      store2.write(compId, [
        makeFinding({ message: "second-a", file: toRelativePath("c.ts") }),
        makeFinding({ message: "second-b", file: toRelativePath("d.ts") }),
      ]),
    ).toThrow(AicError);
    const got = store2.queryByCompilation(compId);
    expect(got).toHaveLength(2);
    expect(got.map((g) => g.message)).toEqual(["first-a", "first-b"]);
  });
});
