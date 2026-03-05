import { describe, it, expect } from "vitest";
import { StructuralMapBuilder } from "../structural-map-builder.js";
import type { RepoMap } from "#core/types/repo-map.js";
import { toRelativePath } from "#core/types/paths.js";
import { toAbsolutePath } from "#core/types/paths.js";
import { toTokenCount, toBytes } from "#core/types/units.js";
import { toISOTimestamp } from "#core/types/identifiers.js";

function makeFileEntry(path: string): RepoMap["files"][number] {
  return {
    path: toRelativePath(path),
    language: "ts",
    sizeBytes: toBytes(100),
    estimatedTokens: toTokenCount(50),
    lastModified: toISOTimestamp("2025-01-01T00:00:00.000Z"),
  };
}

function makeRepoMap(files: RepoMap["files"], root = "/repo"): RepoMap {
  const total = files.reduce((sum, f) => sum + Number(f.estimatedTokens), 0);
  return {
    root: toAbsolutePath(root),
    files,
    totalFiles: files.length,
    totalTokens: toTokenCount(total),
  };
}

describe("StructuralMapBuilder", () => {
  it("build_empty_repo", () => {
    const builder = new StructuralMapBuilder();
    const repo = makeRepoMap([]);
    expect(builder.build(repo)).toBe("");
  });

  it("build_single_file", () => {
    const builder = new StructuralMapBuilder();
    const repo = makeRepoMap([makeFileEntry("src/index.ts")]);
    const result = builder.build(repo);
    expect(result).toContain("src/");
    expect(result).toContain("1 files");
  });

  it("build_multiple_dirs", () => {
    const builder = new StructuralMapBuilder();
    const repo = makeRepoMap([
      makeFileEntry("src/a.ts"),
      makeFileEntry("src/b.ts"),
      makeFileEntry("lib/one.ts"),
    ]);
    const result = builder.build(repo);
    expect(result).toContain("src/");
    expect(result).toContain("lib/");
    expect(result).toContain("2 files"); // src has 2
    expect(result).toContain("1 files"); // lib has 1
    const lines = result.split("\n");
    expect(lines.length).toBe(2);
    const hasSrc = lines.some((l) => l.startsWith("src/"));
    const hasLib = lines.some((l) => l.startsWith("lib/"));
    expect(hasSrc).toBe(true);
    expect(hasLib).toBe(true);
  });

  it("build_deterministic", () => {
    const builder = new StructuralMapBuilder();
    const repo = makeRepoMap([makeFileEntry("src/a.ts"), makeFileEntry("lib/x.ts")]);
    const first = builder.build(repo);
    const second = builder.build(repo);
    expect(first).toBe(second);
  });
});
