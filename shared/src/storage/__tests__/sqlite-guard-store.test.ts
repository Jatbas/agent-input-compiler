// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { AicError } from "@jatbas/aic-core/core/errors/aic-error.js";
import type { GuardFinding } from "@jatbas/aic-core/core/types/guard-types.js";
import type { UUIDv7 } from "@jatbas/aic-core/core/types/identifiers.js";
import { toUUIDv7, toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toLineNumber } from "@jatbas/aic-core/core/types/units.js";
import { toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import { GUARD_SEVERITY, GUARD_FINDING_TYPE } from "@jatbas/aic-core/core/types/enums.js";
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
    return new SqliteGuardStore(db, idGen, clock);
  }

  function ensureCompilationExists(compilationId: string): void {
    db.prepare(
      `INSERT OR IGNORE INTO compilation_log (
        id, intent, task_class, files_selected, files_total, tokens_raw, tokens_compiled,
        token_reduction_pct, cache_hit, duration_ms, editor_id, model_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      compilationId,
      "intent",
      "refactor",
      1,
      1,
      100,
      50,
      50,
      0,
      100,
      "generic",
      null,
      "2026-02-25T10:00:00.000Z",
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
});
