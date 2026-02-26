import * as path from "node:path";
import type { InspectRunner } from "@aic/shared/core/interfaces/inspect-runner.interface.js";
import { AicError } from "@aic/shared/core/errors/aic-error.js";
import { sanitizeError } from "@aic/shared/core/errors/sanitize-error.js";
import { toAbsolutePath, toFilePath } from "@aic/shared/core/types/paths.js";

export type InspectToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

export type InspectRequestParsed = {
  intent: string;
  projectRoot: string;
  configPath?: string | null;
};

export async function handleInspect(
  args: InspectRequestParsed,
  inspectRunner: InspectRunner,
): Promise<InspectToolResult> {
  const projectRoot = toAbsolutePath(args.projectRoot);
  const configPath =
    args.configPath !== undefined && args.configPath !== null
      ? toFilePath(args.configPath)
      : null;
  const dbPath = toFilePath(path.join(projectRoot as string, ".aic", "aic.sqlite"));

  const request = {
    intent: args.intent,
    projectRoot,
    configPath,
    dbPath,
  } as const;

  try {
    const result = await inspectRunner.inspect(request);
    return {
      content: [{ type: "text", text: JSON.stringify({ trace: result }) }],
    };
  } catch (err) {
    const { code, message } = sanitizeError(err);
    if (err instanceof AicError) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message, code }) }],
      };
    }
    return {
      content: [
        { type: "text", text: JSON.stringify({ error: "Internal error", code }) },
      ],
    };
  }
}
