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
import type { StringHasher } from "#core/interfaces/string-hasher.interface.js";
import type { RulePackProvider } from "#core/interfaces/rule-pack-provider.interface.js";
import type { BudgetConfig } from "#core/interfaces/budget-config.interface.js";
import type { TaskClass } from "#core/types/enums.js";
import { EDITOR_ID } from "#core/types/enums.js";
import { CompilationRunner } from "../compilation-runner.js";
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
import { PromptAssembler } from "../prompt-assembler.js";
import { TiktokenAdapter } from "#adapters/tiktoken-adapter.js";
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
  };
}

function makeRequest(fixtureRoot: ReturnType<typeof toAbsolutePath>): CompilationRequest {
  return {
    intent: "refactor auth module to use middleware pattern",
    projectRoot: fixtureRoot,
    modelId: null,
    editorId: EDITOR_ID.GENERIC,
    configPath: null,
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
  const heuristicSelector = new HeuristicSelector(languageProviders, {
    maxFiles: 20,
  });
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
    const deps = {
      intentClassifier,
      rulePackResolver,
      budgetAllocator,
      contextSelector: heuristicSelector,
      contextGuard,
      contentTransformerPipeline,
      summarisationLadder,
      promptAssembler,
      repoMapSupplier: mockRepoMapSupplier,
      tokenCounter: tiktokenAdapter,
    };
    const runner = new CompilationRunner(
      deps,
      mockClock,
      cacheStore,
      configStore,
      stringHasher,
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
    const deps = {
      intentClassifier,
      rulePackResolver,
      budgetAllocator,
      contextSelector: heuristicSelector,
      contextGuard,
      contentTransformerPipeline,
      summarisationLadder,
      promptAssembler,
      repoMapSupplier: mockRepoMapSupplier,
      tokenCounter: tiktokenAdapter,
    };
    const runner = new CompilationRunner(
      deps,
      mockClock,
      cacheStore,
      configStore,
      stringHasher,
    );
    const request = makeRequest(fixtureRoot);
    const first = await runner.run(request);
    const second = await runner.run(request);
    expect(second.meta.cacheHit).toBe(true);
    expect(second.compiledPrompt).toBe(first.compiledPrompt);
  });

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
    const deps = {
      intentClassifier,
      rulePackResolver,
      budgetAllocator,
      contextSelector: heuristicSelector,
      contextGuard,
      contentTransformerPipeline,
      summarisationLadder,
      promptAssembler,
      repoMapSupplier: rejectingRepoMapSupplier,
      tokenCounter: tiktokenAdapter,
    };
    const runner = new CompilationRunner(
      deps,
      mockClock,
      cacheStore,
      configStore,
      stringHasher,
    );
    const request = makeRequest(fixtureRoot);
    await expect(runner.run(request)).rejects.toThrow("getRepoMap failed");
  });
});
