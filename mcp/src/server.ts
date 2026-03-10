// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { RulePack } from "@jatbas/aic-core/core/types/rule-pack.js";
import type { RulePackProvider } from "@jatbas/aic-core/core/interfaces/rule-pack-provider.interface.js";
import type { BudgetConfig } from "@jatbas/aic-core/core/interfaces/budget-config.interface.js";
import type { LanguageProvider } from "@jatbas/aic-core/core/interfaces/language-provider.interface.js";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import {
  type TaskClass,
  type EditorId,
  EDITOR_ID,
} from "@jatbas/aic-core/core/types/enums.js";
import { InspectRunner } from "@jatbas/aic-core/pipeline/inspect-runner.js";
import { CompilationRequestSchema } from "./schemas/compilation-request.js";
import { ConversationSummaryRequestSchema } from "./schemas/conversation-summary-request.js";
import { InspectRequestSchema } from "./schemas/inspect-request.schema.js";
import { createCompileHandler } from "./handlers/compile-handler.js";
import { SessionContext } from "./handlers/session-context-cache.js";
import { handleInspect } from "./handlers/inspect-handler.js";
import { recordToolInvocation } from "./record-tool-invocation.js";
import { ConfigError } from "@jatbas/aic-core/core/errors/config-error.js";
import { prunePromptLog } from "@jatbas/aic-core/maintenance/prune-prompt-log.js";
import { pruneSessionLog } from "@jatbas/aic-core/maintenance/prune-session-log.js";
import { NodePathAdapter } from "@jatbas/aic-core/adapters/node-path-adapter.js";
import { ScopeRegistry } from "@jatbas/aic-core/storage/scope-registry.js";
import { SqliteStatusStore } from "@jatbas/aic-core/storage/sqlite-status-store.js";
import type { CacheStore } from "@jatbas/aic-core/core/interfaces/cache-store.interface.js";
import type { CompilationRunner } from "@jatbas/aic-core/core/interfaces/compilation-runner.interface.js";
import type { SessionTracker } from "@jatbas/aic-core/core/interfaces/session-tracker.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { ProjectScope } from "@jatbas/aic-core/storage/create-project-scope.js";
import type { SessionId } from "@jatbas/aic-core/core/types/identifiers.js";
import {
  toConversationId,
  toSessionId,
} from "@jatbas/aic-core/core/types/identifiers.js";
import { z } from "zod";
import { STOP_REASON } from "@jatbas/aic-core/core/types/enums.js";
import { createFullPipelineDeps } from "@jatbas/aic-core/bootstrap/create-pipeline-deps.js";
import { runInit } from "./init-project.js";
import { runStartupSelfCheck } from "./startup-self-check.js";
import {
  LoadConfigFromFile,
  applyConfigResult,
} from "@jatbas/aic-core/config/load-config-from-file.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CompilationRunner as CompilationRunnerImpl } from "@jatbas/aic-core/pipeline/compilation-runner.js";
import { SqliteAgenticSessionStore } from "@jatbas/aic-core/storage/sqlite-agentic-session-store.js";
import { SqliteToolInvocationLogStore } from "@jatbas/aic-core/storage/sqlite-tool-invocation-log-store.js";
import { Sha256Adapter } from "@jatbas/aic-core/adapters/sha256-adapter.js";
import { loadRulePackFromPath } from "@jatbas/aic-core/core/load-rule-pack.js";
import { createProjectFileReader } from "@jatbas/aic-core/adapters/project-file-reader-adapter.js";
import { createCachingFileContentReader } from "@jatbas/aic-core/adapters/caching-file-content-reader.js";
import { detectEditorId } from "./detect-editor-id.js";
import { detectInstallScope, INSTALL_SCOPE } from "./detect-install-scope.js";
import { getUpdateInfo } from "./latest-version-check.js";
import { EditorModelConfigReaderAdapter } from "@jatbas/aic-core/adapters/editor-model-config-reader.js";
import { ModelDetectorDispatch } from "@jatbas/aic-core/adapters/model-detector-dispatch.js";
import type { ModelEnvHints } from "@jatbas/aic-core/core/types/model-env-hints.js";

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

export function registerShutdownHandler(
  sessionTracker: SessionTracker,
  sessionId: SessionId,
  clock: Clock,
  cacheStore: CacheStore,
): () => void {
  let exited = false;
  const handler = (): void => {
    if (exited) return;
    exited = true;
    try {
      cacheStore.purgeExpired();
      sessionTracker.stopSession(sessionId, clock.now(), STOP_REASON.GRACEFUL);
    } catch {
      // Storage may already be closed (e.g. test teardown); exit anyway.
    }
    process.exit(0);
  };
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
  return handler;
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

function readPackageVersion(): { packageName: string; packageVersion: string } {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(dir, "..", "package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { name?: string; version?: string };
    const packageName = typeof pkg.name === "string" ? pkg.name : "@aic/mcp";
    const packageVersion = typeof pkg.version === "string" ? pkg.version : "0.0.0";
    return { packageName, packageVersion };
  } catch {
    return { packageName: "@aic/mcp", packageVersion: "0.0.0" };
  }
}

export function createMcpServer(
  projectRoot: AbsolutePath,
  additionalProviders?: readonly LanguageProvider[],
): McpServer {
  const normaliser = new NodePathAdapter();
  const registry = new ScopeRegistry(normaliser);
  const startupScope = registry.getOrCreate(projectRoot);
  const { packageName, packageVersion } = readPackageVersion();
  const purgeImmediateId = setImmediate(() => {
    startupScope.cacheStore.purgeExpired();
    pruneSessionLog(startupScope.projectRoot, startupScope.clock);
    prunePromptLog(startupScope.projectRoot, startupScope.clock);
  });
  const { installationOk, installationNotes } = runStartupSelfCheck(projectRoot);
  const installScope = detectInstallScope(os.homedir(), projectRoot);
  const installScopeWarnings: readonly string[] =
    installScope === INSTALL_SCOPE.BOTH
      ? [
          "AIC is registered in both the global MCP config and the workspace MCP config. Your editor will run two AIC instances, causing duplicate tools and potential database conflicts. Remove the duplicate 'aic' entry from the workspace config (.cursor/mcp.json in this project directory) to fix this.",
        ]
      : [];
  if (installScope === INSTALL_SCOPE.BOTH) {
    for (const message of installScopeWarnings) {
      process.stderr.write(`[aic] ${message}\n`);
    }
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
  registerShutdownHandler(
    startupScope.sessionTracker,
    sessionId,
    startupScope.clock,
    startupScope.cacheStore,
  );
  const updateInfoRef: {
    current: { updateAvailable: string | null; currentVersion: string };
  } = { current: { updateAvailable: null, currentVersion: packageVersion } };
  setImmediate(() => {
    getUpdateInfo(projectRoot, packageName, packageVersion, startupScope.clock)
      .then((info) => {
        updateInfoRef.current = info;
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
  } = applyConfigResult(configResult, startupScope.configStore, sha256Adapter);
  const fileContentReader = createCachingFileContentReader(projectRoot);
  const rulePackProvider = createRulePackProvider(projectRoot);
  const deps = createFullPipelineDeps(
    fileContentReader,
    rulePackProvider,
    budgetConfig,
    additionalProviders,
    heuristicConfig,
  );
  const toolInvocationLogStore = new SqliteToolInvocationLogStore(
    startupScope.projectRoot,
    startupScope.db,
  );
  const inspectRunner = new InspectRunner(deps, startupScope.clock);
  const runnerCache = new Map<string, CompilationRunner>();
  const getRunner = (scope: ProjectScope): CompilationRunner => {
    const key = normaliser.normalise(scope.projectRoot);
    const cached = runnerCache.get(key);
    if (cached !== undefined) return cached;
    const scopeConfigResult = configLoader.load(scope.projectRoot, null);
    const { budgetConfig: scopeBudgetConfig, heuristicConfig: scopeHeuristicConfig } =
      applyConfigResult(scopeConfigResult, scope.configStore, sha256Adapter);
    const scopeFileContentReader = createCachingFileContentReader(scope.projectRoot);
    const scopeRulePackProvider = createRulePackProvider(scope.projectRoot);
    const scopeDeps = createFullPipelineDeps(
      scopeFileContentReader,
      scopeRulePackProvider,
      scopeBudgetConfig,
      additionalProviders,
      scopeHeuristicConfig,
    );
    const runner = new CompilationRunnerImpl(
      scopeDeps,
      scope.clock,
      scope.cacheStore,
      scope.configStore,
      sha256Adapter,
      scope.guardStore,
      scope.compilationLogStore,
      scope.idGenerator,
      new SqliteAgenticSessionStore(scope.projectRoot, scope.db),
    );
    runnerCache.set(key, runner);
    return runner;
  };
  const server = new McpServer({ name: "aic", version: packageVersion });
  const editorConfigReader = new EditorModelConfigReaderAdapter(
    process.env["HOME"] ?? os.homedir(),
  );
  const anthropicModel =
    process.env["ANTHROPIC_MODEL"] ?? editorConfigReader.read(EDITOR_ID.CLAUDE_CODE);
  const cursorModel =
    process.env["CURSOR_MODEL"] ?? editorConfigReader.read(EDITOR_ID.CURSOR);
  const envHints: ModelEnvHints = {
    ...(typeof anthropicModel === "string" && anthropicModel !== ""
      ? { anthropicModel }
      : {}),
    ...(typeof cursorModel === "string" && cursorModel !== "" ? { cursorModel } : {}),
  };
  const modelDetector = new ModelDetectorDispatch(envHints);
  const sessionContext = new SessionContext(sessionId);
  const getEditorId = (): EditorId =>
    sessionContext.getEditorId(() => {
      const clientName = server.server.getClientVersion()?.name;
      process.stderr.write(`[aic] MCP client name: ${clientName ?? "(none)"}\n`);
      return detectEditorId(clientName, {
        cursorAgent: process.env["CURSOR_AGENT"] === "1",
      });
    });
  const getSessionId = (): SessionId => sessionContext.getSessionId();
  const getModelId = (editorId: EditorId): string | null =>
    modelDetector.detect(editorId);
  server.tool(
    "aic_compile",
    "Compile intent-specific project context. MUST be called as your FIRST action on EVERY message — including follow-ups in the same chat. Each message has a different intent that needs fresh context. Never skip.",
    CompilationRequestSchema,
    createCompileHandler(
      (projectRootArg: AbsolutePath) => registry.getOrCreate(projectRootArg),
      getRunner,
      sha256Adapter,
      getSessionId,
      getEditorId,
      getModelId,
      configModelId,
      installScopeWarnings,
    ),
  );
  server.tool("aic_inspect", InspectRequestSchema, (args) =>
    handleInspect(
      args,
      inspectRunner,
      toolInvocationLogStore,
      startupScope.clock,
      startupScope.idGenerator,
      getSessionId,
    ),
  );
  server.tool(
    "aic_chat_summary",
    "Get per-conversation AIC compilation summary.",
    ConversationSummaryRequestSchema,
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
        const idRaw: string | null =
          parsed.conversationId !== undefined &&
          typeof parsed.conversationId === "string" &&
          parsed.conversationId.trim().length > 0
            ? parsed.conversationId.trim()
            : null;
        const idForPayload = idRaw ?? "";
        const conversationId = idRaw !== null ? toConversationId(idRaw) : null;
        const statusStore = new SqliteStatusStore(
          startupScope.projectRoot,
          startupScope.db,
          startupScope.clock,
        );
        const summary =
          conversationId !== null
            ? statusStore.getConversationSummary(conversationId)
            : null;
        const payload = summary ?? {
          conversationId: idForPayload,
          compilationsInConversation: 0,
          cacheHitRatePct: null,
          avgReductionPct: null,
          totalTokensRaw: 0,
          totalTokensCompiled: 0,
          totalTokensSaved: null,
          lastCompilationInConversation: null,
          topTaskClasses: [],
        };
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
  server.resource("last", "aic://last", () => {
    const statusStore = new SqliteStatusStore(
      startupScope.projectRoot,
      startupScope.db,
      startupScope.clock,
    );
    const summary = statusStore.getSummary();
    const last = summary.lastCompilation;
    const lastPayload =
      last === null
        ? null
        : {
            ...last,
            tokenReductionPct: Number(last.tokenReductionPct),
          };
    return {
      contents: [
        {
          uri: "aic://last",
          mimeType: "application/json",
          text: JSON.stringify({
            compilationCount: summary.compilationsTotal,
            lastCompilation: lastPayload,
            promptSummary: {
              tokenCount: last?.tokensCompiled ?? null,
              guardPassed: null,
            },
          }),
        },
      ],
    };
  });
  server.resource("status", "aic://status", () => {
    const statusStore = new SqliteStatusStore(
      startupScope.projectRoot,
      startupScope.db,
      startupScope.clock,
    );
    const summary = statusStore.getSummary();
    const budgetMaxTokens = budgetConfig.getMaxTokens();
    const budgetUtilizationPct =
      summary.lastCompilation !== null
        ? (summary.lastCompilation.tokensCompiled / budgetMaxTokens) * 100
        : null;
    return {
      contents: [
        {
          uri: "aic://status",
          mimeType: "application/json",
          text: JSON.stringify({
            ...summary,
            budgetMaxTokens,
            budgetUtilizationPct,
            updateAvailable: updateInfoRef.current.updateAvailable,
            installScope,
            installScopeWarnings,
          }),
        },
      ],
    };
  });
  const out = server as McpServer & { close(): Promise<void> };
  out.close = (): Promise<void> => {
    clearImmediate(purgeImmediateId);
    registry.close();
    return Promise.resolve();
  };
  return out;
}

export async function main(): Promise<void> {
  const projectRoot = toAbsolutePath(process.cwd());
  const server = createMcpServer(projectRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isEntry =
  process.argv[1] !== undefined &&
  fs.realpathSync(path.resolve(process.argv[1])) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isEntry && process.argv[2] === "init") {
  try {
    runInit(toAbsolutePath(process.cwd()));
    process.exit(0);
  } catch (err) {
    process.stderr.write(err instanceof Error ? err.message : String(err));
    const code = err instanceof ConfigError ? 1 : 2;
    process.exit(code);
  }
} else if (isEntry) {
  main().catch((err) => {
    process.stderr.write(String(err));
    process.exit(1);
  });
}
