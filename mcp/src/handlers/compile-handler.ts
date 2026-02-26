import {
  McpError,
  ErrorCode,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { CompilationRunner } from "@aic/shared/core/interfaces/compilation-runner.interface.js";
import { AicError } from "@aic/shared/core/errors/aic-error.js";
import { sanitizeError } from "@aic/shared/core/errors/sanitize-error.js";
import { toAbsolutePath, toFilePath } from "@aic/shared/core/types/paths.js";
import type { EditorId } from "@aic/shared/core/types/enums.js";
import type { CompilationRequest } from "@aic/shared/core/types/compilation-types.js";

export function createCompileHandler(runner: CompilationRunner): (
  args: {
    intent: string;
    projectRoot: string;
    modelId: string | null;
    editorId: string;
    configPath: string | null;
  },
  _extra: unknown,
) => Promise<CallToolResult> {
  return async (args, _extra): Promise<CallToolResult> => {
    try {
      const request: CompilationRequest = {
        intent: args.intent,
        projectRoot: toAbsolutePath(args.projectRoot),
        modelId: args.modelId,
        editorId: args.editorId as EditorId,
        configPath: args.configPath !== null ? toFilePath(args.configPath) : null,
      };
      const result = await runner.run(request);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              compiledPrompt: result.compiledPrompt,
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
