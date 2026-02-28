import * as path from "node:path";
import * as fs from "node:fs";
import { describe, it, expect } from "vitest";
import { toAbsolutePath } from "#core/types/paths.js";
import { toRelativePath } from "#core/types/paths.js";
import { toTokenCount, toMilliseconds } from "#core/types/units.js";
import { toBytes } from "#core/types/units.js";
import { toISOTimestamp } from "#core/types/identifiers.js";
import type { CompilationRequest } from "#core/types/compilation-types.js";
import type { CachedCompilation } from "#core/types/compilation-types.js";
import type { RepoMap, FileEntry } from "#core/types/repo-map.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { FileContentReader } from "#core/interfaces/file-content-reader.interface.js";
import type { RepoMapSupplier } from "#core/interfaces/repo-map-supplier.interface.js";
import type { Clock } from "#core/interfaces/clock.interface.js";
import type { CacheStore } from "#core/interfaces/cache-store.interface.js";
import type { ConfigStore } from "#core/interfaces/config-store.interface.js";
import type { GuardStore } from "#core/interfaces/guard-store.interface.js";
import type { CompilationLogStore } from "#core/interfaces/compilation-log-store.interface.js";
import type { IdGenerator } from "#core/interfaces/id-generator.interface.js";
import type { RulePackProvider } from "#core/interfaces/rule-pack-provider.interface.js";
import type { BudgetConfig } from "#core/interfaces/budget-config.interface.js";
import type { TaskClass } from "#core/types/enums.js";
import { EDITOR_ID } from "#core/types/enums.js";
import { toUUIDv7 } from "#core/types/identifiers.js";
import { CompilationRunner } from "#pipeline/compilation-runner.js";
import { IntentClassifier } from "#pipeline/intent-classifier.js";
import { RulePackResolver } from "#pipeline/rule-pack-resolver.js";
import { BudgetAllocator } from "#pipeline/budget-allocator.js";
import { HeuristicSelector } from "#pipeline/heuristic-selector.js";
import { ExclusionScanner } from "#pipeline/exclusion-scanner.js";
import { SecretScanner } from "#pipeline/secret-scanner.js";
import { PromptInjectionScanner } from "#pipeline/prompt-injection-scanner.js";
import { ContextGuard } from "#pipeline/context-guard.js";
import { WhitespaceNormalizer } from "#pipeline/whitespace-normalizer.js";
import { CommentStripper } from "#pipeline/comment-stripper.js";
import { JsonCompactor } from "#pipeline/json-compactor.js";
import { LockFileSkipper } from "#pipeline/lock-file-skipper.js";
import { ContentTransformerPipeline } from "#pipeline/content-transformer-pipeline.js";
import { SummarisationLadder } from "#pipeline/summarisation-ladder.js";
import { PromptAssembler } from "#pipeline/prompt-assembler.js";
import { IntentAwareFileDiscoverer } from "#pipeline/intent-aware-file-discoverer.js";
import { TiktokenAdapter } from "#adapters/tiktoken-adapter.js";
import { Sha256Adapter } from "#adapters/sha256-adapter.js";
import { TypeScriptProvider } from "#adapters/typescript-provider.js";
import { GenericProvider } from "#adapters/generic-provider.js";

const FIXED_TS = "2026-01-01T00:00:00.000Z";

function defaultRulePack(): RulePack {
  return {
    constraints: [],
    includePatterns: [],
    excludePatterns: [],
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

function createRunner(fixtureRoot: ReturnType<typeof toAbsolutePath>): CompilationRunner {
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
    getContent(pathRel: ReturnType<typeof toRelativePath>): string {
      const full = path.join(fixtureRoot as string, pathRel as string);
      return fs.readFileSync(full, "utf8");
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
    { getScores: () => new Map() },
  );
  const exclusionScanner = new ExclusionScanner();
  const secretScanner = new SecretScanner();
  const promptInjectionScanner = new PromptInjectionScanner();
  const scanners = [exclusionScanner, secretScanner, promptInjectionScanner] as const;
  const contextGuard = new ContextGuard(scanners, fileContentReader, []);
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
  const cacheStore = createInMemoryCacheStore();
  const configStore: ConfigStore = {
    getLatestHash: () => null,
    writeSnapshot() {},
  };
  const sha256Adapter = new Sha256Adapter();
  const guardStore: GuardStore = {
    write() {},
    queryByCompilation() {
      return [];
    },
  };
  const compilationLogStore: CompilationLogStore = {
    record() {},
  };
  const idGenerator: IdGenerator = {
    generate() {
      return toUUIDv7("00000000-0000-7000-8000-000000000000");
    },
  };
  const deps = {
    intentClassifier,
    rulePackResolver,
    budgetAllocator,
    contextSelector: heuristicSelector,
    contextGuard,
    contentTransformerPipeline,
    summarisationLadder,
    promptAssembler,
    intentAwareFileDiscoverer: new IntentAwareFileDiscoverer(),
    repoMapSupplier: mockRepoMapSupplier,
    tokenCounter: tiktokenAdapter,
  };
  return new CompilationRunner(
    deps,
    mockClock,
    cacheStore,
    configStore,
    sha256Adapter,
    guardStore,
    compilationLogStore,
    idGenerator,
  );
}

describe("full pipeline", () => {
  const fixtureRoot = toAbsolutePath(
    path.join(process.cwd(), "test", "benchmarks", "repos", "1"),
  );
  const request: CompilationRequest = {
    intent: "refactor auth module to use middleware pattern",
    projectRoot: fixtureRoot,
    modelId: null,
    editorId: EDITOR_ID.GENERIC,
    configPath: null,
  };

  it("full_pipeline_compiled_output_matches_snapshot", async () => {
    const runner = createRunner(fixtureRoot);
    const result = await runner.run(request);
    expect(result.compiledPrompt).toMatchSnapshot();
  });

  it("full_pipeline_deterministic", async () => {
    const runner1 = createRunner(fixtureRoot);
    const runner2 = createRunner(fixtureRoot);
    const first = await runner1.run(request);
    const second = await runner2.run(request);
    expect(first).toEqual(second);
  }, 15_000);

  it("full_pipeline_second_run_cache_hit", async () => {
    const runner = createRunner(fixtureRoot);
    await runner.run(request);
    const second = await runner.run(request);
    expect(second.meta.cacheHit).toBe(true);
    expect(second.meta.durationMs).toEqual(toMilliseconds(0));
  });
});
