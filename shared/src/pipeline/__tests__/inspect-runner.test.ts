import { describe, it, expect } from "vitest";
import { InspectRunner } from "../inspect-runner.js";
import { ConversationCompressorImpl } from "../conversation-compressor.js";
import type { IntentClassifier } from "#core/interfaces/intent-classifier.interface.js";
import type { RulePackResolver } from "#core/interfaces/rule-pack-resolver.interface.js";
import type { BudgetAllocator } from "#core/interfaces/budget-allocator.interface.js";
import type { ContextSelector } from "#core/interfaces/context-selector.interface.js";
import type { ContextGuard } from "#core/interfaces/context-guard.interface.js";
import type { ContentTransformerPipeline } from "#core/interfaces/content-transformer-pipeline.interface.js";
import type { SummarisationLadder } from "#core/interfaces/summarisation-ladder.interface.js";
import type { PromptAssembler } from "#core/interfaces/prompt-assembler.interface.js";
import type { RepoMapSupplier } from "#core/interfaces/repo-map-supplier.interface.js";
import type { IntentAwareFileDiscoverer } from "#core/interfaces/intent-aware-file-discoverer.interface.js";
import type { SpecFileDiscoverer } from "#core/interfaces/spec-file-discoverer.interface.js";
import type { ConversationCompressor } from "#core/interfaces/conversation-compressor.interface.js";
import type { Clock } from "#core/interfaces/clock.interface.js";
import type { TokenCounter } from "#core/interfaces/token-counter.interface.js";
import type { InspectRequest } from "#core/types/inspect-types.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { RepoMap } from "#core/types/repo-map.js";
import type { ContextResult } from "#core/types/selected-file.js";
import type { GuardResult } from "#core/types/guard-types.js";
import type { TransformResult } from "#core/types/transform-types.js";
import type { ISOTimestamp } from "#core/types/identifiers.js";
import { toAbsolutePath, toFilePath, toRelativePath } from "#core/types/paths.js";
import { toTokenCount } from "#core/types/units.js";
import { toConfidence, toRelevanceScore } from "#core/types/scores.js";
import { TASK_CLASS, INCLUSION_TIER } from "#core/types/enums.js";

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
        }),
      } as SpecFileDiscoverer,
      conversationCompressor: new ConversationCompressorImpl() as ConversationCompressor,
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
        }),
      } as SpecFileDiscoverer,
      conversationCompressor: new ConversationCompressorImpl() as ConversationCompressor,
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
        }),
      } as SpecFileDiscoverer,
      conversationCompressor: new ConversationCompressorImpl() as ConversationCompressor,
    };
    const runner = new InspectRunner(deps, mockClock as Clock);

    await expect(runner.inspect(makeRequest())).rejects.toThrow("RepoMap not available");
  });
});
