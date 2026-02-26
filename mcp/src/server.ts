import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { AbsolutePath } from "@aic/shared/core/types/paths.js";
import type { RelativePath } from "@aic/shared/core/types/paths.js";
import type { RulePack } from "@aic/shared/core/types/rule-pack.js";
import type { RulePackProvider } from "@aic/shared/core/interfaces/rule-pack-provider.interface.js";
import type { FileContentReader } from "@aic/shared/core/interfaces/file-content-reader.interface.js";
import type { BudgetConfig } from "@aic/shared/core/interfaces/budget-config.interface.js";
import type { ExecutableDb } from "@aic/shared/core/interfaces/executable-db.interface.js";
import type { Clock } from "@aic/shared/core/interfaces/clock.interface.js";
import type { IdGenerator } from "@aic/shared/core/interfaces/id-generator.interface.js";
import { toAbsolutePath } from "@aic/shared/core/types/paths.js";
import { toTokenCount } from "@aic/shared/core/types/units.js";
import { type TaskClass } from "@aic/shared/core/types/enums.js";
import { STUB_COMPILATION_META } from "@aic/shared/testing/stub-compilation-meta.js";
import type { CompilationRunner } from "@aic/shared/core/interfaces/compilation-runner.interface.js";
import type { RepoMapSupplier } from "@aic/shared/core/interfaces/repo-map-supplier.interface.js";
import { InspectRunner } from "@aic/shared/pipeline/inspect-runner.js";
import { StorageError } from "@aic/shared/core/errors/storage-error.js";
import { CompilationRequestSchema } from "./schemas/compilation-request.js";
import { InspectRequestSchema } from "./schemas/inspect-request.schema.js";
import { createCompileHandler } from "./handlers/compile-handler.js";
import { handleInspect } from "./handlers/inspect-handler.js";
import { openDatabase } from "@aic/shared/storage/open-database.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SystemClock } from "@aic/shared/adapters/system-clock.js";
import { UuidV7Generator } from "@aic/shared/adapters/uuid-v7-generator.js";
import { TiktokenAdapter } from "@aic/shared/adapters/tiktoken-adapter.js";
import { FastGlobAdapter } from "@aic/shared/adapters/fast-glob-adapter.js";
import { IgnoreAdapter } from "@aic/shared/adapters/ignore-adapter.js";
import { TypeScriptProvider } from "@aic/shared/adapters/typescript-provider.js";
import { GenericProvider } from "@aic/shared/adapters/generic-provider.js";
import { SqliteCacheStore } from "@aic/shared/storage/sqlite-cache-store.js";
import { SqliteTelemetryStore } from "@aic/shared/storage/sqlite-telemetry-store.js";
import { SqliteConfigStore } from "@aic/shared/storage/sqlite-config-store.js";
import { SqliteGuardStore } from "@aic/shared/storage/sqlite-guard-store.js";
import { IntentClassifier } from "@aic/shared/pipeline/intent-classifier.js";
import { RulePackResolver } from "@aic/shared/pipeline/rule-pack-resolver.js";
import { BudgetAllocator } from "@aic/shared/pipeline/budget-allocator.js";
import { HeuristicSelector } from "@aic/shared/pipeline/heuristic-selector.js";
import { ExclusionScanner } from "@aic/shared/pipeline/exclusion-scanner.js";
import { SecretScanner } from "@aic/shared/pipeline/secret-scanner.js";
import { PromptInjectionScanner } from "@aic/shared/pipeline/prompt-injection-scanner.js";
import { ContextGuard } from "@aic/shared/pipeline/context-guard.js";
import { WhitespaceNormalizer } from "@aic/shared/pipeline/whitespace-normalizer.js";
import { CommentStripper } from "@aic/shared/pipeline/comment-stripper.js";
import { JsonCompactor } from "@aic/shared/pipeline/json-compactor.js";
import { LockFileSkipper } from "@aic/shared/pipeline/lock-file-skipper.js";
import { ContentTransformerPipeline } from "@aic/shared/pipeline/content-transformer-pipeline.js";
import { SummarisationLadder } from "@aic/shared/pipeline/summarisation-ladder.js";
import { PromptAssembler } from "@aic/shared/pipeline/prompt-assembler.js";

export function ensureAicDir(projectRoot: AbsolutePath): AbsolutePath {
  const aicDir = path.join(projectRoot as string, ".aic");
  fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
  return toAbsolutePath(aicDir);
}

export function createFileContentReader(projectRoot: AbsolutePath): FileContentReader {
  return {
    getContent(pathRel: RelativePath): string {
      const full = path.join(projectRoot as string, pathRel as string);
      return fs.readFileSync(full, "utf8");
    },
  };
}

function defaultRulePack(): RulePack {
  return {
    constraints: [],
    includePatterns: [],
    excludePatterns: [],
  };
}

export function createRulePackProvider(_projectRoot: AbsolutePath): RulePackProvider {
  return {
    getBuiltInPack(_name: string): RulePack {
      return defaultRulePack();
    },
    getProjectPack(projectRootArg: AbsolutePath, taskClass: TaskClass): RulePack | null {
      const filePath = path.join(
        projectRootArg as string,
        "aic-rules",
        `${taskClass}.json`,
      );
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, "utf8");
      const data = JSON.parse(raw) as unknown;
      if (
        typeof data !== "object" ||
        data === null ||
        !Array.isArray((data as { constraints?: unknown }).constraints) ||
        !Array.isArray((data as { includePatterns?: unknown }).includePatterns) ||
        !Array.isArray((data as { excludePatterns?: unknown }).excludePatterns)
      ) {
        return null;
      }
      const obj = data as {
        constraints: unknown[];
        includePatterns: unknown[];
        excludePatterns: unknown[];
      };
      return {
        constraints: obj.constraints as string[],
        includePatterns: obj.includePatterns as RulePack["includePatterns"],
        excludePatterns: obj.excludePatterns as RulePack["excludePatterns"],
      };
    },
  };
}

export function createDefaultBudgetConfig(): BudgetConfig {
  return {
    getMaxTokens(): ReturnType<typeof toTokenCount> {
      return toTokenCount(8000);
    },
    getBudgetForTaskClass(_taskClass: TaskClass): ReturnType<typeof toTokenCount> | null {
      return null;
    },
  };
}

export interface ProjectScope {
  readonly db: ExecutableDb;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly cacheStore: InstanceType<typeof SqliteCacheStore>;
  readonly telemetryStore: InstanceType<typeof SqliteTelemetryStore>;
  readonly configStore: InstanceType<typeof SqliteConfigStore>;
  readonly guardStore: InstanceType<typeof SqliteGuardStore>;
  readonly projectRoot: AbsolutePath;
}

export function createProjectScope(projectRoot: AbsolutePath): ProjectScope {
  const aicDir = ensureAicDir(projectRoot);
  const dbPath = path.join(aicDir as string, "aic.sqlite");
  const clock = new SystemClock();
  const db = openDatabase(dbPath, clock);
  const idGenerator = new UuidV7Generator(clock);
  const cacheDirPath = path.join(aicDir as string, "cache");
  fs.mkdirSync(cacheDirPath, { recursive: true });
  const cacheDir = toAbsolutePath(cacheDirPath);
  const cacheStore = new SqliteCacheStore(db, cacheDir, clock);
  const telemetryStore = new SqliteTelemetryStore(db);
  const configStore = new SqliteConfigStore(db, clock);
  const guardStore = new SqliteGuardStore(db, idGenerator, clock);
  return {
    db,
    clock,
    idGenerator,
    cacheStore,
    telemetryStore,
    configStore,
    guardStore,
    projectRoot,
  };
}

export function createMcpServer(projectRoot: AbsolutePath): McpServer {
  const scope = createProjectScope(projectRoot);
  const tiktokenAdapter = new TiktokenAdapter();
  const _fastGlobAdapter = new FastGlobAdapter();
  const _ignoreAdapter = new IgnoreAdapter();
  const typeScriptProvider = new TypeScriptProvider();
  const genericProvider = new GenericProvider();
  const languageProviders = [typeScriptProvider, genericProvider] as const;
  const tokenCounter = (text: string): ReturnType<typeof tiktokenAdapter.countTokens> =>
    tiktokenAdapter.countTokens(text);
  const fileContentReader = createFileContentReader(projectRoot);
  const rulePackProvider = createRulePackProvider(projectRoot);
  const budgetConfig = createDefaultBudgetConfig();
  const intentClassifier = new IntentClassifier();
  const rulePackResolver = new RulePackResolver(rulePackProvider);
  const budgetAllocator = new BudgetAllocator(budgetConfig);
  const heuristicSelector = new HeuristicSelector(languageProviders, { maxFiles: 20 });
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

  const stubRepoMapSupplier: RepoMapSupplier = {
    getRepoMap() {
      return Promise.reject(
        new StorageError("RepoMap not available; RepoMapBuilder not implemented"),
      );
    },
  };

  const inspectRunner = new InspectRunner(
    intentClassifier,
    rulePackResolver,
    budgetAllocator,
    heuristicSelector,
    contextGuard,
    contentTransformerPipeline,
    summarisationLadder,
    promptAssembler,
    stubRepoMapSupplier,
    scope.clock,
    tiktokenAdapter,
  );

  const stubRunner: CompilationRunner = {
    run(_request) {
      return Promise.resolve({
        compiledPrompt: "Not implemented",
        meta: STUB_COMPILATION_META,
      });
    },
  };
  const server = new McpServer({ name: "aic", version: "0.1.0" });
  server.tool("aic_compile", CompilationRequestSchema, createCompileHandler(stubRunner));
  server.tool("aic_inspect", InspectRequestSchema, (args) =>
    handleInspect(args, inspectRunner),
  );
  server.resource("last-compilation", "aic://last-compilation", () => ({
    contents: [],
  }));
  return server;
}

export async function main(): Promise<void> {
  const projectRoot = toAbsolutePath(process.cwd());
  const server = createMcpServer(projectRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isEntry =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isEntry) {
  main().catch((err) => {
    process.stderr.write(String(err));
    process.exit(1);
  });
}
