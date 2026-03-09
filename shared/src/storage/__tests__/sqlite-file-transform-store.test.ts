// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toTokenCount, toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import { toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import { INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";
import type { CachedFileTransform } from "@jatbas/aic-core/core/types/file-transform-types.js";
import { migration as migration009 } from "../migrations/009-file-transform-cache.js";
import { SqliteFileTransformStore } from "../sqlite-file-transform-store.js";

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

  function setup(clock: Clock): void {
    db = new Database(":memory:");
    migration009.up(db as unknown as ExecutableDb);
    store = new SqliteFileTransformStore(db as unknown as ExecutableDb, clock);
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
});
