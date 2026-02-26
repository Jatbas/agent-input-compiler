import type { AbsolutePath } from "#core/types/paths.js";
import type { IntentClassifier } from "#core/interfaces/intent-classifier.interface.js";
import type { RulePackResolver } from "#core/interfaces/rule-pack-resolver.interface.js";
import type { BudgetAllocator } from "#core/interfaces/budget-allocator.interface.js";
import type { ContextSelector } from "#core/interfaces/context-selector.interface.js";
import type { ContextGuard } from "#core/interfaces/context-guard.interface.js";
import type { ContentTransformerPipeline } from "#core/interfaces/content-transformer-pipeline.interface.js";
import type { SummarisationLadder } from "#core/interfaces/summarisation-ladder.interface.js";
import type { PromptAssembler } from "#core/interfaces/prompt-assembler.interface.js";
import type { RepoMapSupplier } from "#core/interfaces/repo-map-supplier.interface.js";
import type { TokenCounter } from "#core/interfaces/token-counter.interface.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { RepoMap } from "#core/types/repo-map.js";
import type { ContextResult } from "#core/types/selected-file.js";
import type { GuardResult } from "#core/types/guard-types.js";
import type { TransformResult } from "#core/types/transform-types.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { TokenCount } from "#core/types/units.js";
import { OUTPUT_FORMAT } from "#core/types/enums.js";

export interface PipelineStepsDeps {
  readonly intentClassifier: IntentClassifier;
  readonly rulePackResolver: RulePackResolver;
  readonly budgetAllocator: BudgetAllocator;
  readonly contextSelector: ContextSelector;
  readonly contextGuard: ContextGuard;
  readonly contentTransformerPipeline: ContentTransformerPipeline;
  readonly summarisationLadder: SummarisationLadder;
  readonly promptAssembler: PromptAssembler;
  readonly repoMapSupplier: RepoMapSupplier;
  readonly tokenCounter: TokenCounter;
}

export interface PipelineStepsRequest {
  readonly intent: string;
  readonly projectRoot: AbsolutePath;
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
  readonly assembledPrompt: string;
  readonly promptTotal: TokenCount;
}

const TRANSFORM_CONTEXT = {
  directTargetPaths: [],
  rawMode: false,
} as const;

export async function runPipelineSteps(
  deps: PipelineStepsDeps,
  request: PipelineStepsRequest,
  repoMapOverride?: RepoMap,
): Promise<PipelineStepsResult> {
  const task = deps.intentClassifier.classify(request.intent);
  const rulePack = deps.rulePackResolver.resolve(task, request.projectRoot);
  const budget = deps.budgetAllocator.allocate(rulePack, task.taskClass);
  const repoMap =
    repoMapOverride ?? (await deps.repoMapSupplier.getRepoMap(request.projectRoot));
  const contextResult = deps.contextSelector.selectContext(
    task,
    repoMap,
    budget,
    rulePack,
  );
  const selectedFiles = contextResult.files;
  const { result: guardResult, safeFiles } = deps.contextGuard.scan(selectedFiles);
  const transformResult = deps.contentTransformerPipeline.transform(
    safeFiles,
    TRANSFORM_CONTEXT,
  );
  const ladderFiles = deps.summarisationLadder.compress(transformResult.files, budget);
  const assembledPrompt = deps.promptAssembler.assemble(
    task,
    ladderFiles,
    rulePack.constraints,
    OUTPUT_FORMAT.UNIFIED_DIFF,
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
    assembledPrompt,
    promptTotal,
  };
}
