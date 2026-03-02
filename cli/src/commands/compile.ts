import { CompilationArgsSchema } from "@aic/cli/schemas/compilation-args.js";
import type { CompilationArgs } from "@aic/cli/schemas/compilation-args.js";
import type { CompilationRunner } from "@aic/shared/core/interfaces/compilation-runner.interface.js";
import { toAbsolutePath, toFilePath } from "@aic/shared/core/types/paths.js";
import { EDITOR_ID } from "@aic/shared/core/types/enums.js";
import { toConversationId } from "@aic/shared/core/types/identifiers.js";
import type { CompilationRequest } from "@aic/shared/core/types/compilation-types.js";
import type { TelemetryDeps } from "@aic/shared/core/types/telemetry-types.js";
import { writeCompilationTelemetry } from "@aic/shared/core/write-compilation-telemetry.js";
import { handleCommandError } from "@aic/cli/utils/handle-command-error.js";

export async function compileCommand(
  args: CompilationArgs,
  runner: CompilationRunner,
  telemetryDeps?: TelemetryDeps,
): Promise<void> {
  try {
    CompilationArgsSchema.parse(args);
    const request: CompilationRequest = {
      intent: args.intent,
      projectRoot: toAbsolutePath(args.projectRoot),
      modelId: null,
      editorId: EDITOR_ID.GENERIC,
      configPath: args.configPath !== null ? toFilePath(args.configPath) : null,
      triggerSource: args.triggerSource,
      ...(args.conversationId !== undefined && args.conversationId !== ""
        ? { conversationId: toConversationId(args.conversationId) }
        : {}),
    };
    const result = await runner.run(request);
    if (telemetryDeps !== undefined) {
      writeCompilationTelemetry(
        result.meta,
        request,
        result.compilationId,
        telemetryDeps,
        (msg) => process.stderr.write(msg),
      );
    }
    process.stdout.write(result.compiledPrompt);
  } catch (err) {
    handleCommandError(err);
  }
}
