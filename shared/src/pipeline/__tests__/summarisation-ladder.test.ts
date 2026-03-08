// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { SummarisationLadder } from "../summarisation-ladder.js";
import type { FileContentReader } from "#core/interfaces/file-content-reader.interface.js";
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { CodeChunk } from "#core/types/code-chunk.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import { toRelativePath, toFileExtension } from "#core/types/paths.js";
import { toTokenCount, toLineNumber } from "#core/types/units.js";
import { toRelevanceScore } from "#core/types/scores.js";
import { INCLUSION_TIER, SYMBOL_TYPE } from "#core/types/enums.js";

function makeFile(
  path: string,
  tokens: number,
  score: number,
  tier: keyof typeof INCLUSION_TIER = "L0",
): SelectedFile {
  return {
    path: toRelativePath(path),
    language: "ts",
    estimatedTokens: toTokenCount(tokens),
    relevanceScore: toRelevanceScore(score),
    tier: INCLUSION_TIER[tier],
  };
}

describe("SummarisationLadder", () => {
  const noProviders: readonly LanguageProvider[] = [];
  const tokenCounter = (text: string) => toTokenCount(text.length);
  const reader: FileContentReader = {
    getContent: (path) => {
      const p = path as string;
      if (p.includes("a.")) return Promise.resolve("content a " + "x".repeat(100));
      if (p.includes("b.")) return Promise.resolve("content b " + "y".repeat(50));
      return Promise.resolve("content");
    },
  };

  it("returns files unchanged when under budget", async () => {
    const ladder = new SummarisationLadder(noProviders, tokenCounter, reader);
    const files = [makeFile("a.ts", 10, 0.5), makeFile("b.ts", 10, 0.5)];
    const result = await ladder.compress(files, toTokenCount(50));
    expect(result).toHaveLength(2);
    expect(result[0]?.tier).toBe(INCLUSION_TIER.L0);
    expect(result[1]?.tier).toBe(INCLUSION_TIER.L0);
  });

  it("over-budget compresses lowest-scoring first", async () => {
    const ladder = new SummarisationLadder(noProviders, tokenCounter, reader);
    const files = [makeFile("high.ts", 50, 0.9), makeFile("low.ts", 50, 0.1)];
    const result = await ladder.compress(files, toTokenCount(60));
    expect(result).toHaveLength(2);
    const lowFile = result.find((f) => (f.path as string).includes("low"));
    expect(lowFile?.tier).not.toBe(INCLUSION_TIER.L0);
  });

  it("each tier reduces tokens (L0→L1→L2→L3)", async () => {
    const ladder = new SummarisationLadder(noProviders, tokenCounter, reader);
    const files = [makeFile("low.ts", 100, 0.1)];
    const result = await ladder.compress(files, toTokenCount(50));
    expect(result.length).toBe(1);
    expect((result[0]?.estimatedTokens as number) <= 100).toBe(true);
  });

  it("all at L3 and still over budget drops lowest-scoring files", async () => {
    const highTokenCounter = (text: string) => toTokenCount(text.length + 100);
    const ladder = new SummarisationLadder(noProviders, highTokenCounter, reader);
    const files = [
      makeFile("a.ts", 200, 0.2),
      makeFile("b.ts", 200, 0.2),
      makeFile("c.ts", 200, 0.2),
    ];
    const result = await ladder.compress(files, toTokenCount(50));
    const total = result.reduce((s, f) => s + (f.estimatedTokens as number), 0);
    expect(total <= 50 || result.length < 3).toBe(true);
  });

  it("tie-break: more tokens first, then alphabetical", async () => {
    const ladder = new SummarisationLadder(noProviders, tokenCounter, reader);
    const files = [makeFile("b.ts", 20, 0.5), makeFile("a.ts", 30, 0.5)];
    const result = await ladder.compress(files, toTokenCount(25));
    expect(result).toHaveLength(2);
    const compressed = result.find((f) => f.tier !== INCLUSION_TIER.L0);
    expect(compressed).toBeDefined();
    expect((compressed?.path as string) === "a.ts").toBe(true);
  });

  it("never mutates input array", async () => {
    const ladder = new SummarisationLadder(noProviders, tokenCounter, reader);
    const files = [makeFile("a.ts", 100, 0.1), makeFile("b.ts", 100, 0.1)];
    const result = await ladder.compress(files, toTokenCount(50));
    expect(result).not.toBe(files);
    expect(files[0]?.tier).toBe(INCLUSION_TIER.L0);
  });

  it("chunk_level_when_subjectTokens_match_sets_resolvedContent", async () => {
    const fullAuth = "full auth body content";
    const fullUtil = "full util body content";
    const sigAuth = "auth signature";
    const sigUtil = "util signature";
    const path = toRelativePath("src/auth.ts");
    const chunk = (name: string, content: string): CodeChunk => ({
      filePath: path,
      symbolName: name,
      symbolType: SYMBOL_TYPE.FUNCTION,
      startLine: toLineNumber(1),
      endLine: toLineNumber(10),
      content,
      tokenCount: toTokenCount(content.length),
    });
    const provider: LanguageProvider = {
      id: "test-ts",
      extensions: [toFileExtension(".ts")],
      parseImports: () => [],
      extractSignaturesWithDocs: () => [chunk("auth", fullAuth), chunk("util", fullUtil)],
      extractSignaturesOnly: () => [chunk("auth", sigAuth), chunk("util", sigUtil)],
      extractNames: () => [],
    };
    const readerWithContent: FileContentReader = {
      getContent: () => Promise.resolve("file content"),
    };
    const ladder = new SummarisationLadder([provider], tokenCounter, readerWithContent);
    const files = [makeFile("src/auth.ts", 100, 0.5)];
    const result = await ladder.compress(files, toTokenCount(500), ["auth"]);
    expect(result).toHaveLength(1);
    const file = result[0];
    expect(file?.resolvedContent).toBeDefined();
    expect(file?.resolvedContent).toContain(fullAuth);
    expect(file?.resolvedContent).toContain(sigUtil);
    expect(file?.resolvedContent).not.toContain(fullUtil);
    const expectedTokens = tokenCounter(file?.resolvedContent ?? "");
    expect(file?.estimatedTokens).toBe(expectedTokens);
  });

  it("chunk_level_when_subjectTokens_empty_no_resolvedContent", async () => {
    const path = toRelativePath("src/a.ts");
    const chunk = (name: string, content: string): CodeChunk => ({
      filePath: path,
      symbolName: name,
      symbolType: SYMBOL_TYPE.FUNCTION,
      startLine: toLineNumber(1),
      endLine: toLineNumber(5),
      content,
      tokenCount: toTokenCount(content.length),
    });
    const provider: LanguageProvider = {
      id: "test-ts",
      extensions: [toFileExtension(".ts")],
      parseImports: () => [],
      extractSignaturesWithDocs: () => [chunk("foo", "body")],
      extractSignaturesOnly: () => [chunk("foo", "sig")],
      extractNames: () => [],
    };
    const readerWithContent: FileContentReader = {
      getContent: () => Promise.resolve("content"),
    };
    const ladder = new SummarisationLadder([provider], tokenCounter, readerWithContent);
    const files = [makeFile("src/a.ts", 100, 0.5)];
    const resultEmpty = await ladder.compress(files, toTokenCount(500), []);
    const resultUndef = await ladder.compress(files, toTokenCount(500));
    expect(resultEmpty.every((f) => f.resolvedContent === undefined)).toBe(true);
    expect(resultUndef.every((f) => f.resolvedContent === undefined)).toBe(true);
  });

  it("chunk_level_file_without_provider_no_resolvedContent", async () => {
    const path = toRelativePath("src/a.ts");
    const chunk = (name: string, content: string): CodeChunk => ({
      filePath: path,
      symbolName: name,
      symbolType: SYMBOL_TYPE.FUNCTION,
      startLine: toLineNumber(1),
      endLine: toLineNumber(5),
      content,
      tokenCount: toTokenCount(content.length),
    });
    const provider: LanguageProvider = {
      id: "ts-only",
      extensions: [toFileExtension(".ts")],
      parseImports: () => [],
      extractSignaturesWithDocs: () => [chunk("x", "y")],
      extractSignaturesOnly: () => [chunk("x", "y")],
      extractNames: () => [],
    };
    const readerWithContent: FileContentReader = {
      getContent: () => Promise.resolve("content"),
    };
    const ladder = new SummarisationLadder([provider], tokenCounter, readerWithContent);
    const tsFile = makeFile("src/a.ts", 50, 0.5);
    const xyzFile = makeFile("file.xyz", 50, 0.5);
    const result = await ladder.compress([tsFile, xyzFile], toTokenCount(500), ["x"]);
    expect(result).toHaveLength(2);
    const tsResult = result.find((f) => (f.path as string).endsWith(".ts"));
    const xyzResult = result.find((f) => (f.path as string).endsWith(".xyz"));
    expect(tsResult?.resolvedContent).toBeDefined();
    expect(xyzResult?.resolvedContent).toBeUndefined();
  });
});
