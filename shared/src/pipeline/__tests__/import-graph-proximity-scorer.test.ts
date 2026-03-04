import { describe, it, expect } from "vitest";
import { ImportGraphProximityScorer } from "../import-graph-proximity-scorer.js";
import type { FileContentReader } from "#core/interfaces/file-content-reader.interface.js";
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { RepoMap } from "#core/types/repo-map.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { ImportRef } from "#core/types/import-ref.js";
import { toRelativePath, toAbsolutePath, toFileExtension } from "#core/types/paths.js";
import { toTokenCount, toBytes } from "#core/types/units.js";
import { toISOTimestamp } from "#core/types/identifiers.js";
import { toConfidence } from "#core/types/scores.js";
import { TASK_CLASS } from "#core/types/enums.js";

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
});
