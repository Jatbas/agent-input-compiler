// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { SymbolRelevanceScorer } from "../symbol-relevance-scorer.js";
import type { FileContentReader } from "@jatbas/aic-shared/core/interfaces/file-content-reader.interface.js";
import type { LanguageProvider } from "@jatbas/aic-shared/core/interfaces/language-provider.interface.js";
import type { RepoMap } from "@jatbas/aic-shared/core/types/repo-map.js";
import type { TaskClassification } from "@jatbas/aic-shared/core/types/task-classification.js";
import type { ExportedSymbol } from "@jatbas/aic-shared/core/types/exported-symbol.js";
import {
  toRelativePath,
  toAbsolutePath,
  toFileExtension,
} from "@jatbas/aic-shared/core/types/paths.js";
import { toTokenCount, toBytes } from "@jatbas/aic-shared/core/types/units.js";
import { toISOTimestamp } from "@jatbas/aic-shared/core/types/identifiers.js";
import { toConfidence } from "@jatbas/aic-shared/core/types/scores.js";
import { TASK_CLASS, SYMBOL_KIND } from "@jatbas/aic-shared/core/types/enums.js";

function makeEntry(path: string, tokens = 100): RepoMap["files"][number] {
  return {
    path: toRelativePath(path),
    language: "ts",
    sizeBytes: toBytes(tokens * 4),
    estimatedTokens: toTokenCount(tokens),
    lastModified: toISOTimestamp("2026-01-01T00:00:00.000Z"),
  };
}

function makeRepo(files: RepoMap["files"], root = "/repo"): RepoMap {
  const totalTokens = files.reduce((sum, f) => sum + f.estimatedTokens, 0);
  return {
    root: toAbsolutePath(root),
    files,
    totalFiles: files.length,
    totalTokens: toTokenCount(totalTokens),
  };
}

function makeTask(
  matchedKeywords: readonly string[],
  subjectTokens: readonly string[],
): TaskClassification {
  return {
    taskClass: TASK_CLASS.GENERAL,
    confidence: toConfidence(0.5),
    matchedKeywords,
    subjectTokens,
  };
}

describe("SymbolRelevanceScorer", () => {
  it("symbol_relevance_empty_repo", async () => {
    const reader: FileContentReader = { getContent: () => Promise.resolve("") };
    const providers: readonly LanguageProvider[] = [];
    const scorer = new SymbolRelevanceScorer(reader, providers);
    const repo = makeRepo([]);
    const task = makeTask([], ["auth"]);
    const scores = await scorer.getScores(repo, task);
    expect(scores.size).toBe(0);
  });

  it("symbol_relevance_no_subject_tokens_all_zero", async () => {
    const reader: FileContentReader = {
      getContent: () => Promise.resolve("export class Foo {}"),
    };
    const provider: LanguageProvider = {
      id: "ts",
      extensions: [toFileExtension(".ts")],
      parseImports: () => [],
      extractSignaturesWithDocs: () => [],
      extractSignaturesOnly: () => [],
      extractNames: () => [{ name: "Foo", kind: SYMBOL_KIND.CLASS }],
    };
    const scorer = new SymbolRelevanceScorer(reader, [provider]);
    const repo = makeRepo([makeEntry("src/foo.ts")]);
    const task = makeTask([], []);
    const scores = await scorer.getScores(repo, task);
    expect(scores.get(toRelativePath("src/foo.ts"))).toBe(0);
  });

  it("symbol_relevance_matching_symbols_boost_score", async () => {
    const reader: FileContentReader = {
      getContent: () => Promise.resolve("export class AuthService {}"),
    };
    const authSymbol: ExportedSymbol = {
      name: "AuthService",
      kind: SYMBOL_KIND.CLASS,
    };
    const provider: LanguageProvider = {
      id: "ts",
      extensions: [toFileExtension(".ts")],
      parseImports: () => [],
      extractSignaturesWithDocs: () => [],
      extractSignaturesOnly: () => [],
      extractNames: () => [authSymbol],
    };
    const scorer = new SymbolRelevanceScorer(reader, [provider]);
    const repo = makeRepo([makeEntry("src/auth.ts")]);
    const task = makeTask([], ["auth"]);
    const scores = await scorer.getScores(repo, task);
    const score = scores.get(toRelativePath("src/auth.ts"));
    expect(score).toBeGreaterThan(0);
    expect(score).toBe(1);
  });

  it("symbol_relevance_no_provider_zero_score", async () => {
    const reader: FileContentReader = {
      getContent: () => Promise.resolve("content"),
    };
    const provider: LanguageProvider = {
      id: "ts",
      extensions: [toFileExtension(".ts")],
      parseImports: () => [],
      extractSignaturesWithDocs: () => [],
      extractSignaturesOnly: () => [],
      extractNames: () => [],
    };
    const scorer = new SymbolRelevanceScorer(reader, [provider]);
    const repo = makeRepo([makeEntry("readme.md")]);
    const task = makeTask([], ["readme"]);
    const scores = await scorer.getScores(repo, task);
    expect(scores.get(toRelativePath("readme.md"))).toBe(0);
  });

  it("symbol_relevance_read_error_skipped", async () => {
    const goodPath = toRelativePath("src/good.ts");
    const badPath = toRelativePath("src/bad.ts");
    const reader: FileContentReader = {
      getContent: (path) => {
        if (path === badPath) return Promise.reject(new Error("read error"));
        return Promise.resolve("export class AuthHelper {}");
      },
    };
    const provider: LanguageProvider = {
      id: "ts",
      extensions: [toFileExtension(".ts")],
      parseImports: () => [],
      extractSignaturesWithDocs: () => [],
      extractSignaturesOnly: () => [],
      extractNames: (content) =>
        content.includes("AuthHelper")
          ? [{ name: "AuthHelper", kind: SYMBOL_KIND.CLASS }]
          : [],
    };
    const scorer = new SymbolRelevanceScorer(reader, [provider]);
    const repo = makeRepo([makeEntry("src/good.ts"), makeEntry("src/bad.ts")]);
    const task = makeTask([], ["auth"]);
    const scores = await scorer.getScores(repo, task);
    expect(scores.get(badPath)).toBe(0);
    expect(scores.get(goodPath)).toBeGreaterThan(0);
  });
});
