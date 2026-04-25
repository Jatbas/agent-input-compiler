// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as path from "node:path";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { describe, it, expect, vi } from "vitest";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { toGlobPattern } from "@jatbas/aic-core/core/types/paths.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toTokenCount, toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import { toBytes } from "@jatbas/aic-core/core/types/units.js";
import { toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import type { CompilationRequest } from "@jatbas/aic-core/core/types/compilation-types.js";
import type { CachedCompilation } from "@jatbas/aic-core/core/types/compilation-types.js";
import type { RepoMap, FileEntry } from "@jatbas/aic-core/core/types/repo-map.js";
import type { RulePack } from "@jatbas/aic-core/core/types/rule-pack.js";
import type { FileContentReader } from "@jatbas/aic-core/core/interfaces/file-content-reader.interface.js";
import type { RepoMapSupplier } from "@jatbas/aic-core/core/interfaces/repo-map-supplier.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { CacheStore } from "@jatbas/aic-core/core/interfaces/cache-store.interface.js";
import type { ConfigStore } from "@jatbas/aic-core/core/interfaces/config-store.interface.js";
import type { StringHasher } from "@jatbas/aic-core/core/interfaces/string-hasher.interface.js";
import type { GuardStore } from "@jatbas/aic-core/core/interfaces/guard-store.interface.js";
import type { CompilationLogStore } from "@jatbas/aic-core/core/interfaces/compilation-log-store.interface.js";
import type { IdGenerator } from "@jatbas/aic-core/core/interfaces/id-generator.interface.js";
import type { RulePackProvider } from "@jatbas/aic-core/core/interfaces/rule-pack-provider.interface.js";
import type { BudgetConfig } from "@jatbas/aic-core/core/interfaces/budget-config.interface.js";
import type { TaskClass } from "@jatbas/aic-core/core/types/enums.js";
import type { CompilationLogEntry } from "@jatbas/aic-core/core/types/compilation-log-entry.js";
import type { GuardFinding } from "@jatbas/aic-core/core/types/guard-types.js";
import type { UUIDv7 } from "@jatbas/aic-core/core/types/identifiers.js";
import {
  EDITOR_ID,
  TRIGGER_SOURCE,
  TOOL_OUTPUT_TYPE,
} from "@jatbas/aic-core/core/types/enums.js";
import {
  toUUIDv7,
  toConversationId,
  toProjectId,
  toSessionId,
} from "@jatbas/aic-core/core/types/identifiers.js";
import { toStepIndex } from "@jatbas/aic-core/core/types/units.js";
import { INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";
import type { AgenticSessionState } from "@jatbas/aic-core/core/interfaces/agentic-session-state.interface.js";
import type {
  PreviousFile,
  SessionStep,
} from "@jatbas/aic-core/core/types/session-dedup-types.js";
import {
  CompilationRunner,
  lookupContextWindow,
  normalizeForLookup,
} from "../compilation-runner.js";
import { resolveModelDerivedEffectiveWindowTokens } from "@jatbas/aic-core/core/resolve-display-total-budget.js";
import { MODEL_CONTEXT_WINDOWS } from "@jatbas/aic-core/data/model-context-windows.js";
import { IntentClassifier } from "../intent-classifier.js";
import { RulePackResolver } from "../rule-pack-resolver.js";
import { BudgetAllocator } from "../budget-allocator.js";
import { HeuristicSelector } from "../heuristic-selector.js";
import { ExclusionScanner } from "../exclusion-scanner.js";
import { SecretScanner } from "../secret-scanner.js";
import { PromptInjectionScanner } from "../prompt-injection-scanner.js";
import { ContextGuard } from "../context-guard.js";
import { WhitespaceNormalizer } from "../whitespace-normalizer.js";
import { CommentStripper } from "../comment-stripper.js";
import { JsonCompactor } from "../json-compactor.js";
import { LockFileSkipper } from "../lock-file-skipper.js";
import { ContentTransformerPipeline } from "../content-transformer-pipeline.js";
import { SummarisationLadder } from "../summarisation-ladder.js";
import { LineLevelPruner } from "../line-level-pruner.js";
import { PromptAssembler } from "../prompt-assembler.js";
import { IntentAwareFileDiscoverer } from "../intent-aware-file-discoverer.js";
import { SpecFileDiscoverer } from "../spec-file-discoverer.js";
import { ConversationCompressorImpl } from "../conversation-compressor.js";
import { StructuralMapBuilder } from "../structural-map-builder.js";
import { TiktokenAdapter } from "@jatbas/aic-core/adapters/tiktoken-adapter.js";
import { TypeScriptProvider } from "@jatbas/aic-core/adapters/typescript-provider.js";
import { GenericProvider } from "@jatbas/aic-core/adapters/generic-provider.js";
import Database from "better-sqlite3";
import { SqliteCacheStore } from "@jatbas/aic-core/storage/sqlite-cache-store.js";
import { migration } from "@jatbas/aic-core/storage/migrations/001-consolidated-schema.js";

const FIXED_TS = "2026-01-01T00:00:00.000Z";

function defaultRulePack(): RulePack {
  return {
    constraints: [],
    includePatterns: [],
    excludePatterns: [],
    heuristic: {
      boostPatterns: [toGlobPattern("**/*.ts")],
      penalizePatterns: [],
    },
  };
}

function buildFixtureRepoMap(fixtureRoot: ReturnType<typeof toAbsolutePath>): RepoMap {
  const rel1 = toRelativePath("src/auth/service.ts");
  const rel2 = toRelativePath("src/index.ts");
  const full1 = path.join(fixtureRoot as string, rel1 as string);
  const full2 = path.join(fixtureRoot as string, rel2 as string);
  const content1 = fs.readFileSync(full1, "utf8");
  const content2 = fs.readFileSync(full2, "utf8");
  const size1 = Buffer.byteLength(content1, "utf8");
  const size2 = Buffer.byteLength(content2, "utf8");
  const entry1: FileEntry = {
    path: rel1,
    language: "ts",
    sizeBytes: toBytes(size1),
    estimatedTokens: toTokenCount(10),
    lastModified: toISOTimestamp(FIXED_TS),
  };
  const entry2: FileEntry = {
    path: rel2,
    language: "ts",
    sizeBytes: toBytes(size2),
    estimatedTokens: toTokenCount(12),
    lastModified: toISOTimestamp(FIXED_TS),
  };
  return {
    root: fixtureRoot,
    files: [entry1, entry2],
    totalFiles: 2,
    totalTokens: toTokenCount(22),
  };
}

function createInMemoryCacheStore(): CacheStore {
  const map = new Map<string, CachedCompilation>();
  return {
    get(key: string) {
      return map.get(key) ?? null;
    },
    set(entry: CachedCompilation) {
      map.set(entry.key, entry);
    },
    invalidate() {},
    invalidateAll() {
      map.clear();
    },
    purgeExpired() {},
  };
}

function makeRequest(fixtureRoot: ReturnType<typeof toAbsolutePath>): CompilationRequest {
  return {
    intent: "refactor auth module to use middleware pattern",
    projectRoot: fixtureRoot,
    modelId: null,
    editorId: EDITOR_ID.GENERIC,
    configPath: null,
    triggerSource: TRIGGER_SOURCE.INTERNAL_TEST,
  };
}

describe("CompilationRunner", () => {
  const fixtureRoot = toAbsolutePath(
    path.join(process.cwd(), "test", "benchmarks", "repos", "1"),
  );
  const repoMap = buildFixtureRepoMap(fixtureRoot);
  const mockRepoMapSupplier: RepoMapSupplier = {
    getRepoMap(_projectRoot) {
      return Promise.resolve(repoMap);
    },
  };
  const mockClock: Clock = {
    now() {
      return toISOTimestamp(FIXED_TS);
    },
    addMinutes() {
      return toISOTimestamp(FIXED_TS);
    },
    durationMs() {
      return toMilliseconds(0);
    },
  };
  const fileContentReader: FileContentReader = {
    getContent(pathRel: ReturnType<typeof toRelativePath>): Promise<string> {
      const full = path.join(fixtureRoot as string, pathRel as string);
      return fs.promises.readFile(full, "utf8");
    },
  };
  const rulePackProvider: RulePackProvider = {
    getBuiltInPack(_name: string): RulePack {
      return defaultRulePack();
    },
    getProjectPack(_projectRoot: unknown, _taskClass: TaskClass): RulePack | null {
      return null;
    },
  };
  const budgetConfig: BudgetConfig = {
    getMaxTokens() {
      return toTokenCount(8000);
    },
    getBudgetForTaskClass(_taskClass: TaskClass) {
      return null;
    },
    getContextWindow() {
      return null;
    },
  };
  const tiktokenAdapter = new TiktokenAdapter();
  const tokenCounter = (text: string) => tiktokenAdapter.countTokens(text);
  const typeScriptProvider = new TypeScriptProvider();
  const genericProvider = new GenericProvider();
  const languageProviders = [typeScriptProvider, genericProvider] as const;
  const intentClassifier = new IntentClassifier();
  const rulePackResolver = new RulePackResolver(rulePackProvider);
  const budgetAllocator = new BudgetAllocator(budgetConfig);
  const heuristicSelector = new HeuristicSelector(
    languageProviders,
    {
      maxFiles: 20,
    },
    { getScores: () => Promise.resolve(new Map()) },
    { getScores: () => Promise.resolve(new Map()) },
  );
  const exclusionScanner = new ExclusionScanner();
  const secretScanner = new SecretScanner();
  const promptInjectionScanner = new PromptInjectionScanner();
  const contentScanners = [secretScanner, promptInjectionScanner] as const;
  const contextGuard = new ContextGuard(
    exclusionScanner,
    contentScanners,
    fileContentReader,
    [],
  );
  const whitespaceNormalizer = new WhitespaceNormalizer();
  const commentStripper = new CommentStripper();
  const jsonCompactor = new JsonCompactor();
  const lockFileSkipper = new LockFileSkipper();
  const transformers = [
    whitespaceNormalizer,
    commentStripper,
    jsonCompactor,
    lockFileSkipper,
  ] as const;
  const contentTransformerPipeline = new ContentTransformerPipeline(
    transformers,
    fileContentReader,
    tokenCounter,
  );
  const summarisationLadder = new SummarisationLadder(
    languageProviders,
    tokenCounter,
    fileContentReader,
  );
  const promptAssembler = new PromptAssembler(fileContentReader);

  const fixedCompilationId = toUUIDv7("00000000-0000-7000-8000-000000000001");
  const mockIdGenerator: IdGenerator = {
    generate(): UUIDv7 {
      return fixedCompilationId;
    },
  };

  function createGuardAndLogMocks(): {
    recordedGuardCalls: Array<{ id: UUIDv7; findings: readonly GuardFinding[] }>;
    recordedLogEntries: CompilationLogEntry[];
    guardStore: GuardStore;
    compilationLogStore: CompilationLogStore;
  } {
    const recordedGuardCalls: Array<{ id: UUIDv7; findings: readonly GuardFinding[] }> =
      [];
    const recordedLogEntries: CompilationLogEntry[] = [];
    return {
      recordedGuardCalls,
      recordedLogEntries,
      guardStore: {
        write(id: UUIDv7, findings: readonly GuardFinding[]) {
          recordedGuardCalls.push({ id, findings });
        },
        queryByCompilation() {
          return [];
        },
      },
      compilationLogStore: {
        record(entry: CompilationLogEntry) {
          recordedLogEntries.push(entry);
        },
      },
    };
  }

  it("first_run_returns_compiled_prompt_and_meta_cache_miss", async () => {
    const cacheStore = createInMemoryCacheStore();
    const configStore: ConfigStore = {
      getLatestHash: () => null,
      writeSnapshot() {},
    };
    const stringHasher: StringHasher = {
      hash(input: string) {
        return `h-${input.length}`;
      },
    };
    const { guardStore, compilationLogStore } = createGuardAndLogMocks();
    const deps = {
      intentClassifier,
      rulePackResolver,
      budgetAllocator,
      contextSelector: heuristicSelector,
      contextGuard,
      contentTransformerPipeline,
      summarisationLadder,
      languageProviders,
      lineLevelPruner: new LineLevelPruner(tiktokenAdapter, fileContentReader),
      promptAssembler,
      intentAwareFileDiscoverer: new IntentAwareFileDiscoverer(),
      repoMapSupplier: mockRepoMapSupplier,
      tokenCounter: tiktokenAdapter,
      specFileDiscoverer: new SpecFileDiscoverer(),
      conversationCompressor: new ConversationCompressorImpl(),
      heuristicMaxFiles: 0,
      structuralMapBuilder: new StructuralMapBuilder(),
    };
    const runner = new CompilationRunner(
      deps,
      mockClock,
      cacheStore,
      configStore,
      stringHasher,
      guardStore,
      compilationLogStore,
      mockIdGenerator,
      null,
    );
    const request = makeRequest(fixtureRoot);
    const result = await runner.run(request);
    expect(result.meta.cacheHit).toBe(false);
    expect(typeof result.compiledPrompt).toBe("string");
    expect(result.compiledPrompt.length).toBeGreaterThan(0);
  });

  it("second_run_same_key_returns_cache_hit", async () => {
    const cacheStore = createInMemoryCacheStore();
    const configStore: ConfigStore = {
      getLatestHash: () => null,
      writeSnapshot() {},
    };
    const stringHasher: StringHasher = {
      hash(input: string) {
        return `h-${input.length}`;
      },
    };
    const { guardStore, compilationLogStore } = createGuardAndLogMocks();
    const deps = {
      intentClassifier,
      rulePackResolver,
      budgetAllocator,
      contextSelector: heuristicSelector,
      contextGuard,
      contentTransformerPipeline,
      summarisationLadder,
      languageProviders,
      lineLevelPruner: new LineLevelPruner(tiktokenAdapter, fileContentReader),
      promptAssembler,
      intentAwareFileDiscoverer: new IntentAwareFileDiscoverer(),
      repoMapSupplier: mockRepoMapSupplier,
      tokenCounter: tiktokenAdapter,
      specFileDiscoverer: new SpecFileDiscoverer(),
      conversationCompressor: new ConversationCompressorImpl(),
      heuristicMaxFiles: 0,
      structuralMapBuilder: new StructuralMapBuilder(),
    };
    const runner = new CompilationRunner(
      deps,
      mockClock,
      cacheStore,
      configStore,
      stringHasher,
      guardStore,
      compilationLogStore,
      mockIdGenerator,
      null,
    );
    const request = makeRequest(fixtureRoot);
    const first = await runner.run(request);
    const second = await runner.run(request);
    expect(second.meta.cacheHit).toBe(true);
    expect(second.compiledPrompt).toBe(first.compiledPrompt);
  }, 30_000);

  it("stale cache metadata is cleaned on read failure", async () => {
    const cacheDir = fs.mkdtempSync(path.join(tmpdir(), "aic-runner-cache-"));
    const db = new Database(":memory:");
    migration.up(db);
    const projectId = toProjectId("018f0000-0000-7000-8000-000000000121");
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(projectId, fixtureRoot, FIXED_TS, FIXED_TS);
    const realStore = new SqliteCacheStore(
      projectId,
      db,
      toAbsolutePath(cacheDir),
      mockClock,
    );
    const noPersistStore: CacheStore = {
      get(key: string): CachedCompilation | null {
        return realStore.get(key);
      },
      set(): void {},
      invalidate(key: string): void {
        realStore.invalidate(key);
      },
      invalidateAll(): void {
        realStore.invalidateAll();
      },
      purgeExpired(): void {
        realStore.purgeExpired();
      },
    };
    const configStore: ConfigStore = {
      getLatestHash: () => null,
      writeSnapshot() {},
    };
    const stringHasher: StringHasher = {
      hash(input: string) {
        return `h-${input.length}`;
      },
    };
    const { guardStore, compilationLogStore } = createGuardAndLogMocks();
    const deps = {
      intentClassifier,
      rulePackResolver,
      budgetAllocator,
      contextSelector: heuristicSelector,
      contextGuard,
      contentTransformerPipeline,
      summarisationLadder,
      languageProviders,
      lineLevelPruner: new LineLevelPruner(tiktokenAdapter, fileContentReader),
      promptAssembler,
      intentAwareFileDiscoverer: new IntentAwareFileDiscoverer(),
      repoMapSupplier: mockRepoMapSupplier,
      tokenCounter: tiktokenAdapter,
      specFileDiscoverer: new SpecFileDiscoverer(),
      conversationCompressor: new ConversationCompressorImpl(),
      heuristicMaxFiles: 0,
      structuralMapBuilder: new StructuralMapBuilder(),
    };
    let observedCacheKey = "";
    const captureStore: CacheStore = {
      get(key: string): CachedCompilation | null {
        observedCacheKey = key;
        return null;
      },
      set(): void {},
      invalidate(): void {},
      invalidateAll(): void {},
      purgeExpired(): void {},
    };
    const captureRunner = new CompilationRunner(
      deps,
      mockClock,
      captureStore,
      configStore,
      stringHasher,
      guardStore,
      compilationLogStore,
      mockIdGenerator,
      null,
    );
    const request = makeRequest(fixtureRoot);
    await captureRunner.run(request);
    expect(observedCacheKey.length).toBeGreaterThan(0);
    const staleKey = observedCacheKey;
    const staleEntry: CachedCompilation = {
      key: staleKey,
      compiledPrompt: "stale",
      tokenCount: toTokenCount(5),
      createdAt: toISOTimestamp(FIXED_TS),
      expiresAt: toISOTimestamp("2099-01-01T00:00:00.000Z"),
      fileTreeHash: "h-347",
      configHash: "",
      filesSelected: 1,
    };
    realStore.set(staleEntry);
    const staleRowsBefore = db
      .prepare("SELECT file_path FROM cache_metadata WHERE cache_key = ?")
      .all(staleKey) as { file_path: string }[];
    expect(staleRowsBefore).toHaveLength(1);
    const stalePath = staleRowsBefore[0]!.file_path;
    fs.writeFileSync(stalePath, "{", "utf8");

    const runner = new CompilationRunner(
      deps,
      mockClock,
      noPersistStore,
      configStore,
      stringHasher,
      guardStore,
      compilationLogStore,
      mockIdGenerator,
      null,
    );

    const first = await runner.run(request);
    expect(first.meta.cacheHit).toBe(false);
    const staleRowsAfterFirst = db
      .prepare("SELECT cache_key FROM cache_metadata WHERE cache_key = ?")
      .all(staleKey) as { cache_key: string }[];
    expect(staleRowsAfterFirst).toHaveLength(0);

    const second = await runner.run(request);
    expect(second.meta.cacheHit).toBe(false);
    expect(second.compiledPrompt.length).toBeGreaterThan(0);
    expect(second.meta.filesSelected).toBeGreaterThan(0);

    db.close();
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }, 30_000);

  it("compilation_runner_fresh_vs_cache_trace", async () => {
    const cacheStore = createInMemoryCacheStore();
    const configStore: ConfigStore = {
      getLatestHash: () => null,
      writeSnapshot() {},
    };
    const stringHasher: StringHasher = {
      hash(input: string) {
        return `h-${input.length}`;
      },
    };
    const { recordedLogEntries, guardStore, compilationLogStore } =
      createGuardAndLogMocks();
    const deps = {
      intentClassifier,
      rulePackResolver,
      budgetAllocator,
      contextSelector: heuristicSelector,
      contextGuard,
      contentTransformerPipeline,
      summarisationLadder,
      languageProviders,
      lineLevelPruner: new LineLevelPruner(tiktokenAdapter, fileContentReader),
      promptAssembler,
      intentAwareFileDiscoverer: new IntentAwareFileDiscoverer(),
      repoMapSupplier: mockRepoMapSupplier,
      tokenCounter: tiktokenAdapter,
      specFileDiscoverer: new SpecFileDiscoverer(),
      conversationCompressor: new ConversationCompressorImpl(),
      heuristicMaxFiles: 0,
      structuralMapBuilder: new StructuralMapBuilder(),
    };
    const runner = new CompilationRunner(
      deps,
      mockClock,
      cacheStore,
      configStore,
      stringHasher,
      guardStore,
      compilationLogStore,
      mockIdGenerator,
      null,
    );
    const request = makeRequest(fixtureRoot);
    await runner.run(request);
    await runner.run(request);
    expect(recordedLogEntries.length).toBe(2);
    expect(recordedLogEntries[0]?.selectionTrace).not.toBeNull();
    expect(recordedLogEntries[1]?.selectionTrace).toBeNull();
  }, 30_000);

  it("compilation_runner_cache_key_differs_when_related_files_change", async () => {
    const cacheStore = createInMemoryCacheStore();
    const configStore: ConfigStore = {
      getLatestHash: () => null,
      writeSnapshot() {},
    };
    const preimages: string[] = [];
    const stringHasher: StringHasher = {
      hash(input: string) {
        preimages.push(input);
        return `h-${input.length}`;
      },
    };
    const { guardStore, compilationLogStore } = createGuardAndLogMocks();
    const deps = {
      intentClassifier,
      rulePackResolver,
      budgetAllocator,
      contextSelector: heuristicSelector,
      contextGuard,
      contentTransformerPipeline,
      summarisationLadder,
      languageProviders,
      lineLevelPruner: new LineLevelPruner(tiktokenAdapter, fileContentReader),
      promptAssembler,
      intentAwareFileDiscoverer: new IntentAwareFileDiscoverer(),
      repoMapSupplier: mockRepoMapSupplier,
      tokenCounter: tiktokenAdapter,
      specFileDiscoverer: new SpecFileDiscoverer(),
      conversationCompressor: new ConversationCompressorImpl(),
      heuristicMaxFiles: 0,
      structuralMapBuilder: new StructuralMapBuilder(),
    };
    const runner = new CompilationRunner(
      deps,
      mockClock,
      cacheStore,
      configStore,
      stringHasher,
      guardStore,
      compilationLogStore,
      mockIdGenerator,
      null,
    );
    const sessionId = toSessionId("task-281-session");
    const stepIndex = toStepIndex(0);
    const base = makeRequest(fixtureRoot);
    const firstRequest: CompilationRequest = {
      ...base,
      sessionId,
      stepIndex,
      toolOutputs: [
        {
          type: TOOL_OUTPUT_TYPE.COMMAND_OUTPUT,
          content: "",
          relatedFiles: [toRelativePath("src/auth/service.ts")],
        },
      ],
    };
    const secondRequest: CompilationRequest = {
      ...base,
      sessionId,
      stepIndex,
      toolOutputs: [
        {
          type: TOOL_OUTPUT_TYPE.COMMAND_OUTPUT,
          content: "",
          relatedFiles: [toRelativePath("src/index.ts")],
        },
      ],
    };
    await runner.run(firstRequest);
    expect(preimages.length).toBe(2);
    const second = await runner.run(secondRequest);
    expect(preimages.length).toBe(3);
    expect(preimages[1]).not.toBe(preimages[2]);
    expect(second.meta.cacheHit).toBe(false);
  }, 30_000);

  it("compilation_runner_cache_hit_when_related_files_permuted", async () => {
    const cacheStore = createInMemoryCacheStore();
    const configStore: ConfigStore = {
      getLatestHash: () => null,
      writeSnapshot() {},
    };
    const preimages: string[] = [];
    const stringHasher: StringHasher = {
      hash(input: string) {
        preimages.push(input);
        return `h-${input.length}`;
      },
    };
    const { guardStore, compilationLogStore } = createGuardAndLogMocks();
    const deps = {
      intentClassifier,
      rulePackResolver,
      budgetAllocator,
      contextSelector: heuristicSelector,
      contextGuard,
      contentTransformerPipeline,
      summarisationLadder,
      languageProviders,
      lineLevelPruner: new LineLevelPruner(tiktokenAdapter, fileContentReader),
      promptAssembler,
      intentAwareFileDiscoverer: new IntentAwareFileDiscoverer(),
      repoMapSupplier: mockRepoMapSupplier,
      tokenCounter: tiktokenAdapter,
      specFileDiscoverer: new SpecFileDiscoverer(),
      conversationCompressor: new ConversationCompressorImpl(),
      heuristicMaxFiles: 0,
      structuralMapBuilder: new StructuralMapBuilder(),
    };
    const runner = new CompilationRunner(
      deps,
      mockClock,
      cacheStore,
      configStore,
      stringHasher,
      guardStore,
      compilationLogStore,
      mockIdGenerator,
      null,
    );
    const sessionId = toSessionId("task-281-permute-session");
    const stepIndex = toStepIndex(0);
    const base = makeRequest(fixtureRoot);
    const firstRequest: CompilationRequest = {
      ...base,
      sessionId,
      stepIndex,
      toolOutputs: [
        {
          type: TOOL_OUTPUT_TYPE.COMMAND_OUTPUT,
          content: "",
          relatedFiles: [toRelativePath("src/auth/service.ts")],
        },
        {
          type: TOOL_OUTPUT_TYPE.COMMAND_OUTPUT,
          content: "",
          relatedFiles: [toRelativePath("src/index.ts")],
        },
      ],
    };
    const secondRequest: CompilationRequest = {
      ...base,
      sessionId,
      stepIndex,
      toolOutputs: [
        {
          type: TOOL_OUTPUT_TYPE.COMMAND_OUTPUT,
          content: "",
          relatedFiles: [toRelativePath("src/index.ts")],
        },
        {
          type: TOOL_OUTPUT_TYPE.COMMAND_OUTPUT,
          content: "",
          relatedFiles: [toRelativePath("src/auth/service.ts")],
        },
      ],
    };
    await runner.run(firstRequest);
    expect(preimages.length).toBe(2);
    const second = await runner.run(secondRequest);
    expect(preimages.length).toBe(3);
    expect(preimages[1]).toBe(preimages[2]);
    expect(second.meta.cacheHit).toBe(true);
  }, 30_000);

  it("cache_hit_same_repo_map_reference", async () => {
    const sharedRepoMap = buildFixtureRepoMap(fixtureRoot);
    const sameRefSupplier: RepoMapSupplier = {
      getRepoMap() {
        return Promise.resolve(sharedRepoMap);
      },
    };
    let hashCallCount = 0;
    const stringHasher: StringHasher = {
      hash(_input: string) {
        hashCallCount += 1;
        return "fixed-hash";
      },
    };
    const cacheStore = createInMemoryCacheStore();
    const configStore: ConfigStore = {
      getLatestHash: () => null,
      writeSnapshot() {},
    };
    const { guardStore, compilationLogStore } = createGuardAndLogMocks();
    const deps = {
      intentClassifier,
      rulePackResolver,
      budgetAllocator,
      contextSelector: heuristicSelector,
      contextGuard,
      contentTransformerPipeline,
      summarisationLadder,
      languageProviders,
      lineLevelPruner: new LineLevelPruner(tiktokenAdapter, fileContentReader),
      promptAssembler,
      intentAwareFileDiscoverer: new IntentAwareFileDiscoverer(),
      repoMapSupplier: sameRefSupplier,
      tokenCounter: tiktokenAdapter,
      specFileDiscoverer: new SpecFileDiscoverer(),
      conversationCompressor: new ConversationCompressorImpl(),
      heuristicMaxFiles: 0,
      structuralMapBuilder: new StructuralMapBuilder(),
    };
    const runner = new CompilationRunner(
      deps,
      mockClock,
      cacheStore,
      configStore,
      stringHasher,
      guardStore,
      compilationLogStore,
      mockIdGenerator,
      null,
    );
    const request = makeRequest(fixtureRoot);
    await runner.run(request);
    await runner.run(request);
    // First run: hash(serialized repo map) + hash(cache key). Second run: hash(cache key) only (repo map hash from WeakMap cache).
    expect(hashCallCount).toBe(3);
  }, 30_000);

  it("repo_map_supplier_throws_run_rejects", async () => {
    const rejectingRepoMapSupplier: RepoMapSupplier = {
      getRepoMap() {
        return Promise.reject(new Error("getRepoMap failed"));
      },
    };
    const cacheStore = createInMemoryCacheStore();
    const configStore: ConfigStore = {
      getLatestHash: () => null,
      writeSnapshot() {},
    };
    const stringHasher: StringHasher = {
      hash(input: string) {
        return `h-${input.length}`;
      },
    };
    const { guardStore, compilationLogStore } = createGuardAndLogMocks();
    const deps = {
      intentClassifier,
      rulePackResolver,
      budgetAllocator,
      contextSelector: heuristicSelector,
      contextGuard,
      contentTransformerPipeline,
      summarisationLadder,
      languageProviders,
      lineLevelPruner: new LineLevelPruner(tiktokenAdapter, fileContentReader),
      promptAssembler,
      intentAwareFileDiscoverer: new IntentAwareFileDiscoverer(),
      repoMapSupplier: rejectingRepoMapSupplier,
      tokenCounter: tiktokenAdapter,
      specFileDiscoverer: new SpecFileDiscoverer(),
      conversationCompressor: new ConversationCompressorImpl(),
      heuristicMaxFiles: 0,
      structuralMapBuilder: new StructuralMapBuilder(),
    };
    const runner = new CompilationRunner(
      deps,
      mockClock,
      cacheStore,
      configStore,
      stringHasher,
      guardStore,
      compilationLogStore,
      mockIdGenerator,
      null,
    );
    const request = makeRequest(fixtureRoot);
    await expect(runner.run(request)).rejects.toThrow("getRepoMap failed");
  });

  it("CompilationRunner cache miss writes log and guard findings", async () => {
    const cacheStore = createInMemoryCacheStore();
    const configStore: ConfigStore = {
      getLatestHash: () => null,
      writeSnapshot() {},
    };
    const stringHasher: StringHasher = {
      hash(input: string) {
        return `h-${input.length}`;
      },
    };
    const { recordedGuardCalls, recordedLogEntries, guardStore, compilationLogStore } =
      createGuardAndLogMocks();
    const deps = {
      intentClassifier,
      rulePackResolver,
      budgetAllocator,
      contextSelector: heuristicSelector,
      contextGuard,
      contentTransformerPipeline,
      summarisationLadder,
      languageProviders,
      lineLevelPruner: new LineLevelPruner(tiktokenAdapter, fileContentReader),
      promptAssembler,
      intentAwareFileDiscoverer: new IntentAwareFileDiscoverer(),
      repoMapSupplier: mockRepoMapSupplier,
      tokenCounter: tiktokenAdapter,
      specFileDiscoverer: new SpecFileDiscoverer(),
      conversationCompressor: new ConversationCompressorImpl(),
      heuristicMaxFiles: 0,
      structuralMapBuilder: new StructuralMapBuilder(),
    };
    const runner = new CompilationRunner(
      deps,
      mockClock,
      cacheStore,
      configStore,
      stringHasher,
      guardStore,
      compilationLogStore,
      mockIdGenerator,
      null,
    );
    const request = makeRequest(fixtureRoot);
    const result = await runner.run(request);
    expect(recordedLogEntries.length).toBe(1);
    expect(recordedGuardCalls.length).toBe(1);
    const entry = recordedLogEntries[0];
    const guardCall = recordedGuardCalls[0];
    expect(entry).toBeDefined();
    expect(guardCall).toBeDefined();
    if (entry === undefined || guardCall === undefined) return;
    expect(entry.id).toBe(fixedCompilationId);
    expect(guardCall.id).toBe(fixedCompilationId);
    expect(entry.intent).toBe(result.meta.intent);
    expect(entry.taskClass).toBe(result.meta.taskClass);
    expect(entry.filesSelected).toBe(result.meta.filesSelected);
    expect(entry.cacheHit).toBe(false);
    expect(entry.triggerSource).toBe(TRIGGER_SOURCE.INTERNAL_TEST);
    expect(Array.isArray(guardCall.findings)).toBe(true);
    expect(result.meta.guard !== null).toBe(true);
    expect(guardCall.findings).toEqual(result.meta.guard?.findings ?? []);
  }, 15_000);

  it("CompilationRunner cache hit writes log and empty findings", async () => {
    const cacheStore = createInMemoryCacheStore();
    const configStore: ConfigStore = {
      getLatestHash: () => null,
      writeSnapshot() {},
    };
    const stringHasher: StringHasher = {
      hash(input: string) {
        return `h-${input.length}`;
      },
    };
    const { recordedGuardCalls, recordedLogEntries, guardStore, compilationLogStore } =
      createGuardAndLogMocks();
    const deps = {
      intentClassifier,
      rulePackResolver,
      budgetAllocator,
      contextSelector: heuristicSelector,
      contextGuard,
      contentTransformerPipeline,
      summarisationLadder,
      languageProviders,
      lineLevelPruner: new LineLevelPruner(tiktokenAdapter, fileContentReader),
      promptAssembler,
      intentAwareFileDiscoverer: new IntentAwareFileDiscoverer(),
      repoMapSupplier: mockRepoMapSupplier,
      tokenCounter: tiktokenAdapter,
      specFileDiscoverer: new SpecFileDiscoverer(),
      conversationCompressor: new ConversationCompressorImpl(),
      heuristicMaxFiles: 0,
      structuralMapBuilder: new StructuralMapBuilder(),
    };
    const runner = new CompilationRunner(
      deps,
      mockClock,
      cacheStore,
      configStore,
      stringHasher,
      guardStore,
      compilationLogStore,
      mockIdGenerator,
      null,
    );
    const request = makeRequest(fixtureRoot);
    const first = await runner.run(request);
    const second = await runner.run(request);
    expect(second.meta.filesSelected).toBe(first.meta.filesSelected);
    expect(first.meta.filesSelected).toBeGreaterThan(0);
    expect(second.meta.cacheHit).toBe(true);
    expect(recordedLogEntries.length).toBe(2);
    expect(recordedGuardCalls.length).toBe(2);
    const guardCallOnHit = recordedGuardCalls[1];
    expect(guardCallOnHit).toBeDefined();
    expect(guardCallOnHit?.findings.length).toBe(0);
  }, 15_000);

  it("runner_passes_trigger_source_to_entry", async () => {
    const cacheStore = createInMemoryCacheStore();
    const configStore: ConfigStore = {
      getLatestHash: () => null,
      writeSnapshot() {},
    };
    const stringHasher: StringHasher = {
      hash(input: string) {
        return `h-${input.length}`;
      },
    };
    const { recordedLogEntries, guardStore, compilationLogStore } =
      createGuardAndLogMocks();
    const deps = {
      intentClassifier,
      rulePackResolver,
      budgetAllocator,
      contextSelector: heuristicSelector,
      contextGuard,
      contentTransformerPipeline,
      summarisationLadder,
      languageProviders,
      lineLevelPruner: new LineLevelPruner(tiktokenAdapter, fileContentReader),
      promptAssembler,
      intentAwareFileDiscoverer: new IntentAwareFileDiscoverer(),
      repoMapSupplier: mockRepoMapSupplier,
      tokenCounter: tiktokenAdapter,
      specFileDiscoverer: new SpecFileDiscoverer(),
      conversationCompressor: new ConversationCompressorImpl(),
      heuristicMaxFiles: 0,
      structuralMapBuilder: new StructuralMapBuilder(),
    };
    const runner = new CompilationRunner(
      deps,
      mockClock,
      cacheStore,
      configStore,
      stringHasher,
      guardStore,
      compilationLogStore,
      mockIdGenerator,
      null,
    );
    const request: CompilationRequest = {
      ...makeRequest(fixtureRoot),
      triggerSource: TRIGGER_SOURCE.CLI,
    };
    await runner.run(request);
    expect(recordedLogEntries.length).toBe(1);
    const entry = recordedLogEntries[0];
    expect(entry).toBeDefined();
    if (entry !== undefined) {
      expect(entry.triggerSource).toBe(TRIGGER_SOURCE.CLI);
      expect(entry.triggerSource).toBe("cli");
    }
  }, 15_000);

  it("compilation_runner_passes_conversation_id", async () => {
    const cacheStore = createInMemoryCacheStore();
    const configStore: ConfigStore = {
      getLatestHash: () => null,
      writeSnapshot() {},
    };
    const stringHasher: StringHasher = {
      hash(input: string) {
        return `h-${input.length}`;
      },
    };
    const { recordedLogEntries, guardStore, compilationLogStore } =
      createGuardAndLogMocks();
    const deps = {
      intentClassifier,
      rulePackResolver,
      budgetAllocator,
      contextSelector: heuristicSelector,
      contextGuard,
      contentTransformerPipeline,
      summarisationLadder,
      languageProviders,
      lineLevelPruner: new LineLevelPruner(tiktokenAdapter, fileContentReader),
      promptAssembler,
      intentAwareFileDiscoverer: new IntentAwareFileDiscoverer(),
      repoMapSupplier: mockRepoMapSupplier,
      tokenCounter: tiktokenAdapter,
      specFileDiscoverer: new SpecFileDiscoverer(),
      conversationCompressor: new ConversationCompressorImpl(),
      heuristicMaxFiles: 0,
      structuralMapBuilder: new StructuralMapBuilder(),
    };
    const runner = new CompilationRunner(
      deps,
      mockClock,
      cacheStore,
      configStore,
      stringHasher,
      guardStore,
      compilationLogStore,
      mockIdGenerator,
      null,
    );
    const convId = toConversationId("runner-conv");
    const request: CompilationRequest = {
      ...makeRequest(fixtureRoot),
      conversationId: convId,
    };
    await runner.run(request);
    expect(recordedLogEntries.length).toBe(1);
    const entry = recordedLogEntries[0];
    expect(entry).toBeDefined();
    if (entry !== undefined) {
      expect(entry.conversationId).toBe(convId);
    }
  });

  it("compilation_runner_record_step_called", async () => {
    const recordStepCalls: Array<[ReturnType<typeof toSessionId>, SessionStep]> = [];
    const mockAgenticSessionState: AgenticSessionState = {
      getPreviouslyShownFiles: () => [],
      getSteps: () => [],
      recordStep: (sessionId, step) => {
        recordStepCalls.push([sessionId, step]);
      },
    };
    const cacheStore = createInMemoryCacheStore();
    const configStore: ConfigStore = {
      getLatestHash: () => null,
      writeSnapshot() {},
    };
    const stringHasher: StringHasher = {
      hash(input: string) {
        return `h-${input.length}`;
      },
    };
    const { guardStore, compilationLogStore } = createGuardAndLogMocks();
    const deps = {
      intentClassifier,
      rulePackResolver,
      budgetAllocator,
      contextSelector: heuristicSelector,
      contextGuard,
      contentTransformerPipeline,
      summarisationLadder,
      languageProviders,
      lineLevelPruner: new LineLevelPruner(tiktokenAdapter, fileContentReader),
      promptAssembler,
      intentAwareFileDiscoverer: new IntentAwareFileDiscoverer(),
      repoMapSupplier: mockRepoMapSupplier,
      tokenCounter: tiktokenAdapter,
      specFileDiscoverer: new SpecFileDiscoverer(),
      conversationCompressor: new ConversationCompressorImpl(),
      heuristicMaxFiles: 0,
      structuralMapBuilder: new StructuralMapBuilder(),
    };
    const runner = new CompilationRunner(
      deps,
      mockClock,
      cacheStore,
      configStore,
      stringHasher,
      guardStore,
      compilationLogStore,
      mockIdGenerator,
      mockAgenticSessionState,
    );
    const sessionId = toSessionId("session-1");
    const request: CompilationRequest = {
      ...makeRequest(fixtureRoot),
      sessionId,
      stepIndex: toStepIndex(1),
    };
    const result = await runner.run(request);
    expect(recordStepCalls.length).toBe(1);
    const firstCall = recordStepCalls[0];
    expect(firstCall).toBeDefined();
    if (firstCall === undefined) return;
    const [calledSessionId, step] = firstCall;
    expect(calledSessionId).toBe(sessionId);
    expect(step.filesSelected.length).toBe(result.meta.filesSelected);
  }, 30_000);

  it("compilation_runner_conversation_id_used_as_session_key", async () => {
    const recordStepCalls: Array<[ReturnType<typeof toSessionId>, SessionStep]> = [];
    const mockAgenticSessionState: AgenticSessionState = {
      getPreviouslyShownFiles: () => [],
      getSteps: () => [],
      recordStep: (sessionId, step) => {
        recordStepCalls.push([sessionId, step]);
      },
    };
    const cacheStore = createInMemoryCacheStore();
    const configStore: ConfigStore = {
      getLatestHash: () => null,
      writeSnapshot() {},
    };
    const stringHasher: StringHasher = {
      hash(input: string) {
        return `h-${input.length}`;
      },
    };
    const { guardStore, compilationLogStore } = createGuardAndLogMocks();
    const deps = {
      intentClassifier,
      rulePackResolver,
      budgetAllocator,
      contextSelector: heuristicSelector,
      contextGuard,
      contentTransformerPipeline,
      summarisationLadder,
      languageProviders,
      lineLevelPruner: new LineLevelPruner(tiktokenAdapter, fileContentReader),
      promptAssembler,
      intentAwareFileDiscoverer: new IntentAwareFileDiscoverer(),
      repoMapSupplier: mockRepoMapSupplier,
      tokenCounter: tiktokenAdapter,
      specFileDiscoverer: new SpecFileDiscoverer(),
      conversationCompressor: new ConversationCompressorImpl(),
      heuristicMaxFiles: 0,
      structuralMapBuilder: new StructuralMapBuilder(),
    };
    const runner = new CompilationRunner(
      deps,
      mockClock,
      cacheStore,
      configStore,
      stringHasher,
      guardStore,
      compilationLogStore,
      mockIdGenerator,
      mockAgenticSessionState,
    );
    const processSessionId = toSessionId("process-session-uuid");
    const convId = toConversationId("editor-conv-abc");
    const request: CompilationRequest = {
      ...makeRequest(fixtureRoot),
      sessionId: processSessionId,
      stepIndex: toStepIndex(1),
      conversationId: convId,
    };
    await runner.run(request);
    expect(recordStepCalls.length).toBe(1);
    const firstCall = recordStepCalls[0];
    expect(firstCall).toBeDefined();
    if (firstCall === undefined) return;
    const [calledSessionId] = firstCall;
    expect(calledSessionId).toBe(toSessionId(convId));
    expect(calledSessionId).not.toBe(processSessionId);
  }, 30_000);

  it("compilation_runner_cache_key_includes_session_and_step", async () => {
    const cacheStore = createInMemoryCacheStore();
    const configStore: ConfigStore = {
      getLatestHash: () => null,
      writeSnapshot() {},
    };
    const hashInputs: string[] = [];
    const stringHasher: StringHasher = {
      hash(input: string) {
        hashInputs.push(input);
        return `h-${input.length}-${hashInputs.length}`;
      },
    };
    const { guardStore, compilationLogStore } = createGuardAndLogMocks();
    const deps = {
      intentClassifier,
      rulePackResolver,
      budgetAllocator,
      contextSelector: heuristicSelector,
      contextGuard,
      contentTransformerPipeline,
      summarisationLadder,
      languageProviders,
      lineLevelPruner: new LineLevelPruner(tiktokenAdapter, fileContentReader),
      promptAssembler,
      intentAwareFileDiscoverer: new IntentAwareFileDiscoverer(),
      repoMapSupplier: mockRepoMapSupplier,
      tokenCounter: tiktokenAdapter,
      specFileDiscoverer: new SpecFileDiscoverer(),
      conversationCompressor: new ConversationCompressorImpl(),
      heuristicMaxFiles: 0,
      structuralMapBuilder: new StructuralMapBuilder(),
    };
    const runner = new CompilationRunner(
      deps,
      mockClock,
      cacheStore,
      configStore,
      stringHasher,
      guardStore,
      compilationLogStore,
      mockIdGenerator,
      null,
    );
    const request1: CompilationRequest = {
      ...makeRequest(fixtureRoot),
      sessionId: toSessionId("s1"),
      stepIndex: toStepIndex(0),
    };
    const request2: CompilationRequest = {
      ...makeRequest(fixtureRoot),
      sessionId: toSessionId("s2"),
      stepIndex: toStepIndex(1),
    };
    await runner.run(request1);
    const second = await runner.run(request2);
    expect(second.meta.cacheHit).toBe(false);
    const cacheKeyInputs = hashInputs.filter((_, i) => i % 2 === 1);
    expect(cacheKeyInputs[0]).not.toBe(cacheKeyInputs[1]);
  }, 30_000);

  it("compilation_runner_prompt_contains_placeholder_when_previous_returned", async () => {
    const prevPath = toRelativePath("src/auth/service.ts");
    const previousFile: PreviousFile = {
      path: prevPath,
      lastTier: INCLUSION_TIER.L0,
      lastStepIndex: toStepIndex(0),
      modifiedSince: false,
    };
    const mockAgenticSessionState: AgenticSessionState = {
      getPreviouslyShownFiles: () => [previousFile],
      getSteps: () => [],
      recordStep: () => {},
    };
    const cacheStore = createInMemoryCacheStore();
    const configStore: ConfigStore = {
      getLatestHash: () => null,
      writeSnapshot() {},
    };
    const stringHasher: StringHasher = {
      hash(input: string) {
        return `h-${input.length}`;
      },
    };
    const { guardStore, compilationLogStore } = createGuardAndLogMocks();
    const deps = {
      intentClassifier,
      rulePackResolver,
      budgetAllocator,
      contextSelector: heuristicSelector,
      contextGuard,
      contentTransformerPipeline,
      summarisationLadder,
      languageProviders,
      lineLevelPruner: new LineLevelPruner(tiktokenAdapter, fileContentReader),
      promptAssembler,
      intentAwareFileDiscoverer: new IntentAwareFileDiscoverer(),
      repoMapSupplier: mockRepoMapSupplier,
      tokenCounter: tiktokenAdapter,
      specFileDiscoverer: new SpecFileDiscoverer(),
      conversationCompressor: new ConversationCompressorImpl(),
      heuristicMaxFiles: 0,
      structuralMapBuilder: new StructuralMapBuilder(),
    };
    const runner = new CompilationRunner(
      deps,
      mockClock,
      cacheStore,
      configStore,
      stringHasher,
      guardStore,
      compilationLogStore,
      mockIdGenerator,
      mockAgenticSessionState,
    );
    const request: CompilationRequest = {
      ...makeRequest(fixtureRoot),
      sessionId: toSessionId("session-placeholder"),
    };
    const result = await runner.run(request);
    expect(result.compiledPrompt).toContain("Previously shown in step");
  }, 30_000);
});

describe("normalizeForLookup", () => {
  it("normalize_strips_vendor_prefix", () => {
    expect(normalizeForLookup("anthropic/claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
  });

  it("normalize_strips_date_suffix", () => {
    expect(normalizeForLookup("claude-sonnet-4-6-20250722")).toBe("claude-sonnet-4-6");
  });

  it("normalize_strips_both", () => {
    expect(normalizeForLookup("anthropic/claude-sonnet-4-6-20250722")).toBe(
      "claude-sonnet-4-6",
    );
  });

  it("normalize_passthrough_clean_id", () => {
    expect(normalizeForLookup("claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
  });

  it("normalize_returns_auto_for_auto", () => {
    expect(normalizeForLookup("auto")).toBe("auto");
  });

  it("normalize_reorders_cursor_version_role_format", () => {
    expect(normalizeForLookup("claude-4.6-sonnet-medium-thinking")).toBe(
      "claude-sonnet-4.6",
    );
  });

  it("normalize_reorders_cursor_format_strips_variant", () => {
    expect(normalizeForLookup("claude-4.6-opus")).toBe("claude-opus-4.6");
  });
});

describe("lookupContextWindow", () => {
  it("lookup_exact_match", () => {
    expect(lookupContextWindow("claude-opus-4.6")).toBe(
      MODEL_CONTEXT_WINDOWS["claude-opus-4.6"],
    );
  });

  it("lookup_prefix_walk_strips_suffix", () => {
    expect(lookupContextWindow("claude-sonnet-4.6-preview")).toBe(
      MODEL_CONTEXT_WINDOWS["claude-sonnet-4.6"],
    );
  });

  it("lookup_returns_undefined_for_unknown", () => {
    expect(lookupContextWindow("unknown-model-xyz")).toBeUndefined();
  });
});

describe("resolveModelDerivedEffectiveWindowTokens", () => {
  it("writes_warning_when_model_lookup_walks_down", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    resolveModelDerivedEffectiveWindowTokens("claude-sonnet-4.6-preview");

    expect(stderrSpy).toHaveBeenCalledWith(
      "[aic] model context window walk-down: claude-sonnet-4.6-preview -> claude-sonnet-4.6\n",
    );
    stderrSpy.mockRestore();
  });

  it("does_not_write_walk_down_warning_for_exact_match", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    resolveModelDerivedEffectiveWindowTokens("claude-sonnet-4.6");

    expect(stderrSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("model context window walk-down"),
    );
    stderrSpy.mockRestore();
  });
});
