// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { InspectRunner } from "../inspect-runner.js";
import { ConversationCompressorImpl } from "../conversation-compressor.js";
import { StructuralMapBuilder } from "../structural-map-builder.js";
import type { IntentClassifier } from "@jatbas/aic-core/core/interfaces/intent-classifier.interface.js";
import type { RulePackResolver } from "@jatbas/aic-core/core/interfaces/rule-pack-resolver.interface.js";
import type { BudgetAllocator } from "@jatbas/aic-core/core/interfaces/budget-allocator.interface.js";
import type { ContextSelector } from "@jatbas/aic-core/core/interfaces/context-selector.interface.js";
import type { ContextGuard } from "@jatbas/aic-core/core/interfaces/context-guard.interface.js";
import type { ContentTransformerPipeline } from "@jatbas/aic-core/core/interfaces/content-transformer-pipeline.interface.js";
import type { SummarisationLadder } from "@jatbas/aic-core/core/interfaces/summarisation-ladder.interface.js";
import type { LineLevelPruner } from "@jatbas/aic-core/core/interfaces/line-level-pruner.interface.js";
import type { PromptAssembler } from "@jatbas/aic-core/core/interfaces/prompt-assembler.interface.js";
import type { RepoMapSupplier } from "@jatbas/aic-core/core/interfaces/repo-map-supplier.interface.js";
import type { IntentAwareFileDiscoverer } from "@jatbas/aic-core/core/interfaces/intent-aware-file-discoverer.interface.js";
import type { SpecFileDiscoverer } from "@jatbas/aic-core/core/interfaces/spec-file-discoverer.interface.js";
import type { ConversationCompressor } from "@jatbas/aic-core/core/interfaces/conversation-compressor.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { TokenCounter } from "@jatbas/aic-core/core/interfaces/token-counter.interface.js";
import type { InspectRequest } from "@jatbas/aic-core/core/types/inspect-types.js";
import type { TaskClassification } from "@jatbas/aic-core/core/types/task-classification.js";
import type { RulePack } from "@jatbas/aic-core/core/types/rule-pack.js";
import type { RepoMap } from "@jatbas/aic-core/core/types/repo-map.js";
import type {
  ContextResult,
  SelectedFile,
} from "@jatbas/aic-core/core/types/selected-file.js";
import type { GuardResult } from "@jatbas/aic-core/core/types/guard-types.js";
import type { TransformResult } from "@jatbas/aic-core/core/types/transform-types.js";
import type { ISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import {
  toAbsolutePath,
  toFilePath,
  toRelativePath,
} from "@jatbas/aic-core/core/types/paths.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { toConfidence, toRelevanceScore } from "@jatbas/aic-core/core/types/scores.js";
import { TASK_CLASS, INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";
import { TypeScriptProvider } from "@jatbas/aic-core/adapters/typescript-provider.js";

const projectRoot = toAbsolutePath("/tmp/proj");
const dbPath = toFilePath("/tmp/proj/.aic/aic.sqlite");

function makeRequest(overrides?: Partial<InspectRequest>): InspectRequest {
  return {
    intent: "refactor auth",
    projectRoot,
    configPath: null,
    dbPath,
    ...overrides,
  };
}

function makeSelectedFile(
  pathRel: string,
  tokens: number,
  tier: (typeof INCLUSION_TIER)[keyof typeof INCLUSION_TIER] = INCLUSION_TIER.L0,
) {
  return {
    path: toRelativePath(pathRel),
    language: "ts",
    estimatedTokens: toTokenCount(tokens),
    relevanceScore: toRelevanceScore(0.8),
    tier,
  };
}

const fixedTask: TaskClassification = {
  taskClass: TASK_CLASS.REFACTOR,
  confidence: toConfidence(0.9),
  matchedKeywords: ["refactor"],
  subjectTokens: [],
};

const fixedRulePack: RulePack = {
  constraints: ["no side effects"],
  includePatterns: [],
  excludePatterns: [],
};

const fixedRepoMap: RepoMap = {
  root: projectRoot,
  files: [],
  totalFiles: 1,
  totalTokens: toTokenCount(500),
};

const twoFiles = [
  makeSelectedFile("src/a.ts", 100),
  makeSelectedFile("src/b.ts", 150),
] as const;

const contextResult: ContextResult = {
  files: twoFiles,
  totalTokens: toTokenCount(250),
  truncated: false,
  traceExcludedFiles: [],
};

const guardResult: GuardResult = {
  passed: true,
  findings: [],
  filesBlocked: [],
  filesRedacted: [],
  filesWarned: [],
};

const safeFiles = [
  makeSelectedFile("src/a.ts", 90),
  makeSelectedFile("src/b.ts", 140),
] as const;

const transformResult: TransformResult = {
  files: [
    makeSelectedFile("src/a.ts", 90, INCLUSION_TIER.L1),
    makeSelectedFile("src/b.ts", 140, INCLUSION_TIER.L1),
  ],
  metadata: [
    {
      filePath: toRelativePath("src/a.ts"),
      originalTokens: toTokenCount(100),
      transformedTokens: toTokenCount(90),
      transformersApplied: ["whitespace"],
    },
    {
      filePath: toRelativePath("src/b.ts"),
      originalTokens: toTokenCount(150),
      transformedTokens: toTokenCount(140),
      transformersApplied: ["whitespace"],
    },
  ],
};

const ladderFiles = [
  makeSelectedFile("src/a.ts", 50, INCLUSION_TIER.L1),
  makeSelectedFile("src/b.ts", 60, INCLUSION_TIER.L2),
] as const;

const assembledText = "prompt text here";

const fixedTimestamp = "2026-01-01T12:00:00.000Z" as ISOTimestamp;

describe("InspectRunner", () => {
  it("inspect_runner_returns_trace", async () => {
    const mockIntentClassifier = { classify: () => fixedTask };
    const mockRulePackResolver = { resolve: () => fixedRulePack };
    const mockBudgetAllocator = { allocate: () => toTokenCount(1000) };
    const mockContextSelector = {
      selectContext: () => Promise.resolve(contextResult),
    };
    const mockContextGuard = {
      scan: () => Promise.resolve({ result: guardResult, safeFiles: [...safeFiles] }),
    };
    const mockContentTransformerPipeline = {
      transform: () => Promise.resolve(transformResult),
    };
    const mockSummarisationLadder = {
      compress: () => Promise.resolve([...ladderFiles]),
    };
    const mockPromptAssembler = {
      assemble: () => Promise.resolve(assembledText),
    };
    const mockRepoMapSupplier = { getRepoMap: () => Promise.resolve(fixedRepoMap) };
    const mockClock = { now: () => fixedTimestamp };
    const mockTokenCounter = { countTokens: () => toTokenCount(120) };
    const deps = {
      intentClassifier: mockIntentClassifier as IntentClassifier,
      rulePackResolver: mockRulePackResolver as RulePackResolver,
      budgetAllocator: mockBudgetAllocator as BudgetAllocator,
      contextSelector: mockContextSelector as ContextSelector,
      contextGuard: mockContextGuard as ContextGuard,
      contentTransformerPipeline:
        mockContentTransformerPipeline as ContentTransformerPipeline,
      summarisationLadder: mockSummarisationLadder as SummarisationLadder,
      languageProviders: [new TypeScriptProvider()],
      lineLevelPruner: {
        prune: (files: readonly SelectedFile[]) => Promise.resolve([...files]),
      } as LineLevelPruner,
      promptAssembler: mockPromptAssembler as PromptAssembler,
      intentAwareFileDiscoverer: {
        discover: (repo: RepoMap) => repo,
      } as IntentAwareFileDiscoverer,
      repoMapSupplier: mockRepoMapSupplier as RepoMapSupplier,
      tokenCounter: mockTokenCounter as TokenCounter,
      specFileDiscoverer: {
        discover: () => ({
          files: [],
          totalTokens: toTokenCount(0),
          truncated: false,
          traceExcludedFiles: [],
        }),
      } as SpecFileDiscoverer,
      conversationCompressor: new ConversationCompressorImpl() as ConversationCompressor,
      heuristicMaxFiles: 0,
      structuralMapBuilder: new StructuralMapBuilder(),
    };
    const runner = new InspectRunner(deps, mockClock as Clock);

    const request = makeRequest();
    const trace = await runner.inspect(request);

    expect(trace.taskClass).toEqual(fixedTask);
    expect(trace.rulePacks).toHaveLength(2);
    expect(trace.rulePacks).toContain("built-in:default");
    expect(trace.rulePacks).toContain("built-in:refactor");
    expect(trace.selectedFiles).toHaveLength(2);
    expect(trace.guard).toEqual(guardResult);
    expect(trace.tokenSummary.reductionPct).toBeDefined();
    expect(trace.compiledAt).toBe(fixedTimestamp);
  });

  it("inspect_runner_no_file_content_reader", () => {
    const mockIntentClassifier = { classify: () => fixedTask };
    const mockRulePackResolver = { resolve: () => fixedRulePack };
    const mockBudgetAllocator = { allocate: () => toTokenCount(1000) };
    const mockContextSelector = {
      selectContext: () => Promise.resolve(contextResult),
    };
    const mockContextGuard = {
      scan: () => Promise.resolve({ result: guardResult, safeFiles: [...safeFiles] }),
    };
    const mockContentTransformerPipeline = {
      transform: () => Promise.resolve(transformResult),
    };
    const mockSummarisationLadder = {
      compress: () => Promise.resolve([...ladderFiles]),
    };
    const mockPromptAssembler = {
      assemble: () => Promise.resolve(assembledText),
    };
    const mockRepoMapSupplier = { getRepoMap: () => Promise.resolve(fixedRepoMap) };
    const mockClock = { now: () => fixedTimestamp };
    const mockTokenCounter = { countTokens: () => toTokenCount(120) };
    const deps = {
      intentClassifier: mockIntentClassifier as IntentClassifier,
      rulePackResolver: mockRulePackResolver as RulePackResolver,
      budgetAllocator: mockBudgetAllocator as BudgetAllocator,
      contextSelector: mockContextSelector as ContextSelector,
      contextGuard: mockContextGuard as ContextGuard,
      contentTransformerPipeline:
        mockContentTransformerPipeline as ContentTransformerPipeline,
      summarisationLadder: mockSummarisationLadder as SummarisationLadder,
      languageProviders: [new TypeScriptProvider()],
      lineLevelPruner: {
        prune: (files: readonly SelectedFile[]) => Promise.resolve([...files]),
      } as LineLevelPruner,
      promptAssembler: mockPromptAssembler as PromptAssembler,
      intentAwareFileDiscoverer: {
        discover: (repo: RepoMap) => repo,
      } as IntentAwareFileDiscoverer,
      repoMapSupplier: mockRepoMapSupplier as RepoMapSupplier,
      tokenCounter: mockTokenCounter as TokenCounter,
      specFileDiscoverer: {
        discover: () => ({
          files: [],
          totalTokens: toTokenCount(0),
          truncated: false,
          traceExcludedFiles: [],
        }),
      } as SpecFileDiscoverer,
      conversationCompressor: new ConversationCompressorImpl() as ConversationCompressor,
      heuristicMaxFiles: 0,
      structuralMapBuilder: new StructuralMapBuilder(),
    };
    const runner = new InspectRunner(deps, mockClock as Clock);

    expect(runner).toBeDefined();
    expect("fileContentReader" in runner).toBe(false);
  });

  it("inspect_runner_repo_map_reject", async () => {
    const mockIntentClassifier = { classify: () => fixedTask };
    const mockRulePackResolver = { resolve: () => fixedRulePack };
    const mockBudgetAllocator = { allocate: () => toTokenCount(1000) };
    const mockContextSelector = {
      selectContext: () => Promise.resolve(contextResult),
    };
    const mockContextGuard = {
      scan: () => Promise.resolve({ result: guardResult, safeFiles: [...safeFiles] }),
    };
    const mockContentTransformerPipeline = {
      transform: () => Promise.resolve(transformResult),
    };
    const mockSummarisationLadder = {
      compress: () => Promise.resolve([...ladderFiles]),
    };
    const mockPromptAssembler = {
      assemble: () => Promise.resolve(assembledText),
    };
    const stubError = new Error("RepoMap not available");
    const mockRepoMapSupplier = { getRepoMap: () => Promise.reject(stubError) };
    const mockClock = { now: () => fixedTimestamp };
    const mockTokenCounter = { countTokens: () => toTokenCount(120) };
    const deps = {
      intentClassifier: mockIntentClassifier as IntentClassifier,
      rulePackResolver: mockRulePackResolver as RulePackResolver,
      budgetAllocator: mockBudgetAllocator as BudgetAllocator,
      contextSelector: mockContextSelector as ContextSelector,
      contextGuard: mockContextGuard as ContextGuard,
      contentTransformerPipeline:
        mockContentTransformerPipeline as ContentTransformerPipeline,
      summarisationLadder: mockSummarisationLadder as SummarisationLadder,
      languageProviders: [new TypeScriptProvider()],
      lineLevelPruner: {
        prune: (files: readonly SelectedFile[]) => Promise.resolve([...files]),
      } as LineLevelPruner,
      promptAssembler: mockPromptAssembler as PromptAssembler,
      intentAwareFileDiscoverer: {
        discover: (repo: RepoMap) => repo,
      } as IntentAwareFileDiscoverer,
      repoMapSupplier: mockRepoMapSupplier as RepoMapSupplier,
      tokenCounter: mockTokenCounter as TokenCounter,
      specFileDiscoverer: {
        discover: () => ({
          files: [],
          totalTokens: toTokenCount(0),
          truncated: false,
          traceExcludedFiles: [],
        }),
      } as SpecFileDiscoverer,
      conversationCompressor: new ConversationCompressorImpl() as ConversationCompressor,
      heuristicMaxFiles: 0,
      structuralMapBuilder: new StructuralMapBuilder(),
    };
    const runner = new InspectRunner(deps, mockClock as Clock);

    await expect(runner.inspect(makeRequest())).rejects.toThrow("RepoMap not available");
  });
});
