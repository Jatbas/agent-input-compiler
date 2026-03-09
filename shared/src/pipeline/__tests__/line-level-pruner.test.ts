// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { LineLevelPruner } from "../line-level-pruner.js";
import type { TokenCounter } from "@jatbas/aic-core/core/interfaces/token-counter.interface.js";
import type { FileContentReader } from "@jatbas/aic-core/core/interfaces/file-content-reader.interface.js";
import type { SelectedFile } from "@jatbas/aic-core/core/types/selected-file.js";
import type { RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { toRelevanceScore } from "@jatbas/aic-core/core/types/scores.js";
import { INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";

function makeFile(
  path: string,
  content: string,
  tier: keyof typeof INCLUSION_TIER = "L0",
): SelectedFile {
  return {
    path: toRelativePath(path),
    language: "ts",
    estimatedTokens: toTokenCount(content.length),
    relevanceScore: toRelevanceScore(0.5),
    tier: INCLUSION_TIER[tier],
    resolvedContent: content,
  };
}

describe("LineLevelPruner", () => {
  it("prune_when_non_L0_tier_returns_unchanged", async () => {
    const tokenCounter: TokenCounter = { countTokens: (t) => toTokenCount(t.length) };
    const fileContentReader: FileContentReader = {
      getContent: () => Promise.resolve(""),
    };
    const pruner = new LineLevelPruner(tokenCounter, fileContentReader);
    const l1 = makeFile("a.ts", "line1\nline2", "L1");
    const l2 = makeFile("b.ts", "line1\nline2", "L2");
    const files: readonly SelectedFile[] = [l1, l2];
    const result = await pruner.prune(files, ["auth"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(l1);
    expect(result[1]).toEqual(l2);
  });

  it("prune_when_subjectTokens_empty_returns_unchanged", async () => {
    const tokenCounter: TokenCounter = { countTokens: (t) => toTokenCount(t.length) };
    const fileContentReader: FileContentReader = {
      getContent: () => Promise.resolve(""),
    };
    const pruner = new LineLevelPruner(tokenCounter, fileContentReader);
    const content = "auth line\nother";
    const f = makeFile("a.ts", content);
    const files: readonly SelectedFile[] = [f];
    const result = await pruner.prune(files, []);
    expect(result).toHaveLength(1);
    expect(result[0]?.resolvedContent).toBe(content);
  });

  it("prune_keeps_lines_matching_subject_token", async () => {
    const tokenCounter: TokenCounter = { countTokens: (t) => toTokenCount(t.length) };
    const fileContentReader: FileContentReader = {
      getContent: () => Promise.resolve(""),
    };
    const pruner = new LineLevelPruner(tokenCounter, fileContentReader);
    const content = "function login() { }\nauth middleware here\n";
    const f = makeFile("a.ts", content);
    const result = await pruner.prune([f], ["auth"]);
    expect(result).toHaveLength(1);
    expect(result[0]?.resolvedContent).toContain("auth middleware here");
  });

  it("prune_removes_lines_matching_no_token", async () => {
    const tokenCounter: TokenCounter = { countTokens: (t) => toTokenCount(t.length) };
    const fileContentReader: FileContentReader = {
      getContent: () => Promise.resolve(""),
    };
    const pruner = new LineLevelPruner(tokenCounter, fileContentReader);
    const content = "auth line\nnext\nunrelated code far away\n";
    const f = makeFile("a.ts", content);
    const result = await pruner.prune([f], ["auth"]);
    expect(result).toHaveLength(1);
    const out = result[0]?.resolvedContent ?? "";
    expect(out).not.toContain("unrelated code far away");
  });

  it("prune_keeps_syntax_only_lines", async () => {
    const tokenCounter: TokenCounter = { countTokens: (t) => toTokenCount(t.length) };
    const fileContentReader: FileContentReader = {
      getContent: () => Promise.resolve(""),
    };
    const pruner = new LineLevelPruner(tokenCounter, fileContentReader);
    const content = "  }  \n);\nauth match\n";
    const f = makeFile("a.ts", content);
    const result = await pruner.prune([f], ["auth"]);
    expect(result).toHaveLength(1);
    const out = result[0]?.resolvedContent ?? "";
    expect(out).toContain("  }  ");
    expect(out).toContain(");");
  });

  it("prune_keeps_structural_keyword_lines", async () => {
    const tokenCounter: TokenCounter = { countTokens: (t) => toTokenCount(t.length) };
    const fileContentReader: FileContentReader = {
      getContent: () => Promise.resolve(""),
    };
    const pruner = new LineLevelPruner(tokenCounter, fileContentReader);
    const content = "  return result;\n  break;\n  throw new Error('x');\n";
    const f = makeFile("a.ts", content);
    const result = await pruner.prune([f], ["zzz"]);
    expect(result).toHaveLength(1);
    const out = result[0]?.resolvedContent ?? "";
    expect(out).toContain("  return result;");
    expect(out).toContain("  break;");
    expect(out).toContain("  throw new Error('x');");
  });

  it("prune_keeps_context_window", async () => {
    const tokenCounter: TokenCounter = { countTokens: (t) => toTokenCount(t.length) };
    const fileContentReader: FileContentReader = {
      getContent: () => Promise.resolve(""),
    };
    const pruner = new LineLevelPruner(tokenCounter, fileContentReader);
    const content = "before\nline with auth\nafter";
    const f = makeFile("a.ts", content);
    const result = await pruner.prune([f], ["auth"]);
    expect(result).toHaveLength(1);
    const out = result[0]?.resolvedContent ?? "";
    expect(out).toContain("before");
    expect(out).toContain("line with auth");
    expect(out).toContain("after");
  });

  it("prune_reads_from_disk_when_no_resolvedContent", async () => {
    const pathA = toRelativePath("a.ts");
    const contentMap = new Map<RelativePath, string>();
    contentMap.set(pathA, "disk line\nauth here\n");
    const tokenCounter: TokenCounter = { countTokens: (t) => toTokenCount(t.length) };
    const fileContentReader: FileContentReader = {
      getContent: (path: RelativePath) => Promise.resolve(contentMap.get(path) ?? ""),
    };
    const pruner = new LineLevelPruner(tokenCounter, fileContentReader);
    const base = makeFile("a.ts", "");
    const { resolvedContent: _r, ...rest } = base;
    const f: SelectedFile = { ...rest };
    const result = await pruner.prune([f], ["auth"]);
    expect(result).toHaveLength(1);
    expect(result[0]?.resolvedContent).toContain("auth here");
  });

  it("prune_updates_estimatedTokens", async () => {
    const fixedCount = toTokenCount(99);
    const tokenCounter: TokenCounter = {
      countTokens: () => fixedCount,
    };
    const fileContentReader: FileContentReader = {
      getContent: () => Promise.resolve(""),
    };
    const pruner = new LineLevelPruner(tokenCounter, fileContentReader);
    const f = makeFile("a.ts", "auth line");
    const result = await pruner.prune([f], ["auth"]);
    expect(result).toHaveLength(1);
    expect(result[0]?.estimatedTokens).toBe(fixedCount);
  });

  it("prune_no_mutation", async () => {
    const tokenCounter: TokenCounter = { countTokens: (t) => toTokenCount(t.length) };
    const fileContentReader: FileContentReader = {
      getContent: () => Promise.resolve(""),
    };
    const pruner = new LineLevelPruner(tokenCounter, fileContentReader);
    const f = makeFile("a.ts", "auth\nx");
    const files: readonly SelectedFile[] = [f];
    const r1 = await pruner.prune(files, ["auth"]);
    const r2 = await pruner.prune(files, ["auth"]);
    expect(r1).toEqual(r2);
  });
});
