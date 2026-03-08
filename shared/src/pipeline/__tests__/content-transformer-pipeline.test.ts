// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { ContentTransformerPipeline } from "../content-transformer-pipeline.js";
import { WhitespaceNormalizer } from "../whitespace-normalizer.js";
import { JsonCompactor } from "../json-compactor.js";
import type { FileContentReader } from "#core/interfaces/file-content-reader.interface.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import { toRelativePath } from "#core/types/paths.js";
import { toTokenCount } from "#core/types/units.js";
import { toRelevanceScore } from "#core/types/scores.js";
import { INCLUSION_TIER } from "#core/types/enums.js";

function makeFile(path: string, estimatedTokens: number): SelectedFile {
  return {
    path: toRelativePath(path),
    language: "ts",
    estimatedTokens: toTokenCount(estimatedTokens),
    relevanceScore: toRelevanceScore(0.5),
    tier: INCLUSION_TIER.L0,
  };
}

function tokenCounter(text: string): ReturnType<typeof toTokenCount> {
  return toTokenCount(Math.ceil(text.length / 4));
}

describe("ContentTransformerPipeline", () => {
  it("runs format-specific before non-format", async () => {
    const reader: FileContentReader = {
      getContent: () => Promise.resolve('{"a": 1, "b": 2}'),
    };
    const pipeline = new ContentTransformerPipeline(
      [new JsonCompactor(), new WhitespaceNormalizer()],
      reader,
      tokenCounter,
    );
    const files = [makeFile("x.json", 100)];
    const result = await pipeline.transform(files, {
      directTargetPaths: [],
      rawMode: false,
    });
    expect(result.metadata[0]?.transformersApplied).toContain("json-compactor");
    expect(result.metadata[0]?.transformersApplied).toContain("whitespace-normalizer");
  });

  it("rawMode skips all transformers", async () => {
    const reader: FileContentReader = {
      getContent: () => Promise.resolve('{"a": 1}'),
    };
    const pipeline = new ContentTransformerPipeline(
      [new JsonCompactor()],
      reader,
      tokenCounter,
    );
    const files = [makeFile("x.json", 10)];
    const result = await pipeline.transform(files, {
      directTargetPaths: [],
      rawMode: true,
    });
    expect(result.metadata[0]?.transformersApplied).toEqual([]);
    expect(result.metadata[0]?.originalTokens).toBe(
      result.metadata[0]?.transformedTokens,
    );
  });

  it("directTargetPaths skips format-specific only", async () => {
    const reader: FileContentReader = {
      getContent: (path) =>
        Promise.resolve((path as string).endsWith(".json") ? '{"x":1}' : "  code  "),
    };
    const pipeline = new ContentTransformerPipeline(
      [new JsonCompactor(), new WhitespaceNormalizer()],
      reader,
      tokenCounter,
    );
    const files = [makeFile("target.json", 10), makeFile("other.json", 10)];
    const result = await pipeline.transform(files, {
      directTargetPaths: [toRelativePath("target.json")],
      rawMode: false,
    });
    const metaTarget = result.metadata.find(
      (m: { filePath: string }) => m.filePath === "target.json",
    );
    const metaOther = result.metadata.find(
      (m: { filePath: string }) => m.filePath === "other.json",
    );
    expect(metaTarget?.transformersApplied).not.toContain("json-compactor");
    expect(metaTarget?.transformersApplied).toContain("whitespace-normalizer");
    expect(metaOther?.transformersApplied).toContain("json-compactor");
  });

  it("first extension match wins (one format-specific per file)", async () => {
    const reader: FileContentReader = {
      getContent: () => Promise.resolve("[]"),
    };
    const pipeline = new ContentTransformerPipeline(
      [new JsonCompactor(), new WhitespaceNormalizer()],
      reader,
      tokenCounter,
    );
    const files = [makeFile("a.json", 5)];
    const result = await pipeline.transform(files, {
      directTargetPaths: [],
      rawMode: false,
    });
    const formatCount = result.metadata[0]?.transformersApplied.filter(
      (id: string) => id === "json-compactor",
    ).length;
    expect(formatCount).toBe(1);
  });

  it("metadata records correct before/after tokens", async () => {
    const content = '{"a": 1, "b": 2, "c": 3}';
    const reader: FileContentReader = {
      getContent: () => Promise.resolve(content),
    };
    const pipeline = new ContentTransformerPipeline(
      [new JsonCompactor()],
      reader,
      tokenCounter,
    );
    const files = [makeFile("x.json", 100)];
    const result = await pipeline.transform(files, {
      directTargetPaths: [],
      rawMode: false,
    });
    const orig = result.metadata[0]?.originalTokens as number;
    const trans = result.metadata[0]?.transformedTokens as number;
    expect(orig).toBeGreaterThanOrEqual(trans);
    expect(result.files[0]?.estimatedTokens).toBe(trans);
  });
});
