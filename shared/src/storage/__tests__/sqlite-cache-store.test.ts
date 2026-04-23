// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { mkdtempSync, rmSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { toISOTimestamp, toProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import { toTokenCount, toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import type { CachedCompilation } from "@jatbas/aic-core/core/types/compilation-types.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import { migration } from "../migrations/001-consolidated-schema.js";

const TEST_PROJECT_ID = toProjectId("018f0000-0000-7000-8000-000000000001");

const stubClock: Clock = {
  now: () => toISOTimestamp("2025-06-15T12:00:00.000Z"),
  addMinutes: () => toISOTimestamp("2025-06-15T12:00:00.000Z"),
  durationMs: () => toMilliseconds(0),
};
import { SqliteCacheStore } from "../sqlite-cache-store.js";

function makeEntry(overrides: Partial<CachedCompilation> = {}): CachedCompilation {
  return {
    key: "test-key",
    compiledPrompt: "compiled prompt text",
    tokenCount: toTokenCount(100),
    createdAt: toISOTimestamp("2026-02-25T10:00:00.000Z"),
    expiresAt: toISOTimestamp("2026-03-25T10:00:00.000Z"),
    fileTreeHash: "abc123",
    configHash: "config-hash",
    filesSelected: 3,
    ...overrides,
  };
}

describe("SqliteCacheStore", () => {
  let tmpDir: string;
  let db: Database.Database;
  let store: SqliteCacheStore;

  afterEach(() => {
    if (db) db.close();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  function setup(): void {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-cache-store-"));
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
    store = new SqliteCacheStore(TEST_PROJECT_ID, db, toAbsolutePath(tmpDir), stubClock);
  }

  it("set then get returns same CachedCompilation", () => {
    setup();
    const entry = makeEntry({ key: "k1" });
    store.set(entry);
    const got = store.get("k1");
    expect(got).not.toBeNull();
    expect(got?.key).toBe(entry.key);
    expect(got?.compiledPrompt).toBe(entry.compiledPrompt);
    expect(got?.tokenCount).toBe(entry.tokenCount);
    expect(got?.createdAt).toBe(entry.createdAt);
    expect(got?.expiresAt).toBe(entry.expiresAt);
    expect(got?.fileTreeHash).toBe(entry.fileTreeHash);
    expect(got?.configHash).toBe(entry.configHash);
    expect(got?.filesSelected).toBe(entry.filesSelected);
  });

  it("get missing key returns null", () => {
    setup();
    expect(store.get("missing")).toBeNull();
  });

  it("invalidate removes entry and get returns null", () => {
    setup();
    store.set(makeEntry({ key: "k2" }));
    expect(store.get("k2")).not.toBeNull();
    store.invalidate("k2");
    expect(store.get("k2")).toBeNull();
  });

  it("invalidateAll clears all entries", () => {
    setup();
    store.set(makeEntry({ key: "a" }));
    store.set(makeEntry({ key: "b" }));
    expect(store.get("a")).not.toBeNull();
    expect(store.get("b")).not.toBeNull();
    store.invalidateAll();
    expect(store.get("a")).toBeNull();
    expect(store.get("b")).toBeNull();
  });

  it("expiry: get returns null when expires_at is in the past", () => {
    setup();
    const past = "2020-01-01T00:00:00.000Z";
    store.set(makeEntry({ key: "expired", expiresAt: toISOTimestamp(past) }));
    expect(store.get("expired")).toBeNull();
  });

  it("get when blob missing: get returns null when row exists but blob file is missing", () => {
    setup();
    store.set(makeEntry({ key: "blob-missing" }));
    const rows = db
      .prepare("SELECT file_path FROM cache_metadata WHERE cache_key = ?")
      .all("blob-missing") as { file_path: string }[];
    const row = rows[0];
    expect(row).toBeDefined();
    if (row === undefined) return;
    unlinkSync(row.file_path);
    expect(store.get("blob-missing")).toBeNull();
  });

  it("get when blob corrupt: get returns null when row exists and blob exists but JSON is invalid", () => {
    setup();
    store.set(makeEntry({ key: "blob-corrupt" }));
    const rows = db
      .prepare("SELECT file_path FROM cache_metadata WHERE cache_key = ?")
      .all("blob-corrupt") as { file_path: string }[];
    const row = rows[0];
    expect(row).toBeDefined();
    if (row === undefined) return;
    writeFileSync(row.file_path, "not valid json", "utf8");
    expect(store.get("blob-corrupt")).toBeNull();
  });

  it("purgeExpired deletes expired rows and blob files", () => {
    setup();
    const past = "2020-01-01T00:00:00.000Z";
    const future = "2099-01-01T00:00:00.000Z";
    store.set(makeEntry({ key: "expired-1", expiresAt: toISOTimestamp(past) }));
    store.set(makeEntry({ key: "expired-2", expiresAt: toISOTimestamp(past) }));
    store.set(makeEntry({ key: "valid", expiresAt: toISOTimestamp(future) }));
    const expiredRows = db
      .prepare("SELECT file_path FROM cache_metadata WHERE cache_key IN (?, ?)")
      .all("expired-1", "expired-2") as { file_path: string }[];
    store.purgeExpired();
    const remaining = db.prepare("SELECT cache_key FROM cache_metadata").all() as {
      cache_key: string;
    }[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.cache_key).toBe("valid");
    for (const row of expiredRows) {
      expect(() => readFileSync(row.file_path, "utf8")).toThrow();
    }
  });

  it("purgeExpired on empty table is no-op", () => {
    setup();
    store.purgeExpired();
    const rows = db.prepare("SELECT COUNT(*) as c FROM cache_metadata").all() as {
      c: number;
    }[];
    expect(rows[0]?.c).toBe(0);
  });

  it("purgeExpired removes orphan blob files not in cache_metadata", () => {
    setup();
    const future = "2099-01-01T00:00:00.000Z";
    store.set(makeEntry({ key: "valid", expiresAt: toISOTimestamp(future) }));
    const validRows = db
      .prepare("SELECT file_path FROM cache_metadata WHERE cache_key = ?")
      .all("valid") as { file_path: string }[];
    const validPath = validRows[0]?.file_path;
    expect(validPath).toBeDefined();
    const orphanPath = join(tmpDir, "orphan-not-in-db.json");
    writeFileSync(orphanPath, "{}", "utf8");
    store.purgeExpired();
    expect(() => readFileSync(orphanPath, "utf8")).toThrow();
    if (validPath !== undefined) {
      expect(readFileSync(validPath, "utf8")).toBeTruthy();
    }
  });

  it("same-day expiry: get returns null and purgeExpired deletes", () => {
    setup();
    const sameDayPast = "2025-06-15T11:00:00.000Z";
    const sameDayFuture = "2025-06-15T13:00:00.000Z";
    store.set(
      makeEntry({ key: "expired-same-day", expiresAt: toISOTimestamp(sameDayPast) }),
    );
    store.set(
      makeEntry({ key: "valid-same-day", expiresAt: toISOTimestamp(sameDayFuture) }),
    );
    expect(store.get("expired-same-day")).toBeNull();
    expect(store.get("valid-same-day")).not.toBeNull();
    store.purgeExpired();
    const remaining = db.prepare("SELECT cache_key FROM cache_metadata").all() as {
      cache_key: string;
    }[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.cache_key).toBe("valid-same-day");
  });

  it("sqlite_cache_store_get_set_invalidate", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-cache-store-"));
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
    const storeA = new SqliteCacheStore(
      projectIdA,
      db,
      toAbsolutePath(tmpDir),
      stubClock,
    );
    const storeB = new SqliteCacheStore(
      projectIdB,
      db,
      toAbsolutePath(tmpDir),
      stubClock,
    );
    storeA.set(makeEntry({ key: "k-a" }));
    storeB.set(makeEntry({ key: "k-b" }));
    expect(storeA.get("k-a")).not.toBeNull();
    expect(storeA.get("k-b")).toBeNull();
    expect(storeB.get("k-b")).not.toBeNull();
    expect(storeB.get("k-a")).toBeNull();
    storeA.invalidate("k-a");
    expect(storeA.get("k-a")).toBeNull();
    expect(storeB.get("k-b")).not.toBeNull();
  });

  it("get on expired key lazy-deletes row and blob", () => {
    setup();
    const past = "2020-01-01T00:00:00.000Z";
    store.set(makeEntry({ key: "lazy-expired", expiresAt: toISOTimestamp(past) }));
    const rowsBefore = db
      .prepare("SELECT file_path FROM cache_metadata WHERE cache_key = ?")
      .all("lazy-expired") as { file_path: string }[];
    expect(rowsBefore).toHaveLength(1);
    const blobPathBefore = rowsBefore[0]?.file_path;
    expect(store.get("lazy-expired")).toBeNull();
    const rowsAfter = db
      .prepare("SELECT cache_key FROM cache_metadata WHERE cache_key = ?")
      .all("lazy-expired") as { cache_key: string }[];
    expect(rowsAfter).toHaveLength(0);
    if (blobPathBefore !== undefined) {
      expect(() => readFileSync(blobPathBefore, "utf8")).toThrow();
    }
  });
});
