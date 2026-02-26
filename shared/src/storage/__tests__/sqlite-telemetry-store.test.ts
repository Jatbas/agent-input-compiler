import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { TelemetryEvent } from "#core/types/telemetry-types.js";
import { toUUIDv7, toISOTimestamp, toRepoId } from "#core/types/identifiers.js";
import { toTokenCount, toMilliseconds } from "#core/types/units.js";
import { TASK_CLASS, INCLUSION_TIER } from "#core/types/enums.js";
import { migration as migration001 } from "../migrations/001-initial-schema.js";
import { SqliteTelemetryStore } from "../sqlite-telemetry-store.js";

function makeEvent(overrides: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    id: toUUIDv7("018c3d4e-0000-7000-8000-000000000001"),
    timestamp: toISOTimestamp("2026-02-25T10:00:00.000Z"),
    repoId: toRepoId("repo-hash-1"),
    taskClass: TASK_CLASS.REFACTOR,
    tokensRaw: toTokenCount(100),
    tokensCompiled: toTokenCount(40),
    filesSelected: 5,
    filesTotal: 10,
    summarisationTiers: {
      [INCLUSION_TIER.L0]: 1,
      [INCLUSION_TIER.L1]: 2,
      [INCLUSION_TIER.L2]: 1,
      [INCLUSION_TIER.L3]: 1,
    },
    guardBlockedCount: 0,
    guardFindingsCount: 0,
    cacheHit: false,
    durationMs: toMilliseconds(500),
    model: "gpt-4",
    ...overrides,
  };
}

describe("SqliteTelemetryStore", () => {
  let db: Database.Database;
  let store: SqliteTelemetryStore;

  afterEach(() => {
    if (db) db.close();
  });

  function setup(): void {
    db = new Database(":memory:");
    migration001.up(db);
    store = new SqliteTelemetryStore(db);
  }

  it("write persists row", () => {
    setup();
    const event = makeEvent({
      id: toUUIDv7("018c3d4e-0000-7000-8000-000000000001"),
      taskClass: TASK_CLASS.BUGFIX,
    });
    store.write(event);
    const rows = db
      .prepare(
        "SELECT id, repo_id, task_class, tokens_raw, tokens_compiled, created_at FROM telemetry_events WHERE id = ?",
      )
      .all(event.id) as readonly {
      id: string;
      repo_id: string;
      task_class: string;
      tokens_raw: number;
      tokens_compiled: number;
      created_at: string;
    }[];
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toBeDefined();
    if (row === undefined) return;
    expect(row.id).toBe(event.id);
    expect(row.repo_id).toBe(event.repoId);
    expect(row.task_class).toBe(TASK_CLASS.BUGFIX);
    expect(row.tokens_raw).toBe(100);
    expect(row.tokens_compiled).toBe(40);
    expect(row.created_at).toBe(event.timestamp);
  });

  it("multiple writes", () => {
    setup();
    store.write(makeEvent({ id: toUUIDv7("018c3d4e-0000-7000-8000-000000000001") }));
    store.write(makeEvent({ id: toUUIDv7("018c3d4e-0000-7000-8000-000000000002") }));
    const rows = db.prepare("SELECT id FROM telemetry_events").all() as readonly {
      id: string;
    }[];
    expect(rows).toHaveLength(2);
  });

  it("token_reduction_pct when tokensRaw > 0", () => {
    setup();
    store.write(
      makeEvent({
        tokensRaw: toTokenCount(100),
        tokensCompiled: toTokenCount(25),
      }),
    );
    const rows = db
      .prepare("SELECT token_reduction_pct FROM telemetry_events")
      .all() as readonly { token_reduction_pct: number }[];
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toBeDefined();
    if (row === undefined) return;
    expect(row.token_reduction_pct).toBe(75);
  });

  it("token_reduction_pct when tokensRaw is 0", () => {
    setup();
    store.write(
      makeEvent({
        tokensRaw: toTokenCount(0),
        tokensCompiled: toTokenCount(0),
      }),
    );
    const rows = db
      .prepare("SELECT token_reduction_pct FROM telemetry_events")
      .all() as readonly { token_reduction_pct: number }[];
    expect(rows).toHaveLength(1);
    const rowZero = rows[0];
    expect(rowZero).toBeDefined();
    if (rowZero === undefined) return;
    expect(rowZero.token_reduction_pct).toBe(0);
  });

  it("duplicate id", () => {
    setup();
    const event = makeEvent({ id: toUUIDv7("018c3d4e-0000-7000-8000-000000000099") });
    store.write(event);
    expect(() => store.write(event)).toThrow();
  });
});
