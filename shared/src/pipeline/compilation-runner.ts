import type { CompilationRunner as ICompilationRunner } from "#core/interfaces/compilation-runner.interface.js";
import type {
  CompilationRequest,
  CompilationMeta,
  CachedCompilation,
} from "#core/types/compilation-types.js";
import type { TaskClass, TriggerSource } from "#core/types/enums.js";
import type { Clock } from "#core/interfaces/clock.interface.js";
import type { CacheStore } from "#core/interfaces/cache-store.interface.js";
import type { ConfigStore } from "#core/interfaces/config-store.interface.js";
import type { StringHasher } from "#core/interfaces/string-hasher.interface.js";
import type { GuardStore } from "#core/interfaces/guard-store.interface.js";
import type { CompilationLogStore } from "#core/interfaces/compilation-log-store.interface.js";
import type { IdGenerator } from "#core/interfaces/id-generator.interface.js";
import type { AgenticSessionState } from "#core/interfaces/agentic-session-state.interface.js";
import type { PipelineStepsDeps, PipelineStepsResult } from "#core/run-pipeline-steps.js";
import type { RepoMap, FileEntry } from "#core/types/repo-map.js";
import type { Milliseconds, StepIndex } from "#core/types/units.js";
import type { CompilationLogEntry } from "#core/types/compilation-log-entry.js";
import type { GuardFinding } from "#core/types/guard-types.js";
import type { UUIDv7, SessionId, ConversationId } from "#core/types/identifiers.js";
import type { ISOTimestamp } from "#core/types/identifiers.js";
import type { InclusionTier } from "#core/types/enums.js";
import { toTokenCount, toStepIndex } from "#core/types/units.js";
import { toMilliseconds } from "#core/types/units.js";
import { toPercentage, toConfidence } from "#core/types/scores.js";
import { runPipelineSteps } from "#core/run-pipeline-steps.js";
import {
  sumFileTokens,
  sumTransformTokens,
  buildSummarisationTiers,
} from "#core/token-summary.js";

function serializeRepoMap(repoMap: RepoMap): string {
  const sorted = [...repoMap.files].toSorted((a, b) => a.path.localeCompare(b.path));
  return sorted
    .map((f: FileEntry) => `${f.path}|${f.sizeBytes}|${f.lastModified}`)
    .join("\n");
}

function buildCacheHitMeta(
  request: CompilationRequest,
  repoMap: RepoMap,
  cached: CachedCompilation,
  taskClass: TaskClass,
): CompilationMeta {
  return {
    intent: request.intent,
    taskClass,
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
    summarisationTiers: { L0: 0, L1: 0, L2: 0, L3: 0 },
    guard: null,
    contextCompleteness: toConfidence(1),
  };
}

function buildFreshMeta(
  request: CompilationRequest,
  r: PipelineStepsResult,
  durationMs: Milliseconds,
): CompilationMeta {
  const rawNum = r.repoMap.totalTokens;
  const beforeTransform = sumFileTokens(r.safeFiles);
  const afterTransforms = sumTransformTokens(r.transformResult.metadata);
  return {
    intent: request.intent,
    taskClass: r.task.taskClass,
    filesSelected: r.selectedFiles.length,
    filesTotal: r.repoMap.totalFiles,
    tokensRaw: r.repoMap.totalTokens,
    tokensCompiled: r.promptTotal,
    tokenReductionPct:
      rawNum > 0 ? toPercentage((rawNum - r.promptTotal) / rawNum) : toPercentage(0),
    cacheHit: false,
    durationMs,
    modelId: request.modelId ?? "",
    editorId: request.editorId,
    transformTokensSaved: toTokenCount(Math.max(0, beforeTransform - afterTransforms)),
    summarisationTiers: buildSummarisationTiers(r.ladderFiles),
    guard: r.guardResult,
    contextCompleteness: toConfidence(1),
  };
}

function buildCacheKey(
  taskClass: string,
  projectRoot: string,
  fileTreeHash: string,
  configHash: string,
  hasher: StringHasher,
  sessionId?: SessionId | null,
  stepIndex?: StepIndex | null,
): string {
  const base = [taskClass, projectRoot, fileTreeHash, configHash];
  const parts =
    sessionId !== undefined &&
    sessionId !== null &&
    stepIndex !== undefined &&
    stepIndex !== null
      ? [...base, sessionId, String(stepIndex)]
      : base;
  return hasher.hash(parts.join("\0"));
}

function buildLogEntry(
  compilationId: UUIDv7,
  meta: CompilationMeta,
  createdAt: ISOTimestamp,
  sessionId: SessionId | null,
  configHash: string | null,
  triggerSource: TriggerSource | null,
  conversationId: ConversationId | null,
): CompilationLogEntry {
  return {
    id: compilationId,
    intent: meta.intent,
    taskClass: meta.taskClass,
    filesSelected: meta.filesSelected,
    filesTotal: meta.filesTotal,
    tokensRaw: meta.tokensRaw,
    tokensCompiled: meta.tokensCompiled,
    tokenReductionPct: meta.tokenReductionPct,
    cacheHit: meta.cacheHit,
    durationMs: meta.durationMs,
    editorId: meta.editorId,
    modelId: meta.modelId,
    sessionId,
    configHash,
    createdAt,
    triggerSource,
    conversationId,
  };
}

function recordCompilationAndFindings(
  compilationLogStore: CompilationLogStore,
  guardStore: GuardStore,
  idGenerator: IdGenerator,
  clock: Clock,
  meta: CompilationMeta,
  findings: readonly GuardFinding[],
  sessionId: SessionId | null,
  configHash: string | null,
  triggerSource: TriggerSource | null,
  conversationId: ConversationId | null,
): UUIDv7 {
  const compilationId = idGenerator.generate();
  const createdAt = clock.now();
  const entry = buildLogEntry(
    compilationId,
    meta,
    createdAt,
    sessionId,
    configHash,
    triggerSource,
    conversationId,
  );
  compilationLogStore.record(entry);
  guardStore.write(compilationId, findings);
  return compilationId;
}

function runCacheHitPath(
  compilationLogStore: CompilationLogStore,
  guardStore: GuardStore,
  idGenerator: IdGenerator,
  clock: Clock,
  request: CompilationRequest,
  repoMap: RepoMap,
  cached: CachedCompilation,
  taskClass: TaskClass,
  sessionId: SessionId | null,
  configHashOrNull: string | null,
): { compiledPrompt: string; meta: CompilationMeta; compilationId: UUIDv7 } {
  const meta = buildCacheHitMeta(request, repoMap, cached, taskClass);
  const compilationId = recordCompilationAndFindings(
    compilationLogStore,
    guardStore,
    idGenerator,
    clock,
    meta,
    [],
    sessionId,
    configHashOrNull,
    request.triggerSource ?? null,
    request.conversationId ?? null,
  );
  return { compiledPrompt: cached.compiledPrompt, meta, compilationId };
}

function recordSessionStepIfNeeded(
  agenticSessionState: AgenticSessionState | null,
  request: CompilationRequest,
  r: PipelineStepsResult,
  clock: Clock,
): void {
  if (!request.sessionId || !agenticSessionState) return;
  const stepIndex = request.stepIndex ?? toStepIndex(0);
  const tiers = r.ladderFiles.reduce<Record<string, InclusionTier>>(
    (acc, f) => ({ ...acc, [f.path]: f.tier }),
    {},
  );
  agenticSessionState.recordStep(request.sessionId, {
    stepIndex,
    stepIntent: request.stepIntent ?? null,
    filesSelected: r.ladderFiles.map((f) => f.path),
    tiers,
    tokensCompiled: r.promptTotal,
    toolOutputs: request.toolOutputs ?? [],
    completedAt: clock.now(),
  });
}

function runFreshPath(
  deps: PipelineStepsDeps,
  agenticSessionState: AgenticSessionState | null,
  cacheStore: CacheStore,
  compilationLogStore: CompilationLogStore,
  guardStore: GuardStore,
  idGenerator: IdGenerator,
  clock: Clock,
  request: CompilationRequest,
  key: string,
  fileTreeHash: string,
  configHash: string,
  sessionId: SessionId | null,
  configHashOrNull: string | null,
  repoMap: RepoMap,
): Promise<{ compiledPrompt: string; meta: CompilationMeta; compilationId: UUIDv7 }> {
  const start = clock.now();
  const depsWithSession = { ...deps, agenticSessionState };
  const pipelineRequest = {
    intent: request.intent,
    projectRoot: request.projectRoot,
    ...(request.sessionId !== undefined ? { sessionId: request.sessionId } : {}),
    ...(request.stepIndex !== undefined ? { stepIndex: request.stepIndex } : {}),
    ...(request.stepIntent !== undefined ? { stepIntent: request.stepIntent } : {}),
    ...(request.conversationTokens !== undefined
      ? { conversationTokens: request.conversationTokens }
      : {}),
  };
  return runPipelineSteps(depsWithSession, pipelineRequest, repoMap).then((r) => {
    const durationMs = clock.durationMs(start, clock.now());
    cacheStore.set({
      key,
      compiledPrompt: r.assembledPrompt,
      tokenCount: r.promptTotal,
      createdAt: start,
      expiresAt: clock.addMinutes(60),
      fileTreeHash,
      configHash,
    });
    const meta = buildFreshMeta(request, r, durationMs);
    const compilationId = recordCompilationAndFindings(
      compilationLogStore,
      guardStore,
      idGenerator,
      clock,
      meta,
      r.guardResult.findings,
      sessionId,
      configHashOrNull,
      request.triggerSource ?? null,
      request.conversationId ?? null,
    );
    recordSessionStepIfNeeded(agenticSessionState, request, r, clock);
    return { compiledPrompt: r.assembledPrompt, meta, compilationId };
  });
}

export class CompilationRunner implements ICompilationRunner {
  constructor(
    private readonly deps: PipelineStepsDeps,
    private readonly clock: Clock,
    private readonly cacheStore: CacheStore,
    private readonly configStore: ConfigStore,
    private readonly stringHasher: StringHasher,
    private readonly guardStore: GuardStore,
    private readonly compilationLogStore: CompilationLogStore,
    private readonly idGenerator: IdGenerator,
    private readonly agenticSessionState: AgenticSessionState | null,
  ) {}

  async run(
    request: CompilationRequest,
  ): Promise<{ compiledPrompt: string; meta: CompilationMeta; compilationId: UUIDv7 }> {
    const repoMap = await this.deps.repoMapSupplier.getRepoMap(request.projectRoot);
    const fileTreeHash = this.stringHasher.hash(serializeRepoMap(repoMap));
    const configHash = this.configStore.getLatestHash() ?? "";
    const configHashOrNull = configHash === "" ? null : configHash;
    const sessionId = request.sessionId ?? null;
    const task = this.deps.intentClassifier.classify(request.intent);
    const key = buildCacheKey(
      task.taskClass,
      request.projectRoot,
      fileTreeHash,
      configHash,
      this.stringHasher,
      request.sessionId,
      request.stepIndex,
    );
    const cached = this.cacheStore.get(key);
    if (cached !== null) {
      return runCacheHitPath(
        this.compilationLogStore,
        this.guardStore,
        this.idGenerator,
        this.clock,
        request,
        repoMap,
        cached,
        task.taskClass,
        sessionId,
        configHashOrNull,
      );
    }
    return runFreshPath(
      this.deps,
      this.agenticSessionState,
      this.cacheStore,
      this.compilationLogStore,
      this.guardStore,
      this.idGenerator,
      this.clock,
      request,
      key,
      fileTreeHash,
      configHash,
      sessionId,
      configHashOrNull,
      repoMap,
    );
  }
}
