// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { CompilationRunner as ICompilationRunner } from "@jatbas/aic-core/core/interfaces/compilation-runner.interface.js";
import type {
  CompilationRequest,
  CompilationMeta,
  CachedCompilation,
} from "@jatbas/aic-core/core/types/compilation-types.js";
import type { TaskClass, TriggerSource } from "@jatbas/aic-core/core/types/enums.js";
import type { TaskClassification } from "@jatbas/aic-core/core/types/task-classification.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { CacheStore } from "@jatbas/aic-core/core/interfaces/cache-store.interface.js";
import type { ConfigStore } from "@jatbas/aic-core/core/interfaces/config-store.interface.js";
import type { StringHasher } from "@jatbas/aic-core/core/interfaces/string-hasher.interface.js";
import type { GuardStore } from "@jatbas/aic-core/core/interfaces/guard-store.interface.js";
import type { CompilationLogStore } from "@jatbas/aic-core/core/interfaces/compilation-log-store.interface.js";
import type { IdGenerator } from "@jatbas/aic-core/core/interfaces/id-generator.interface.js";
import type { AgenticSessionState } from "@jatbas/aic-core/core/interfaces/agentic-session-state.interface.js";
import type {
  PipelineStepsDeps,
  PipelineStepsResult,
} from "@jatbas/aic-core/core/run-pipeline-steps.js";
import type { RepoMap, FileEntry } from "@jatbas/aic-core/core/types/repo-map.js";
import type {
  Milliseconds,
  StepIndex,
  TokenCount,
} from "@jatbas/aic-core/core/types/units.js";
import type { CompilationLogEntry } from "@jatbas/aic-core/core/types/compilation-log-entry.js";
import type { GuardFinding } from "@jatbas/aic-core/core/types/guard-types.js";
import type {
  UUIDv7,
  SessionId,
  ConversationId,
} from "@jatbas/aic-core/core/types/identifiers.js";
import type { ISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import { toSessionId } from "@jatbas/aic-core/core/types/identifiers.js";
import type { InclusionTier } from "@jatbas/aic-core/core/types/enums.js";
import { toTokenCount, toStepIndex } from "@jatbas/aic-core/core/types/units.js";
import { toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import type { Confidence } from "@jatbas/aic-core/core/types/scores.js";
import { toPercentage, toConfidence } from "@jatbas/aic-core/core/types/scores.js";
import { runPipelineSteps } from "@jatbas/aic-core/core/run-pipeline-steps.js";
import { buildSelectionTraceForLog } from "@jatbas/aic-core/core/build-selection-trace-for-log.js";
import type { SelectionTrace } from "@jatbas/aic-core/core/types/selection-trace.js";
import {
  sumFileTokens,
  sumTransformTokens,
  buildSummarisationTiers,
} from "@jatbas/aic-core/core/token-summary.js";
import { canonicalRelatedPathsForSelectionCache } from "./related-files-boost-context-selector.js";
import { MODEL_CONTEXT_WINDOWS } from "@jatbas/aic-core/data/model-context-windows.js";

// conversationId as session key gives each editor conversation its own cache entries.
function resolveEffectiveSessionId(request: CompilationRequest): SessionId | null {
  if (request.conversationId !== undefined && request.conversationId !== null) {
    return toSessionId(request.conversationId);
  }
  return request.sessionId ?? null;
}

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
    filesSelected: r.prunedFiles.length,
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
  sessionId: SessionId | null | undefined,
  stepIndex: StepIndex | null | undefined,
  toolRelatedCanonical: string,
): string {
  const base = [taskClass, projectRoot, fileTreeHash, configHash];
  const parts =
    sessionId !== undefined &&
    sessionId !== null &&
    stepIndex !== undefined &&
    stepIndex !== null
      ? [...base, sessionId, String(stepIndex)]
      : base;
  const withTool = toolRelatedCanonical !== "" ? [...parts, toolRelatedCanonical] : parts;
  return hasher.hash(withTool.join("\0"));
}

function computeCompilationCacheKey(
  request: CompilationRequest,
  taskClass: string,
  fileTreeHash: string,
  configHash: string,
  hasher: StringHasher,
): string {
  return buildCacheKey(
    taskClass,
    request.projectRoot,
    fileTreeHash,
    configHash,
    hasher,
    resolveEffectiveSessionId(request),
    request.stepIndex,
    canonicalRelatedPathsForSelectionCache(request.toolOutputs),
  );
}

type ClassifierLogScalars = {
  readonly classifierConfidence: Confidence | null;
  readonly specificityScore: Confidence | null;
  readonly underspecificationIndex: Confidence | null;
};

function buildLogEntry(
  compilationId: UUIDv7,
  meta: CompilationMeta,
  createdAt: ISOTimestamp,
  sessionId: SessionId | null,
  configHash: string | null,
  triggerSource: TriggerSource | null,
  conversationId: ConversationId | null,
  selectionTrace: SelectionTrace | null,
  classifier: ClassifierLogScalars,
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
    selectionTrace,
    ...classifier,
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
  selectionTrace: SelectionTrace | null,
  classifier: ClassifierLogScalars,
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
    selectionTrace,
    classifier,
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
  task: TaskClassification,
  sessionId: SessionId | null,
  configHashOrNull: string | null,
): { compiledPrompt: string; meta: CompilationMeta; compilationId: UUIDv7 } {
  const meta = buildCacheHitMeta(request, repoMap, cached, task.taskClass);
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
    null,
    {
      classifierConfidence: task.confidence,
      specificityScore: task.specificityScore,
      underspecificationIndex: task.underspecificationIndex,
    },
  );
  return { compiledPrompt: cached.compiledPrompt, meta, compilationId };
}

function recordSessionStepIfNeeded(
  agenticSessionState: AgenticSessionState | null,
  request: CompilationRequest,
  r: PipelineStepsResult,
  clock: Clock,
): void {
  const effectiveSessionId = resolveEffectiveSessionId(request);
  if (!effectiveSessionId || !agenticSessionState) return;
  const stepIndex = request.stepIndex ?? toStepIndex(0);
  const tiers: Record<string, InclusionTier> = Object.fromEntries(
    r.prunedFiles.map((f) => [f.path, f.tier]),
  );
  agenticSessionState.recordStep(effectiveSessionId, {
    stepIndex,
    stepIntent: request.stepIntent ?? null,
    filesSelected: r.prunedFiles.map((f) => f.path),
    tiers,
    tokensCompiled: r.promptTotal,
    toolOutputs: request.toolOutputs ?? [],
    completedAt: clock.now(),
  });
}

// Must match normalizeModelId in fetch-model-context-windows.cjs exactly — update both in lockstep.
export function normalizeForLookup(id: string): string {
  const withoutVendor = id.includes("/") ? id.slice(id.indexOf("/") + 1) : id;
  const base = withoutVendor.toLowerCase().replace(/-\d{8}$/, "");
  const m = /^(claude)-(\d+\.\d+)-([a-z]+)/.exec(base);
  if (m !== null) return `${m[1]}-${m[3]}-${m[2]}`;
  return base;
}

export function lookupContextWindow(normalizedId: string): number | undefined {
  const walk = (candidate: string): number | undefined => {
    if (candidate.length === 0) return undefined;
    const found = MODEL_CONTEXT_WINDOWS[candidate];
    if (found !== undefined) return found;
    const lastDash = candidate.lastIndexOf("-");
    if (lastDash === -1) return undefined;
    return walk(candidate.slice(0, lastDash));
  };
  return walk(normalizedId);
}

function resolveModelDerivedContextWindow(
  modelId: string | null,
): TokenCount | undefined {
  const MODEL_EFFECTIVE_FACTOR = 0.65;
  const lookupId = modelId !== null ? normalizeForLookup(modelId) : null;
  const rawWindow = lookupId !== null ? lookupContextWindow(lookupId) : undefined;
  if (rawWindow === undefined && lookupId !== null && lookupId !== "auto") {
    process.stderr.write(
      `[aic] unknown model context window: ${modelId ?? ""} (normalized: ${lookupId}) — falling back to 128K\n`,
    );
  }
  if (rawWindow === undefined) return undefined;
  return toTokenCount(Math.floor(rawWindow * MODEL_EFFECTIVE_FACTOR));
}

function completeFreshPathAfterPipeline(
  r: PipelineStepsResult,
  start: ISOTimestamp,
  clock: Clock,
  cacheStore: CacheStore,
  key: string,
  fileTreeHash: string,
  configHash: string,
  request: CompilationRequest,
  compilationLogStore: CompilationLogStore,
  guardStore: GuardStore,
  idGenerator: IdGenerator,
  sessionId: SessionId | null,
  configHashOrNull: string | null,
  agenticSessionState: AgenticSessionState | null,
): { compiledPrompt: string; meta: CompilationMeta; compilationId: UUIDv7 } {
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
  const trace = buildSelectionTraceForLog(r);
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
    trace,
    {
      classifierConfidence: r.task.confidence,
      specificityScore: r.task.specificityScore,
      underspecificationIndex: r.task.underspecificationIndex,
    },
  );
  recordSessionStepIfNeeded(agenticSessionState, request, r, clock);
  return { compiledPrompt: r.assembledPrompt, meta, compilationId };
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
  const effectiveSessionId = resolveEffectiveSessionId(request);
  const contextWindow = resolveModelDerivedContextWindow(request.modelId);
  const pipelineRequest = {
    intent: request.intent,
    projectRoot: request.projectRoot,
    ...(effectiveSessionId !== null ? { sessionId: effectiveSessionId } : {}),
    ...(request.stepIndex !== undefined ? { stepIndex: request.stepIndex } : {}),
    ...(request.stepIntent !== undefined ? { stepIntent: request.stepIntent } : {}),
    ...(request.conversationTokens !== undefined
      ? { conversationTokens: request.conversationTokens }
      : {}),
    ...(contextWindow !== undefined ? { contextWindow } : {}),
    ...(request.toolOutputs !== undefined ? { toolOutputs: request.toolOutputs } : {}),
  };
  return runPipelineSteps(depsWithSession, pipelineRequest, repoMap).then((r) =>
    completeFreshPathAfterPipeline(
      r,
      start,
      clock,
      cacheStore,
      key,
      fileTreeHash,
      configHash,
      request,
      compilationLogStore,
      guardStore,
      idGenerator,
      sessionId,
      configHashOrNull,
      agenticSessionState,
    ),
  );
}

export class CompilationRunner implements ICompilationRunner {
  private readonly repoMapHashCache = new WeakMap<RepoMap, string>();

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
    const fileTreeHash = ((): string => {
      const cached = this.repoMapHashCache.get(repoMap);
      if (cached !== undefined) return cached;
      const serialized = serializeRepoMap(repoMap);
      const hash = this.stringHasher.hash(serialized);
      this.repoMapHashCache.set(repoMap, hash);
      return hash;
    })();
    const configHash = this.configStore.getLatestHash() ?? "";
    const configHashOrNull = configHash === "" ? null : configHash;
    const sessionId = request.sessionId ?? null;
    const task = this.deps.intentClassifier.classify(request.intent);
    const key = computeCompilationCacheKey(
      request,
      task.taskClass,
      fileTreeHash,
      configHash,
      this.stringHasher,
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
        task,
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
