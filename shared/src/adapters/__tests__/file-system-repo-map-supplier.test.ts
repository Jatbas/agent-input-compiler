// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, afterEach } from "vitest";
import type { GlobProvider } from "@jatbas/aic-core/core/interfaces/glob-provider.interface.js";
import type { IgnoreProvider } from "@jatbas/aic-core/core/interfaces/ignore-provider.interface.js";
import { toAbsolutePath, toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toBytes, toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import { FileSystemRepoMapSupplier } from "../file-system-repo-map-supplier.js";

const MOCK_LAST_MODIFIED = toISOTimestamp("2020-01-01T00:00:00.000Z");

describe("FileSystemRepoMapSupplier", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir !== undefined && tmpDir !== "") {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("bytes_div4_token_estimate_for_text_file", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-repomap-"));
    const projectRoot = toAbsolutePath(tmpDir);
    const content = "const x = 1;";
    writeFileSync(join(tmpDir, "a.ts"), content);
    const mockGlob: GlobProvider = {
      find: () => Promise.resolve([toRelativePath("a.ts")]),
      findWithStats: () =>
        Promise.resolve([
          {
            path: toRelativePath("a.ts"),
            sizeBytes: toBytes(Buffer.byteLength(content, "utf8")),
            lastModified: MOCK_LAST_MODIFIED,
          },
        ]),
    };
    const mockIgnore: IgnoreProvider = { accepts: () => true };
    const supplier = new FileSystemRepoMapSupplier(mockGlob, mockIgnore);
    const repoMap = await supplier.getRepoMap(projectRoot);
    expect(repoMap.files).toHaveLength(1);
    const entry = repoMap.files[0];
    expect(entry).toBeDefined();
    if (entry) {
      const expectedTokens = toTokenCount(
        Math.ceil(Buffer.byteLength(content, "utf8") / 4),
      );
      expect(entry.estimatedTokens).toBe(expectedTokens);
    }
  });

  it("binary_files_excluded", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-repomap-"));
    const projectRoot = toAbsolutePath(tmpDir);
    writeFileSync(join(tmpDir, "x.png"), "binary");
    const mockGlob: GlobProvider = {
      find: () => Promise.resolve([toRelativePath("x.png")]),
      findWithStats: () =>
        Promise.resolve([
          {
            path: toRelativePath("x.png"),
            sizeBytes: toBytes(6),
            lastModified: MOCK_LAST_MODIFIED,
          },
        ]),
    };
    const mockIgnore: IgnoreProvider = { accepts: () => true };
    const supplier = new FileSystemRepoMapSupplier(mockGlob, mockIgnore);
    const repoMap = await supplier.getRepoMap(projectRoot);
    expect(repoMap.files).toHaveLength(0);
  });

  it("totalTokens_equals_sum_of_estimatedTokens", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-repomap-"));
    const projectRoot = toAbsolutePath(tmpDir);
    writeFileSync(join(tmpDir, "a.ts"), "a");
    writeFileSync(join(tmpDir, "b.ts"), "bb");
    const mockGlob: GlobProvider = {
      find: () => Promise.resolve([toRelativePath("a.ts"), toRelativePath("b.ts")]),
      findWithStats: () =>
        Promise.resolve([
          {
            path: toRelativePath("a.ts"),
            sizeBytes: toBytes(1),
            lastModified: MOCK_LAST_MODIFIED,
          },
          {
            path: toRelativePath("b.ts"),
            sizeBytes: toBytes(2),
            lastModified: MOCK_LAST_MODIFIED,
          },
        ]),
    };
    const mockIgnore: IgnoreProvider = { accepts: () => true };
    const supplier = new FileSystemRepoMapSupplier(mockGlob, mockIgnore);
    const repoMap = await supplier.getRepoMap(projectRoot);
    expect(repoMap.files).toHaveLength(2);
    const a = repoMap.files[0];
    const b = repoMap.files[1];
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    if (a !== undefined && b !== undefined) {
      const sum = a.estimatedTokens + b.estimatedTokens;
      expect(repoMap.totalTokens).toBe(toTokenCount(sum));
    }
  });

  it("empty_project_returns_zero_totalTokens", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-repomap-"));
    const projectRoot = toAbsolutePath(tmpDir);
    const mockGlob: GlobProvider = {
      find: () => Promise.resolve([]),
      findWithStats: () => Promise.resolve([]),
    };
    const mockIgnore: IgnoreProvider = { accepts: () => true };
    const supplier = new FileSystemRepoMapSupplier(mockGlob, mockIgnore);
    const repoMap = await supplier.getRepoMap(projectRoot);
    expect(repoMap.files.length).toBe(0);
    expect(repoMap.totalTokens).toBe(toTokenCount(0));
  });
});
