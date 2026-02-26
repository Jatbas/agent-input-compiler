import { InspectArgsSchema } from "@aic/cli/schemas/inspect-args.js";
import type { InspectArgs } from "@aic/cli/schemas/inspect-args.js";
import type { InspectRunner } from "@aic/shared/core/interfaces/inspect-runner.interface.js";
import type { InspectRequest } from "@aic/shared/core/types/inspect-types.js";
import { toAbsolutePath, toFilePath } from "@aic/shared/core/types/paths.js";
import { AicError } from "@aic/shared/core/errors/aic-error.js";
import { sanitizeError } from "@aic/shared/core/errors/sanitize-error.js";
import * as path from "node:path";
import { z } from "zod";

export async function inspectCommand(
  args: InspectArgs,
  runner: InspectRunner,
): Promise<void> {
  try {
    InspectArgsSchema.parse(args);
    const projectRoot = toAbsolutePath(args.projectRoot);
    const configPath = args.configPath !== null ? toFilePath(args.configPath) : null;
    const dbPath =
      args.dbPath !== null
        ? toFilePath(args.dbPath)
        : toFilePath(path.join(projectRoot as string, ".aic", "aic.sqlite"));
    const request: InspectRequest = {
      intent: args.intent,
      projectRoot,
      configPath,
      dbPath,
    };
    const result = await runner.inspect(request);
    process.stdout.write(JSON.stringify({ trace: result }));
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
