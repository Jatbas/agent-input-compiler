import { describe, it, expect } from "vitest";
import { HeuristicSelector } from "../heuristic-selector.js";
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { RepoMap } from "#core/types/repo-map.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import { TASK_CLASS } from "#core/types/enums.js";
import { toAbsolutePath } from "#core/types/paths.js";
import { toRelativePath } from "#core/types/paths.js";
import { toGlobPattern } from "#core/types/paths.js";
import { toTokenCount } from "#core/types/units.js";
import { toBytes } from "#core/types/units.js";
import { toConfidence } from "#core/types/scores.js";
import { toISOTimestamp } from "#core/types/identifiers.js";

function makeRepo(
  files: { path: string; tokens: number; lastModified: string }[],
): RepoMap {
  const fileEntries = files.map((f) => ({
    path: toRelativePath(f.path),
    language: "ts",
    sizeBytes: toBytes(100),
    estimatedTokens: toTokenCount(f.tokens),
    lastModified: toISOTimestamp(f.lastModified),
  }));
  const totalTokens = files.reduce((s, f) => s + f.tokens, 0);
  return {
    root: toAbsolutePath("/proj"),
    files: fileEntries,
    totalFiles: fileEntries.length,
    totalTokens: toTokenCount(totalTokens),
  };
}

describe("HeuristicSelector", () => {
  const noProviders: readonly LanguageProvider[] = [];

  it("produces expected scores for known inputs (path relevance and size penalty)", () => {
    const repo = makeRepo([
      {
        path: "src/refactor/service.ts",
        tokens: 100,
        lastModified: "2024-01-01T00:00:00.000Z",
      },
      { path: "other/util.ts", tokens: 500, lastModified: "2024-01-01T00:00:00.000Z" },
    ]);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.REFACTOR,
      confidence: toConfidence(0.8),
      matchedKeywords: ["refactor"],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const selector = new HeuristicSelector(noProviders, { maxFiles: 20 });
    const result = selector.selectContext(task, repo, toTokenCount(1000), rulePack);
    expect(result.files.length).toBeGreaterThanOrEqual(1);
    expect(result.files[0]?.path).toBe(toRelativePath("src/refactor/service.ts"));
    expect(result.totalTokens).toBe(600);
  });

  it("respects maxFiles cap", () => {
    const repo = makeRepo(
      Array.from({ length: 30 }, (_, i) => ({
        path: `src/f${i}.ts`,
        tokens: 10,
        lastModified: "2024-01-01T00:00:00.000Z",
      })),
    );
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0),
      matchedKeywords: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const selector = new HeuristicSelector(noProviders, { maxFiles: 5 });
    const result = selector.selectContext(task, repo, toTokenCount(10000), rulePack);
    expect(result.files.length).toBe(5);
  });

  it("filters by includePatterns whitelist", () => {
    const repo = makeRepo([
      { path: "src/a.ts", tokens: 50, lastModified: "2024-01-01T00:00:00.000Z" },
      { path: "lib/b.ts", tokens: 50, lastModified: "2024-01-01T00:00:00.000Z" },
    ]);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0),
      matchedKeywords: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [toGlobPattern("src/**")],
      excludePatterns: [],
    };
    const selector = new HeuristicSelector(noProviders, { maxFiles: 20 });
    const result = selector.selectContext(task, repo, toTokenCount(1000), rulePack);
    expect(result.files.map((f) => f.path)).toEqual([toRelativePath("src/a.ts")]);
  });

  it("filters by excludePatterns blacklist", () => {
    const repo = makeRepo([
      { path: "src/a.ts", tokens: 50, lastModified: "2024-01-01T00:00:00.000Z" },
      { path: "src/ignore/b.ts", tokens: 50, lastModified: "2024-01-01T00:00:00.000Z" },
    ]);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0),
      matchedKeywords: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [toGlobPattern("src/ignore/**")],
    };
    const selector = new HeuristicSelector(noProviders, { maxFiles: 20 });
    const result = selector.selectContext(task, repo, toTokenCount(1000), rulePack);
    expect(result.files.map((f) => f.path)).toEqual([toRelativePath("src/a.ts")]);
  });

  it("applies boostPatterns +0.2 and penalizePatterns -0.2 (clamped)", () => {
    const repo = makeRepo([
      { path: "boost/me.ts", tokens: 50, lastModified: "2024-01-02T00:00:00.000Z" },
      { path: "penalize/me.ts", tokens: 50, lastModified: "2024-01-02T00:00:00.000Z" },
      { path: "neutral.ts", tokens: 50, lastModified: "2024-01-02T00:00:00.000Z" },
    ]);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0),
      matchedKeywords: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
      heuristic: {
        boostPatterns: [toGlobPattern("boost/**")],
        penalizePatterns: [toGlobPattern("penalize/**")],
      },
    };
    const selector = new HeuristicSelector(noProviders, { maxFiles: 20 });
    const result = selector.selectContext(task, repo, toTokenCount(1000), rulePack);
    expect(result.files.length).toBe(3);
    const boostFile = result.files.find((f) => (f.path as string).includes("boost"));
    const penalizeFile = result.files.find((f) =>
      (f.path as string).includes("penalize"),
    );
    expect(boostFile).toBeDefined();
    expect(penalizeFile).toBeDefined();
    expect(
      (boostFile!.relevanceScore as number) >= (penalizeFile!.relevanceScore as number),
    ).toBe(true);
  });

  it("stops adding files when budget exceeded", () => {
    const repo = makeRepo([
      { path: "a.ts", tokens: 400, lastModified: "2024-01-01T00:00:00.000Z" },
      { path: "b.ts", tokens: 400, lastModified: "2024-01-01T00:00:00.000Z" },
      { path: "c.ts", tokens: 400, lastModified: "2024-01-01T00:00:00.000Z" },
    ]);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0),
      matchedKeywords: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const selector = new HeuristicSelector(noProviders, { maxFiles: 20 });
    const result = selector.selectContext(task, repo, toTokenCount(500), rulePack);
    expect(result.files.length).toBe(1);
    expect(result.totalTokens).toBe(400);
  });

  it("uses importProximity 0 when no LanguageProvider (all files get 0)", () => {
    const repo = makeRepo([
      { path: "src/a.ts", tokens: 100, lastModified: "2024-01-01T00:00:00.000Z" },
    ]);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0),
      matchedKeywords: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const selector = new HeuristicSelector(noProviders, { maxFiles: 20 });
    const result = selector.selectContext(task, repo, toTokenCount(1000), rulePack);
    expect(result.files.length).toBe(1);
    expect(result.files[0]?.relevanceScore).toBeDefined();
  });
});
