// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as fs from "node:fs";
import * as path from "node:path";
import {
  McpError,
  ErrorCode,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { CompilationRunner } from "@jatbas/aic-core/core/interfaces/compilation-runner.interface.js";
import type { ConfigLoader } from "@jatbas/aic-core/core/interfaces/config-loader.interface.js";
import type { StringHasher } from "@jatbas/aic-core/core/interfaces/string-hasher.interface.js";
import type { ProjectScope } from "@jatbas/aic-core/storage/create-project-scope.js";
import { SqliteToolInvocationLogStore } from "@jatbas/aic-core/storage/sqlite-tool-invocation-log-store.js";
import { reconcileProjectId } from "@jatbas/aic-core/storage/ensure-project-id.js";
import { reparentSubagentCompilations } from "@jatbas/aic-core/storage/reparent-subagent-compilations.js";
import { getLastNonGeneralIntentForConversation } from "@jatbas/aic-core/storage/get-last-intent-for-conversation.js";
import { AicError } from "@jatbas/aic-core/core/errors/aic-error.js";
import { TimeoutError } from "@jatbas/aic-core/core/errors/timeout-error.js";
import { sanitizeError } from "@jatbas/aic-core/core/errors/sanitize-error.js";
import {
  type EditorId,
  EDITOR_ID,
  type TriggerSource,
  TRIGGER_SOURCE,
} from "@jatbas/aic-core/core/types/enums.js";
import {
  type SessionId,
  toConversationId,
} from "@jatbas/aic-core/core/types/identifiers.js";
import {
  type AbsolutePath,
  type FilePath,
  toRelativePath,
} from "@jatbas/aic-core/core/types/paths.js";
import { toStepIndex, toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import type { GuardResult } from "@jatbas/aic-core/core/types/guard-types.js";
import type {
  CompilationRequest,
  ToolOutput,
} from "@jatbas/aic-core/core/types/compilation-types.js";
import { writeCompilationTelemetry } from "@jatbas/aic-core/core/write-compilation-telemetry.js";
import { recordToolInvocation } from "../record-tool-invocation.js";
import { ensureProjectInit } from "../init-project.js";
import { installTriggerRule } from "../install-trigger-rule.js";
import {
  BOOTSTRAP_INTEGRATION,
  type BootstrapIntegrationMode,
  runEditorBootstrapIfNeeded,
} from "../editor-integration-dispatch.js";
import { validateProjectRoot, validateConfigPath } from "../validate-project-root.js";
import { readSessionModelIdFromSessionModelsJsonl } from "@jatbas/aic-core/maintenance/read-session-model-jsonl.js";
import {
  MCP_INTENT_OMITTED_DEFAULT,
  SanitisedCacheIdsSchema,
} from "../schemas/compilation-request.js";

const MAX_SANITIZED_FINDINGS = 20;

function normalizeModelId(raw: string): string {
  return raw.toLowerCase() === "default" ? "auto" : raw;
}

function readSessionModelCache(
  projectRoot: AbsolutePath,
  conversationId: string | null,
  editorId: string,
): string | null {
  try {
    return readSessionModelIdFromSessionModelsJsonl(
      projectRoot,
      conversationId,
      editorId,
    );
  } catch {
    return null;
  }
}

function resolveAndCacheModelId(
  argsModelId: string | null,
  getModelId: (editorId: EditorId) => string | null,
  editorId: EditorId,
  projectRoot: AbsolutePath,
  conversationId: string | null,
  _timestamp: string,
): string | null {
  const raw: string | null =
    argsModelId ??
    readSessionModelCache(projectRoot, conversationId, editorId) ??
    getModelId(editorId);
  return raw !== null ? normalizeModelId(raw) : null;
}

function rejectAfter(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new TimeoutError("Compilation timed out after 30s")), ms),
  );
}

const WEAK_SUBAGENT_INTENT_PREFIXES = ["provide context for"] as const;

const WEAK_INTENT_PREDICATES: ReadonlyArray<(t: string) => boolean> = [
  (t) => t.length === 0,
  (t) => WEAK_SUBAGENT_INTENT_PREFIXES.some((p) => t.startsWith(p)),
  (t) => t === MCP_INTENT_OMITTED_DEFAULT,
];

function isWeakIntent(intent: string): boolean {
  const trimmed = intent.trim();
  return WEAK_INTENT_PREDICATES.some((fn) => fn(trimmed));
}

function resolveIntentWithFallback(
  intent: string,
  conversationId: string | null,
  db: ProjectScope["db"],
  projectId: ProjectScope["projectId"],
): string {
  if (!isWeakIntent(intent) || conversationId === null) return intent;
  const fallback = getLastNonGeneralIntentForConversation(
    db,
    projectId,
    toConversationId(conversationId),
  );
  return fallback ?? intent;
}

function sanitizeGuardForModel(guard: GuardResult): {
  passed: boolean;
  findings: readonly {
    severity: string;
    type: string;
    line?: number;
    message: string;
    pattern?: string;
  }[];
  filesBlocked: readonly string[];
  filesRedacted: readonly string[];
  filesWarned: readonly string[];
} {
  const stripped = guard.findings.map(({ file: _f, ...rest }) => rest);
  const deduped = Object.values(
    stripped.reduce<
      Record<
        string,
        {
          severity: string;
          type: string;
          line?: number;
          message: string;
          pattern?: string;
        }
      >
    >((acc, finding) => {
      const key = `${finding.type}|${finding.pattern ?? ""}`;
      if (acc[key] !== undefined) return acc;
      return { ...acc, [key]: finding };
    }, {}),
  );
  return {
    passed: guard.passed,
    findings: deduped.slice(0, MAX_SANITIZED_FINDINGS),
    filesBlocked: [],
    filesRedacted: [],
    filesWarned: [],
  };
}

const EXCLUSION_INSTRUCTION =
  "Do not attempt to read excluded or redacted files (e.g. .env, secrets) directly via editor tools. Use only the context provided below.\n\n";

function buildSuccessResponse(
  result: Awaited<ReturnType<CompilationRunner["run"]>>,
  request: CompilationRequest,
  installScopeWarnings: readonly string[],
  getUpdateMessage: () => string | null,
  getConfigUpgraded: () => boolean,
): CallToolResult {
  const warningBlock =
    installScopeWarnings.length > 0
      ? installScopeWarnings.map((w) => `⚠️ WARNING: ${w}`).join("\n") + "\n\n"
      : "";
  const reinforcement =
    "\n\nIMPORTANT: On your NEXT message in this conversation, call aic_compile again BEFORE doing anything else. Every message needs fresh context — do not reuse this result.";
  const metaForModel = {
    ...result.meta,
    guard: result.meta.guard !== null ? sanitizeGuardForModel(result.meta.guard) : null,
  };
  const hadExclusions =
    result.meta.guard !== null &&
    (result.meta.guard.filesBlocked.length > 0 ||
      result.meta.guard.filesRedacted.length > 0);
  const compiledPrompt =
    warningBlock +
    (hadExclusions ? EXCLUSION_INSTRUCTION : "") +
    result.compiledPrompt +
    reinforcement;
  const payload = {
    compiledPrompt,
    meta: metaForModel,
    conversationId: request.conversationId ?? null,
    updateMessage: getUpdateMessage() ?? null,
    ...(getConfigUpgraded()
      ? {
          configUpgraded:
            "AIC updated your MCP config to @latest. Reload Cursor (Cmd+Shift+P → Reload Window) to start using the new version.",
        }
      : {}),
    ...(installScopeWarnings.length > 0 ? { warnings: installScopeWarnings } : {}),
  };
  const text = JSON.stringify(payload);
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: payload,
  };
}

function resolveConversationId(argsValue: string | null | undefined): string | null {
  if (argsValue !== null && argsValue !== undefined && argsValue !== "") {
    return argsValue;
  }
  return null;
}

type McpCompileToolOutputArg = {
  readonly type: "test-result" | "lint-error" | "build-output" | "command-output";
  readonly content: string;
  readonly relatedFiles?: readonly string[] | undefined;
};

function mapMcpToolOutputsToCore(
  outputs: readonly McpCompileToolOutputArg[],
): readonly ToolOutput[] {
  return outputs.map((o) => {
    if (o.relatedFiles !== undefined) {
      return {
        type: o.type,
        content: o.content,
        relatedFiles: o.relatedFiles.map((p) => toRelativePath(p)),
      };
    }
    return { type: o.type, content: o.content };
  });
}

type CompileHandlerArgs = {
  intent: string;
  projectRoot: string;
  modelId: string | null;
  editorId?: string | undefined;
  configPath: string | null;
  triggerSource?: TriggerSource | undefined;
  conversationId?: string | null | undefined;
  stepIndex?: number | undefined;
  stepIntent?: string | undefined;
  previousFiles?: readonly string[] | undefined;
  toolOutputs?: readonly McpCompileToolOutputArg[] | undefined;
  conversationTokens?: number | undefined;
  reparentFromConversationId?: string | null | undefined;
};

export function createCompileHandler(
  getScope: (projectRoot: AbsolutePath) => ProjectScope,
  getRunner: (scope: ProjectScope, configPath: FilePath | null) => CompilationRunner,
  sha256Adapter: StringHasher,
  getSessionId: () => SessionId,
  getEditorId: () => EditorId,
  getModelId: (editorId: EditorId) => string | null,
  installScopeWarnings: readonly string[],
  configLoader: ConfigLoader,
  setLastConversationId: (id: string | null) => void,
  getUpdateMessage: () => string | null,
  getConfigUpgraded: () => boolean,
  bootstrapIntegrationMode: BootstrapIntegrationMode = BOOTSTRAP_INTEGRATION.AUTO,
): (args: CompileHandlerArgs, _extra: unknown) => Promise<CallToolResult> {
  const initDoneForProject = new Set<string>();
  const runWhenEnabled = async (
    args: CompileHandlerArgs,
    projectRoot: AbsolutePath,
    scope: ProjectScope,
    configPath: ReturnType<typeof validateConfigPath> | null,
  ): Promise<CallToolResult> => {
    const runner = getRunner(scope, configPath);
    const telemetryDeps = {
      telemetryStore: scope.telemetryStore,
      clock: scope.clock,
      idGenerator: scope.idGenerator,
      stringHasher: sha256Adapter,
    };
    const toolInvocationLogStore = new SqliteToolInvocationLogStore(
      scope.projectId,
      scope.db,
    );
    const key = scope.normaliser.normalise(projectRoot);
    const resolvedEditorId: EditorId =
      args.editorId !== undefined ? (args.editorId as EditorId) : getEditorId();
    if (!initDoneForProject.has(key)) {
      ensureProjectInit(projectRoot, scope.clock, scope.idGenerator);
      reconcileProjectId(
        projectRoot,
        scope.db,
        scope.clock,
        scope.idGenerator,
        scope.normaliser,
      );
      installTriggerRule(projectRoot, resolvedEditorId);
      runEditorBootstrapIfNeeded(projectRoot, bootstrapIntegrationMode);
      initDoneForProject.add(key);
    }
    const intent = args.intent.replace(/[\x00-\x08\x0b-\x1f]/g, "");
    const resolvedModelId = resolveAndCacheModelId(
      args.modelId,
      getModelId,
      resolvedEditorId,
      projectRoot,
      args.conversationId ?? null,
      scope.clock.now(),
    );
    const resolvedConversationId = resolveConversationId(args.conversationId);
    const effectiveIntent = resolveIntentWithFallback(
      intent,
      resolvedConversationId,
      scope.db,
      scope.projectId,
    );
    const safe = {
      modelId: SanitisedCacheIdsSchema.shape.modelId.safeParse(resolvedModelId).success
        ? resolvedModelId
        : null,
      conversationId: SanitisedCacheIdsSchema.shape.conversationId.safeParse(
        resolvedConversationId,
      ).success
        ? resolvedConversationId
        : null,
      editorId: SanitisedCacheIdsSchema.shape.editorId.safeParse(resolvedEditorId).success
        ? resolvedEditorId
        : (EDITOR_ID.GENERIC as EditorId),
    };
    const request: CompilationRequest = {
      intent: effectiveIntent,
      projectRoot,
      modelId: safe.modelId,
      editorId: safe.editorId,
      configPath,
      sessionId: getSessionId(),
      triggerSource: args.triggerSource ?? TRIGGER_SOURCE.TOOL_GATE,
      ...(safe.conversationId !== null && safe.conversationId !== ""
        ? { conversationId: toConversationId(safe.conversationId) }
        : {}),
      ...(args.stepIndex !== undefined ? { stepIndex: toStepIndex(args.stepIndex) } : {}),
      ...(args.stepIntent !== undefined ? { stepIntent: args.stepIntent } : {}),
      ...(args.previousFiles !== undefined
        ? { previousFiles: args.previousFiles.map((p) => toRelativePath(p)) }
        : {}),
      ...(args.toolOutputs !== undefined
        ? { toolOutputs: mapMcpToolOutputsToCore(args.toolOutputs) }
        : {}),
      ...(args.conversationTokens !== undefined
        ? { conversationTokens: toTokenCount(args.conversationTokens) }
        : {}),
    };
    setLastConversationId(safe.conversationId ?? null);
    recordToolInvocation(
      toolInvocationLogStore,
      scope.clock,
      scope.idGenerator,
      getSessionId,
      "aic_compile",
      args,
    );
    const result = await Promise.race([runner.run(request), rejectAfter(30_000)]);
    writeCompilationTelemetry(
      result.meta,
      request,
      result.compilationId,
      telemetryDeps,
      (msg) => process.stderr.write(msg),
    );
    const lastPromptPath = path.join(
      request.projectRoot,
      ".aic",
      "last-compiled-prompt.txt",
    );
    try {
      await fs.promises.writeFile(lastPromptPath, result.compiledPrompt, "utf8");
    } catch {
      // Non-fatal — do not fail the request
    }
    return buildSuccessResponse(
      result,
      request,
      installScopeWarnings,
      getUpdateMessage,
      getConfigUpgraded,
    );
  };
  return async (args, _extra): Promise<CallToolResult> => {
    try {
      const projectRoot = validateProjectRoot(args.projectRoot);
      const scope = getScope(projectRoot);
      if (
        args.triggerSource === TRIGGER_SOURCE.SUBAGENT_STOP &&
        typeof args.reparentFromConversationId === "string" &&
        args.reparentFromConversationId.trim().length > 0 &&
        typeof args.conversationId === "string" &&
        args.conversationId.trim().length > 0
      ) {
        const count = reparentSubagentCompilations(
          scope.db,
          scope.projectId,
          toConversationId(args.reparentFromConversationId.trim()),
          toConversationId(args.conversationId.trim()),
        );
        const reparentPayload = { reparented: true as const, rowsUpdated: count };
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(reparentPayload),
            },
          ],
          structuredContent: reparentPayload,
        };
      }
      const configPath =
        args.configPath !== null
          ? validateConfigPath(args.configPath, projectRoot)
          : null;
      const configResult = configLoader.load(projectRoot, configPath);
      if (configResult.config.enabled === false) {
        const disabledPayload = {
          compiledPrompt:
            'AIC is disabled for this project. Set "enabled": true in aic.config.json to re-enable.',
          meta: {},
          conversationId: resolveConversationId(args.conversationId) ?? null,
        };
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(disabledPayload),
            },
          ],
          structuredContent: disabledPayload,
        };
      }
      return await runWhenEnabled(args, projectRoot, scope, configPath);
    } catch (err) {
      if (err instanceof TimeoutError) {
        throw new McpError(ErrorCode.InternalError, "Compilation timed out after 30s");
      }
      if (err instanceof AicError) {
        const sanitized = sanitizeError(err);
        throw new McpError(ErrorCode.InternalError, sanitized.message);
      }
      const label = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[aic] compile-handler unexpected error: ${label}\n`);
      throw new McpError(ErrorCode.InternalError, "Internal error");
    }
  };
}
