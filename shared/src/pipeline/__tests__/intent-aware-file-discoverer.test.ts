// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { toAbsolutePath, toRelativePath, toGlobPattern } from "#core/types/paths.js";
import { toTokenCount, toBytes } from "#core/types/units.js";
import { toISOTimestamp } from "#core/types/identifiers.js";
import { toConfidence } from "#core/types/scores.js";
import type { RepoMap, FileEntry } from "#core/types/repo-map.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { RulePack } from "#core/types/rule-pack.js";
import { TASK_CLASS } from "#core/types/enums.js";
import { IntentAwareFileDiscoverer } from "../intent-aware-file-discoverer.js";

const ROOT = toAbsolutePath("/repo");
const TS = toISOTimestamp("2026-01-01T00:00:00.000Z");

function fileEntry(path: string, tokens: number): FileEntry {
  return {
    path: toRelativePath(path),
    language: "ts",
    sizeBytes: toBytes(tokens * 4),
    estimatedTokens: toTokenCount(tokens),
    lastModified: TS,
  };
}

function repoMap(files: readonly FileEntry[]): RepoMap {
  const totalTokens = toTokenCount(files.reduce((sum, f) => sum + f.estimatedTokens, 0));
  return { root: ROOT, files, totalFiles: files.length, totalTokens };
}

describe("IntentAwareFileDiscoverer", () => {
  it("keyword_filter_narrows_files", () => {
    const discoverer = new IntentAwareFileDiscoverer();
    const files: readonly FileEntry[] = [
      fileEntry("src/auth/service.ts", 10),
      fileEntry("src/index.ts", 5),
      fileEntry("src/other.ts", 5),
      fileEntry("docs/readme.md", 3),
      fileEntry("src/auth/helper.ts", 8),
    ];
    const repo = repoMap(files);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.REFACTOR,
      confidence: toConfidence(0.9),
      matchedKeywords: ["auth"],
      subjectTokens: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const result = discoverer.discover(repo, task, rulePack);
    expect(result.files).toHaveLength(2);
    expect(result.files.every((f) => f.path.toLowerCase().includes("auth"))).toBe(true);
  });

  it("include_patterns_restrict_candidates", () => {
    const discoverer = new IntentAwareFileDiscoverer();
    const files: readonly FileEntry[] = [
      fileEntry("src/foo.ts", 10),
      fileEntry("docs/readme.md", 5),
    ];
    const repo = repoMap(files);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0.5),
      matchedKeywords: [],
      subjectTokens: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [toGlobPattern("src/*.ts")],
      excludePatterns: [],
    };
    const result = discoverer.discover(repo, task, rulePack);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe(toRelativePath("src/foo.ts"));
  });

  it("exclude_patterns_applied", () => {
    const discoverer = new IntentAwareFileDiscoverer();
    const files: readonly FileEntry[] = [
      fileEntry("src/foo.ts", 10),
      fileEntry("node_modules/pkg", 20),
    ];
    const repo = repoMap(files);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0.5),
      matchedKeywords: [],
      subjectTokens: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [toGlobPattern("node_modules/*")],
    };
    const result = discoverer.discover(repo, task, rulePack);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe(toRelativePath("src/foo.ts"));
    expect(result.files.some((f) => f.path.includes("node_modules"))).toBe(false);
  });

  it("general_task_no_keyword_filter", () => {
    const discoverer = new IntentAwareFileDiscoverer();
    const files: readonly FileEntry[] = [
      fileEntry("src/a.ts", 1),
      fileEntry("src/b.ts", 2),
      fileEntry("lib/c.ts", 3),
    ];
    const repo = repoMap(files);
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
    const result = discoverer.discover(repo, task, rulePack);
    expect(result.files).toHaveLength(repo.files.length);
  });

  it("empty_filter_returns_original_repo", () => {
    const discoverer = new IntentAwareFileDiscoverer();
    const files: readonly FileEntry[] = [
      fileEntry("src/foo.ts", 10),
      fileEntry("src/bar.ts", 5),
    ];
    const repo = repoMap(files);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.REFACTOR,
      confidence: toConfidence(0.8),
      matchedKeywords: ["xyznone"],
      subjectTokens: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const result = discoverer.discover(repo, task, rulePack);
    expect(result.root).toBe(repo.root);
    expect(result.files).toHaveLength(repo.files.length);
    expect(result.files).toBe(repo.files);
  });
});
