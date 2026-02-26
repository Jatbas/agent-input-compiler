import type { CompilationRunner as ICompilationRunner } from "#core/interfaces/compilation-runner.interface.js";
import type {
  CompilationRequest,
  CompilationMeta,
} from "#core/types/compilation-types.js";
import type { Clock } from "#core/interfaces/clock.interface.js";
import type { CacheStore } from "#core/interfaces/cache-store.interface.js";
import type { ConfigStore } from "#core/interfaces/config-store.interface.js";
import type { StringHasher } from "#core/interfaces/string-hasher.interface.js";
import type { PipelineStepsDeps } from "#core/run-pipeline-steps.js";
import type { RepoMap, FileEntry } from "#core/types/repo-map.js";
import { toTokenCount } from "#core/types/units.js";
import { toMilliseconds } from "#core/types/units.js";
import { toPercentage } from "#core/types/scores.js";
import { runPipelineSteps } from "#core/run-pipeline-steps.js";
import {
  sumFileTokens,
  sumTransformTokens,
  buildSummarisationTiers,
} from "#core/token-summary.js";

function serializeRepoMap(repoMap: RepoMap): string {
  const sorted = [...repoMap.files].toSorted((a, b) =>
    (a.path as string).localeCompare(b.path as string),
  );
  return sorted
    .map((f: FileEntry) => `${f.path}|${f.sizeBytes}|${f.lastModified}`)
    .join("\n");
}

export class CompilationRunner implements ICompilationRunner {
  constructor(
    public readonly deps: PipelineStepsDeps,
    private readonly clock: Clock,
    private readonly cacheStore: CacheStore,
    private readonly configStore: ConfigStore,
    private readonly stringHasher: StringHasher,
  ) {}

  async run(
    request: CompilationRequest,
  ): Promise<{ compiledPrompt: string; meta: CompilationMeta }> {
    const repoMap = await this.deps.repoMapSupplier.getRepoMap(request.projectRoot);
    const fileTreeHash = this.stringHasher.hash(serializeRepoMap(repoMap));
    const configHash = this.configStore.getLatestHash() ?? "";
    const key = this.stringHasher.hash(
      [request.intent, request.projectRoot, fileTreeHash, configHash].join("\0"),
    );
    const cached = this.cacheStore.get(key);
    if (cached !== null) {
      const task = this.deps.intentClassifier.classify(request.intent);
      const meta: CompilationMeta = {
        intent: request.intent,
        taskClass: task.taskClass,
        filesSelected: 0,
        filesTotal: repoMap.totalFiles,
        tokensRaw: repoMap.totalTokens,
        tokensCompiled: cached.tokenCount,
        tokenReductionPct: toPercentage(0),
        cacheHit: true,
        durationMs: toMilliseconds(0),
        modelId: request.modelId ?? "",
        editorId: request.editorId,
        transformTokensSaved: toTokenCount(0),
        summarisationTiers: {
          L0: 0,
          L1: 0,
          L2: 0,
          L3: 0,
        },
        guard: null,
      };
      return { compiledPrompt: cached.compiledPrompt, meta };
    }
    const start = this.clock.now();
    const r = await runPipelineSteps(
      this.deps,
      { intent: request.intent, projectRoot: request.projectRoot },
      repoMap,
    );
    const end = this.clock.now();
    const rawNum = r.repoMap.totalTokens as number;
    const beforeTransform = sumFileTokens(r.safeFiles);
    const afterTransforms = sumTransformTokens(r.transformResult.metadata);
    const transformTokensSaved = toTokenCount(
      Math.max(0, (beforeTransform as number) - (afterTransforms as number)),
    );
    const tokenReductionPct =
      rawNum > 0
        ? toPercentage((rawNum - (r.promptTotal as number)) / rawNum)
        : toPercentage(0);
    const meta: CompilationMeta = {
      intent: request.intent,
      taskClass: r.task.taskClass,
      filesSelected: r.selectedFiles.length,
      filesTotal: r.repoMap.totalFiles,
      tokensRaw: r.repoMap.totalTokens,
      tokensCompiled: r.promptTotal,
      tokenReductionPct,
      cacheHit: false,
      durationMs: this.clock.durationMs(start, end),
      modelId: request.modelId ?? "",
      editorId: request.editorId,
      transformTokensSaved,
      summarisationTiers: buildSummarisationTiers(r.ladderFiles),
      guard: r.guardResult,
    };
    this.cacheStore.set({
      key,
      compiledPrompt: r.assembledPrompt,
      tokenCount: r.promptTotal,
      createdAt: start,
      expiresAt: this.clock.addMinutes(60),
      fileTreeHash,
      configHash,
    });
    return { compiledPrompt: r.assembledPrompt, meta };
  }
}
