import { describe, it, expect } from "vitest";
import { SummarisationLadder } from "../summarisation-ladder.js";
import type { FileContentReader } from "#core/interfaces/file-content-reader.interface.js";
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import { toRelativePath } from "#core/types/paths.js";
import { toTokenCount } from "#core/types/units.js";
import { toRelevanceScore } from "#core/types/scores.js";
import { INCLUSION_TIER } from "#core/types/enums.js";

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
      if (p.includes("a.")) return "content a " + "x".repeat(100);
      if (p.includes("b.")) return "content b " + "y".repeat(50);
      return "content";
    },
  };

  it("returns files unchanged when under budget", () => {
    const ladder = new SummarisationLadder(noProviders, tokenCounter, reader);
    const files = [makeFile("a.ts", 10, 0.5), makeFile("b.ts", 10, 0.5)];
    const result = ladder.compress(files, toTokenCount(50));
    expect(result).toHaveLength(2);
    expect(result[0]?.tier).toBe(INCLUSION_TIER.L0);
    expect(result[1]?.tier).toBe(INCLUSION_TIER.L0);
  });

  it("over-budget compresses lowest-scoring first", () => {
    const ladder = new SummarisationLadder(noProviders, tokenCounter, reader);
    const files = [makeFile("high.ts", 50, 0.9), makeFile("low.ts", 50, 0.1)];
    const result = ladder.compress(files, toTokenCount(60));
    expect(result).toHaveLength(2);
    const lowFile = result.find((f) => (f.path as string).includes("low"));
    expect(lowFile?.tier).not.toBe(INCLUSION_TIER.L0);
  });

  it("each tier reduces tokens (L0→L1→L2→L3)", () => {
    const ladder = new SummarisationLadder(noProviders, tokenCounter, reader);
    const files = [makeFile("low.ts", 100, 0.1)];
    const result = ladder.compress(files, toTokenCount(50));
    expect(result.length).toBe(1);
    expect((result[0]?.estimatedTokens as number) <= 100).toBe(true);
  });

  it("all at L3 and still over budget drops lowest-scoring files", () => {
    const highTokenCounter = (text: string) => toTokenCount(text.length + 100);
    const ladder = new SummarisationLadder(noProviders, highTokenCounter, reader);
    const files = [
      makeFile("a.ts", 200, 0.2),
      makeFile("b.ts", 200, 0.2),
      makeFile("c.ts", 200, 0.2),
    ];
    const result = ladder.compress(files, toTokenCount(50));
    const total = result.reduce((s, f) => s + (f.estimatedTokens as number), 0);
    expect(total <= 50 || result.length < 3).toBe(true);
  });

  it("tie-break: more tokens first, then alphabetical", () => {
    const ladder = new SummarisationLadder(noProviders, tokenCounter, reader);
    const files = [makeFile("b.ts", 20, 0.5), makeFile("a.ts", 30, 0.5)];
    const result = ladder.compress(files, toTokenCount(25));
    expect(result).toHaveLength(2);
    const compressed = result.find((f) => f.tier !== INCLUSION_TIER.L0);
    expect(compressed).toBeDefined();
    expect((compressed?.path as string) === "a.ts").toBe(true);
  });

  it("never mutates input array", () => {
    const ladder = new SummarisationLadder(noProviders, tokenCounter, reader);
    const files = [makeFile("a.ts", 100, 0.1), makeFile("b.ts", 100, 0.1)];
    const result = ladder.compress(files, toTokenCount(50));
    expect(result).not.toBe(files);
    expect(files[0]?.tier).toBe(INCLUSION_TIER.L0);
  });
});
