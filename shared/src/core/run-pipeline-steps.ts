// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { AbsolutePath } from "#core/types/paths.js";
import type { IntentClassifier } from "#core/interfaces/intent-classifier.interface.js";
import type { RulePackResolver } from "#core/interfaces/rule-pack-resolver.interface.js";
import type { BudgetAllocator } from "#core/interfaces/budget-allocator.interface.js";
import type { ContextSelector } from "#core/interfaces/context-selector.interface.js";
import type { ContextGuard } from "#core/interfaces/context-guard.interface.js";
import type { ContentTransformerPipeline } from "#core/interfaces/content-transformer-pipeline.interface.js";
import type { SummarisationLadder } from "#core/interfaces/summarisation-ladder.interface.js";
import type { LineLevelPruner } from "#core/interfaces/line-level-pruner.interface.js";
import type { PromptAssembler } from "#core/interfaces/prompt-assembler.interface.js";
import type { StructuralMapBuilder } from "#core/interfaces/structural-map-builder.interface.js";
import type { RepoMapSupplier } from "#core/interfaces/repo-map-supplier.interface.js";
import type { SpecFileDiscoverer } from "#core/interfaces/spec-file-discoverer.interface.js";
import type { IntentAwareFileDiscoverer } from "#core/interfaces/intent-aware-file-discoverer.interface.js";
import type { TokenCounter } from "#core/interfaces/token-counter.interface.js";
import type { AgenticSessionState } from "#core/interfaces/agentic-session-state.interface.js";
import type { ConversationCompressor } from "#core/interfaces/conversation-compressor.interface.js";
import type { PreviousFile } from "#core/types/session-dedup-types.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { RepoMap } from "#core/types/repo-map.js";
import type { ContextResult } from "#core/types/selected-file.js";
import type { GuardResult } from "#core/types/guard-types.js";
import type { TransformResult } from "#core/types/transform-types.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { TokenCount, StepIndex } from "#core/types/units.js";
import type { SessionId, ISOTimestamp } from "#core/types/identifiers.js";
import type { SessionBudgetContext } from "#core/types/session-budget-context.js";
import { toTokenCount } from "#core/types/units.js";
import { OUTPUT_FORMAT } from "#core/types/enums.js";

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
}

export interface PipelineStepsRequest {
  readonly intent: string;
  readonly projectRoot: AbsolutePath;
  readonly sessionId?: SessionId;
  readonly stepIndex?: StepIndex;
  readonly stepIntent?: string;
  readonly conversationTokens?: TokenCount;
}

export interface PipelineStepsResult {
  readonly task: TaskClassification;
  readonly rulePack: RulePack;
  readonly budget: TokenCount;
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
    path.startsWith(".cursor/skills/") ||
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

export async function runPipelineSteps(
  deps: PipelineStepsDeps,
  request: PipelineStepsRequest,
  repoMapOverride?: RepoMap,
): Promise<PipelineStepsResult> {
  const task = deps.intentClassifier.classify(request.intent);
  const rulePack = deps.rulePackResolver.resolve(task, request.projectRoot);
  const sessionContext = deriveSessionContext(request, deps);
  const budget = deps.budgetAllocator.allocate(rulePack, task.taskClass, sessionContext);
  const repoMap =
    repoMapOverride ?? (await deps.repoMapSupplier.getRepoMap(request.projectRoot));
  const discoveredRepoMap = deps.intentAwareFileDiscoverer.discover(
    repoMap,
    task,
    rulePack,
  );
  const contextResult = await deps.contextSelector.selectContext(
    task,
    discoveredRepoMap,
    budget,
    rulePack,
  );
  const fileLastModified = repoMap.files.reduce<Record<string, ISOTimestamp>>(
    (acc, f) => ({ ...acc, [f.path]: f.lastModified }),
    {},
  );
  const selectedFilesAfterDedup =
    request.sessionId && deps.agenticSessionState
      ? (() => {
          const previous = deps.agenticSessionState.getPreviouslyShownFiles(
            request.sessionId,
            fileLastModified,
          );
          const byPath = previous.reduce<Readonly<Record<string, PreviousFile>>>(
            (acc, p) => ({ ...acc, [p.path]: p }),
            {},
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
  const specRepoMap = buildSpecRepoMap(repoMap);
  const specContextResult = deps.specFileDiscoverer.discover(specRepoMap, task, rulePack);
  const specLadderFiles =
    specContextResult.files.length === 0
      ? []
      : await (async () => {
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
              Math.floor(Number(budget) * 0.2),
            ),
          );
          return deps.summarisationLadder.compress(
            specTransformResult.files,
            specBudget,
            task.subjectTokens,
          );
        })();
  const { result: guardResult, safeFiles } = await deps.contextGuard.scan(selectedFiles);
  const transformResult = await deps.contentTransformerPipeline.transform(
    safeFiles,
    TRANSFORM_CONTEXT,
  );
  const ladderFiles = await deps.summarisationLadder.compress(
    transformResult.files,
    budget,
    task.subjectTokens,
  );
  const prunedFiles =
    task.subjectTokens.length > 0
      ? await deps.lineLevelPruner.prune(ladderFiles, task.subjectTokens)
      : ladderFiles;
  const sessionContextSummary =
    request.sessionId && deps.agenticSessionState
      ? deps.conversationCompressor.compress(
          deps.agenticSessionState.getSteps(request.sessionId),
        )
      : "";
  const structuralMap = deps.structuralMapBuilder.build(repoMap);
  const assembledPrompt = await deps.promptAssembler.assemble(
    task,
    prunedFiles,
    rulePack.constraints,
    OUTPUT_FORMAT.UNIFIED_DIFF,
    specLadderFiles,
    sessionContextSummary,
    structuralMap,
  );
  const promptTotal = deps.tokenCounter.countTokens(assembledPrompt);
  return {
    task,
    rulePack,
    budget,
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
