import { CompilationArgsSchema } from "@aic/cli/schemas/compilation-args.js";
import type { CompilationArgs } from "@aic/cli/schemas/compilation-args.js";
import type { CompilationRunner } from "@aic/shared/core/interfaces/compilation-runner.interface.js";
import { toAbsolutePath, toFilePath } from "@aic/shared/core/types/paths.js";
import { EDITOR_ID } from "@aic/shared/core/types/enums.js";
import type { CompilationRequest } from "@aic/shared/core/types/compilation-types.js";
import { AicError } from "@aic/shared/core/errors/aic-error.js";
import { sanitizeError } from "@aic/shared/core/errors/sanitize-error.js";
import { z } from "zod";

export async function compileCommand(
  args: CompilationArgs,
  runner: CompilationRunner,
): Promise<void> {
  try {
    CompilationArgsSchema.parse(args);
    const request: CompilationRequest = {
      intent: args.intent,
      projectRoot: toAbsolutePath(args.projectRoot),
      modelId: null,
      editorId: EDITOR_ID.GENERIC,
      configPath: args.configPath !== null ? toFilePath(args.configPath) : null,
    };
    const result = await runner.run(request);
    process.stdout.write(result.compiledPrompt);
  } catch (err) {
    if (err instanceof z.ZodError) {
      process.stderr.write(String(err.message));
      throw err;
    }
    if (err instanceof AicError) {
      const sanitized = sanitizeError(err);
      process.stderr.write(sanitized.message);
      throw err;
    }
    process.stderr.write("Internal error");
    throw err;
  }
}
