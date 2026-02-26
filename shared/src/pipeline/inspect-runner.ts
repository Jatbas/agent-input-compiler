import type { InspectRunner as IInspectRunner } from "#core/interfaces/inspect-runner.interface.js";
import type { Clock } from "#core/interfaces/clock.interface.js";
import type { PipelineStepsDeps } from "#core/run-pipeline-steps.js";
import type { InspectRequest, PipelineTrace } from "#core/types/inspect-types.js";
import { toPercentage } from "#core/types/scores.js";
import {
  sumFileTokens,
  sumTransformTokens,
  buildSummarisationTiers,
} from "#core/token-summary.js";
import { runPipelineSteps } from "#core/run-pipeline-steps.js";

export class InspectRunner implements IInspectRunner {
  constructor(
    public readonly deps: PipelineStepsDeps,
    private readonly clock: Clock,
  ) {}

  async inspect(request: InspectRequest): Promise<PipelineTrace> {
    const r = await runPipelineSteps(this.deps, {
      intent: request.intent,
      projectRoot: request.projectRoot,
    });
    const raw = r.repoMap.totalTokens;
    const rawNum = raw;
    const reductionPct =
      rawNum > 0 ? toPercentage((rawNum - r.promptTotal) / rawNum) : toPercentage(0);
    const rulePacks = ["built-in:default", `built-in:${r.task.taskClass}`] as const;
    return {
      intent: request.intent,
      taskClass: r.task,
      rulePacks: [...rulePacks],
      budget: r.budget,
      selectedFiles: [...r.selectedFiles],
      guard: r.guardResult,
      transforms: [...r.transformResult.metadata],
      summarisationTiers: buildSummarisationTiers(r.ladderFiles),
      constraints: [...r.rulePack.constraints],
      tokenSummary: {
        raw,
        selected: r.contextResult.totalTokens,
        afterGuard: sumFileTokens(r.safeFiles),
        afterTransforms: sumTransformTokens(r.transformResult.metadata),
        afterLadder: sumFileTokens(r.ladderFiles),
        promptTotal: r.promptTotal,
        reductionPct,
      },
      compiledAt: this.clock.now(),
    };
  }
}
