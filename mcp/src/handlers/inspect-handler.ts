import * as path from "node:path";
import type { InspectRunner } from "@aic/shared/core/interfaces/inspect-runner.interface.js";
import type { ToolInvocationLogStore } from "@aic/shared/core/interfaces/tool-invocation-log-store.interface.js";
import type { Clock } from "@aic/shared/core/interfaces/clock.interface.js";
import type { IdGenerator } from "@aic/shared/core/interfaces/id-generator.interface.js";
import type { SessionId } from "@aic/shared/core/types/identifiers.js";
import { AicError } from "@aic/shared/core/errors/aic-error.js";
import { sanitizeError } from "@aic/shared/core/errors/sanitize-error.js";
import { toFilePath } from "@aic/shared/core/types/paths.js";
import { recordToolInvocation } from "#mcp/record-tool-invocation.js";
import { validateProjectRoot, validateConfigPath } from "#mcp/validate-project-root.js";

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
  toolInvocationLogStore: ToolInvocationLogStore,
  clock: Clock,
  idGenerator: IdGenerator,
  getSessionId: () => SessionId,
): Promise<InspectToolResult> {
  const projectRoot = validateProjectRoot(args.projectRoot);
  const configPath =
    args.configPath !== undefined && args.configPath !== null
      ? validateConfigPath(args.configPath, projectRoot)
      : null;
  recordToolInvocation(
    toolInvocationLogStore,
    clock,
    idGenerator,
    getSessionId,
    "aic_inspect",
    args,
  );
  const dbPath = toFilePath(path.join(projectRoot, ".aic", "aic.sqlite"));

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
