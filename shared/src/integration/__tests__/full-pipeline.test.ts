// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { describe, it, expect, afterEach } from "vitest";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { toGlobPattern } from "@jatbas/aic-core/core/types/paths.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { runPipelineSteps } from "@jatbas/aic-core/core/run-pipeline-steps.js";
import { resolveModelDerivedEffectiveWindowTokens } from "@jatbas/aic-core/core/resolve-display-total-budget.js";
import { noopImportGraphFailureSink } from "@jatbas/aic-core/core/interfaces/import-graph-failure-sink.interface.js";
import { toTokenCount, toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import { toBytes } from "@jatbas/aic-core/core/types/units.js";
import { toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import type { CompilationRequest } from "@jatbas/aic-core/core/types/compilation-types.js";
import type { CachedCompilation } from "@jatbas/aic-core/core/types/compilation-types.js";
import type { RepoMap, FileEntry } from "@jatbas/aic-core/core/types/repo-map.js";
import type { RulePack } from "@jatbas/aic-core/core/types/rule-pack.js";
import type { FileContentReader } from "@jatbas/aic-core/core/interfaces/file-content-reader.interface.js";
import type { RepoMapSupplier } from "@jatbas/aic-core/core/interfaces/repo-map-supplier.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { CacheStore } from "@jatbas/aic-core/core/interfaces/cache-store.interface.js";
import type { ConfigStore } from "@jatbas/aic-core/core/interfaces/config-store.interface.js";
import type { GuardStore } from "@jatbas/aic-core/core/interfaces/guard-store.interface.js";
import type { CompilationLogStore } from "@jatbas/aic-core/core/interfaces/compilation-log-store.interface.js";
import type { IdGenerator } from "@jatbas/aic-core/core/interfaces/id-generator.interface.js";
import type { RulePackProvider } from "@jatbas/aic-core/core/interfaces/rule-pack-provider.interface.js";
import type { BudgetConfig } from "@jatbas/aic-core/core/interfaces/budget-config.interface.js";
import type { TaskClass } from "@jatbas/aic-core/core/types/enums.js";
import { EDITOR_ID, TRIGGER_SOURCE } from "@jatbas/aic-core/core/types/enums.js";
import { toUUIDv7 } from "@jatbas/aic-core/core/types/identifiers.js";
import { CompilationRunner } from "@jatbas/aic-core/pipeline/compilation-runner.js";
import { IntentClassifier } from "@jatbas/aic-core/pipeline/intent-classifier.js";
import { RulePackResolver } from "@jatbas/aic-core/pipeline/rule-pack-resolver.js";
import { BudgetAllocator } from "@jatbas/aic-core/pipeline/budget-allocator.js";
import { HeuristicSelector } from "@jatbas/aic-core/pipeline/heuristic-selector.js";
import { ExclusionScanner } from "@jatbas/aic-core/pipeline/exclusion-scanner.js";
import { SecretScanner } from "@jatbas/aic-core/pipeline/secret-scanner.js";
import { PromptInjectionScanner } from "@jatbas/aic-core/pipeline/prompt-injection-scanner.js";
import { ContextGuard } from "@jatbas/aic-core/pipeline/context-guard.js";
import { WhitespaceNormalizer } from "@jatbas/aic-core/pipeline/whitespace-normalizer.js";
import { CommentStripper } from "@jatbas/aic-core/pipeline/comment-stripper.js";
import { JsonCompactor } from "@jatbas/aic-core/pipeline/json-compactor.js";
import { LockFileSkipper } from "@jatbas/aic-core/pipeline/lock-file-skipper.js";
import { ContentTransformerPipeline } from "@jatbas/aic-core/pipeline/content-transformer-pipeline.js";
import { SummarisationLadder } from "@jatbas/aic-core/pipeline/summarisation-ladder.js";
import { LineLevelPruner } from "@jatbas/aic-core/pipeline/line-level-pruner.js";
import { PromptAssembler } from "@jatbas/aic-core/pipeline/prompt-assembler.js";
import { IntentAwareFileDiscoverer } from "@jatbas/aic-core/pipeline/intent-aware-file-discoverer.js";
import { SpecFileDiscoverer } from "@jatbas/aic-core/pipeline/spec-file-discoverer.js";
import { ConversationCompressorImpl } from "@jatbas/aic-core/pipeline/conversation-compressor.js";
import { StructuralMapBuilder } from "@jatbas/aic-core/pipeline/structural-map-builder.js";
import { TiktokenAdapter } from "@jatbas/aic-core/adapters/tiktoken-adapter.js";
import { Sha256Adapter } from "@jatbas/aic-core/adapters/sha256-adapter.js";
import { TypeScriptProvider } from "@jatbas/aic-core/adapters/typescript-provider.js";
import { GenericProvider } from "@jatbas/aic-core/adapters/generic-provider.js";
import { createPipelineDeps } from "../../bootstrap/create-pipeline-deps.js";
import { ConfigError } from "@jatbas/aic-core/core/errors/config-error.js";

const FIXED_TS = "2026-01-01T00:00:00.000Z";

function defaultRulePack(): RulePack {
  return {
    constraints: [],
    includePatterns: [],
    excludePatterns: [],
    heuristic: {
      boostPatterns: [toGlobPattern("**/*.ts")],
      penalizePatterns: [],
    },
  };
}

const BG03_README_SHAPED_MD =
  "# Title\n\nPara    with    spaces.\n\n\n\n\nNext.\n\nSee https://example.com/" +
  "x".repeat(100) +
  "/y\n";

const BG03_ANCHOR_MD = `---\ntitle: BG03\n---\n\n${BG03_README_SHAPED_MD}`;

function firstTripleHeadingAfterSection(
  prompt: string,
  sectionTitle: string,
): string | null {
  const marker = `${sectionTitle}\n`;
  const idx = prompt.indexOf(marker);
  if (idx === -1) return null;
  const tail = prompt.slice(idx + marker.length);
  const nextHdr = tail.search(/\n## /);
  const windowText = nextHdr === -1 ? tail : tail.slice(0, nextHdr);
  const hit = windowText.split("\n").find((line) => line.startsWith("### "));
  return hit ?? null;
}

function writeBg03SyntheticRepo(root: string): ReturnType<typeof toAbsolutePath> {
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "000-bg03-anchor.md"), BG03_ANCHOR_MD, "utf8");
  for (let i = 0; i < 5; i += 1) {
    fs.writeFileSync(
      path.join(root, "docs", `extra-${i}.md`),
      BG03_README_SHAPED_MD,
      "utf8",
    );
  }
  for (let i = 0; i < 24; i += 1) {
    const n = i < 10 ? `0${i}` : String(i);
    fs.writeFileSync(
      path.join(root, "src", `mod-${n}.ts`),
      `export const bg03_${i} = ${i};\n`,
      "utf8",
    );
  }
  return toAbsolutePath(root);
}

function buildBg03RepoMap(fixtureRoot: ReturnType<typeof toAbsolutePath>): RepoMap {
  const relStrings = [
    "000-bg03-anchor.md",
    ...[0, 1, 2, 3, 4].map((i) => `docs/extra-${i}.md`),
    ...Array.from({ length: 24 }, (_, i) => {
      const n = i < 10 ? `0${i}` : String(i);
      return `src/mod-${n}.ts`;
    }),
  ];
  const files: FileEntry[] = relStrings.map((rel) => {
    const full = path.join(fixtureRoot as string, rel);
    const raw = fs.readFileSync(full, "utf8");
    return {
      path: toRelativePath(rel),
      language: rel.endsWith(".md") ? "markdown" : "ts",
      sizeBytes: toBytes(Buffer.byteLength(raw, "utf8")),
      estimatedTokens: toTokenCount(80),
      lastModified: toISOTimestamp(FIXED_TS),
    };
  });
  const totalTokens = toTokenCount(
    files.reduce((sum, f) => sum + Number(f.estimatedTokens), 0),
  );
  return {
    root: fixtureRoot,
    files,
    totalFiles: files.length,
    totalTokens,
  };
}

function buildFixtureRepoMap(fixtureRoot: ReturnType<typeof toAbsolutePath>): RepoMap {
  const rel1 = toRelativePath("src/auth/service.ts");
  const rel2 = toRelativePath("src/index.ts");
  const full1 = path.join(fixtureRoot as string, rel1 as string);
  const full2 = path.join(fixtureRoot as string, rel2 as string);
  const content1 = fs.readFileSync(full1, "utf8");
  const content2 = fs.readFileSync(full2, "utf8");
  const size1 = Buffer.byteLength(content1, "utf8");
  const size2 = Buffer.byteLength(content2, "utf8");
  const entry1: FileEntry = {
    path: rel1,
    language: "ts",
    sizeBytes: toBytes(size1),
    estimatedTokens: toTokenCount(10),
    lastModified: toISOTimestamp(FIXED_TS),
  };
  const entry2: FileEntry = {
    path: rel2,
    language: "ts",
    sizeBytes: toBytes(size2),
    estimatedTokens: toTokenCount(12),
    lastModified: toISOTimestamp(FIXED_TS),
  };
  return {
    root: fixtureRoot,
    files: [entry1, entry2],
    totalFiles: 2,
    totalTokens: toTokenCount(22),
  };
}

function createInMemoryCacheStore(): CacheStore {
  const map = new Map<string, CachedCompilation>();
  return {
    get(key: string) {
      return map.get(key) ?? null;
    },
    set(entry: CachedCompilation) {
      map.set(entry.key, entry);
    },
    invalidate() {},
    invalidateAll() {
      map.clear();
    },
    purgeExpired() {},
  };
}

function createRunner(fixtureRoot: ReturnType<typeof toAbsolutePath>): CompilationRunner {
  const repoMap = buildFixtureRepoMap(fixtureRoot);
  const mockRepoMapSupplier: RepoMapSupplier = {
    getRepoMap(_projectRoot) {
      return Promise.resolve(repoMap);
    },
  };
  const mockClock: Clock = {
    now() {
      return toISOTimestamp(FIXED_TS);
    },
    addMinutes() {
      return toISOTimestamp(FIXED_TS);
    },
    durationMs() {
      return toMilliseconds(0);
    },
  };
  const fileContentReader: FileContentReader = {
    getContent(pathRel: ReturnType<typeof toRelativePath>): Promise<string> {
      const full = path.join(fixtureRoot as string, pathRel as string);
      return fs.promises.readFile(full, "utf8");
    },
  };
  const rulePackProvider: RulePackProvider = {
    getBuiltInPack(_name: string): RulePack {
      return defaultRulePack();
    },
    getProjectPack(_projectRoot: unknown, _taskClass: TaskClass): RulePack | null {
      return null;
    },
  };
  const budgetConfig: BudgetConfig = {
    getMaxTokens() {
      return toTokenCount(8000);
    },
    getBudgetForTaskClass(_taskClass: TaskClass) {
      return null;
    },
    getContextWindow() {
      return null;
    },
  };
  const tiktokenAdapter = new TiktokenAdapter();
  const tokenCounter = (text: string) => tiktokenAdapter.countTokens(text);
  const typeScriptProvider = new TypeScriptProvider();
  const genericProvider = new GenericProvider();
  const languageProviders = [typeScriptProvider, genericProvider] as const;
  const intentClassifier = new IntentClassifier();
  const rulePackResolver = new RulePackResolver(rulePackProvider);
  const budgetAllocator = new BudgetAllocator(budgetConfig);
  const heuristicSelector = new HeuristicSelector(
    languageProviders,
    {
      maxFiles: 20,
    },
    { getScores: () => Promise.resolve(new Map()) },
    { getScores: () => Promise.resolve(new Map()) },
  );
  const exclusionScanner = new ExclusionScanner();
  const secretScanner = new SecretScanner();
  const promptInjectionScanner = new PromptInjectionScanner();
  const contentScanners = [secretScanner, promptInjectionScanner] as const;
  const contextGuard = new ContextGuard(
    exclusionScanner,
    contentScanners,
    fileContentReader,
    [],
  );
  const whitespaceNormalizer = new WhitespaceNormalizer();
  const commentStripper = new CommentStripper();
  const jsonCompactor = new JsonCompactor();
  const lockFileSkipper = new LockFileSkipper();
  const transformers = [
    whitespaceNormalizer,
    commentStripper,
    jsonCompactor,
    lockFileSkipper,
  ] as const;
  const contentTransformerPipeline = new ContentTransformerPipeline(
    transformers,
    fileContentReader,
    tokenCounter,
  );
  const summarisationLadder = new SummarisationLadder(
    languageProviders,
    tokenCounter,
    fileContentReader,
  );
  const promptAssembler = new PromptAssembler(fileContentReader);
  const cacheStore = createInMemoryCacheStore();
  const configStore: ConfigStore = {
    getLatestHash: () => null,
    writeSnapshot() {},
  };
  const sha256Adapter = new Sha256Adapter();
  const guardStore: GuardStore = {
    write() {},
    queryByCompilation() {
      return [];
    },
  };
  const compilationLogStore: CompilationLogStore = {
    record() {},
  };
  const idGenerator: IdGenerator = {
    generate() {
      return toUUIDv7("00000000-0000-7000-8000-000000000000");
    },
  };
  const deps = {
    intentClassifier,
    rulePackResolver,
    budgetAllocator,
    contextSelector: heuristicSelector,
    contextGuard,
    contentTransformerPipeline,
    summarisationLadder,
    languageProviders,
    lineLevelPruner: new LineLevelPruner(tiktokenAdapter, fileContentReader),
    promptAssembler,
    intentAwareFileDiscoverer: new IntentAwareFileDiscoverer(),
    repoMapSupplier: mockRepoMapSupplier,
    tokenCounter: tiktokenAdapter,
    specFileDiscoverer: new SpecFileDiscoverer(),
    conversationCompressor: new ConversationCompressorImpl(),
    heuristicMaxFiles: 0,
    structuralMapBuilder: new StructuralMapBuilder(),
  };
  return new CompilationRunner(
    deps,
    mockClock,
    cacheStore,
    configStore,
    sha256Adapter,
    guardStore,
    compilationLogStore,
    idGenerator,
    null,
  );
}

describe("full pipeline", () => {
  const fixtureRoot = toAbsolutePath(
    path.join(process.cwd(), "test", "benchmarks", "repos", "1"),
  );
  const request: CompilationRequest = {
    intent: "refactor auth module to use middleware pattern",
    projectRoot: fixtureRoot,
    modelId: null,
    editorId: EDITOR_ID.GENERIC,
    configPath: null,
    triggerSource: TRIGGER_SOURCE.INTERNAL_TEST,
  };

  it("full_pipeline_compiled_output_matches_snapshot", async () => {
    const runner = createRunner(fixtureRoot);
    const result = await runner.run(request);
    expect(result.compiledPrompt).toMatchSnapshot();
  });

  it("full_pipeline_deterministic", async () => {
    const runner1 = createRunner(fixtureRoot);
    const runner2 = createRunner(fixtureRoot);
    const first = await runner1.run(request);
    const second = await runner2.run(request);
    expect(first).toEqual(second);
  }, 15_000);

  it("full_pipeline_second_run_cache_hit", async () => {
    const runner = createRunner(fixtureRoot);
    await runner.run(request);
    const second = await runner.run(request);
    expect(second.meta.cacheHit).toBe(true);
    expect(second.meta.durationMs).toEqual(toMilliseconds(0));
  }, 15_000);
});

describe("BG03 large-window bookend and prose-density integration", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir !== undefined) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("full_pipeline_bookends_top_file_and_compresses_prose_at_1m_window", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-bg03-"));
    const fixtureRoot = writeBg03SyntheticRepo(tmpDir);
    const repoMap = buildBg03RepoMap(fixtureRoot);
    const mockRepoMapSupplier: RepoMapSupplier = {
      getRepoMap() {
        return Promise.resolve(repoMap);
      },
    };
    const fileContentReader: FileContentReader = {
      getContent(pathRel: ReturnType<typeof toRelativePath>): Promise<string> {
        const full = path.join(fixtureRoot as string, pathRel as string);
        return fs.promises.readFile(full, "utf8");
      },
    };
    const rulePackProvider: RulePackProvider = {
      getBuiltInPack(_name: string): RulePack {
        return {
          constraints: [],
          includePatterns: [],
          excludePatterns: [],
          heuristic: {
            boostPatterns: [toGlobPattern("**/*.md"), toGlobPattern("**/*.ts")],
            penalizePatterns: [],
          },
        };
      },
      getProjectPack(): RulePack | null {
        return null;
      },
    };
    const budgetConfig: BudgetConfig = {
      getMaxTokens() {
        return toTokenCount(0);
      },
      getBudgetForTaskClass() {
        return null;
      },
      getContextWindow() {
        return null;
      },
    };
    const partial = createPipelineDeps(
      fileContentReader,
      rulePackProvider,
      budgetConfig,
      undefined,
      { maxFiles: 0 },
      [],
      noopImportGraphFailureSink,
    );
    const deps = { ...partial, repoMapSupplier: mockRepoMapSupplier };
    const derivedWindow = resolveModelDerivedEffectiveWindowTokens("claude-opus-4.6");
    if (derivedWindow === undefined) {
      throw new ConfigError(
        "BG03 integration test requires claude-opus-4.6 model window",
      );
    }
    const r = await runPipelineSteps(deps, {
      intent: "consolidate module exports for bg03 synthetic fixture",
      projectRoot: fixtureRoot,
      contextWindow: derivedWindow,
    });
    expect(r.prunedFiles.length).toBeGreaterThanOrEqual(5);
    const prompt = r.assembledPrompt;
    expect(prompt).toContain("## Context (reinforced)");
    const mainHeading = firstTripleHeadingAfterSection(prompt, "## Context");
    const reinforcedHeading = firstTripleHeadingAfterSection(
      prompt,
      "## Context (reinforced)",
    );
    expect(mainHeading).not.toBeNull();
    expect(reinforcedHeading).not.toBeNull();
    expect(mainHeading).toBe(reinforcedHeading);
    const mdMeta = r.transformResult.metadata.filter((m) =>
      (m.filePath as string).endsWith(".md"),
    );
    const hasProseDensityReduction = mdMeta.some(
      (m) =>
        m.transformersApplied.includes("prose-density") &&
        Number(m.transformedTokens) < Number(m.originalTokens),
    );
    expect(hasProseDensityReduction).toBe(true);
  }, 60_000);
});
