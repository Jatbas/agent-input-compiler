import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, afterEach } from "vitest";
import type { GlobProvider } from "#core/interfaces/glob-provider.interface.js";
import type { IgnoreProvider } from "#core/interfaces/ignore-provider.interface.js";
import { toAbsolutePath, toRelativePath } from "#core/types/paths.js";
import { toTokenCount } from "#core/types/units.js";
import { FileSystemRepoMapSupplier } from "../file-system-repo-map-supplier.js";

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
      find: () => [toRelativePath("a.ts")],
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
      find: () => [toRelativePath("x.png")],
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
      find: () => [toRelativePath("a.ts"), toRelativePath("b.ts")],
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
    const mockGlob: GlobProvider = { find: () => [] };
    const mockIgnore: IgnoreProvider = { accepts: () => true };
    const supplier = new FileSystemRepoMapSupplier(mockGlob, mockIgnore);
    const repoMap = await supplier.getRepoMap(projectRoot);
    expect(repoMap.files.length).toBe(0);
    expect(repoMap.totalTokens).toBe(toTokenCount(0));
  });
});
