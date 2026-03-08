import { describe, it, expect, vi, beforeEach } from "vitest";
import { runPipelineSteps } from "../run-pipeline-steps.js";
import type {
  PipelineStepsDeps,
  PipelineStepsRequest,
} from "#core/run-pipeline-steps.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { RepoMap } from "#core/types/repo-map.js";
import type { ContextResult } from "#core/types/selected-file.js";
import type { GuardResult } from "#core/types/guard-types.js";
import type { TransformResult } from "#core/types/transform-types.js";
import type { AgenticSessionState } from "#core/interfaces/agentic-session-state.interface.js";
import type { SessionStep } from "#core/types/session-dedup-types.js";
import { toAbsolutePath } from "#core/types/paths.js";
import { toTokenCount, toStepIndex } from "#core/types/units.js";
import { toSessionId, toISOTimestamp } from "#core/types/identifiers.js";
import { TASK_CLASS } from "#core/types/enums.js";
import { toConfidence } from "#core/types/scores.js";

const PROJECT_ROOT = toAbsolutePath("/tmp/proj");

function minimalTask(): TaskClassification {
  return {
    taskClass: TASK_CLASS.GENERAL,
    confidence: toConfidence(1),
    matchedKeywords: [],
    subjectTokens: [],
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
  agenticSessionState?: AgenticSessionState | null;
}): PipelineStepsDeps {
  const allocateSpy =
    overrides.budgetAllocatorAllocate ?? vi.fn().mockReturnValue(toTokenCount(10000));
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
    lineLevelPruner: {
      prune: vi
        .fn()
        .mockImplementation((files: readonly unknown[]) => Promise.resolve([...files])),
    },
    promptAssembler: {
      assemble: vi.fn().mockResolvedValue(""),
    },
    specFileDiscoverer: {
      discover: vi.fn().mockReturnValue(minimalContextResult()),
    },
    conversationCompressor: {
      compress: vi.fn().mockReturnValue(""),
    },
    structuralMapBuilder: {
      build: vi.fn().mockReturnValue(""),
    },
    tokenCounter: {
      countTokens: vi.fn().mockReturnValue(toTokenCount(0)),
    },
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
});
