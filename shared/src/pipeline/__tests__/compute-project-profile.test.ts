// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { computeProjectProfile } from "../compute-project-profile.js";
import type { RepoMap } from "@jatbas/aic-core/core/types/repo-map.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toTokenCount, toBytes } from "@jatbas/aic-core/core/types/units.js";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";

const ROOT = toAbsolutePath("/proj");
const TS = toISOTimestamp("2026-01-01T00:00:00.000Z");

function entry(path: string, tokens: number) {
  return {
    path: toRelativePath(path),
    language: "ts",
    sizeBytes: toBytes(1),
    estimatedTokens: toTokenCount(tokens),
    lastModified: TS,
  };
}

describe("computeProjectProfile", () => {
  it("empty_repo_returns_zero_profile", () => {
    const repo: RepoMap = {
      root: ROOT,
      files: [],
      totalFiles: 0,
      totalTokens: toTokenCount(0),
    };
    const p = computeProjectProfile(repo);
    expect(p.totalFiles).toBe(0);
    expect(Number(p.totalTokens)).toBe(0);
    expect(Number(p.medianFileTokens)).toBe(0);
    expect(Number(p.p90FileTokens)).toBe(0);
  });

  it("single_file_median_and_p90_equal_that_file", () => {
    const repo: RepoMap = {
      root: ROOT,
      files: [entry("a.ts", 500)],
      totalFiles: 1,
      totalTokens: toTokenCount(500),
    };
    const p = computeProjectProfile(repo);
    expect(Number(p.medianFileTokens)).toBe(500);
    expect(Number(p.p90FileTokens)).toBe(500);
  });

  it("even_count_uses_floor_midpoint_for_median", () => {
    const repo: RepoMap = {
      root: ROOT,
      files: [
        entry("a.ts", 100),
        entry("b.ts", 200),
        entry("c.ts", 300),
        entry("d.ts", 400),
      ],
      totalFiles: 4,
      totalTokens: toTokenCount(1000),
    };
    const p = computeProjectProfile(repo);
    expect(Number(p.medianFileTokens)).toBe(200);
  });

  it("p90_returns_90th_percentile", () => {
    const files = Array.from({ length: 10 }, (_, i) => entry(`f${i}.ts`, (i + 1) * 100));
    const repo: RepoMap = {
      root: ROOT,
      files,
      totalFiles: 10,
      totalTokens: toTokenCount(5500),
    };
    const p = computeProjectProfile(repo);
    expect(Number(p.p90FileTokens)).toBe(900);
  });

  it("profile_totals_match_repomap", () => {
    const repo: RepoMap = {
      root: ROOT,
      files: [entry("a.ts", 10), entry("b.ts", 20), entry("c.ts", 30)],
      totalFiles: 99,
      totalTokens: toTokenCount(12345),
    };
    const p = computeProjectProfile(repo);
    expect(p.totalFiles).toBe(99);
    expect(p.totalTokens).toBe(repo.totalTokens);
  });
});
