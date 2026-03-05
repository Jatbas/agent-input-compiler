import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { AbsolutePath } from "@aic/shared/core/types/paths.js";
import type { RulePack } from "@aic/shared/core/types/rule-pack.js";
import type { RulePackProvider } from "@aic/shared/core/interfaces/rule-pack-provider.interface.js";
import type { BudgetConfig } from "@aic/shared/core/interfaces/budget-config.interface.js";
import type { LanguageProvider } from "@aic/shared/core/interfaces/language-provider.interface.js";
import { toAbsolutePath } from "@aic/shared/core/types/paths.js";
import { toTokenCount } from "@aic/shared/core/types/units.js";
import {
  type TaskClass,
  type EditorId,
  EDITOR_ID,
} from "@aic/shared/core/types/enums.js";
import { InspectRunner } from "@aic/shared/pipeline/inspect-runner.js";
import { CompilationRequestSchema } from "./schemas/compilation-request.js";
import { ConversationSummaryRequestSchema } from "./schemas/conversation-summary-request.js";
import { InspectRequestSchema } from "./schemas/inspect-request.schema.js";
import { createCompileHandler } from "./handlers/compile-handler.js";
import { SessionContext } from "./handlers/session-context-cache.js";
import { handleInspect } from "./handlers/inspect-handler.js";
import { closeDatabase } from "@aic/shared/storage/open-database.js";
import { ConfigError } from "@aic/shared/core/errors/config-error.js";
import { createProjectScope } from "@aic/shared/storage/create-project-scope.js";
import { SqliteStatusStore } from "@aic/shared/storage/sqlite-status-store.js";
import type { CacheStore } from "@aic/shared/core/interfaces/cache-store.interface.js";
import type { SessionTracker } from "@aic/shared/core/interfaces/session-tracker.interface.js";
import type { Clock } from "@aic/shared/core/interfaces/clock.interface.js";
import type { SessionId } from "@aic/shared/core/types/identifiers.js";
import { toConversationId, toSessionId } from "@aic/shared/core/types/identifiers.js";
import { z } from "zod";
import { STOP_REASON } from "@aic/shared/core/types/enums.js";
import { createFullPipelineDeps } from "@aic/shared/bootstrap/create-pipeline-deps.js";
import { installCursorHooks } from "./install-cursor-hooks.js";
import { installTriggerRule } from "./install-trigger-rule.js";
import { runInit } from "./init-project.js";
import { runStartupSelfCheck } from "./startup-self-check.js";
import {
  LoadConfigFromFile,
  applyConfigResult,
} from "@aic/shared/config/load-config-from-file.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CompilationRunner as CompilationRunnerImpl } from "@aic/shared/pipeline/compilation-runner.js";
import { SqliteAgenticSessionStore } from "@aic/shared/storage/sqlite-agentic-session-store.js";
import { Sha256Adapter } from "@aic/shared/adapters/sha256-adapter.js";
import { loadRulePackFromPath } from "@aic/shared/core/load-rule-pack.js";
import { createProjectFileReader } from "@aic/shared/adapters/project-file-reader-adapter.js";
import { createCachingFileContentReader } from "@aic/shared/adapters/caching-file-content-reader.js";
import { detectEditorId } from "./detect-editor-id.js";
import { initLanguageProviders } from "@aic/shared/adapters/init-language-providers.js";
import { EditorModelConfigReaderAdapter } from "@aic/shared/adapters/editor-model-config-reader.js";
import { ModelDetectorDispatch } from "@aic/shared/adapters/model-detector-dispatch.js";
import type { ModelEnvHints } from "@aic/shared/core/types/model-env-hints.js";

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

export function createMcpServer(
  projectRoot: AbsolutePath,
  additionalProviders?: readonly LanguageProvider[],
): McpServer {
  const scope = createProjectScope(projectRoot);
  const purgeImmediateId = setImmediate(() => scope.cacheStore.purgeExpired());
  installTriggerRule(projectRoot);
  installCursorHooks(projectRoot);
  const { installationOk, installationNotes } = runStartupSelfCheck(projectRoot);
  const sessionId = toSessionId(scope.idGenerator.generate());
  const startedAt = scope.clock.now();
  scope.sessionTracker.startSession(
    sessionId,
    startedAt,
    process.pid,
    "0.2.0",
    installationOk,
    installationNotes,
  );
  scope.sessionTracker.backfillCrashedSessions(startedAt);
  registerShutdownHandler(scope.sessionTracker, sessionId, scope.clock, scope.cacheStore);
  const sha256Adapter = new Sha256Adapter();
  const configLoader = new LoadConfigFromFile();
  const configResult = configLoader.load(projectRoot, null);
  const {
    budgetConfig,
    heuristicConfig,
    modelId: configModelId,
  } = applyConfigResult(configResult, scope.configStore, sha256Adapter);
  const fileContentReader = createCachingFileContentReader(projectRoot);
  const rulePackProvider = createRulePackProvider(projectRoot);
  const deps = createFullPipelineDeps(
    fileContentReader,
    rulePackProvider,
    budgetConfig,
    additionalProviders,
    heuristicConfig,
  );
  const inspectRunner = new InspectRunner(deps, scope.clock);
  const compilationRunner = new CompilationRunnerImpl(
    deps,
    scope.clock,
    scope.cacheStore,
    scope.configStore,
    sha256Adapter,
    scope.guardStore,
    scope.compilationLogStore,
    scope.idGenerator,
    new SqliteAgenticSessionStore(scope.db),
  );
  const server = new McpServer({ name: "aic", version: "0.1.0" });
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
      compilationRunner,
      {
        telemetryStore: scope.telemetryStore,
        clock: scope.clock,
        idGenerator: scope.idGenerator,
        stringHasher: sha256Adapter,
      },
      getSessionId,
      getEditorId,
      getModelId,
      configModelId,
    ),
  );
  server.tool("aic_inspect", InspectRequestSchema, (args) =>
    handleInspect(args, inspectRunner),
  );
  server.tool(
    "aic_chat_summary",
    "Get per-conversation AIC compilation summary.",
    ConversationSummaryRequestSchema,
    (args) => {
      const parsed = z.object(ConversationSummaryRequestSchema).parse(args);
      const conversationId = toConversationId(parsed.conversationId);
      const statusStore = new SqliteStatusStore(scope.db, scope.clock);
      const summary = statusStore.getConversationSummary(conversationId);
      const payload = summary ?? {
        conversationId: parsed.conversationId,
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
    },
  );
  server.resource("last", "aic://last", () => {
    const statusStore = new SqliteStatusStore(scope.db, scope.clock);
    const summary = statusStore.getSummary();
    const lastPromptPath = path.join(
      scope.projectRoot,
      ".aic",
      "last-compiled-prompt.txt",
    );
    let compiledPrompt: string | null = null;
    if (fs.existsSync(lastPromptPath)) {
      try {
        compiledPrompt = fs.readFileSync(lastPromptPath, "utf8");
      } catch {
        compiledPrompt = null;
      }
    }
    return {
      contents: [
        {
          uri: "aic://last",
          mimeType: "application/json",
          text: JSON.stringify({
            compilationCount: summary.compilationsTotal,
            lastCompilation: summary.lastCompilation,
            compiledPrompt,
          }),
        },
      ],
    };
  });
  server.resource("status", "aic://status", () => {
    const statusStore = new SqliteStatusStore(scope.db, scope.clock);
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
          }),
        },
      ],
    };
  });
  const out = server as McpServer & { close(): Promise<void> };
  out.close = (): Promise<void> => {
    clearImmediate(purgeImmediateId);
    closeDatabase(scope.db);
    return Promise.resolve();
  };
  return out;
}

export async function main(): Promise<void> {
  const projectRoot = toAbsolutePath(process.cwd());
  const providers = await initLanguageProviders(projectRoot);
  const server = createMcpServer(projectRoot, providers);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isEntry =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

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
