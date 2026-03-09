// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { InspectRunner as IInspectRunner } from "@jatbas/aic-core/core/interfaces/inspect-runner.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { PipelineStepsDeps } from "@jatbas/aic-core/core/run-pipeline-steps.js";
import type {
  InspectRequest,
  PipelineTrace,
} from "@jatbas/aic-core/core/types/inspect-types.js";
import { toPercentage } from "@jatbas/aic-core/core/types/scores.js";
import {
  sumFileTokens,
  sumTransformTokens,
  buildSummarisationTiers,
} from "@jatbas/aic-core/core/token-summary.js";
import { runPipelineSteps } from "@jatbas/aic-core/core/run-pipeline-steps.js";

export class InspectRunner implements IInspectRunner {
  constructor(
    private readonly deps: PipelineStepsDeps,
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
        afterPrune: sumFileTokens(r.prunedFiles),
        promptTotal: r.promptTotal,
        reductionPct,
      },
      compiledAt: this.clock.now(),
    };
  }
}
