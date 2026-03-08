import * as fs from "node:fs";
import * as path from "node:path";
import {
  McpError,
  ErrorCode,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { CompilationRunner } from "@aic/shared/core/interfaces/compilation-runner.interface.js";
import type { ToolInvocationLogStore } from "@aic/shared/core/interfaces/tool-invocation-log-store.interface.js";
import type { Clock } from "@aic/shared/core/interfaces/clock.interface.js";
import type { IdGenerator } from "@aic/shared/core/interfaces/id-generator.interface.js";
import { AicError } from "@aic/shared/core/errors/aic-error.js";
import { TimeoutError } from "@aic/shared/core/errors/timeout-error.js";
import { sanitizeError } from "@aic/shared/core/errors/sanitize-error.js";
import {
  type EditorId,
  type TriggerSource,
  TRIGGER_SOURCE,
} from "@aic/shared/core/types/enums.js";
import { type SessionId, toConversationId } from "@aic/shared/core/types/identifiers.js";
import type { CompilationRequest } from "@aic/shared/core/types/compilation-types.js";
import type { TelemetryDeps } from "@aic/shared/core/types/telemetry-types.js";
import { writeCompilationTelemetry } from "@aic/shared/core/write-compilation-telemetry.js";
import { recordToolInvocation } from "#mcp/record-tool-invocation.js";
import { ensureProjectInit } from "#mcp/init-project.js";
import { validateProjectRoot, validateConfigPath } from "#mcp/validate-project-root.js";

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
  runner: CompilationRunner,
  telemetryDeps: TelemetryDeps,
  getSessionId: () => SessionId,
  getEditorId: () => EditorId,
  getModelId: (editorId: EditorId) => string | null,
  modelIdOverride: string | null,
  toolInvocationLogStore: ToolInvocationLogStore,
  clock: Clock,
  idGenerator: IdGenerator,
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
      ensureProjectInit(projectRoot);
      const configPath =
        args.configPath !== null
          ? validateConfigPath(args.configPath, projectRoot)
          : null;
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
        clock,
        idGenerator,
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
      const reinforcement =
        "\n\nIMPORTANT: On your NEXT message in this conversation, call aic_compile again BEFORE doing anything else. Every message needs fresh context — do not reuse this result.";
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              compiledPrompt: result.compiledPrompt + reinforcement,
              meta: result.meta,
              conversationId: request.conversationId ?? null,
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
