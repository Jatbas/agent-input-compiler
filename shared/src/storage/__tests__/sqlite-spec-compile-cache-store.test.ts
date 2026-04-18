// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import { toISOTimestamp, toProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import { toTokenCount, toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import { toPercentage } from "@jatbas/aic-core/core/types/scores.js";
import type { SpecCompileCacheEntry } from "@jatbas/aic-core/core/types/specification-compilation.types.js";
import { migration } from "../migrations/001-consolidated-schema.js";
import { migration as migration002 } from "../migrations/002-add-conversation-id-index.js";
import { migration as migration003 } from "../migrations/003-compilation-selection-trace.js";
import { migration as migration004 } from "../migrations/004-spec-compile-cache.js";
import { SqliteSpecCompileCacheStore } from "../sqlite-spec-compile-cache-store.js";

const TEST_PROJECT_ID = toProjectId("018f0000-0000-7000-8000-0000000000aa");

function makeClock(nowIso: string): Clock {
  return {
    now: () => toISOTimestamp(nowIso),
    addMinutes: () => toISOTimestamp(nowIso),
    durationMs: () => toMilliseconds(0),
  };
}

function makeEntry(
  overrides: Partial<{
    cacheKey: string;
    compiledSpec: string;
    meta: SpecCompileCacheEntry["meta"];
    createdAt: ReturnType<typeof toISOTimestamp>;
    expiresAt: ReturnType<typeof toISOTimestamp>;
  }>,
): SpecCompileCacheEntry {
  const meta: SpecCompileCacheEntry["meta"] = overrides.meta ?? {
    totalTokensRaw: toTokenCount(100),
    totalTokensCompiled: toTokenCount(40),
    reductionPct: toPercentage(0.6),
    typeTiers: { T: "verbatim" },
    transformTokensSaved: toTokenCount(5),
  };
  return {
    cacheKey: overrides.cacheKey ?? "cache-key-1",
    compiledSpec: overrides.compiledSpec ?? "compiled body",
    meta,
    createdAt: overrides.createdAt ?? toISOTimestamp("2025-06-01T12:00:00.000Z"),
    expiresAt: overrides.expiresAt ?? toISOTimestamp("2026-06-01T12:00:00.000Z"),
  };
}

describe("SqliteSpecCompileCacheStore", () => {
  let db: Database.Database;
  let store: SqliteSpecCompileCacheStore;

  afterEach(() => {
    if (db) db.close();
  });

  function setup(clock: Clock, projectRoot = "/test/project"): void {
    db = new Database(":memory:");
    const execDb = db as unknown as ExecutableDb;
    migration.up(execDb);
    migration002.up(execDb);
    migration003.up(execDb);
    migration004.up(execDb);
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(
      TEST_PROJECT_ID,
      projectRoot,
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    );
    store = new SqliteSpecCompileCacheStore(TEST_PROJECT_ID, execDb, clock);
  }

  it("store_miss_returns_null", () => {
    setup(makeClock("2025-06-01T12:00:00.000Z"));
    expect(store.get("missing-key")).toBeNull();
  });

  it("store_set_get_round_trip", () => {
    setup(makeClock("2025-06-01T12:00:00.000Z"));
    const entry = makeEntry({
      cacheKey: "ck-round",
      compiledSpec: "round-trip spec",
      meta: {
        totalTokensRaw: toTokenCount(200),
        totalTokensCompiled: toTokenCount(80),
        reductionPct: toPercentage(0.4),
        typeTiers: { X: "signature-path", Y: "path-only" },
        transformTokensSaved: toTokenCount(12),
      },
    });
    store.set(entry);
    const got = store.get(entry.cacheKey);
    expect(got).not.toBeNull();
    if (got === null) return;
    expect(got.cacheKey).toBe(entry.cacheKey);
    expect(got.compiledSpec).toBe(entry.compiledSpec);
    expect(got.meta.totalTokensRaw).toBe(entry.meta.totalTokensRaw);
    expect(got.meta.totalTokensCompiled).toBe(entry.meta.totalTokensCompiled);
    expect(got.meta.reductionPct).toBe(entry.meta.reductionPct);
    expect(got.meta.transformTokensSaved).toBe(entry.meta.transformTokensSaved);
    expect(got.meta.typeTiers).toEqual(entry.meta.typeTiers);
    expect(got.createdAt).toBe(entry.createdAt);
    expect(got.expiresAt).toBe(entry.expiresAt);
  });

  it("store_purgeExpired_removes_expired_only", () => {
    const nowIso = "2025-06-01T12:00:00.000Z";
    setup(makeClock(nowIso));
    const expired = makeEntry({
      cacheKey: "expired",
      expiresAt: toISOTimestamp("2025-01-01T00:00:00.000Z"),
    });
    const valid = makeEntry({
      cacheKey: "valid",
      expiresAt: toISOTimestamp("2026-01-01T00:00:00.000Z"),
    });
    store.set(expired);
    store.set(valid);
    store.purgeExpired();
    expect(store.get(expired.cacheKey)).toBeNull();
    const got = store.get(valid.cacheKey);
    expect(got).not.toBeNull();
    if (got !== null) expect(got.cacheKey).toBe("valid");
  });
});
