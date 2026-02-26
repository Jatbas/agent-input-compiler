import { InspectArgsSchema } from "@aic/cli/schemas/inspect-args.js";
import type { InspectArgs } from "@aic/cli/schemas/inspect-args.js";
import type { InspectRunner } from "@aic/shared/core/interfaces/inspect-runner.interface.js";
import type { InspectRequest } from "@aic/shared/core/types/inspect-types.js";
import { toAbsolutePath, toFilePath } from "@aic/shared/core/types/paths.js";
import { handleCommandError } from "@aic/cli/utils/handle-command-error.js";
import * as path from "node:path";

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
        : toFilePath(path.join(projectRoot, ".aic", "aic.sqlite"));
    const request: InspectRequest = {
      intent: args.intent,
      projectRoot,
      configPath,
      dbPath,
    };
    const result = await runner.inspect(request);
    process.stdout.write(JSON.stringify({ trace: result }));
  } catch (err) {
    handleCommandError(err);
  }
}
