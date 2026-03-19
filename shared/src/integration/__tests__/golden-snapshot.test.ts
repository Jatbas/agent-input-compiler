// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as path from "node:path";
import * as fs from "node:fs";
import { describe, it, expect } from "vitest";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toFilePath } from "@jatbas/aic-core/core/types/paths.js";
import { toTokenCount, toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import { toBytes } from "@jatbas/aic-core/core/types/units.js";
import { toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import type { RepoMap, FileEntry } from "@jatbas/aic-core/core/types/repo-map.js";
import type { RulePack } from "@jatbas/aic-core/core/types/rule-pack.js";
import type { FileContentReader } from "@jatbas/aic-core/core/interfaces/file-content-reader.interface.js";
import type { RepoMapSupplier } from "@jatbas/aic-core/core/interfaces/repo-map-supplier.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { RulePackProvider } from "@jatbas/aic-core/core/interfaces/rule-pack-provider.interface.js";
import type { BudgetConfig } from "@jatbas/aic-core/core/interfaces/budget-config.interface.js";
import type { TaskClass } from "@jatbas/aic-core/core/types/enums.js";
import { InspectRunner } from "@jatbas/aic-core/pipeline/inspect-runner.js";
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
import { TypeScriptProvider } from "@jatbas/aic-core/adapters/typescript-provider.js";
import { GenericProvider } from "@jatbas/aic-core/adapters/generic-provider.js";

const FIXED_TS = "2026-01-01T00:00:00.000Z";

function defaultRulePack(): RulePack {
  return {
    constraints: [],
    includePatterns: [],
    excludePatterns: [],
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
  const est1 = toTokenCount(10);
  const est2 = toTokenCount(12);
  const entry1: FileEntry = {
    path: rel1,
    language: "ts",
    sizeBytes: toBytes(size1),
    estimatedTokens: est1,
    lastModified: toISOTimestamp(FIXED_TS),
  };
  const entry2: FileEntry = {
    path: rel2,
    language: "ts",
    sizeBytes: toBytes(size2),
    estimatedTokens: est2,
    lastModified: toISOTimestamp(FIXED_TS),
  };
  const files: readonly FileEntry[] = [entry1, entry2];
  const totalTokens = toTokenCount(10 + 12);
  return {
    root: fixtureRoot,
    files,
    totalFiles: 2,
    totalTokens,
  };
}

function createRunner(fixtureRoot: ReturnType<typeof toAbsolutePath>): InspectRunner {
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
    { maxFiles: 20 },
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
  const deps = {
    intentClassifier,
    rulePackResolver,
    budgetAllocator,
    contextSelector: heuristicSelector,
    contextGuard,
    contentTransformerPipeline,
    summarisationLadder,
    lineLevelPruner: new LineLevelPruner(tiktokenAdapter, fileContentReader),
    promptAssembler,
    intentAwareFileDiscoverer: new IntentAwareFileDiscoverer(),
    repoMapSupplier: mockRepoMapSupplier,
    tokenCounter: tiktokenAdapter,
    specFileDiscoverer: new SpecFileDiscoverer(),
    conversationCompressor: new ConversationCompressorImpl(),
    structuralMapBuilder: new StructuralMapBuilder(),
  };
  return new InspectRunner(deps, mockClock);
}

describe("golden snapshot", () => {
  const fixtureRoot = toAbsolutePath(
    path.join(process.cwd(), "test", "benchmarks", "repos", "1"),
  );
  const request = {
    intent: "refactor auth module to use middleware pattern",
    projectRoot: fixtureRoot,
    configPath: null as ReturnType<typeof toFilePath> | null,
    dbPath: toFilePath(path.join(fixtureRoot as string, ".aic", "aic.sqlite")),
  };

  it("full_pipeline_trace_matches_golden_snapshot", async () => {
    const runner = createRunner(fixtureRoot);
    const trace = await runner.inspect(request);
    expect(trace).toMatchSnapshot();
  });

  it("full_pipeline_trace_is_deterministic", async () => {
    const runner = createRunner(fixtureRoot);
    const trace1 = await runner.inspect(request);
    const trace2 = await runner.inspect(request);
    const trace3 = await runner.inspect(request);
    expect(trace1).toEqual(trace2);
    expect(trace2).toEqual(trace3);
  }, 30_000);
});
