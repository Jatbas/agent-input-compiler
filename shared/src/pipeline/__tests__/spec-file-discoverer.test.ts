import { describe, it, expect } from "vitest";
import { SpecFileDiscoverer } from "../spec-file-discoverer.js";
import { toAbsolutePath, toRelativePath, toGlobPattern } from "#core/types/paths.js";
import { toTokenCount, toBytes } from "#core/types/units.js";
import { toISOTimestamp } from "#core/types/identifiers.js";
import { toConfidence } from "#core/types/scores.js";
import type { RepoMap, FileEntry } from "#core/types/repo-map.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { RulePack } from "#core/types/rule-pack.js";
import { TASK_CLASS } from "#core/types/enums.js";

const ROOT = toAbsolutePath("/repo");

function fileEntry(
  path: string,
  tokens: number,
  lastModified: string = "2026-01-01T12:00:00.000Z",
): FileEntry {
  return {
    path: toRelativePath(path),
    language: "md",
    sizeBytes: toBytes(tokens * 4),
    estimatedTokens: toTokenCount(tokens),
    lastModified: toISOTimestamp(lastModified),
  };
}

function repoMap(files: readonly FileEntry[]): RepoMap {
  const total = files.reduce((sum, f) => sum + f.estimatedTokens, 0);
  return {
    root: ROOT,
    files,
    totalFiles: files.length,
    totalTokens: toTokenCount(total),
  };
}

describe("SpecFileDiscoverer", () => {
  it("empty_spec_repo_returns_empty_result", () => {
    const discoverer = new SpecFileDiscoverer();
    const specRepoMap = repoMap([]);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0.5),
      matchedKeywords: [],
      subjectTokens: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const result = discoverer.discover(specRepoMap, task, rulePack);
    expect(result.files.length).toBe(0);
    expect(result.totalTokens).toBe(toTokenCount(0));
    expect(result.truncated).toBe(false);
  });

  it("exclude_patterns_filter_spec_files", () => {
    const discoverer = new SpecFileDiscoverer();
    const files: readonly FileEntry[] = [
      fileEntry("documentation/a.md", 10),
      fileEntry("documentation/b.md", 20),
      fileEntry(".cursor/rules/foo.mdc", 15),
    ];
    const specRepoMap = repoMap(files);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0.5),
      matchedKeywords: [],
      subjectTokens: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [toGlobPattern(".cursor/rules/*")],
    };
    const result = discoverer.discover(specRepoMap, task, rulePack);
    expect(result.files).toHaveLength(2);
    expect(result.files.map((f) => f.path)).not.toContainEqual(
      toRelativePath(".cursor/rules/foo.mdc"),
    );
  });

  it("include_patterns_filter_spec_files", () => {
    const discoverer = new SpecFileDiscoverer();
    const files: readonly FileEntry[] = [
      fileEntry("documentation/a.md", 10),
      fileEntry("documentation/b.md", 20),
      fileEntry("other/readme.md", 5),
    ];
    const specRepoMap = repoMap(files);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0.5),
      matchedKeywords: [],
      subjectTokens: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [toGlobPattern("documentation/*.md")],
      excludePatterns: [],
    };
    const result = discoverer.discover(specRepoMap, task, rulePack);
    expect(result.files).toHaveLength(2);
    expect(result.files.every((f) => f.path.startsWith("documentation/"))).toBe(true);
  });

  it("keyword_match_filters_when_no_include", () => {
    const discoverer = new SpecFileDiscoverer();
    const files: readonly FileEntry[] = [
      fileEntry("doc/a.md", 10),
      fileEntry("doc/plan.md", 20),
    ];
    const specRepoMap = repoMap(files);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0.5),
      matchedKeywords: ["plan"],
      subjectTokens: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const result = discoverer.discover(specRepoMap, task, rulePack);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe(toRelativePath("doc/plan.md"));
  });

  it("spec_path_tier_orders_adr_above_doc", () => {
    const discoverer = new SpecFileDiscoverer();
    const files: readonly FileEntry[] = [
      fileEntry("documentation/other.md", 50),
      fileEntry("documentation/adr-001.md", 50),
    ];
    const specRepoMap = repoMap(files);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0.5),
      matchedKeywords: [],
      subjectTokens: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const result = discoverer.discover(specRepoMap, task, rulePack);
    expect(result.files).toHaveLength(2);
    const adrFirst = result.files[0]?.path === toRelativePath("documentation/adr-001.md");
    expect(adrFirst).toBe(true);
    expect(result.files[0]?.relevanceScore).toBeGreaterThanOrEqual(
      result.files[1]?.relevanceScore ?? 0,
    );
  });

  it("recency_and_size_affect_score", () => {
    const discoverer = new SpecFileDiscoverer();
    const files: readonly FileEntry[] = [
      fileEntry("documentation/same.md", 200, "2026-01-01T10:00:00.000Z"),
      fileEntry("documentation/same.md", 50, "2026-01-01T12:00:00.000Z"),
    ];
    const specRepoMap = repoMap(files);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0.5),
      matchedKeywords: [],
      subjectTokens: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const result = discoverer.discover(specRepoMap, task, rulePack);
    expect(result.files).toHaveLength(2);
    const first = result.files[0];
    const second = result.files[1];
    expect(first?.estimatedTokens).toBe(toTokenCount(50));
    expect(second?.estimatedTokens).toBe(toTokenCount(200));
    expect(first?.relevanceScore).toBeGreaterThanOrEqual(second?.relevanceScore ?? 0);
  });

  it("boost_and_penalize_patterns_affect_score", () => {
    const discoverer = new SpecFileDiscoverer();
    const files: readonly FileEntry[] = [
      fileEntry("documentation/neutral.md", 100),
      fileEntry("documentation/boosted.md", 100),
      fileEntry("documentation/penalized.md", 100),
    ];
    const specRepoMap = repoMap(files);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0.5),
      matchedKeywords: [],
      subjectTokens: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
      heuristic: {
        boostPatterns: [toGlobPattern("**/boosted.md")],
        penalizePatterns: [toGlobPattern("**/penalized.md")],
      },
    };
    const result = discoverer.discover(specRepoMap, task, rulePack);
    expect(result.files).toHaveLength(3);
    const boosted = result.files.find((f) => f.path.endsWith("boosted.md"));
    const penalized = result.files.find((f) => f.path.endsWith("penalized.md"));
    const neutral = result.files.find((f) => f.path.endsWith("neutral.md"));
    expect(boosted?.relevanceScore).toBeGreaterThan(neutral?.relevanceScore ?? 0);
    expect(penalized?.relevanceScore).toBeLessThan(neutral?.relevanceScore ?? 1);
  });

  it("no_mutation_of_inputs", () => {
    const discoverer = new SpecFileDiscoverer();
    const files: readonly FileEntry[] = [
      fileEntry("documentation/a.md", 10),
      fileEntry("documentation/b.md", 20),
    ];
    const specRepoMap = repoMap(files);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0.5),
      matchedKeywords: [],
      subjectTokens: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const result1 = discoverer.discover(specRepoMap, task, rulePack);
    const result2 = discoverer.discover(specRepoMap, task, rulePack);
    expect(result1.files.length).toBe(result2.files.length);
    expect(result1.totalTokens).toBe(result2.totalTokens);
    expect(result1.files.map((f) => f.path)).toEqual(result2.files.map((f) => f.path));
    expect(specRepoMap.files).toBe(files);
  });
});
