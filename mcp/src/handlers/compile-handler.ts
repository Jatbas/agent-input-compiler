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
import { AicError } from "@jatbas/aic-core/core/errors/aic-error.js";
import { TimeoutError } from "@jatbas/aic-core/core/errors/timeout-error.js";
import { sanitizeError } from "@jatbas/aic-core/core/errors/sanitize-error.js";
import {
  type EditorId,
  type TriggerSource,
  TRIGGER_SOURCE,
} from "@jatbas/aic-core/core/types/enums.js";
import {
  type SessionId,
  toConversationId,
} from "@jatbas/aic-core/core/types/identifiers.js";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { CompilationRequest } from "@jatbas/aic-core/core/types/compilation-types.js";
import { writeCompilationTelemetry } from "@jatbas/aic-core/core/write-compilation-telemetry.js";
import { recordToolInvocation } from "../record-tool-invocation.js";
import { ensureProjectInit } from "../init-project.js";
import { installCursorHooks } from "../install-cursor-hooks.js";
import { installTriggerRule } from "../install-trigger-rule.js";
import { validateProjectRoot, validateConfigPath } from "../validate-project-root.js";

function rejectAfter(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new TimeoutError("Compilation timed out after 30s")), ms),
  );
}

function resolveConversationId(argsValue: string | null | undefined): string | null {
  if (argsValue !== null && argsValue !== undefined && argsValue !== "") {
    return argsValue;
  }
  return null;
}

export function createCompileHandler(
  getScope: (projectRoot: AbsolutePath) => ProjectScope,
  getRunner: (scope: ProjectScope) => CompilationRunner,
  sha256Adapter: StringHasher,
  getSessionId: () => SessionId,
  getEditorId: () => EditorId,
  getModelId: (editorId: EditorId) => string | null,
  modelIdOverride: string | null,
  installScopeWarnings: readonly string[],
  configLoader: ConfigLoader,
): (
  args: {
    intent: string;
    projectRoot: string;
    modelId: string | null;
    editorId?: string | undefined;
    configPath: string | null;
    triggerSource?: TriggerSource | undefined;
    conversationId?: string | null | undefined;
  },
  _extra: unknown,
) => Promise<CallToolResult> {
  return async (args, _extra): Promise<CallToolResult> => {
    try {
      const projectRoot = validateProjectRoot(args.projectRoot);
      const scope = getScope(projectRoot);
      const configPath =
        args.configPath !== null
          ? validateConfigPath(args.configPath, projectRoot)
          : null;
      const configResult = configLoader.load(projectRoot, configPath);
      if (configResult.config.enabled === false) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                compiledPrompt:
                  'AIC is disabled for this project. Set "enabled": true in aic.config.json to re-enable.',
                meta: {},
                conversationId: resolveConversationId(args.conversationId) ?? null,
              }),
            },
          ],
        };
      }
      const runner = getRunner(scope);
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
      ensureProjectInit(projectRoot, scope.clock, scope.idGenerator);
      reconcileProjectId(
        projectRoot,
        scope.db,
        scope.clock,
        scope.idGenerator,
        scope.normaliser,
      );
      installTriggerRule(projectRoot);
      installCursorHooks(projectRoot);
      const intent = args.intent.replace(/[\x00-\x08\x0b-\x1f]/g, "");
      const resolvedEditorId: EditorId =
        args.editorId !== undefined ? (args.editorId as EditorId) : getEditorId();
      const resolvedModelId: string | null =
        args.modelId ?? modelIdOverride ?? getModelId(resolvedEditorId);
      const resolvedConversationId = resolveConversationId(args.conversationId);
      const request: CompilationRequest = {
        intent,
        projectRoot,
        modelId: resolvedModelId,
        editorId: resolvedEditorId,
        configPath,
        sessionId: getSessionId(),
        triggerSource: args.triggerSource ?? TRIGGER_SOURCE.TOOL_GATE,
        ...(resolvedConversationId !== null
          ? { conversationId: toConversationId(resolvedConversationId) }
          : {}),
      };
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
        fs.writeFileSync(lastPromptPath, result.compiledPrompt, "utf8");
      } catch {
        // Non-fatal — do not fail the request
      }
      const warningBlock =
        installScopeWarnings.length > 0
          ? installScopeWarnings.map((w) => `⚠️ WARNING: ${w}`).join("\n") + "\n\n"
          : "";
      const reinforcement =
        "\n\nIMPORTANT: On your NEXT message in this conversation, call aic_compile again BEFORE doing anything else. Every message needs fresh context — do not reuse this result.";
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              compiledPrompt: warningBlock + result.compiledPrompt + reinforcement,
              meta: result.meta,
              conversationId: request.conversationId ?? null,
              ...(installScopeWarnings.length > 0
                ? { warnings: installScopeWarnings }
                : {}),
            }),
          },
        ],
      };
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
