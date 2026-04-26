// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, vi, beforeEach } from "vitest";
import { runPipelineSteps } from "../run-pipeline-steps.js";
import type {
  PipelineStepsDeps,
  PipelineStepsRequest,
} from "@jatbas/aic-core/core/run-pipeline-steps.js";
import type { TaskClassification } from "@jatbas/aic-core/core/types/task-classification.js";
import type { RulePack } from "@jatbas/aic-core/core/types/rule-pack.js";
import type { FileEntry, RepoMap } from "@jatbas/aic-core/core/types/repo-map.js";
import type { ContextResult } from "@jatbas/aic-core/core/types/selected-file.js";
import type { GuardResult } from "@jatbas/aic-core/core/types/guard-types.js";
import type { TransformResult } from "@jatbas/aic-core/core/types/transform-types.js";
import type { AgenticSessionState } from "@jatbas/aic-core/core/interfaces/agentic-session-state.interface.js";
import type { SessionStep } from "@jatbas/aic-core/core/types/session-dedup-types.js";
import type { SelectedFile } from "@jatbas/aic-core/core/types/selected-file.js";
import type { ToolOutput } from "@jatbas/aic-core/core/types/compilation-types.js";
import { toAbsolutePath, toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import {
  toTokenCount,
  toStepIndex,
  toBytes,
  type TokenCount,
} from "@jatbas/aic-core/core/types/units.js";
import { toSessionId, toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import {
  INCLUSION_TIER,
  TASK_CLASS,
  TOOL_OUTPUT_TYPE,
} from "@jatbas/aic-core/core/types/enums.js";
import { toConfidence, toRelevanceScore } from "@jatbas/aic-core/core/types/scores.js";
import { TypeScriptProvider } from "@jatbas/aic-core/adapters/typescript-provider.js";

const PROJECT_ROOT = toAbsolutePath("/tmp/proj");

function minimalTask(): TaskClassification {
  return {
    taskClass: TASK_CLASS.GENERAL,
    confidence: toConfidence(1),
    matchedKeywords: [],
    subjectTokens: [],
    specificityScore: toConfidence(0),
    underspecificationIndex: toConfidence(0),
  };
}

function minimalRulePack(): RulePack {
  return {
    constraints: [],
    includePatterns: [],
    excludePatterns: [],
  };
}

function minimalRepoMap(): RepoMap {
  return {
    root: PROJECT_ROOT,
    files: [],
    totalFiles: 0,
    totalTokens: toTokenCount(0),
  };
}

function minimalContextResult(): ContextResult {
  return {
    files: [],
    totalTokens: toTokenCount(0),
    truncated: false,
    traceExcludedFiles: [],
  };
}

function minimalGuardResult(): GuardResult {
  return {
    passed: true,
    findings: [],
    filesBlocked: [],
    filesRedacted: [],
    filesWarned: [],
  };
}

function minimalTransformResult(): TransformResult {
  return {
    files: [],
    metadata: [],
  };
}

function sessionStep(tokensCompiled: number): SessionStep {
  return {
    stepIndex: toStepIndex(0),
    stepIntent: null,
    filesSelected: [],
    tiers: {},
    tokensCompiled: toTokenCount(tokensCompiled),
    toolOutputs: [],
    completedAt: toISOTimestamp("2026-01-01T00:00:00.000Z"),
  };
}

function createDeps(overrides: {
  budgetAllocatorAllocate?: ReturnType<typeof vi.fn>;
  conversationCompressorCompress?: ReturnType<typeof vi.fn>;
  agenticSessionState?: AgenticSessionState | null;
  heuristicMaxFiles?: number;
}): PipelineStepsDeps {
  const allocateSpy =
    overrides.budgetAllocatorAllocate ?? vi.fn().mockReturnValue(toTokenCount(10000));
  const compressSpy =
    overrides.conversationCompressorCompress ?? vi.fn().mockReturnValue("");
  return {
    intentClassifier: { classify: vi.fn().mockReturnValue(minimalTask()) },
    rulePackResolver: { resolve: vi.fn().mockReturnValue(minimalRulePack()) },
    budgetAllocator: { allocate: allocateSpy },
    repoMapSupplier: {
      getRepoMap: vi.fn().mockResolvedValue(minimalRepoMap()),
    },
    intentAwareFileDiscoverer: {
      discover: vi.fn().mockReturnValue(minimalRepoMap()),
    },
    contextSelector: {
      selectContext: vi.fn().mockResolvedValue(minimalContextResult()),
    },
    contextGuard: {
      scan: vi.fn().mockResolvedValue({
        result: minimalGuardResult(),
        safeFiles: [],
      }),
    },
    contentTransformerPipeline: {
      transform: vi.fn().mockResolvedValue(minimalTransformResult()),
    },
    summarisationLadder: {
      compress: vi.fn().mockResolvedValue([]),
    },
    languageProviders: [new TypeScriptProvider()],
    lineLevelPruner: {
      prune: vi
        .fn()
        .mockImplementation((files: readonly unknown[]) => Promise.resolve([...files])),
    },
    promptAssembler: {
      assemble: vi.fn().mockResolvedValue({
        prompt: "",
        renderedOverheadTokens: toTokenCount(0),
      }),
    },
    specFileDiscoverer: {
      discover: vi.fn().mockReturnValue(minimalContextResult()),
    },
    conversationCompressor: {
      compress: compressSpy,
    },
    structuralMapBuilder: {
      build: vi.fn().mockReturnValue(""),
    },
    tokenCounter: {
      countTokens: vi.fn().mockReturnValue(toTokenCount(0)),
    },
    heuristicMaxFiles: overrides.heuristicMaxFiles ?? 20,
    agenticSessionState: overrides.agenticSessionState ?? null,
  } as unknown as PipelineStepsDeps;
}

describe("runPipelineSteps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("session_context_derived_from_steps_when_conversationTokens_absent", async () => {
    const steps: readonly SessionStep[] = [
      sessionStep(100),
      sessionStep(200),
      sessionStep(50),
    ];
    const allocateSpy = vi.fn().mockReturnValue(toTokenCount(10000));
    const agenticSessionState: AgenticSessionState = {
      getPreviouslyShownFiles: vi.fn().mockReturnValue([]),
      getSteps: vi.fn().mockReturnValue(steps),
      recordStep: vi.fn(),
    };
    const deps = createDeps({
      budgetAllocatorAllocate: allocateSpy,
      agenticSessionState,
    });
    const request: PipelineStepsRequest = {
      intent: "fix bug",
      projectRoot: PROJECT_ROOT,
      sessionId: toSessionId("00000000-0000-7000-8000-000000000001"),
    };

    await runPipelineSteps(deps, request);

    expect(allocateSpy).toHaveBeenCalledTimes(1);
    const sessionContext = allocateSpy.mock.calls[0]?.[2];
    expect(sessionContext).toBeDefined();
    expect(sessionContext?.conversationTokens).toBeDefined();
    expect(Number(sessionContext?.conversationTokens)).toBe(350);
  });

  it("session_context_unchanged_when_conversationTokens_provided", async () => {
    const explicitTokens = toTokenCount(5000);
    const allocateSpy = vi.fn().mockReturnValue(toTokenCount(10000));
    const agenticSessionState: AgenticSessionState = {
      getPreviouslyShownFiles: vi.fn().mockReturnValue([]),
      getSteps: vi.fn().mockReturnValue([sessionStep(999)]),
      recordStep: vi.fn(),
    };
    const deps = createDeps({
      budgetAllocatorAllocate: allocateSpy,
      agenticSessionState,
    });
    const request: PipelineStepsRequest = {
      intent: "fix bug",
      projectRoot: PROJECT_ROOT,
      sessionId: toSessionId("00000000-0000-7000-8000-000000000002"),
      conversationTokens: explicitTokens,
    };

    await runPipelineSteps(deps, request);

    expect(allocateSpy).toHaveBeenCalledTimes(1);
    const sessionContext = allocateSpy.mock.calls[0]?.[2];
    expect(sessionContext?.conversationTokens).toBe(explicitTokens);
    expect(Number(sessionContext?.conversationTokens)).toBe(5000);
  });

  it("session_context_undefined_when_no_session", async () => {
    const allocateSpy = vi.fn().mockReturnValue(toTokenCount(10000));
    const deps = createDeps({
      budgetAllocatorAllocate: allocateSpy,
      agenticSessionState: null,
    });
    const request: PipelineStepsRequest = {
      intent: "fix bug",
      projectRoot: PROJECT_ROOT,
    };

    await runPipelineSteps(deps, request);

    expect(allocateSpy).toHaveBeenCalledTimes(1);
    const sessionContext = allocateSpy.mock.calls[0]?.[2];
    expect(sessionContext).toBeUndefined();
  });

  it("session_context_zero_when_first_in_session", async () => {
    const allocateSpy = vi.fn().mockReturnValue(toTokenCount(10000));
    const agenticSessionState: AgenticSessionState = {
      getPreviouslyShownFiles: vi.fn().mockReturnValue([]),
      getSteps: vi.fn().mockReturnValue([]),
      recordStep: vi.fn(),
    };
    const deps = createDeps({
      budgetAllocatorAllocate: allocateSpy,
      agenticSessionState,
    });
    const request: PipelineStepsRequest = {
      intent: "fix bug",
      projectRoot: PROJECT_ROOT,
      sessionId: toSessionId("00000000-0000-7000-8000-000000000003"),
    };

    await runPipelineSteps(deps, request);

    expect(allocateSpy).toHaveBeenCalledTimes(1);
    const sessionContext = allocateSpy.mock.calls[0]?.[2];
    expect(sessionContext).toBeDefined();
    expect(sessionContext?.conversationTokens).toBeDefined();
    expect(Number(sessionContext?.conversationTokens)).toBe(0);
  });

  it("session_compressor_receives_only_last_n_steps_when_exceeds_limit", async () => {
    const fifteenSteps = Array.from({ length: 15 }, (_, i) => sessionStep(i * 10));
    const compressSpy = vi.fn().mockReturnValue("");
    const agenticSessionState: AgenticSessionState = {
      getPreviouslyShownFiles: vi.fn().mockReturnValue([]),
      getSteps: vi.fn().mockReturnValue(fifteenSteps),
      recordStep: vi.fn(),
    };
    const deps = createDeps({
      agenticSessionState,
      conversationCompressorCompress: compressSpy,
    });
    const request: PipelineStepsRequest = {
      intent: "fix bug",
      projectRoot: PROJECT_ROOT,
      sessionId: toSessionId("00000000-0000-7000-8000-000000000010"),
    };
    await runPipelineSteps(deps, request);
    expect(compressSpy).toHaveBeenCalledTimes(1);
    expect(compressSpy).toHaveBeenCalledWith(fifteenSteps.slice(-10));
  });

  it("session_compressor_receives_all_steps_when_under_limit", async () => {
    const fiveSteps = Array.from({ length: 5 }, (_, i) => sessionStep(i * 10));
    const compressSpy = vi.fn().mockReturnValue("");
    const agenticSessionState: AgenticSessionState = {
      getPreviouslyShownFiles: vi.fn().mockReturnValue([]),
      getSteps: vi.fn().mockReturnValue(fiveSteps),
      recordStep: vi.fn(),
    };
    const deps = createDeps({
      agenticSessionState,
      conversationCompressorCompress: compressSpy,
    });
    const request: PipelineStepsRequest = {
      intent: "fix bug",
      projectRoot: PROJECT_ROOT,
      sessionId: toSessionId("00000000-0000-7000-8000-000000000011"),
    };
    await runPipelineSteps(deps, request);
    expect(compressSpy).toHaveBeenCalledTimes(1);
    expect(compressSpy).toHaveBeenCalledWith(fiveSteps);
  });

  it("fileLastModified_matches_repoMap_at_scale", async () => {
    const files: readonly FileEntry[] = Array.from({ length: 64 }, (_, i) => ({
      path: toRelativePath(`src/scale-${i}.ts`),
      language: "typescript",
      sizeBytes: toBytes(10),
      estimatedTokens: toTokenCount(1),
      lastModified: toISOTimestamp(`2026-01-01T00:00:00.${String(i).padStart(3, "0")}Z`),
    }));
    const largeRepoMap: RepoMap = {
      root: PROJECT_ROOT,
      files,
      totalFiles: 64,
      totalTokens: toTokenCount(64),
    };
    const getPreviouslyShownFiles = vi.fn().mockReturnValue([]);
    const agenticSessionState: AgenticSessionState = {
      getPreviouslyShownFiles,
      getSteps: vi.fn().mockReturnValue([]),
      recordStep: vi.fn(),
    };
    const deps = createDeps({ agenticSessionState });
    deps.repoMapSupplier.getRepoMap = vi.fn().mockResolvedValue(largeRepoMap);
    deps.intentAwareFileDiscoverer.discover = vi
      .fn()
      .mockImplementation((m: RepoMap) => m);
    const request: PipelineStepsRequest = {
      intent: "fix bug",
      projectRoot: PROJECT_ROOT,
      sessionId: toSessionId("00000000-0000-7000-8000-000000000020"),
    };
    await runPipelineSteps(deps, request);
    expect(getPreviouslyShownFiles).toHaveBeenCalled();
    const firstCall = getPreviouslyShownFiles.mock.calls[0];
    expect(firstCall).toBeDefined();
    const fileLastModifiedArg = firstCall?.[1];
    expect(fileLastModifiedArg).toEqual(
      Object.fromEntries(files.map((f) => [f.path, f.lastModified])),
    );
  });

  it("run_pipeline_steps_forwards_tool_outputs", async () => {
    const deps = createDeps({});
    const toolOutputs: readonly ToolOutput[] = [
      {
        type: TOOL_OUTPUT_TYPE.COMMAND_OUTPUT,
        content: "x",
        relatedFiles: [toRelativePath("src/b.ts")],
      },
    ];
    const request: PipelineStepsRequest = {
      intent: "fix bug",
      projectRoot: PROJECT_ROOT,
      toolOutputs,
    };
    await runPipelineSteps(deps, request);
    const selectContext = deps.contextSelector.selectContext as ReturnType<typeof vi.fn>;
    expect(selectContext).toHaveBeenCalledTimes(1);
    expect(selectContext.mock.calls[0]?.[4]).toBe(toolOutputs);
  });

  it("agentic_dedup_preserves_previouslyShownAtStep_when_not_modified", async () => {
    const paths = Array.from({ length: 8 }, (_, i) =>
      toRelativePath(`src/dedup-${i}.ts`),
    );
    const previous = paths.map((path, i) => ({
      path,
      lastTier: INCLUSION_TIER.L0,
      lastStepIndex: toStepIndex(i + 1),
      modifiedSince: false,
    }));
    const getPreviouslyShownFiles = vi.fn().mockReturnValue(previous);
    const agenticSessionState: AgenticSessionState = {
      getPreviouslyShownFiles,
      getSteps: vi.fn().mockReturnValue([]),
      recordStep: vi.fn(),
    };
    const selectedFromContext: readonly SelectedFile[] = paths.map((path) => ({
      path,
      language: "typescript",
      estimatedTokens: toTokenCount(10),
      relevanceScore: toRelevanceScore(0.5),
      tier: INCLUSION_TIER.L1,
    }));
    const scanSpy = vi.fn().mockResolvedValue({
      result: minimalGuardResult(),
      safeFiles: [],
    });
    const deps = createDeps({ agenticSessionState });
    deps.contextSelector.selectContext = vi.fn().mockResolvedValue({
      files: selectedFromContext,
      totalTokens: toTokenCount(80),
      truncated: false,
    });
    deps.contextGuard.scan = scanSpy;
    const request: PipelineStepsRequest = {
      intent: "fix bug",
      projectRoot: PROJECT_ROOT,
      sessionId: toSessionId("00000000-0000-7000-8000-000000000021"),
    };
    await runPipelineSteps(deps, request);
    expect(scanSpy).toHaveBeenCalled();
    const scanned = scanSpy.mock.calls[0]?.[0] as readonly SelectedFile[] | undefined;
    expect(scanned).toBeDefined();
    for (const path of paths) {
      const file = scanned?.find((f) => f.path === path);
      const prev = previous.find((p) => p.path === path);
      expect(file).toBeDefined();
      expect(prev).toBeDefined();
      expect(file?.previouslyShownAtStep).toBe(prev?.lastStepIndex);
    }
  });

  it("overhead_subtracted_from_budget_for_code_selection", async () => {
    const STRUCTURAL = "structural map text";
    const deps = createDeps({});
    deps.structuralMapBuilder.build = vi.fn().mockReturnValue(STRUCTURAL);
    deps.tokenCounter.countTokens = vi
      .fn()
      .mockImplementation((text: string) =>
        text === STRUCTURAL ? toTokenCount(500) : toTokenCount(0),
      );
    const request: PipelineStepsRequest = {
      intent: "fix bug",
      projectRoot: PROJECT_ROOT,
    };
    await runPipelineSteps(deps, request);
    const selectContext = deps.contextSelector.selectContext as ReturnType<typeof vi.fn>;
    const passedBudget = selectContext.mock.calls[0]?.[2];
    expect(Number(passedBudget)).toBe(10000 - 500 - 100);
  });

  it("auto_maxfiles_derived_from_repo_map", async () => {
    const files: readonly FileEntry[] = Array.from({ length: 400 }, (_, i) => ({
      path: toRelativePath(`src/f-${i}.ts`),
      language: "typescript",
      sizeBytes: toBytes(1),
      estimatedTokens: toTokenCount(1),
      lastModified: toISOTimestamp("2026-01-01T00:00:00.000Z"),
    }));
    const largeRepo: RepoMap = {
      root: PROJECT_ROOT,
      files,
      totalFiles: 400,
      totalTokens: toTokenCount(400),
    };
    const deps = createDeps({ heuristicMaxFiles: 0 });
    deps.repoMapSupplier.getRepoMap = vi.fn().mockResolvedValue(largeRepo);
    deps.intentAwareFileDiscoverer.discover = vi
      .fn()
      .mockImplementation((m: RepoMap) => m);
    const request: PipelineStepsRequest = {
      intent: "fix bug",
      projectRoot: PROJECT_ROOT,
    };
    await runPipelineSteps(deps, request);
    const selectContext = deps.contextSelector.selectContext as ReturnType<typeof vi.fn>;
    const rp = selectContext.mock.calls[0]?.[3] as RulePack;
    expect(rp.maxFilesOverride).toBe(20);
  });

  it("explicit_maxfiles_passes_through", async () => {
    const deps = createDeps({ heuristicMaxFiles: 15 });
    const request: PipelineStepsRequest = {
      intent: "fix bug",
      projectRoot: PROJECT_ROOT,
    };
    await runPipelineSteps(deps, request);
    const selectContext = deps.contextSelector.selectContext as ReturnType<typeof vi.fn>;
    const rp = selectContext.mock.calls[0]?.[3] as RulePack;
    expect(rp.maxFilesOverride).toBe(15);
  });

  it("resolveAutoMaxFiles_scales_for_large_context", async () => {
    const files: readonly FileEntry[] = Array.from({ length: 1600 }, (_, i) => ({
      path: toRelativePath(`src/f-${i}.ts`),
      language: "typescript",
      sizeBytes: toBytes(1),
      estimatedTokens: toTokenCount(1),
      lastModified: toISOTimestamp("2026-01-01T00:00:00.000Z"),
    }));
    const largeRepo: RepoMap = {
      root: PROJECT_ROOT,
      files,
      totalFiles: 1600,
      totalTokens: toTokenCount(1600),
    };
    const deps = createDeps({ heuristicMaxFiles: 0 });
    deps.repoMapSupplier.getRepoMap = vi.fn().mockResolvedValue(largeRepo);
    deps.intentAwareFileDiscoverer.discover = vi
      .fn()
      .mockImplementation((m: RepoMap) => m);
    const request: PipelineStepsRequest = {
      intent: "fix bug",
      projectRoot: PROJECT_ROOT,
      contextWindow: toTokenCount(650_000),
    };
    await runPipelineSteps(deps, request);
    const selectContext = deps.contextSelector.selectContext as ReturnType<typeof vi.fn>;
    const rp = selectContext.mock.calls[0]?.[3] as RulePack;
    expect(rp.maxFilesOverride).toBe(204);
  });

  it("run_pipeline_steps_recompresses_when_prompt_total_exceeds_budget", async () => {
    const allocateSpy = vi.fn().mockReturnValue(toTokenCount(500));
    const compressSpy = vi.fn().mockResolvedValue([]);
    const assembleSpy = vi
      .fn()
      .mockResolvedValueOnce({
        prompt: "FIRST",
        renderedOverheadTokens: toTokenCount(50),
      })
      .mockResolvedValueOnce({
        prompt: "SECOND_SMALL",
        renderedOverheadTokens: toTokenCount(5),
      });
    const countSpy = vi.fn().mockImplementation((text: string) => {
      if (text === "FIRST") return toTokenCount(600);
      if (text === "SECOND_SMALL") return toTokenCount(80);
      return toTokenCount(0);
    });
    const deps = createDeps({
      budgetAllocatorAllocate: allocateSpy,
    });
    deps.summarisationLadder.compress = compressSpy;
    deps.promptAssembler.assemble = assembleSpy;
    deps.tokenCounter.countTokens = countSpy;
    const transformFiles: readonly SelectedFile[] = [
      {
        path: toRelativePath("a.ts"),
        language: "ts",
        estimatedTokens: toTokenCount(100),
        relevanceScore: toRelevanceScore(0.5),
        tier: INCLUSION_TIER.L0,
      },
    ];
    deps.contentTransformerPipeline.transform = vi.fn().mockResolvedValue({
      files: transformFiles,
      metadata: [],
    });
    deps.contextSelector.selectContext = vi.fn().mockResolvedValue({
      files: transformFiles,
      totalTokens: toTokenCount(100),
      truncated: false,
      traceExcludedFiles: [],
    });
    deps.contextGuard.scan = vi.fn().mockResolvedValue({
      result: minimalGuardResult(),
      safeFiles: transformFiles,
    });
    const r = await runPipelineSteps(deps, {
      intent: "x",
      projectRoot: PROJECT_ROOT,
    });
    expect(compressSpy).toHaveBeenCalledTimes(2);
    const secondBudget = compressSpy.mock.calls[1]?.[1] as TokenCount | undefined;
    expect(Number(secondBudget)).toBe(350);
    expect(Number(r.promptTotal)).toBe(80);
    expect(r.assembledPrompt).toBe("SECOND_SMALL");
  });
});
