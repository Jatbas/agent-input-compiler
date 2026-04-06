// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { IntentClassifier } from "@jatbas/aic-core/core/interfaces/intent-classifier.interface.js";
import type { RulePackResolver } from "@jatbas/aic-core/core/interfaces/rule-pack-resolver.interface.js";
import type { BudgetAllocator } from "@jatbas/aic-core/core/interfaces/budget-allocator.interface.js";
import type { ContextSelector } from "@jatbas/aic-core/core/interfaces/context-selector.interface.js";
import type { ContextGuard } from "@jatbas/aic-core/core/interfaces/context-guard.interface.js";
import type { ContentTransformerPipeline } from "@jatbas/aic-core/core/interfaces/content-transformer-pipeline.interface.js";
import type { SummarisationLadder } from "@jatbas/aic-core/core/interfaces/summarisation-ladder.interface.js";
import type { LineLevelPruner } from "@jatbas/aic-core/core/interfaces/line-level-pruner.interface.js";
import type { PromptAssembler } from "@jatbas/aic-core/core/interfaces/prompt-assembler.interface.js";
import type { StructuralMapBuilder } from "@jatbas/aic-core/core/interfaces/structural-map-builder.interface.js";
import type { RepoMapSupplier } from "@jatbas/aic-core/core/interfaces/repo-map-supplier.interface.js";
import type { SpecFileDiscoverer } from "@jatbas/aic-core/core/interfaces/spec-file-discoverer.interface.js";
import type { IntentAwareFileDiscoverer } from "@jatbas/aic-core/core/interfaces/intent-aware-file-discoverer.interface.js";
import type { TokenCounter } from "@jatbas/aic-core/core/interfaces/token-counter.interface.js";
import type { AgenticSessionState } from "@jatbas/aic-core/core/interfaces/agentic-session-state.interface.js";
import type { ConversationCompressor } from "@jatbas/aic-core/core/interfaces/conversation-compressor.interface.js";
import type { PreviousFile } from "@jatbas/aic-core/core/types/session-dedup-types.js";
import type { TaskClassification } from "@jatbas/aic-core/core/types/task-classification.js";
import type { RulePack } from "@jatbas/aic-core/core/types/rule-pack.js";
import type { RepoMap } from "@jatbas/aic-core/core/types/repo-map.js";
import type { ContextResult } from "@jatbas/aic-core/core/types/selected-file.js";
import type { GuardResult } from "@jatbas/aic-core/core/types/guard-types.js";
import type { TransformResult } from "@jatbas/aic-core/core/types/transform-types.js";
import type { SelectedFile } from "@jatbas/aic-core/core/types/selected-file.js";
import type { TokenCount, StepIndex } from "@jatbas/aic-core/core/types/units.js";
import type { SessionId, ISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import type { ToolOutput } from "@jatbas/aic-core/core/types/compilation-types.js";
import type { SessionBudgetContext } from "@jatbas/aic-core/core/types/session-budget-context.js";
import type { ProjectProfile } from "@jatbas/aic-core/core/types/project-profile.js";
import { computeProjectProfile } from "@jatbas/aic-core/pipeline/compute-project-profile.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";

export interface PipelineStepsDeps {
  readonly intentClassifier: IntentClassifier;
  readonly rulePackResolver: RulePackResolver;
  readonly budgetAllocator: BudgetAllocator;
  readonly contextSelector: ContextSelector;
  readonly contextGuard: ContextGuard;
  readonly contentTransformerPipeline: ContentTransformerPipeline;
  readonly summarisationLadder: SummarisationLadder;
  readonly lineLevelPruner: LineLevelPruner;
  readonly promptAssembler: PromptAssembler;
  readonly repoMapSupplier: RepoMapSupplier;
  readonly intentAwareFileDiscoverer: IntentAwareFileDiscoverer;
  readonly tokenCounter: TokenCounter;
  readonly specFileDiscoverer: SpecFileDiscoverer;
  readonly conversationCompressor: ConversationCompressor;
  readonly structuralMapBuilder: StructuralMapBuilder;
  readonly agenticSessionState?: AgenticSessionState | null;
  readonly heuristicMaxFiles: number;
}

export interface PipelineStepsRequest {
  readonly intent: string;
  readonly projectRoot: AbsolutePath;
  readonly sessionId?: SessionId;
  readonly stepIndex?: StepIndex;
  readonly stepIntent?: string;
  readonly conversationTokens?: TokenCount;
  readonly toolOutputs?: readonly ToolOutput[];
}

export interface PipelineStepsResult {
  readonly task: TaskClassification;
  readonly rulePack: RulePack;
  readonly budget: TokenCount;
  readonly codeBudget: TokenCount;
  readonly repoMap: RepoMap;
  readonly contextResult: ContextResult;
  readonly selectedFiles: readonly SelectedFile[];
  readonly guardResult: GuardResult;
  readonly safeFiles: readonly SelectedFile[];
  readonly transformResult: TransformResult;
  readonly ladderFiles: readonly SelectedFile[];
  readonly prunedFiles: readonly SelectedFile[];
  readonly assembledPrompt: string;
  readonly promptTotal: TokenCount;
}

const TRANSFORM_CONTEXT = {
  directTargetPaths: [],
  rawMode: false,
} as const;

function isSpecPath(path: string): boolean {
  return (
    path.startsWith("documentation/") ||
    path.startsWith(".cursor/rules/") ||
    path.startsWith(".claude/skills/") ||
    path.startsWith("adr-")
  );
}

function buildSpecRepoMap(repoMap: RepoMap): RepoMap {
  const specFiles = repoMap.files.filter((f) => isSpecPath(f.path));
  const total = specFiles.reduce((sum, f) => sum + f.estimatedTokens, 0);
  return {
    root: repoMap.root,
    files: specFiles,
    totalFiles: specFiles.length,
    totalTokens: toTokenCount(total),
  };
}

function deriveSessionContext(
  request: PipelineStepsRequest,
  deps: PipelineStepsDeps,
): SessionBudgetContext | undefined {
  if (request.conversationTokens !== undefined) {
    return { conversationTokens: request.conversationTokens };
  }
  if (request.sessionId !== undefined && deps.agenticSessionState) {
    const steps = deps.agenticSessionState.getSteps(request.sessionId);
    const sum = steps.reduce((acc, step) => acc + Number(step.tokensCompiled), 0);
    return { conversationTokens: toTokenCount(sum) };
  }
  return undefined;
}

const RECENT_STEPS_LIMIT = 10;

function resolveAutoMaxFiles(
  profile: ProjectProfile,
  configuredMaxFiles: number,
): number {
  if (configuredMaxFiles === 0) {
    return Math.max(5, Math.min(40, Math.ceil(Math.sqrt(profile.totalFiles))));
  }
  return configuredMaxFiles;
}

function computeOverheadTokens(
  structuralMapTokens: number,
  sessionContextTokens: number,
  specTokens: number,
  constraintsTokens: number,
): number {
  return (
    structuralMapTokens + sessionContextTokens + specTokens + constraintsTokens + 100
  );
}

async function loadSpecLadderFiles(
  deps: PipelineStepsDeps,
  task: TaskClassification,
  rulePack: RulePack,
  repoMap: RepoMap,
  totalBudget: TokenCount,
): Promise<readonly SelectedFile[]> {
  const specRepoMap = buildSpecRepoMap(repoMap);
  const specContextResult = deps.specFileDiscoverer.discover(specRepoMap, task, rulePack);
  if (specContextResult.files.length === 0) {
    return [];
  }
  const { safeFiles: specSafeFiles } = await deps.contextGuard.scan(
    specContextResult.files,
  );
  const specTransformResult = await deps.contentTransformerPipeline.transform(
    specSafeFiles,
    TRANSFORM_CONTEXT,
  );
  const specBudget = toTokenCount(
    Math.min(
      Number(specContextResult.totalTokens),
      Math.floor(Number(totalBudget) * 0.2),
    ),
  );
  return deps.summarisationLadder.compress(
    specTransformResult.files,
    specBudget,
    task.subjectTokens,
  );
}

export async function runPipelineSteps(
  deps: PipelineStepsDeps,
  request: PipelineStepsRequest,
  repoMapOverride?: RepoMap,
): Promise<PipelineStepsResult> {
  const task = deps.intentClassifier.classify(request.intent);
  const rulePack = deps.rulePackResolver.resolve(task, request.projectRoot);
  const sessionContext = deriveSessionContext(request, deps);
  const totalBudget = deps.budgetAllocator.allocate(
    rulePack,
    task.taskClass,
    sessionContext,
  );
  const repoMap =
    repoMapOverride ?? (await deps.repoMapSupplier.getRepoMap(request.projectRoot));
  const profile = computeProjectProfile(repoMap);
  const structuralMap = deps.structuralMapBuilder.build(repoMap);
  const structuralMapTokens = Number(deps.tokenCounter.countTokens(structuralMap));
  const sessionContextSummary =
    request.sessionId && deps.agenticSessionState
      ? deps.conversationCompressor.compress(
          deps.agenticSessionState.getSteps(request.sessionId).slice(-RECENT_STEPS_LIMIT),
        )
      : "";
  const sessionContextTokens = Number(
    deps.tokenCounter.countTokens(sessionContextSummary),
  );
  const specLadderFiles = await loadSpecLadderFiles(
    deps,
    task,
    rulePack,
    repoMap,
    totalBudget,
  );
  const specTokens = specLadderFiles.reduce(
    (sum, f) => sum + Number(f.estimatedTokens),
    0,
  );
  const constraintsTokens = Number(
    deps.tokenCounter.countTokens(rulePack.constraints.join("\n")),
  );
  const overhead = computeOverheadTokens(
    structuralMapTokens,
    sessionContextTokens,
    specTokens,
    constraintsTokens,
  );
  const codeBudget = toTokenCount(Math.max(0, Number(totalBudget) - overhead));
  const effectiveMaxFiles = resolveAutoMaxFiles(profile, deps.heuristicMaxFiles);
  const mergedRulePack: RulePack = { ...rulePack, maxFilesOverride: effectiveMaxFiles };
  const discoveredRepoMap = deps.intentAwareFileDiscoverer.discover(
    repoMap,
    task,
    mergedRulePack,
  );
  const contextResult = await deps.contextSelector.selectContext(
    task,
    discoveredRepoMap,
    codeBudget,
    mergedRulePack,
    request.toolOutputs,
  );
  const fileLastModified: Record<string, ISOTimestamp> = Object.fromEntries(
    repoMap.files.map((f): [string, ISOTimestamp] => [f.path, f.lastModified]),
  );
  const selectedFilesAfterDedup =
    request.sessionId && deps.agenticSessionState
      ? (() => {
          const previous = deps.agenticSessionState.getPreviouslyShownFiles(
            request.sessionId,
            fileLastModified,
          );
          const byPath: Readonly<Record<string, PreviousFile>> = Object.fromEntries(
            previous.map((p): [string, PreviousFile] => [p.path, p]),
          );
          return contextResult.files.map((f) => {
            const prev = byPath[f.path];
            if (prev && !prev.modifiedSince) {
              return { ...f, previouslyShownAtStep: prev.lastStepIndex };
            }
            return f;
          });
        })()
      : contextResult.files;
  const selectedFiles = selectedFilesAfterDedup;
  const { result: guardResult, safeFiles } = await deps.contextGuard.scan(selectedFiles);
  const transformResult = await deps.contentTransformerPipeline.transform(
    safeFiles,
    TRANSFORM_CONTEXT,
  );
  const ladderFiles = await deps.summarisationLadder.compress(
    transformResult.files,
    codeBudget,
    task.subjectTokens,
  );
  const prunedFiles =
    task.subjectTokens.length > 0
      ? await deps.lineLevelPruner.prune(ladderFiles, task.subjectTokens)
      : ladderFiles;
  const assembledPrompt = await deps.promptAssembler.assemble(
    task,
    prunedFiles,
    rulePack.constraints,
    specLadderFiles,
    sessionContextSummary,
    structuralMap,
  );
  const promptTotal = deps.tokenCounter.countTokens(assembledPrompt);
  return {
    task,
    rulePack,
    budget: totalBudget,
    codeBudget,
    repoMap,
    contextResult,
    selectedFiles,
    guardResult,
    safeFiles,
    transformResult,
    ladderFiles,
    prunedFiles,
    assembledPrompt,
    promptTotal,
  };
}
