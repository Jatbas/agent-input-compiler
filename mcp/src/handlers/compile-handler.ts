import {
  McpError,
  ErrorCode,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { CompilationRunner } from "@aic/shared/core/interfaces/compilation-runner.interface.js";
import { AicError } from "@aic/shared/core/errors/aic-error.js";
import { sanitizeError } from "@aic/shared/core/errors/sanitize-error.js";
import { toAbsolutePath, toFilePath } from "@aic/shared/core/types/paths.js";
import {
  type EditorId,
  type TriggerSource,
  TRIGGER_SOURCE,
} from "@aic/shared/core/types/enums.js";
import { type SessionId, toConversationId } from "@aic/shared/core/types/identifiers.js";
import type { CompilationRequest } from "@aic/shared/core/types/compilation-types.js";
import type { TelemetryDeps } from "@aic/shared/core/types/telemetry-types.js";
import { writeCompilationTelemetry } from "@aic/shared/core/write-compilation-telemetry.js";

export function createCompileHandler(
  runner: CompilationRunner,
  telemetryDeps: TelemetryDeps,
  sessionId: SessionId,
  getEditorId: () => EditorId,
  getModelId: (editorId: EditorId) => string | null,
  modelIdOverride: string | null,
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
      const resolvedEditorId: EditorId =
        args.editorId !== undefined ? (args.editorId as EditorId) : getEditorId();
      const resolvedModelId: string | null =
        args.modelId ?? modelIdOverride ?? getModelId(resolvedEditorId);
      const request: CompilationRequest = {
        intent: args.intent,
        projectRoot: toAbsolutePath(args.projectRoot),
        modelId: resolvedModelId,
        editorId: resolvedEditorId,
        configPath: args.configPath !== null ? toFilePath(args.configPath) : null,
        sessionId,
        triggerSource: args.triggerSource ?? TRIGGER_SOURCE.TOOL_GATE,
        ...(args.conversationId !== null &&
        args.conversationId !== undefined &&
        args.conversationId !== ""
          ? { conversationId: toConversationId(args.conversationId) }
          : {}),
      };
      const result = await runner.run(request);
      writeCompilationTelemetry(
        result.meta,
        request,
        result.compilationId,
        telemetryDeps,
        (msg) => process.stderr.write(msg),
      );
      const reinforcement =
        "\n\nIMPORTANT: On your NEXT message in this conversation, call aic_compile again BEFORE doing anything else. Every message needs fresh context — do not reuse this result.";
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              compiledPrompt: result.compiledPrompt + reinforcement,
              meta: result.meta,
            }),
          },
        ],
      };
    } catch (err) {
      if (err instanceof AicError) {
        const sanitized = sanitizeError(err);
        throw new McpError(ErrorCode.InternalError, sanitized.message);
      }
      throw new McpError(ErrorCode.InternalError, "Internal error");
    }
  };
}
