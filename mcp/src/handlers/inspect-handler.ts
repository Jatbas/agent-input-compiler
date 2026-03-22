// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as path from "node:path";
import type { InspectRunner } from "@jatbas/aic-core/core/interfaces/inspect-runner.interface.js";
import type { ToolInvocationLogStore } from "@jatbas/aic-core/core/interfaces/tool-invocation-log-store.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { IdGenerator } from "@jatbas/aic-core/core/interfaces/id-generator.interface.js";
import type { SessionId } from "@jatbas/aic-core/core/types/identifiers.js";
import { AicError } from "@jatbas/aic-core/core/errors/aic-error.js";
import { sanitizeError } from "@jatbas/aic-core/core/errors/sanitize-error.js";
import { toFilePath } from "@jatbas/aic-core/core/types/paths.js";
import { recordToolInvocation } from "../record-tool-invocation.js";
import { validateProjectRoot, validateConfigPath } from "../validate-project-root.js";

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
    // strip file content to prevent response self-flooding
    const sanitizedTrace = {
      ...result,
      selectedFiles: result.selectedFiles.map(
        ({ resolvedContent: _content, ...rest }) => rest,
      ),
    };
    return {
      content: [{ type: "text", text: JSON.stringify({ trace: sanitizedTrace }) }],
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
