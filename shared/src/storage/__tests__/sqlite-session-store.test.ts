import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { toSessionId, toISOTimestamp } from "#core/types/identifiers.js";
import { STOP_REASON } from "#core/types/enums.js";
import { migration as migration001 } from "../migrations/001-initial-schema.js";
import { migration as migration002 } from "../migrations/002-server-sessions.js";
import { SqliteSessionStore } from "../sqlite-session-store.js";

describe("SqliteSessionStore", () => {
  let db: Database.Database;
  let store: SqliteSessionStore;

  afterEach(() => {
    if (db) db.close();
  });

  function setup(): void {
    db = new Database(":memory:");
    migration001.up(db);
    migration002.up(db);
    store = new SqliteSessionStore(db);
  }

  it("startSession_persists_row", () => {
    setup();
    const sessionId = toSessionId("018c3d4e-0000-7000-8000-000000000001");
    const startedAt = toISOTimestamp("2026-02-28T12:00:00.000Z");
    const pid = 12345;
    const version = "0.2.0";
    store.startSession(sessionId, startedAt, pid, version);

    const rows = db
      .prepare(
        "SELECT session_id, started_at, stopped_at, stop_reason, pid, version FROM server_sessions",
      )
      .all() as readonly {
      session_id: string;
      started_at: string;
      stopped_at: string | null;
      stop_reason: string | null;
      pid: number;
      version: string;
    }[];
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (row === undefined) expect.fail("expected one row");
    expect(row.session_id).toBe(sessionId);
    expect(row.started_at).toBe(startedAt);
    expect(row.stopped_at).toBeNull();
    expect(row.stop_reason).toBeNull();
    expect(row.pid).toBe(pid);
    expect(row.version).toBe(version);
  });

  it("stopSession_updates_row", () => {
    setup();
    const sessionId = toSessionId("018c3d4e-0000-7000-8000-000000000002");
    const startedAt = toISOTimestamp("2026-02-28T12:00:00.000Z");
    store.startSession(sessionId, startedAt, 999, "0.2.0");
    const stoppedAt = toISOTimestamp("2026-02-28T13:00:00.000Z");
    store.stopSession(sessionId, stoppedAt, STOP_REASON.GRACEFUL);

    const rows = db
      .prepare(
        "SELECT session_id, started_at, stopped_at, stop_reason FROM server_sessions WHERE session_id = ?",
      )
      .all(sessionId) as readonly {
      session_id: string;
      started_at: string;
      stopped_at: string | null;
      stop_reason: string | null;
    }[];
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (row === undefined) expect.fail("expected one row");
    expect(row.stopped_at).toBe(stoppedAt);
    expect(row.stop_reason).toBe(STOP_REASON.GRACEFUL);
  });

  it("backfillCrashedSessions_marks_open_sessions", () => {
    setup();
    const openId = toSessionId("018c3d4e-0000-7000-8000-000000000003");
    const closedId = toSessionId("018c3d4e-0000-7000-8000-000000000004");
    const startedAt = toISOTimestamp("2026-02-28T12:00:00.000Z");
    const closedStoppedAt = toISOTimestamp("2026-02-28T12:30:00.000Z");
    db.prepare(
      "INSERT INTO server_sessions (session_id, started_at, stopped_at, stop_reason, pid, version) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(openId, startedAt, null, null, 1, "0.2.0");
    db.prepare(
      "INSERT INTO server_sessions (session_id, started_at, stopped_at, stop_reason, pid, version) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(closedId, startedAt, closedStoppedAt, STOP_REASON.GRACEFUL, 2, "0.2.0");

    const backfillAt = toISOTimestamp("2026-02-28T14:00:00.000Z");
    store.backfillCrashedSessions(backfillAt);

    const openRow = db
      .prepare("SELECT stopped_at, stop_reason FROM server_sessions WHERE session_id = ?")
      .get(openId) as
      | { stopped_at: string | null; stop_reason: string | null }
      | undefined;
    expect(openRow).toBeDefined();
    expect(openRow?.stopped_at).toBe(backfillAt);
    expect(openRow?.stop_reason).toBe(STOP_REASON.CRASH);

    const closedRow = db
      .prepare("SELECT stopped_at, stop_reason FROM server_sessions WHERE session_id = ?")
      .get(closedId) as
      | { stopped_at: string | null; stop_reason: string | null }
      | undefined;
    expect(closedRow).toBeDefined();
    expect(closedRow?.stopped_at).toBe(closedStoppedAt);
    expect(closedRow?.stop_reason).toBe(STOP_REASON.GRACEFUL);
  });

  it("empty_backfill_no_op", () => {
    setup();
    const sessionId = toSessionId("018c3d4e-0000-7000-8000-000000000005");
    const startedAt = toISOTimestamp("2026-02-28T12:00:00.000Z");
    const stoppedAt = toISOTimestamp("2026-02-28T13:00:00.000Z");
    store.startSession(sessionId, startedAt, 1, "0.2.0");
    store.stopSession(sessionId, stoppedAt, STOP_REASON.GRACEFUL);

    const before = db.prepare("SELECT COUNT(*) as n FROM server_sessions").get() as {
      n: number;
    };
    const backfillAt = toISOTimestamp("2026-02-28T14:00:00.000Z");
    store.backfillCrashedSessions(backfillAt);
    const after = db.prepare("SELECT COUNT(*) as n FROM server_sessions").get() as {
      n: number;
    };
    expect(after.n).toBe(before.n);

    const row = db
      .prepare("SELECT stopped_at, stop_reason FROM server_sessions WHERE session_id = ?")
      .get(sessionId) as
      | { stopped_at: string | null; stop_reason: string | null }
      | undefined;
    expect(row?.stopped_at).toBe(stoppedAt);
    expect(row?.stop_reason).toBe(STOP_REASON.GRACEFUL);
  });

  it("duplicate_startSession_throws", () => {
    setup();
    const sessionId = toSessionId("018c3d4e-0000-7000-8000-000000000006");
    const startedAt = toISOTimestamp("2026-02-28T12:00:00.000Z");
    store.startSession(sessionId, startedAt, 1, "0.2.0");
    expect(() => {
      store.startSession(sessionId, startedAt, 2, "0.2.0");
    }).toThrow();
  });
});
