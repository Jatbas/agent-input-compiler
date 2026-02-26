import type { InspectRunner as IInspectRunner } from "#core/interfaces/inspect-runner.interface.js";
import type { IntentClassifier } from "#core/interfaces/intent-classifier.interface.js";
import type { RulePackResolver } from "#core/interfaces/rule-pack-resolver.interface.js";
import type { BudgetAllocator } from "#core/interfaces/budget-allocator.interface.js";
import type { ContextSelector } from "#core/interfaces/context-selector.interface.js";
import type { ContextGuard } from "#core/interfaces/context-guard.interface.js";
import type { ContentTransformerPipeline } from "#core/interfaces/content-transformer-pipeline.interface.js";
import type { SummarisationLadder } from "#core/interfaces/summarisation-ladder.interface.js";
import type { PromptAssembler } from "#core/interfaces/prompt-assembler.interface.js";
import type { RepoMapSupplier } from "#core/interfaces/repo-map-supplier.interface.js";
import type { Clock } from "#core/interfaces/clock.interface.js";
import type { TokenCounter } from "#core/interfaces/token-counter.interface.js";
import type { InspectRequest, PipelineTrace } from "#core/types/inspect-types.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { TokenCount } from "#core/types/units.js";
import type { InclusionTier } from "#core/types/enums.js";
import { toTokenCount } from "#core/types/units.js";
import { toPercentage } from "#core/types/scores.js";
import { INCLUSION_TIER, OUTPUT_FORMAT } from "#core/types/enums.js";

function sumFileTokens(files: readonly SelectedFile[]): TokenCount {
  const n = files.reduce((acc, f) => acc + (f.estimatedTokens as number), 0);
  return toTokenCount(n);
}

function sumTransformTokens(
  metadata: readonly { readonly transformedTokens: TokenCount }[],
): TokenCount {
  const n = metadata.reduce((acc, m) => acc + (m.transformedTokens as number), 0);
  return toTokenCount(n);
}

function buildSummarisationTiers(
  files: readonly SelectedFile[],
): Readonly<Record<InclusionTier, number>> {
  const initial: Record<InclusionTier, number> = {
    [INCLUSION_TIER.L0]: 0,
    [INCLUSION_TIER.L1]: 0,
    [INCLUSION_TIER.L2]: 0,
    [INCLUSION_TIER.L3]: 0,
  };
  return files.reduce(
    (acc, f) => ({ ...acc, [f.tier]: acc[f.tier] + 1 }),
    initial,
  ) as Readonly<Record<InclusionTier, number>>;
}

export class InspectRunner implements IInspectRunner {
  constructor(
    private readonly intentClassifier: IntentClassifier,
    private readonly rulePackResolver: RulePackResolver,
    private readonly budgetAllocator: BudgetAllocator,
    private readonly contextSelector: ContextSelector,
    private readonly contextGuard: ContextGuard,
    private readonly contentTransformerPipeline: ContentTransformerPipeline,
    private readonly summarisationLadder: SummarisationLadder,
    private readonly promptAssembler: PromptAssembler,
    private readonly repoMapSupplier: RepoMapSupplier,
    private readonly clock: Clock,
    private readonly tokenCounter: TokenCounter,
  ) {}

  async inspect(request: InspectRequest): Promise<PipelineTrace> {
    const task = this.intentClassifier.classify(request.intent);
    const rulePack = this.rulePackResolver.resolve(task, request.projectRoot);
    const budget = this.budgetAllocator.allocate(rulePack, task.taskClass);
    const repoMap = await this.repoMapSupplier.getRepoMap(request.projectRoot);
    const contextResult = this.contextSelector.selectContext(
      task,
      repoMap,
      budget,
      rulePack,
    );
    const selectedFiles = contextResult.files;
    const { result: guardResult, safeFiles } = this.contextGuard.scan(selectedFiles);
    const transformContext = { directTargetPaths: [], rawMode: false } as const;
    const transformResult = this.contentTransformerPipeline.transform(
      safeFiles,
      transformContext,
    );
    const ladderFiles = this.summarisationLadder.compress(transformResult.files, budget);
    const assembledPrompt = this.promptAssembler.assemble(
      task,
      ladderFiles,
      rulePack.constraints,
      OUTPUT_FORMAT.UNIFIED_DIFF,
    );
    const promptTotal = this.tokenCounter.countTokens(assembledPrompt);

    const raw = repoMap.totalTokens;
    const selected = contextResult.totalTokens;
    const afterGuard = sumFileTokens(safeFiles);
    const afterTransforms = sumTransformTokens(transformResult.metadata);
    const afterLadder = sumFileTokens(ladderFiles);
    const rawNum = raw as number;
    const reductionPct =
      rawNum > 0
        ? toPercentage((rawNum - (promptTotal as number)) / rawNum)
        : toPercentage(0);

    const rulePacks = ["built-in:default", `built-in:${task.taskClass}`] as const;

    return {
      intent: request.intent,
      taskClass: task,
      rulePacks: [...rulePacks],
      budget,
      selectedFiles: [...selectedFiles],
      guard: guardResult,
      transforms: [...transformResult.metadata],
      summarisationTiers: buildSummarisationTiers(ladderFiles),
      constraints: [...rulePack.constraints],
      tokenSummary: {
        raw,
        selected,
        afterGuard,
        afterTransforms,
        afterLadder,
        promptTotal,
        reductionPct,
      },
      compiledAt: this.clock.now(),
    };
  }
}
