// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import "./preflight.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { AbsolutePath, FilePath } from "@jatbas/aic-core/core/types/paths.js";
import type { RulePack } from "@jatbas/aic-core/core/types/rule-pack.js";
import type { RulePackProvider } from "@jatbas/aic-core/core/interfaces/rule-pack-provider.interface.js";
import type { LanguageProvider } from "@jatbas/aic-core/core/interfaces/language-provider.interface.js";
import type { ImportGraphFailureSink } from "@jatbas/aic-core/core/interfaces/import-graph-failure-sink.interface.js";
import { toAbsolutePath, toFilePath } from "@jatbas/aic-core/core/types/paths.js";
import type { TaskClass, EditorId } from "@jatbas/aic-core/core/types/enums.js";
import { InspectRunner } from "@jatbas/aic-core/pipeline/inspect-runner.js";
import {
  CompilationRequestSchema,
  MCP_INTENT_OMITTED_DEFAULT,
} from "./schemas/compilation-request.js";
import { StatusRequestSchema } from "./schemas/status-request.schema.js";
import {
  QualityReportRequestSchema,
  toQualityReportWindowDays,
} from "./schemas/quality-report-request.schema.js";
import { ConversationSummaryRequestSchema } from "./schemas/conversation-summary-request.js";
import { InspectRequestSchema } from "./schemas/inspect-request.schema.js";
import { ModelTestRequestSchema } from "./schemas/model-test-request.schema.js";
import { CompileSpecRequestSchema } from "./schemas/compile-spec-request.schema.js";
import {
  AicCompileSpecToolRegisteredOutputSchema,
  AicCompileToolRegisteredOutputSchema,
} from "./schemas/compile-tool-outputs.schema.js";
import { createCompileHandler } from "./handlers/compile-handler.js";
import { createCompileSpecHandler } from "./handlers/compile-spec-handler.js";
import { createModelTestHandler } from "./handlers/model-test-handler.js";
import { SessionContext } from "./handlers/session-context-cache.js";
import { handleInspect } from "./handlers/inspect-handler.js";
import { recordToolInvocation } from "./record-tool-invocation.js";
import { ConfigError } from "@jatbas/aic-core/core/errors/config-error.js";
import { prunePromptLog } from "@jatbas/aic-core/maintenance/prune-prompt-log.js";
import { pruneSessionLog } from "@jatbas/aic-core/maintenance/prune-session-log.js";
import { pruneJsonlByTimestamp } from "@jatbas/aic-core/maintenance/prune-jsonl-by-timestamp.js";
import { NodePathAdapter } from "@jatbas/aic-core/adapters/node-path-adapter.js";
import { SystemClock } from "@jatbas/aic-core/adapters/system-clock.js";
import { ScopeRegistry } from "@jatbas/aic-core/storage/scope-registry.js";
import { openDatabase, closeDatabase } from "@jatbas/aic-core/storage/open-database.js";
import type { CacheStore } from "@jatbas/aic-core/core/interfaces/cache-store.interface.js";
import type { CompilationRunner } from "@jatbas/aic-core/core/interfaces/compilation-runner.interface.js";
import type { SessionTracker } from "@jatbas/aic-core/core/interfaces/session-tracker.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { ProjectScope } from "@jatbas/aic-core/storage/create-project-scope.js";
import type { SessionId } from "@jatbas/aic-core/core/types/identifiers.js";
import { toSessionId } from "@jatbas/aic-core/core/types/identifiers.js";
import { toStatusTimeRangeDays } from "@jatbas/aic-core/core/types/status-types.js";
import { z } from "zod";
import { STOP_REASON } from "@jatbas/aic-core/core/types/enums.js";
import {
  createFullPipelineDeps,
  createPipelineDeps,
} from "@jatbas/aic-core/bootstrap/create-pipeline-deps.js";
import type { Closeable } from "@jatbas/aic-core/core/interfaces/closeable.interface.js";
import { FileSystemRepoMapSupplier } from "@jatbas/aic-core/adapters/file-system-repo-map-supplier.js";
import { WatchingRepoMapSupplier } from "@jatbas/aic-core/adapters/watching-repo-map-supplier.js";
import { FastGlobAdapter } from "@jatbas/aic-core/adapters/fast-glob-adapter.js";
import { IgnoreAdapter } from "@jatbas/aic-core/adapters/ignore-adapter.js";
import { runInit } from "./init-project.js";
import { installTriggerRule } from "./install-trigger-rule.js";
import { runStartupSelfCheck } from "./startup-self-check.js";
import {
  LoadConfigFromFile,
  applyConfigResult,
} from "@jatbas/aic-core/config/load-config-from-file.js";
import {
  McpError,
  ErrorCode,
  type ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CompilationRunner as CompilationRunnerImpl } from "@jatbas/aic-core/pipeline/compilation-runner.js";
import { SpecificationCompilerImpl } from "@jatbas/aic-core/pipeline/specification-compiler.js";
import { SqliteAgenticSessionStore } from "@jatbas/aic-core/storage/sqlite-agentic-session-store.js";
import { SqliteSpecCompileCacheStore } from "@jatbas/aic-core/storage/sqlite-spec-compile-cache-store.js";
import { SqliteToolInvocationLogStore } from "@jatbas/aic-core/storage/sqlite-tool-invocation-log-store.js";
import { Sha256Adapter } from "@jatbas/aic-core/adapters/sha256-adapter.js";
import { loadRulePackFromPath } from "@jatbas/aic-core/core/load-rule-pack.js";
import { createProjectFileReader } from "@jatbas/aic-core/adapters/project-file-reader-adapter.js";
import { createCachingFileContentReader } from "@jatbas/aic-core/adapters/caching-file-content-reader.js";
import { detectEditorId } from "./detect-editor-id.js";
import { detectInstallScope } from "./detect-install-scope.js";
import {
  BOOTSTRAP_INTEGRATION,
  type BootstrapIntegrationMode,
  getInstallScopeWarnings,
  getDuplicateInstallStderrMessage,
  getEditorModelHints,
  getEditorEnvHints,
  parseBootstrapIntegrationMode,
  runEditorBootstrapIfNeeded,
} from "./editor-integration-dispatch.js";
import { upgradeGlobalMcpConfigIfNeeded } from "./upgrade-global-mcp-config-if-needed.js";
import { getUpdateInfo, type UpdateInfo } from "./latest-version-check.js";
import { readPackageVersion, runCliDiagnosticsAndExit } from "./cli-diagnostics.js";
import {
  buildStatusPayload,
  buildLastPayload,
  buildChatSummaryToolPayload,
  buildProjectsPayload,
  buildQualityReportPayload,
} from "./diagnostic-payloads.js";
import { EditorModelConfigReaderAdapter } from "@jatbas/aic-core/adapters/editor-model-config-reader.js";
import { ModelDetectorDispatch } from "@jatbas/aic-core/adapters/model-detector-dispatch.js";

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
      return loadRulePackFromPath(createProjectFileReader(projectRootArg), taskClass);
    },
  };
}

const createImportGraphFailureSink = (): ImportGraphFailureSink => ({
  notifyImportGraphFailure({ kind, path, cause }): void {
    process.stderr.write(
      `[aic] import-graph:${kind} ${path} ${cause instanceof Error ? cause.name : "non-error-throw"}\n`,
    );
  },
});

export function registerShutdownHandler(
  sessionTracker: SessionTracker,
  sessionId: SessionId,
  clock: Clock,
  cacheStore: CacheStore,
  runnerCache?: Map<string, { runner: CompilationRunner; closeable: Closeable }>,
): () => void {
  let exited = false;
  const handler = (): void => {
    if (exited) return;
    exited = true;
    try {
      if (runnerCache !== undefined) {
        for (const entry of runnerCache.values()) {
          entry.closeable.close();
        }
      }
      cacheStore.purgeExpired();
      sessionTracker.stopSession(sessionId, clock.now(), STOP_REASON.GRACEFUL);
    } catch {
      // Storage may already be closed (e.g. test teardown); exit anyway.
    }
    process.exit(0);
  };
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
  process.on("SIGHUP", handler);
  return handler;
}

export type BatchExitRef = { stdinEnded: boolean; pendingToolCalls: number };

export function createMcpServer(
  projectRoot: AbsolutePath,
  db: ExecutableDb,
  clock: Clock,
  additionalProviders?: readonly LanguageProvider[],
  batchExitRef?: BatchExitRef,
  bootstrapIntegrationMode: BootstrapIntegrationMode = BOOTSTRAP_INTEGRATION.AUTO,
): McpServer & { close(): Promise<void>; getEditorId(): EditorId } {
  const batchExit = batchExitRef;
  const normaliser = new NodePathAdapter();
  const registry = new ScopeRegistry(normaliser, db, clock);
  const startupScope = registry.getOrCreate(projectRoot);
  const { packageName, packageVersion } = readPackageVersion();
  const purgeImmediateId = setImmediate(() => {
    startupScope.cacheStore.purgeExpired();
    pruneSessionLog(startupScope.projectRoot, startupScope.clock);
    prunePromptLog(startupScope.projectRoot, startupScope.clock);
    pruneJsonlByTimestamp(
      startupScope.projectRoot,
      startupScope.clock,
      "session-models.jsonl",
    );
  });
  const { installationOk, installationNotes } = runStartupSelfCheck(projectRoot);
  const installScope = detectInstallScope(os.homedir(), projectRoot);
  const configUpgraded = upgradeGlobalMcpConfigIfNeeded(os.homedir());
  const installScopeWarnings = getInstallScopeWarnings(installScope);
  if (installScopeWarnings.length > 0) {
    process.stderr.write(getDuplicateInstallStderrMessage());
  }
  const sessionId = toSessionId(startupScope.idGenerator.generate());
  const startedAt = startupScope.clock.now();
  startupScope.sessionTracker.startSession(
    sessionId,
    startedAt,
    process.pid,
    packageVersion,
    installationOk,
    installationNotes,
  );
  startupScope.sessionTracker.backfillCrashedSessions(startedAt);
  const runnerCache = new Map<
    string,
    { runner: CompilationRunner; closeable: WatchingRepoMapSupplier }
  >();
  registerShutdownHandler(
    startupScope.sessionTracker,
    sessionId,
    startupScope.clock,
    startupScope.cacheStore,
    runnerCache,
  );
  const updateInfoRef: { current: UpdateInfo } = {
    current: {
      updateAvailable: null,
      currentVersion: packageVersion,
      updateMessage: null,
    },
  };
  setImmediate(() => {
    getUpdateInfo(projectRoot, packageName, packageVersion, startupScope.clock)
      .then((info) => {
        updateInfoRef.current = info;
        if (info.updateAvailable !== null) {
          process.stderr.write(`[aic] ${info.updateMessage}\n`);
        }
      })
      .catch(() => {});
  });
  const sha256Adapter = new Sha256Adapter();
  const configLoader = new LoadConfigFromFile();
  const configResult = configLoader.load(projectRoot, null);
  const {
    budgetConfig,
    heuristicConfig,
    modelId: configModelId,
    guardAllowPatterns,
    contextWindow: _contextWindow,
  } = applyConfigResult(configResult, startupScope.configStore, sha256Adapter);
  const fileContentReader = createCachingFileContentReader(projectRoot);
  const rulePackProvider = createRulePackProvider(projectRoot);
  const importGraphFailureSink = createImportGraphFailureSink();
  const deps = createFullPipelineDeps(
    fileContentReader,
    rulePackProvider,
    budgetConfig,
    additionalProviders,
    heuristicConfig,
    guardAllowPatterns,
    importGraphFailureSink,
  );
  const specificationCompiler = new SpecificationCompilerImpl(
    (text) => deps.tokenCounter.countTokens(text),
    deps.contentTransformerPipeline,
    deps.summarisationLadder,
    deps.languageProviders,
  );
  const toolInvocationLogStore = new SqliteToolInvocationLogStore(
    startupScope.projectId,
    startupScope.db,
  );
  const specCompileCacheStore = new SqliteSpecCompileCacheStore(
    startupScope.projectId,
    startupScope.db,
    startupScope.clock,
  );
  const inspectRunner = new InspectRunner(deps, startupScope.clock);
  const getRunner = (
    scope: ProjectScope,
    configPath: FilePath | null,
  ): CompilationRunner => {
    const key = `${normaliser.normalise(scope.projectRoot)}::${configPath ?? ""}`;
    const cached = runnerCache.get(key);
    if (cached !== undefined) return cached.runner;
    const scopeConfigResult = configLoader.load(scope.projectRoot, configPath);
    const {
      budgetConfig: scopeBudgetConfig,
      heuristicConfig: scopeHeuristicConfig,
      guardAllowPatterns: scopeGuardAllowPatterns,
      contextWindow: _scopeContextWindow,
    } = applyConfigResult(scopeConfigResult, scope.configStore, sha256Adapter);
    const scopeFileContentReader = createCachingFileContentReader(scope.projectRoot);
    const scopeRulePackProvider = createRulePackProvider(scope.projectRoot);
    const partial = createPipelineDeps(
      scopeFileContentReader,
      scopeRulePackProvider,
      scopeBudgetConfig,
      additionalProviders,
      scopeHeuristicConfig,
      scopeGuardAllowPatterns,
      importGraphFailureSink,
    );
    const ignoreAdapter = new IgnoreAdapter();
    const inner = new FileSystemRepoMapSupplier(new FastGlobAdapter(), ignoreAdapter);
    const repoMapSupplier = new WatchingRepoMapSupplier(inner, ignoreAdapter);
    const scopeDeps = { ...partial, repoMapSupplier };
    const runner = new CompilationRunnerImpl(
      scopeDeps,
      scope.clock,
      scope.cacheStore,
      scope.configStore,
      sha256Adapter,
      scope.guardStore,
      scope.compilationLogStore,
      scope.idGenerator,
      new SqliteAgenticSessionStore(scope.projectId, scope.db),
    );
    if (runnerCache.size >= 10) {
      const firstKey = runnerCache.keys().next().value;
      if (firstKey !== undefined) {
        const evicted = runnerCache.get(firstKey);
        runnerCache.delete(firstKey);
        evicted?.closeable.close();
      }
    }
    runnerCache.set(key, { runner, closeable: repoMapSupplier });
    return runner;
  };
  const server = new McpServer({ name: "aic", version: packageVersion });
  const editorConfigReader = new EditorModelConfigReaderAdapter(
    process.env["HOME"] ?? os.homedir(),
  );
  const envHints = getEditorModelHints(editorConfigReader);
  const modelDetector = new ModelDetectorDispatch(envHints);
  const sessionContext = new SessionContext(sessionId);
  const getEditorId = (): EditorId =>
    sessionContext.getEditorId(() => {
      const clientName = server.server.getClientVersion()?.name;
      process.stderr.write(`[aic] MCP client name: ${clientName ?? "(none)"}\n`);
      return detectEditorId(clientName, getEditorEnvHints());
    });
  const getSessionId = (): SessionId => sessionContext.getSessionId();
  const getModelId = (editorId: EditorId): string | null =>
    configModelId ?? modelDetector.detect(editorId);
  const lastConversationIdRef: { current: string | null } = { current: null };
  const setLastConversationId = (id: string | null): void => {
    lastConversationIdRef.current = id;
  };
  const getUpdateMessage = (): string | null =>
    updateInfoRef.current.updateMessage ?? null;
  const getConfigUpgraded = (): boolean => configUpgraded;
  const getLastPayload = (): ReturnType<typeof buildLastPayload> =>
    buildLastPayload({
      projectId: startupScope.projectId,
      db: startupScope.db,
      clock: startupScope.clock,
      conversationIdForLast: lastConversationIdRef.current,
    });
  const compileHandler = createCompileHandler(
    (projectRootArg: AbsolutePath) => registry.getOrCreate(projectRootArg),
    getRunner,
    sha256Adapter,
    getSessionId,
    getEditorId,
    getModelId,
    installScopeWarnings,
    configLoader,
    setLastConversationId,
    getUpdateMessage,
    getConfigUpgraded,
    bootstrapIntegrationMode,
  );
  const aicCompileHandler =
    batchExit !== undefined
      ? async (...handlerArgs: Parameters<typeof compileHandler>) => {
          batchExit.pendingToolCalls += 1;
          try {
            return await compileHandler(...handlerArgs);
          } finally {
            batchExit.pendingToolCalls -= 1;
            if (batchExit.stdinEnded && batchExit.pendingToolCalls === 0) process.exit(0);
          }
        }
      : compileHandler;
  // Defaults only applied when undefined — model-omitted fields would otherwise return -32602.
  const compileSchemaWithDefaults = {
    ...CompilationRequestSchema,
    intent: CompilationRequestSchema.intent.default(MCP_INTENT_OMITTED_DEFAULT),
    projectRoot: CompilationRequestSchema.projectRoot.default(projectRoot),
  };
  const compileInputValidated = z.object(compileSchemaWithDefaults);
  const toolAnnotationsReadOnly: ToolAnnotations = { readOnlyHint: true };
  const toolAnnotationsWritesTelemetry: ToolAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
  };
  // @ts-expect-error TS2589 — registerTool generic depth with compile input object schema (MCP SDK + Zod).
  server.registerTool(
    "aic_compile",
    {
      description:
        "Compile intent-specific project context. MUST be called as your FIRST action on EVERY message — including follow-ups in the same chat. Each message has a different intent that needs fresh context. Never skip.",
      inputSchema: compileInputValidated,
      outputSchema: AicCompileToolRegisteredOutputSchema,
      annotations: toolAnnotationsWritesTelemetry,
    },
    aicCompileHandler,
  );
  const compileSpecHandler = createCompileSpecHandler({
    toolInvocationLogStore,
    clock: startupScope.clock,
    idGenerator: startupScope.idGenerator,
    getSessionId,
    specificationCompiler,
    specCompileCacheStore,
    stringHasher: sha256Adapter,
  });
  const compileSpecInputValidated = z.object(CompileSpecRequestSchema);
  server.registerTool(
    "aic_compile_spec",
    {
      description:
        "Compile structured specification input: Zod validates CompileSpecRequestSchema (required spec; budget absent defaults to sum of estimatedTokens). On success runs SpecificationCompiler and returns MCP text JSON with compiledSpec plus meta (totalTokensRaw, totalTokensCompiled, reductionPct, typeTiers, transformTokensSaved). Records tool_invocation_log.",
      inputSchema: compileSpecInputValidated,
      outputSchema: AicCompileSpecToolRegisteredOutputSchema,
      annotations: toolAnnotationsWritesTelemetry,
    },
    compileSpecHandler,
  );
  server.tool(
    "aic_inspect",
    "Inspect a compilation run: returns the full pipeline trace (file selection, token counts, guard results) without writing a compilation record.",
    InspectRequestSchema,
    toolAnnotationsWritesTelemetry,
    (args) =>
      handleInspect(
        args,
        inspectRunner,
        toolInvocationLogStore,
        startupScope.clock,
        startupScope.idGenerator,
        getSessionId,
      ),
  );
  const aicProjectsParams: z.ZodRawShape = {};
  server.tool(
    "aic_projects",
    "List all known AIC projects (project ID, path, last seen, compilation count).",
    aicProjectsParams,
    toolAnnotationsReadOnly,
    () => {
      const list = buildProjectsPayload(startupScope.db);
      return Promise.resolve({
        content: [{ type: "text" as const, text: JSON.stringify(list) }],
      });
    },
  );
  server.tool(
    "aic_status",
    "Project-level AIC status: compilations, token savings, budget utilization, guard findings, top task classes.",
    StatusRequestSchema,
    toolAnnotationsReadOnly,
    (args) =>
      Promise.resolve({
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              buildStatusPayload({
                projectId: startupScope.projectId,
                db: startupScope.db,
                clock: startupScope.clock,
                configLoader,
                projectRoot: startupScope.projectRoot,
                budgetConfig,
                updateInfo: updateInfoRef.current,
                installScope,
                installScopeWarnings,
                timeRangeDays:
                  args.timeRangeDays === undefined
                    ? null
                    : toStatusTimeRangeDays(args.timeRangeDays),
              }),
            ),
          },
        ],
      }),
  );
  server.tool(
    "aic_quality_report",
    "Windowed quality aggregates: medians, cache hit rate, tier mix, per task class, classifier confidence summary, and daily series for trends (read-only).",
    QualityReportRequestSchema,
    toolAnnotationsReadOnly,
    (args) => {
      try {
        const parsed = z.object(QualityReportRequestSchema).parse(args);
        const windowDaysResolved = toQualityReportWindowDays(parsed.windowDays);
        const payload = buildQualityReportPayload({
          projectId: startupScope.projectId,
          db: startupScope.db,
          clock: startupScope.clock,
          windowDays: windowDaysResolved,
        });
        return Promise.resolve({
          content: [{ type: "text" as const, text: JSON.stringify(payload) }],
        });
      } catch (err) {
        const label = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[aic] quality_report unexpected error: ${label}\n`);
        throw new McpError(ErrorCode.InternalError, "Internal error");
      }
    },
  );
  const aicLastParams: z.ZodRawShape = {};
  server.tool(
    "aic_last",
    "Most recent AIC compilation: intent, files selected, tokens compiled, budget utilization, exclusion rate, guard status.",
    aicLastParams,
    toolAnnotationsReadOnly,
    () =>
      Promise.resolve({
        content: [{ type: "text" as const, text: JSON.stringify(getLastPayload()) }],
      }),
  );
  const modelTestHandler = createModelTestHandler(startupScope.db, startupScope.clock);
  server.tool(
    "aic_model_test",
    "Agent capability probe: call this tool to receive challenges, solve them, then call it again with your answers to verify your agent can use AIC.",
    ModelTestRequestSchema,
    toolAnnotationsWritesTelemetry,
    modelTestHandler,
  );
  server.tool(
    "aic_chat_summary",
    "Get per-conversation AIC compilation summary.",
    ConversationSummaryRequestSchema,
    toolAnnotationsWritesTelemetry,
    (args) => {
      try {
        const parsed = z.object(ConversationSummaryRequestSchema).parse(args);
        recordToolInvocation(
          toolInvocationLogStore,
          startupScope.clock,
          startupScope.idGenerator,
          getSessionId,
          "aic_chat_summary",
          parsed,
        );
        const payload = buildChatSummaryToolPayload({
          startupProjectId: startupScope.projectId,
          db: startupScope.db,
          clock: startupScope.clock,
          conversationIdArg: parsed.conversationId,
        });
        return Promise.resolve({
          content: [{ type: "text" as const, text: JSON.stringify(payload) }],
        });
      } catch (err) {
        const label = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[aic] chat_summary unexpected error: ${label}\n`);
        throw new McpError(ErrorCode.InternalError, "Internal error");
      }
    },
  );
  const out = server as McpServer & {
    close(): Promise<void>;
    getEditorId(): EditorId;
  };
  out.close = (): Promise<void> => {
    clearImmediate(purgeImmediateId);
    try {
      for (const entry of runnerCache.values()) {
        entry.closeable.close();
      }
    } catch {
      // prevent one failing closeable from blocking registry/DB cleanup
    }
    runnerCache.clear();
    registry.close();
    closeDatabase(db);
    return Promise.resolve();
  };
  out.getEditorId = getEditorId;
  return out;
}

function resolveBootstrapMode(): BootstrapIntegrationMode {
  try {
    return parseBootstrapIntegrationMode(process.argv);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${msg}\n`);
    process.exit(1);
  }
}

export const LIST_ROOTS_BOOTSTRAP_SIGNAL = {
  LIST_ROOTS_FAILED: "list_roots_failed",
  ROOT_PROCESSING_SKIPPED: "root_processing_skipped",
} as const;

export type ListRootsBootstrapSignal =
  (typeof LIST_ROOTS_BOOTSTRAP_SIGNAL)[keyof typeof LIST_ROOTS_BOOTSTRAP_SIGNAL];

function writeListRootsBootstrapObservability(signal: ListRootsBootstrapSignal): void {
  process.stderr.write(`[aic] bootstrap ${signal}\n`);
}

export function notifyListRootsBootstrapFetchFailed(): void {
  writeListRootsBootstrapObservability(LIST_ROOTS_BOOTSTRAP_SIGNAL.LIST_ROOTS_FAILED);
}

export function processListedWorkspaceRootsForBootstrap(
  roots: readonly { readonly uri: string }[],
  homeDirectoryPath: FilePath,
  getEditorId: () => EditorId,
  bootstrapMode: BootstrapIntegrationMode,
): void {
  for (const root of roots) {
    try {
      const rootPath = fileURLToPath(root.uri);
      if (toFilePath(rootPath) === homeDirectoryPath) continue;
      const absRoot = toAbsolutePath(rootPath);
      installTriggerRule(absRoot, getEditorId());
      runEditorBootstrapIfNeeded(absRoot, bootstrapMode);
    } catch {
      writeListRootsBootstrapObservability(
        LIST_ROOTS_BOOTSTRAP_SIGNAL.ROOT_PROCESSING_SKIPPED,
      );
    }
  }
}

export async function main(): Promise<void> {
  const bootstrapMode = resolveBootstrapMode();
  const projectRoot = toAbsolutePath(process.cwd());
  const globalAicDir = path.join(os.homedir(), ".aic");
  const globalDbPath = path.join(globalAicDir, "aic.sqlite");
  fs.mkdirSync(globalAicDir, { recursive: true, mode: 0o700 });
  const cwdAicDb = path.join(process.cwd(), ".aic", "aic.sqlite");
  if (!fs.existsSync(globalDbPath) && fs.existsSync(cwdAicDb)) {
    fs.copyFileSync(cwdAicDb, globalDbPath);
  }
  const clock = new SystemClock();
  const db = openDatabase(globalDbPath, clock);
  const batchExitRef: BatchExitRef = {
    stdinEnded: false,
    pendingToolCalls: 0,
  };
  const server = createMcpServer(
    projectRoot,
    db,
    clock,
    undefined,
    batchExitRef,
    bootstrapMode,
  );
  const homedir = os.homedir();
  const homeDirectoryPath = toFilePath(homedir);
  server.server.oninitialized = (): void => {
    const caps = server.server.getClientCapabilities();
    if (caps?.roots !== undefined) {
      server.server
        .listRoots()
        .then((result) => {
          processListedWorkspaceRootsForBootstrap(
            result.roots,
            homeDirectoryPath,
            () => server.getEditorId(),
            bootstrapMode,
          );
        })
        .catch((): void => {
          notifyListRootsBootstrapFetchFailed();
        });
    }
  };
  const transport = new StdioServerTransport();
  transport.onclose = (): void => {
    process.exit(0);
  };
  transport.onerror = (_err: Error): void => {
    process.exit(1);
  };
  // Defer exit until pending compile finishes — batched stdin (e.g. subagentStart) must write to DB first.
  process.stdin.on("end", () => {
    batchExitRef.stdinEnded = true;
    if (batchExitRef.pendingToolCalls === 0) process.exit(0);
  });
  await server.connect(transport);
}

const isEntry =
  process.argv[1] !== undefined &&
  fs.realpathSync(path.resolve(process.argv[1])) ===
    path.resolve(fileURLToPath(import.meta.url));

const CLI_DIAGNOSTIC_HANDLERS: Record<string, () => void> = {
  status: () => runCliDiagnosticsAndExit(process.argv.slice(2)),
  last: () => runCliDiagnosticsAndExit(process.argv.slice(2)),
  "chat-summary": () => runCliDiagnosticsAndExit(process.argv.slice(2)),
  quality: () => runCliDiagnosticsAndExit(process.argv.slice(2)),
  projects: () => runCliDiagnosticsAndExit(process.argv.slice(2)),
};

if (isEntry) {
  const cmd = process.argv[2];
  if (cmd === "init") {
    try {
      runInit(toAbsolutePath(process.cwd()));
      process.exit(0);
    } catch (err) {
      process.stderr.write(err instanceof Error ? err.message : String(err));
      const code = err instanceof ConfigError ? 1 : 2;
      process.exit(code);
    }
  } else {
    const diagnosticHandler =
      cmd !== undefined &&
      Object.prototype.hasOwnProperty.call(CLI_DIAGNOSTIC_HANDLERS, cmd)
        ? CLI_DIAGNOSTIC_HANDLERS[cmd]
        : undefined;
    if (diagnosticHandler !== undefined) {
      diagnosticHandler();
    } else {
      main().catch((err) => {
        process.stderr.write(String(err));
        process.exit(1);
      });
    }
  }
}
