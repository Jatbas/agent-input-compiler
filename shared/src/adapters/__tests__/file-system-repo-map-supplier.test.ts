import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, afterEach } from "vitest";
import type { GlobProvider } from "#core/interfaces/glob-provider.interface.js";
import type { IgnoreProvider } from "#core/interfaces/ignore-provider.interface.js";
import type { FileContentReader } from "#core/interfaces/file-content-reader.interface.js";
import type { TokenCounter } from "#core/interfaces/token-counter.interface.js";
import { StorageError } from "#core/errors/storage-error.js";
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

  it("real_token_count_used_for_text_file", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-repomap-"));
    const projectRoot = toAbsolutePath(tmpDir);
    writeFileSync(join(tmpDir, "a.ts"), "const x = 1;");
    const fixedCount = toTokenCount(42);
    const mockGlob: GlobProvider = {
      find: () => [toRelativePath("a.ts")],
    };
    const mockIgnore: IgnoreProvider = { accepts: () => true };
    const mockReader: FileContentReader = {
      getContent: () => "const x = 1;",
    };
    const mockCounter: TokenCounter = {
      countTokens: () => fixedCount,
    };
    const supplier = new FileSystemRepoMapSupplier(
      mockGlob,
      mockIgnore,
      mockReader,
      mockCounter,
    );
    const repoMap = await supplier.getRepoMap(projectRoot);
    expect(repoMap.files).toHaveLength(1);
    const entry = repoMap.files[0];
    expect(entry).toBeDefined();
    if (entry) expect(entry.estimatedTokens).toBe(fixedCount);
  });

  it("bytes_fallback_when_getContent_throws", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-repomap-"));
    const projectRoot = toAbsolutePath(tmpDir);
    const content = "x".repeat(100);
    writeFileSync(join(tmpDir, "a.ts"), "ok");
    writeFileSync(join(tmpDir, "b.ts"), content);
    const failingPath = toRelativePath("b.ts");
    const mockGlob: GlobProvider = {
      find: () => [toRelativePath("a.ts"), failingPath],
    };
    const mockIgnore: IgnoreProvider = { accepts: () => true };
    const mockReader: FileContentReader = {
      getContent: (p) => {
        if (p === failingPath) throw new StorageError("read fail");
        return "ok";
      },
    };
    const mockCounter: TokenCounter = { countTokens: () => toTokenCount(10) };
    const supplier = new FileSystemRepoMapSupplier(
      mockGlob,
      mockIgnore,
      mockReader,
      mockCounter,
    );
    const repoMap = await supplier.getRepoMap(projectRoot);
    expect(repoMap.files).toHaveLength(2);
    const entryB = repoMap.files.find((e) => e.path === failingPath);
    expect(entryB).toBeDefined();
    expect(entryB?.estimatedTokens).toBe(toTokenCount(Math.ceil(100 / 4)));
  });

  it("binary_files_excluded", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-repomap-"));
    const projectRoot = toAbsolutePath(tmpDir);
    writeFileSync(join(tmpDir, "x.png"), "binary");
    const mockGlob: GlobProvider = {
      find: () => [toRelativePath("x.png")],
    };
    const mockIgnore: IgnoreProvider = { accepts: () => true };
    const mockReader: FileContentReader = { getContent: () => "" };
    const mockCounter: TokenCounter = { countTokens: () => toTokenCount(0) };
    const supplier = new FileSystemRepoMapSupplier(
      mockGlob,
      mockIgnore,
      mockReader,
      mockCounter,
    );
    const repoMap = await supplier.getRepoMap(projectRoot);
    expect(repoMap.files).toHaveLength(0);
  });

  it("totalTokens_equals_sum_of_estimatedTokens", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-repomap-"));
    const projectRoot = toAbsolutePath(tmpDir);
    writeFileSync(join(tmpDir, "a.ts"), "a");
    writeFileSync(join(tmpDir, "b.ts"), "b");
    const mockGlob: GlobProvider = {
      find: () => [toRelativePath("a.ts"), toRelativePath("b.ts")],
    };
    const mockIgnore: IgnoreProvider = { accepts: () => true };
    const mockReader: FileContentReader = {
      getContent: (p) => (p === toRelativePath("a.ts") ? "a" : "b"),
    };
    const mockCounter: TokenCounter = {
      countTokens: (t) => toTokenCount(t === "a" ? 10 : 20),
    };
    const supplier = new FileSystemRepoMapSupplier(
      mockGlob,
      mockIgnore,
      mockReader,
      mockCounter,
    );
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
    const mockReader: FileContentReader = { getContent: () => "" };
    const mockCounter: TokenCounter = { countTokens: () => toTokenCount(0) };
    const supplier = new FileSystemRepoMapSupplier(
      mockGlob,
      mockIgnore,
      mockReader,
      mockCounter,
    );
    const repoMap = await supplier.getRepoMap(projectRoot);
    expect(repoMap.files.length).toBe(0);
    expect(repoMap.totalTokens).toBe(toTokenCount(0));
  });
});
