// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toTokenCount, toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import { toISOTimestamp, toProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import { INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";
import type { CachedFileTransform } from "@jatbas/aic-core/core/types/file-transform-types.js";
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
import { migration as migration013 } from "../migrations/013-project-id-fk.js";
import { migration as migration014 } from "../migrations/014-drop-project-root-columns.js";
import { SqliteFileTransformStore } from "../sqlite-file-transform-store.js";

const TEST_PROJECT_ID = toProjectId("018f0000-0000-7000-8000-000000000001");

function makeClock(nowIso: string): Clock {
  return {
    now: () => toISOTimestamp(nowIso),
    addMinutes: () => toISOTimestamp(nowIso),
    durationMs: () => toMilliseconds(0),
  };
}

function makeEntry(
  overrides: Partial<{
    filePath: ReturnType<typeof toRelativePath>;
    contentHash: string;
    transformedContent: string;
    tierOutputs: CachedFileTransform["tierOutputs"];
    createdAt: ReturnType<typeof toISOTimestamp>;
    expiresAt: ReturnType<typeof toISOTimestamp>;
  }>,
): CachedFileTransform {
  const tierOutputs: CachedFileTransform["tierOutputs"] = overrides.tierOutputs ?? {
    [INCLUSION_TIER.L0]: { content: "l0", tokens: toTokenCount(0) },
    [INCLUSION_TIER.L1]: { content: "l1", tokens: toTokenCount(1) },
    [INCLUSION_TIER.L2]: { content: "l2", tokens: toTokenCount(2) },
    [INCLUSION_TIER.L3]: { content: "l3", tokens: toTokenCount(3) },
  };
  return {
    filePath: overrides.filePath ?? toRelativePath("a.ts"),
    contentHash: overrides.contentHash ?? "hash1",
    transformedContent: overrides.transformedContent ?? "transformed",
    tierOutputs,
    createdAt: overrides.createdAt ?? toISOTimestamp("2025-06-01T12:00:00.000Z"),
    expiresAt: overrides.expiresAt ?? toISOTimestamp("2026-06-01T12:00:00.000Z"),
  };
}

describe("SqliteFileTransformStore", () => {
  let db: Database.Database;
  let store: SqliteFileTransformStore;

  afterEach(() => {
    if (db) db.close();
  });

  function setup(clock: Clock, projectRoot = "/test/project"): void {
    db = new Database(":memory:");
    const execDb = db as unknown as ExecutableDb;
    migration001.up(execDb);
    migration002.up(execDb);
    migration003.up(execDb);
    migration004.up(execDb);
    migration005.up(execDb);
    migration006.up(execDb);
    migration007.up(execDb);
    migration008.up(execDb);
    migration009.up(execDb);
    migration010.up(execDb);
    migration011.up(execDb);
    migration013.up(execDb);
    migration014.up(execDb);
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(
      TEST_PROJECT_ID,
      projectRoot,
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    );
    store = new SqliteFileTransformStore(TEST_PROJECT_ID, execDb, clock);
  }

  it("get_empty_returns_null", () => {
    setup(makeClock("2025-06-01T12:00:00.000Z"));
    expect(store.get(toRelativePath("any.ts"), "anyhash")).toBeNull();
  });

  it("set_then_get_returns_entry", () => {
    setup(makeClock("2025-06-01T12:00:00.000Z"));
    const entry = makeEntry({
      filePath: toRelativePath("src/foo.ts"),
      contentHash: "abc123",
      transformedContent: "x",
      tierOutputs: {
        [INCLUSION_TIER.L0]: { content: "c0", tokens: toTokenCount(10) },
        [INCLUSION_TIER.L1]: { content: "c1", tokens: toTokenCount(20) },
        [INCLUSION_TIER.L2]: { content: "c2", tokens: toTokenCount(30) },
        [INCLUSION_TIER.L3]: { content: "c3", tokens: toTokenCount(40) },
      },
    });
    store.set(entry);
    const got = store.get(entry.filePath, entry.contentHash);
    expect(got).not.toBeNull();
    if (got === null) return;
    expect(got.filePath).toBe(entry.filePath);
    expect(got.contentHash).toBe(entry.contentHash);
    expect(got.transformedContent).toBe(entry.transformedContent);
    expect(got.tierOutputs[INCLUSION_TIER.L0].content).toBe("c0");
    expect(got.tierOutputs[INCLUSION_TIER.L0].tokens).toBe(10);
    expect(got.createdAt).toBe(entry.createdAt);
    expect(got.expiresAt).toBe(entry.expiresAt);
  });

  it("get_expired_returns_null", () => {
    setup(makeClock("2030-01-01T00:00:00.000Z"));
    const entry = makeEntry({
      expiresAt: toISOTimestamp("2025-01-01T00:00:00.000Z"),
    });
    store.set(entry);
    expect(store.get(entry.filePath, entry.contentHash)).toBeNull();
  });

  it("invalidate_removes_by_path", () => {
    setup(makeClock("2025-06-01T12:00:00.000Z"));
    const path = toRelativePath("same/path.ts");
    store.set(makeEntry({ filePath: path, contentHash: "h1" }));
    store.set(makeEntry({ filePath: path, contentHash: "h2" }));
    store.invalidate(path);
    expect(store.get(path, "h1")).toBeNull();
    expect(store.get(path, "h2")).toBeNull();
  });

  it("purgeExpired_removes_expired_only", () => {
    const nowIso = "2025-06-01T12:00:00.000Z";
    setup(makeClock(nowIso));
    const expired = makeEntry({
      filePath: toRelativePath("expired.ts"),
      contentHash: "e1",
      expiresAt: toISOTimestamp("2025-01-01T00:00:00.000Z"),
    });
    const valid = makeEntry({
      filePath: toRelativePath("valid.ts"),
      contentHash: "v1",
      expiresAt: toISOTimestamp("2026-01-01T00:00:00.000Z"),
    });
    store.set(expired);
    store.set(valid);
    store.purgeExpired();
    expect(store.get(expired.filePath, expired.contentHash)).toBeNull();
    const got = store.get(valid.filePath, valid.contentHash);
    expect(got).not.toBeNull();
    if (got !== null) expect(got.contentHash).toBe("v1");
  });

  it("set_idempotent", () => {
    setup(makeClock("2025-06-01T12:00:00.000Z"));
    const entry = makeEntry({ transformedContent: "first" });
    store.set(entry);
    store.set({ ...entry, transformedContent: "second" });
    const got = store.get(entry.filePath, entry.contentHash);
    expect(got).not.toBeNull();
    if (got !== null) expect(got.transformedContent).toBe("second");
  });

  it("empty_result_set", () => {
    setup(makeClock("2025-06-01T12:00:00.000Z"));
    store.purgeExpired();
    expect(store.get(toRelativePath("nonexistent.ts"), "hash")).toBeNull();
  });

  it("sqlite_file_transform_store_get_set_invalidate", () => {
    db = new Database(":memory:");
    const execDb = db as unknown as ExecutableDb;
    migration001.up(execDb);
    migration002.up(execDb);
    migration003.up(execDb);
    migration004.up(execDb);
    migration005.up(execDb);
    migration006.up(execDb);
    migration007.up(execDb);
    migration008.up(execDb);
    migration009.up(execDb);
    migration010.up(execDb);
    migration011.up(execDb);
    migration013.up(execDb);
    migration014.up(execDb);
    const projectIdA = toProjectId("018f0000-0000-7000-8000-000000000010");
    const projectIdB = toProjectId("018f0000-0000-7000-8000-000000000011");
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(projectIdA, "/proj/a", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(projectIdB, "/proj/b", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    const clock = makeClock("2025-06-01T12:00:00.000Z");
    const storeA = new SqliteFileTransformStore(projectIdA, execDb, clock);
    const storeB = new SqliteFileTransformStore(projectIdB, execDb, clock);
    const path = toRelativePath("same/path.ts");
    storeA.set(makeEntry({ filePath: path, contentHash: "h-a" }));
    storeB.set(makeEntry({ filePath: path, contentHash: "h-b" }));
    expect(storeA.get(path, "h-a")).not.toBeNull();
    expect(storeA.get(path, "h-b")).toBeNull();
    expect(storeB.get(path, "h-b")).not.toBeNull();
    expect(storeB.get(path, "h-a")).toBeNull();
    storeA.invalidate(path);
    expect(storeA.get(path, "h-a")).toBeNull();
    expect(storeB.get(path, "h-b")).not.toBeNull();
  });
});
