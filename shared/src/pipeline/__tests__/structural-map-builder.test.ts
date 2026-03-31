// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { StructuralMapBuilder } from "../structural-map-builder.js";
import type { RepoMap } from "@jatbas/aic-core/core/types/repo-map.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { toTokenCount, toBytes } from "@jatbas/aic-core/core/types/units.js";
import { toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";

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

  it("excludes_git_paths", () => {
    const builder = new StructuralMapBuilder();
    const repo = makeRepoMap([
      makeFileEntry(".git/objects/ab/1234abcd"),
      makeFileEntry(".git/refs/heads/main"),
      makeFileEntry("src/index.ts"),
    ]);
    const result = builder.build(repo);
    expect(result).not.toContain(".git/");
    expect(result).toContain("src/");
    expect(result).toContain("1 files");
  });

  it("all_git_paths_returns_empty", () => {
    const builder = new StructuralMapBuilder();
    const repo = makeRepoMap([
      makeFileEntry(".git/objects/ab/1234abcd"),
      makeFileEntry(".git/HEAD"),
    ]);
    const result = builder.build(repo);
    expect(result).toBe("");
  });
});
