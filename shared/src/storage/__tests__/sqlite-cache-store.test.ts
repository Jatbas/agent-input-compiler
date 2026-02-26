import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { toAbsolutePath } from "#core/types/paths.js";
import { toISOTimestamp } from "#core/types/identifiers.js";
import { toTokenCount, toMilliseconds } from "#core/types/units.js";
import type { CachedCompilation } from "#core/types/compilation-types.js";
import type { Clock } from "#core/interfaces/clock.interface.js";
import { migration as migration001 } from "../migrations/001-initial-schema.js";

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
    migration001.up(db);
    store = new SqliteCacheStore(db, toAbsolutePath(tmpDir), stubClock);
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
});
