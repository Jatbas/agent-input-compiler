// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, afterEach } from "vitest";
import { FastGlobAdapter } from "../fast-glob-adapter.js";
import { toAbsolutePath, toRelativePath } from "@jatbas/aic-shared/core/types/paths.js";
import { toBytes } from "@jatbas/aic-shared/core/types/units.js";

describe("FastGlobAdapter", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("find empty patterns returns []", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-glob-test-"));
    const cwd = toAbsolutePath(tmpDir);
    const adapter = new FastGlobAdapter();
    const result = await adapter.find([], cwd);
    expect(result).toEqual([]);
  });

  it("find matching pattern returns relative paths under cwd", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-glob-test-"));
    writeFileSync(join(tmpDir, "a.ts"), "");
    writeFileSync(join(tmpDir, "b.js"), "");
    const cwd = toAbsolutePath(tmpDir);
    const adapter = new FastGlobAdapter();
    const result = await adapter.find(["**/*.ts"], cwd);
    expect(result).toContainEqual("a.ts");
    expect(result).toHaveLength(1);
  });

  it("find with negation excludes matching files", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-glob-test-"));
    writeFileSync(join(tmpDir, "include.ts"), "");
    writeFileSync(join(tmpDir, "exclude.ts"), "");
    const cwd = toAbsolutePath(tmpDir);
    const adapter = new FastGlobAdapter();
    const result = await adapter.find(["**/*.ts", "!**/exclude.ts"], cwd);
    expect(result).toContainEqual("include.ts");
    expect(result).not.toContainEqual("exclude.ts");
    expect(result).toHaveLength(1);
  });

  it("find deterministic: same input gives same output order across calls", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-glob-test-"));
    writeFileSync(join(tmpDir, "a.ts"), "");
    writeFileSync(join(tmpDir, "b.ts"), "");
    const cwd = toAbsolutePath(tmpDir);
    const adapter = new FastGlobAdapter();
    const first = await adapter.find(["**/*.ts"], cwd);
    const second = await adapter.find(["**/*.ts"], cwd);
    expect(first).toEqual(second);
  });

  it("find non-existent cwd propagates error", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-glob-test-"));
    const filePath = join(tmpDir, "a.ts");
    writeFileSync(filePath, "");
    const adapter = new FastGlobAdapter();
    const cwd = toAbsolutePath(filePath);
    await expect(adapter.find(["**/*.ts"], cwd)).rejects.toThrow();
  });

  it("findWithStats_returns_path_size_mtime", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-glob-test-"));
    writeFileSync(join(tmpDir, "a.ts"), "x");
    const cwd = toAbsolutePath(tmpDir);
    const adapter = new FastGlobAdapter();
    const result = await adapter.findWithStats(["**/*.ts"], cwd);
    expect(result).toHaveLength(1);
    const first = result[0];
    expect(first).toBeDefined();
    if (first !== undefined) {
      expect(first.path).toBe(toRelativePath("a.ts"));
      expect(first.sizeBytes).toBe(toBytes(1));
      expect(first.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
  });
});
