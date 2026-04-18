// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  buildReverseEdges,
  ImportGraphProximityScorer,
} from "../import-graph-proximity-scorer.js";
import type { FileContentReader } from "@jatbas/aic-core/core/interfaces/file-content-reader.interface.js";
import type { ImportGraphFailureSink } from "@jatbas/aic-core/core/interfaces/import-graph-failure-sink.interface.js";
import type { LanguageProvider } from "@jatbas/aic-core/core/interfaces/language-provider.interface.js";
import type { RepoMap } from "@jatbas/aic-core/core/types/repo-map.js";
import type { TaskClassification } from "@jatbas/aic-core/core/types/task-classification.js";
import type { ImportRef } from "@jatbas/aic-core/core/types/import-ref.js";
import {
  toRelativePath,
  toAbsolutePath,
  toFileExtension,
  type RelativePath,
} from "@jatbas/aic-core/core/types/paths.js";
import { toTokenCount, toBytes } from "@jatbas/aic-core/core/types/units.js";
import { toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import { toConfidence } from "@jatbas/aic-core/core/types/scores.js";
import { TASK_CLASS } from "@jatbas/aic-core/core/types/enums.js";
import { AicError } from "@jatbas/aic-core/core/errors/aic-error.js";

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

function makeTask(matchedKeywords: readonly string[]): TaskClassification {
  return {
    taskClass: TASK_CLASS.GENERAL,
    confidence: toConfidence(0.5),
    matchedKeywords,
    subjectTokens: [],
  };
}

describe("ImportGraphProximityScorer", () => {
  it("import_graph_empty_repo", async () => {
    const reader: FileContentReader = {
      getContent: () => Promise.resolve(""),
    };
    const providers: readonly LanguageProvider[] = [];
    const scorer = new ImportGraphProximityScorer(reader, providers);
    const repo = makeRepo([]);
    const task = makeTask([]);
    const scores = await scorer.getScores(repo, task);
    expect(scores.size).toBe(0);
  });

  it("import_graph_no_keywords_all_zero", async () => {
    const reader: FileContentReader = {
      getContent: () => Promise.resolve(""),
    };
    const provider: LanguageProvider = {
      id: "ts",
      extensions: [toFileExtension(".ts")],
      parseImports: () => [],
      extractSignaturesWithDocs: () => [],
      extractSignaturesOnly: () => [],
      extractNames: () => [],
    };
    const scorer = new ImportGraphProximityScorer(reader, [provider]);
    const repo = makeRepo([makeEntry("src/foo.ts")]);
    const task = makeTask([]);
    const scores = await scorer.getScores(repo, task);
    expect(scores.get(toRelativePath("src/foo.ts"))).toBe(0);
  });

  it("import_graph_seed_imports_other", async () => {
    const seedPath = toRelativePath("seed.ts");
    const otherPath = toRelativePath("other.ts");
    const contentByPath = new Map<string, string>([
      [seedPath, "import x from './other';"],
      [otherPath, ""],
    ]);
    const reader: FileContentReader = {
      getContent: (path) => Promise.resolve(contentByPath.get(path) ?? ""),
    };
    const refOther: ImportRef = {
      source: "./other",
      symbols: [],
      isRelative: true,
    };
    const provider: LanguageProvider = {
      id: "ts",
      extensions: [toFileExtension(".ts")],
      parseImports: (_content, path) => (path === seedPath ? [refOther] : []),
      extractSignaturesWithDocs: () => [],
      extractSignaturesOnly: () => [],
      extractNames: () => [],
    };
    const scorer = new ImportGraphProximityScorer(reader, [provider]);
    const repo = makeRepo([makeEntry("seed.ts"), makeEntry("other.ts")]);
    const task = makeTask(["seed"]);
    const scores = await scorer.getScores(repo, task);
    expect(scores.get(otherPath)).toBe(0.6);
  });

  it("import_graph_path_index_large_repo", async () => {
    const otherPath = toRelativePath("other.ts");
    const seedPath = toRelativePath("seed.ts");
    const decoys = Array.from({ length: 400 }, (_, i) => makeEntry(`lib/dummy/${i}.ts`));
    const contentByPath = new Map<string, string>([
      [seedPath, "import x from './other';"],
      [otherPath, ""],
    ]);
    const reader: FileContentReader = {
      getContent: (path) => Promise.resolve(contentByPath.get(path) ?? ""),
    };
    const refOther: ImportRef = {
      source: "./other",
      symbols: [],
      isRelative: true,
    };
    const provider: LanguageProvider = {
      id: "ts",
      extensions: [toFileExtension(".ts")],
      parseImports: (_content, path) => (path === seedPath ? [refOther] : []),
      extractSignaturesWithDocs: () => [],
      extractSignaturesOnly: () => [],
      extractNames: () => [],
    };
    const scorer = new ImportGraphProximityScorer(reader, [provider]);
    const repo = makeRepo([...decoys, makeEntry("seed.ts"), makeEntry("other.ts")]);
    const task = makeTask(["seed"]);
    const scores = await scorer.getScores(repo, task);
    expect(scores.get(otherPath)).toBe(0.6);
  });

  it("import_graph_index_barrel_large_repo", async () => {
    const indexPath = toRelativePath("pkg/foo/index.ts");
    const seedPath = toRelativePath("seed.ts");
    const decoys = Array.from({ length: 400 }, (_, i) => makeEntry(`lib/dummy/${i}.ts`));
    const contentByPath = new Map<string, string>([
      [seedPath, "import x from './pkg/foo';"],
      [indexPath, ""],
    ]);
    const reader: FileContentReader = {
      getContent: (path) => Promise.resolve(contentByPath.get(path) ?? ""),
    };
    const refFoo: ImportRef = {
      source: "./pkg/foo",
      symbols: [],
      isRelative: true,
    };
    const provider: LanguageProvider = {
      id: "ts",
      extensions: [toFileExtension(".ts")],
      parseImports: (_content, path) => (path === seedPath ? [refFoo] : []),
      extractSignaturesWithDocs: () => [],
      extractSignaturesOnly: () => [],
      extractNames: () => [],
    };
    const scorer = new ImportGraphProximityScorer(reader, [provider]);
    const repo = makeRepo([
      ...decoys,
      makeEntry("pkg/foo/index.ts"),
      makeEntry("seed.ts"),
    ]);
    const task = makeTask(["seed"]);
    const scores = await scorer.getScores(repo, task);
    expect(scores.get(indexPath)).toBe(0.6);
  });

  it("records_read_failure_via_sink", async () => {
    const failPath = toRelativePath("pkg/a.ts");
    const reader: FileContentReader = {
      getContent: (path) =>
        path === failPath
          ? Promise.reject(new AicError("read failed", "TEST_IG_READ"))
          : Promise.resolve(""),
    };
    const provider: LanguageProvider = {
      id: "ts",
      extensions: [toFileExtension(".ts")],
      parseImports: () => [],
      extractSignaturesWithDocs: () => [],
      extractSignaturesOnly: () => [],
      extractNames: () => [],
    };
    const notifications: { kind: "read" | "parse"; path: RelativePath }[] = [];
    const recordingSink: ImportGraphFailureSink = {
      notifyImportGraphFailure({ kind, path }): void {
        notifications.push({ kind, path });
      },
    };
    const scorer = new ImportGraphProximityScorer(reader, [provider], recordingSink);
    const repo = makeRepo([makeEntry("pkg/a.ts"), makeEntry("pkg/b.ts")]);
    const task = makeTask(["b"]);
    await expect(scorer.getScores(repo, task)).resolves.toBeDefined();
    expect(notifications).toEqual([{ kind: "read", path: failPath }]);
  });

  it("records_parse_failure_via_sink", async () => {
    const badPath = toRelativePath("bad.ts");
    const reader: FileContentReader = {
      getContent: () => Promise.resolve("x"),
    };
    const provider: LanguageProvider = {
      id: "ts",
      extensions: [toFileExtension(".ts")],
      parseImports: (_content, path) => {
        if (path === badPath) throw new AicError("parse failed", "TEST_IG_PARSE");
        return [];
      },
      extractSignaturesWithDocs: () => [],
      extractSignaturesOnly: () => [],
      extractNames: () => [],
    };
    const notifications: { kind: "read" | "parse"; path: RelativePath }[] = [];
    const recordingSink: ImportGraphFailureSink = {
      notifyImportGraphFailure({ kind, path }): void {
        notifications.push({ kind, path });
      },
    };
    const scorer = new ImportGraphProximityScorer(reader, [provider], recordingSink);
    const repo = makeRepo([makeEntry("good.ts"), makeEntry("bad.ts")]);
    const task = makeTask(["good"]);
    await expect(scorer.getScores(repo, task)).resolves.toBeDefined();
    expect(notifications).toEqual([{ kind: "parse", path: badPath }]);
  });

  it("import_graph_no_provider_score_zero", async () => {
    const reader: FileContentReader = {
      getContent: () => Promise.resolve(""),
    };
    const provider: LanguageProvider = {
      id: "ts",
      extensions: [toFileExtension(".ts")],
      parseImports: () => [],
      extractSignaturesWithDocs: () => [],
      extractSignaturesOnly: () => [],
      extractNames: () => [],
    };
    const scorer = new ImportGraphProximityScorer(reader, [provider]);
    const repo = makeRepo([makeEntry("readme.md")]);
    const task = makeTask(["readme"]);
    const scores = await scorer.getScores(repo, task);
    expect(scores.get(toRelativePath("readme.md"))).toBe(0);
  });

  it("reverse_dependency_scores_importer_of_seed", async () => {
    const seedPath = toRelativePath("seed.ts");
    const callerPath = toRelativePath("caller.ts");
    const contentByPath = new Map<string, string>([
      [seedPath, ""],
      [callerPath, "import x from './seed';"],
    ]);
    const reader: FileContentReader = {
      getContent: (path) => Promise.resolve(contentByPath.get(path) ?? ""),
    };
    const refSeed: ImportRef = {
      source: "./seed",
      symbols: [],
      isRelative: true,
    };
    const provider: LanguageProvider = {
      id: "ts",
      extensions: [toFileExtension(".ts")],
      parseImports: (_content, path) => (path === callerPath ? [refSeed] : []),
      extractSignaturesWithDocs: () => [],
      extractSignaturesOnly: () => [],
      extractNames: () => [],
    };
    const scorer = new ImportGraphProximityScorer(reader, [provider]);
    const repo = makeRepo([makeEntry("seed.ts"), makeEntry("caller.ts")]);
    const task = makeTask(["seed"]);
    const scores = await scorer.getScores(repo, task);
    expect(scores.get(callerPath)).toBe(0.6);
  });

  it("import_graph_bfs_depth_two", async () => {
    const seedPath = toRelativePath("seed.ts");
    const aPath = toRelativePath("a.ts");
    const bPath = toRelativePath("b.ts");
    const contentByPath = new Map<string, string>([
      [seedPath, "import './a';"],
      [aPath, "import './b';"],
      [bPath, ""],
    ]);
    const reader: FileContentReader = {
      getContent: (path) => Promise.resolve(contentByPath.get(path) ?? ""),
    };
    const provider: LanguageProvider = {
      id: "ts",
      extensions: [toFileExtension(".ts")],
      parseImports: (_, path) => {
        if (path === seedPath) return [{ source: "./a", symbols: [], isRelative: true }];
        if (path === aPath) return [{ source: "./b", symbols: [], isRelative: true }];
        return [];
      },
      extractSignaturesWithDocs: () => [],
      extractSignaturesOnly: () => [],
      extractNames: () => [],
    };
    const scorer = new ImportGraphProximityScorer(reader, [provider]);
    const repo = makeRepo([makeEntry("seed.ts"), makeEntry("a.ts"), makeEntry("b.ts")]);
    const task = makeTask(["seed"]);
    const scores = await scorer.getScores(repo, task);
    expect(scores.get(bPath)).toBe(0.3);
  });

  it("build_reverse_edges_wide_fan_in", () => {
    const sharedTarget = toRelativePath("lib/shared.ts");
    const edges = new Map<RelativePath, readonly RelativePath[]>(
      Array.from({ length: 256 }, (_, i): [RelativePath, readonly RelativePath[]] => [
        toRelativePath(`src/m/${i}.ts`),
        [sharedTarget],
      ]),
    );
    const reverseEdges = buildReverseEdges(edges);
    expect(reverseEdges.size).toBe(1);
    expect(reverseEdges.get(sharedTarget)?.length).toBe(256);
    expect(reverseEdges.get(sharedTarget)?.[0]).toBe(toRelativePath("src/m/0.ts"));
    expect(reverseEdges.get(sharedTarget)?.[255]).toBe(toRelativePath("src/m/255.ts"));
  });

  it("build_reverse_edges_body_has_no_per_edge_list_spread", () => {
    const here = fileURLToPath(import.meta.url);
    const dir = dirname(here);
    const scorerPath = join(dir, "..", "import-graph-proximity-scorer.ts");
    const source = readFileSync(scorerPath, "utf8");
    const start = source.indexOf("export function buildReverseEdges");
    const end = source.indexOf("\nfunction bfsScores", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const bodyRegion = source.slice(start, end);
    expect(bodyRegion).not.toMatch(/\[\.\.\.\s*existing/);
  });
});
