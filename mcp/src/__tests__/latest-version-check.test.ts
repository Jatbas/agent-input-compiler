// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  isValidVersionString,
  compareVersions,
  getUpdateInfo,
} from "../latest-version-check.js";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import { toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";

function createMockClock(now: string, durationMsResult: number): Clock {
  return {
    now: () => toISOTimestamp(now),
    addMinutes: (_m: number) => toISOTimestamp(now),
    durationMs: () => toMilliseconds(durationMsResult),
  };
}

describe("latest-version-check", () => {
  it("isValidVersionString_accepts_semver", () => {
    expect(isValidVersionString("0.2.1")).toBe(true);
    expect(isValidVersionString("1.0.0")).toBe(true);
    expect(isValidVersionString("1.0.0-alpha")).toBe(true);
  });

  it("isValidVersionString_rejects_long", () => {
    const long = "1.0.0-" + "a".repeat(27);
    expect(long.length).toBe(33);
    expect(isValidVersionString(long)).toBe(false);
  });

  it("isValidVersionString_rejects_invalid", () => {
    expect(isValidVersionString("v0.2.1")).toBe(false);
    expect(isValidVersionString("0.2")).toBe(false);
    expect(isValidVersionString("")).toBe(false);
  });

  it("compareVersions_gt", () => {
    expect(compareVersions("0.2.2", "0.2.1")).toBe(1);
  });

  it("compareVersions_lt", () => {
    expect(compareVersions("0.2.1", "0.2.2")).toBe(-1);
  });

  it("compareVersions_eq", () => {
    expect(compareVersions("0.2.1", "0.2.1")).toBe(0);
  });

  describe("getUpdateInfo", () => {
    let tmpDir: string;
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-version-check-"));
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      if (tmpDir !== undefined && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("getUpdateInfo_when_fetch_fails_returns_null", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
      const clock = createMockClock("2025-01-01T12:00:00.000Z", 25 * 60 * 60 * 1000);
      const result = await getUpdateInfo(
        toAbsolutePath(tmpDir),
        "@jatbas/aic",
        "0.2.1",
        clock,
      );
      expect(result.updateAvailable).toBe(null);
      expect(result.currentVersion).toBe("0.2.1");
    });

    it("getUpdateInfo_when_cache_fresh_uses_cache", async () => {
      const aicDir = path.join(tmpDir, ".aic");
      fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
      const cachePath = path.join(aicDir, "version-check-cache.json");
      const now = "2025-01-01T12:00:00.000Z";
      fs.writeFileSync(
        cachePath,
        JSON.stringify({
          lastCheck: now,
          latestVersion: "0.2.2",
          currentVersion: "0.2.1",
        }),
        "utf8",
      );
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const clock = createMockClock(now, 0);
      const result = await getUpdateInfo(
        toAbsolutePath(tmpDir),
        "@jatbas/aic",
        "0.2.1",
        clock,
      );
      expect(result.updateAvailable).toBe("0.2.2");
      expect(result.currentVersion).toBe("0.2.1");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("getUpdateMessage_returned_when_update_available", async () => {
      const registryJson = JSON.stringify({ "dist-tags": { latest: "0.2.2" } });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          headers: {
            get: (name: string) =>
              name.toLowerCase() === "content-type" ? "application/json" : null,
          },
          arrayBuffer: () => Promise.resolve(new TextEncoder().encode(registryJson)),
        }),
      );
      const clock = createMockClock("2025-01-01T12:00:00.000Z", 25 * 60 * 60 * 1000);
      const result = await getUpdateInfo(
        toAbsolutePath(tmpDir),
        "@jatbas/aic",
        "0.2.1",
        clock,
      );
      const expectedMessage =
        "A newer AIC version (0.2.2) is available. Run `rm -rf ~/.npm/_npx` then reload Cursor to update.";
      expect(result.updateMessage).toBe(expectedMessage);
      const messagePath = path.join(tmpDir, ".aic", "update-available.txt");
      expect(fs.existsSync(messagePath)).toBe(true);
      const written = fs.readFileSync(messagePath, "utf8");
      expect(written).toBe(result.updateMessage);
    });

    it("getUpdateInfo_when_content_type_not_json_returns_null", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          headers: {
            get: (name: string) =>
              name.toLowerCase() === "content-type" ? "text/html" : null,
          },
          arrayBuffer: () =>
            Promise.resolve(
              new TextEncoder().encode(
                JSON.stringify({ "dist-tags": { latest: "0.2.2" } }),
              ),
            ),
        }),
      );
      const clock = createMockClock("2025-01-01T12:00:00.000Z", 25 * 60 * 60 * 1000);
      const result = await getUpdateInfo(
        toAbsolutePath(tmpDir),
        "@jatbas/aic",
        "0.2.1",
        clock,
      );
      expect(result.updateAvailable).toBe(null);
      expect(result.currentVersion).toBe("0.2.1");
    });

    it("getUpdateInfo_when_packument_missing_dist_tags_returns_null", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          headers: { get: () => "application/json" },
          arrayBuffer: () =>
            Promise.resolve(new TextEncoder().encode(JSON.stringify({ name: "pkg" }))),
        }),
      );
      const clock = createMockClock("2025-01-01T12:00:00.000Z", 25 * 60 * 60 * 1000);
      const result = await getUpdateInfo(
        toAbsolutePath(tmpDir),
        "@jatbas/aic",
        "0.2.1",
        clock,
      );
      expect(result.updateAvailable).toBe(null);
    });

    it("getUpdateInfo_no_persist_skips_cache_write", async () => {
      const registryJson = JSON.stringify({ "dist-tags": { latest: "99.0.0" } });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          headers: {
            get: (name: string) =>
              name.toLowerCase() === "content-type" ? "application/json" : null,
          },
          arrayBuffer: () => Promise.resolve(new TextEncoder().encode(registryJson)),
        }),
      );
      const clock = createMockClock("2025-01-01T12:00:00.000Z", 25 * 60 * 60 * 1000);
      const cachePath = path.join(tmpDir, ".aic", "version-check-cache.json");
      expect(fs.existsSync(cachePath)).toBe(false);
      const result = await getUpdateInfo(
        toAbsolutePath(tmpDir),
        "@jatbas/aic",
        "0.2.1",
        clock,
        { persistSideEffects: false },
      );
      expect(result.updateAvailable).toBe("99.0.0");
      expect(fs.existsSync(cachePath)).toBe(false);
    });
  });
});
