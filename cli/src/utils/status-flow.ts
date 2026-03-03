import * as fs from "node:fs";
import * as path from "node:path";
import type { StatusRunner } from "@aic/shared/core/interfaces/status-runner.interface.js";
import type { StatusRequest } from "@aic/shared/core/types/status-types.js";
import type { StatusAggregates } from "@aic/shared/core/types/status-types.js";
import { toAbsolutePath, toFilePath } from "@aic/shared/core/types/paths.js";
import { LoadConfigFromFile } from "@aic/shared/config/load-config-from-file.js";

export type StatusFlowBaseArgs = {
  readonly projectRoot: string;
  readonly configPath: string | null;
  readonly dbPath: string | null;
};

export type StatusFlowResult =
  | { readonly kind: "no_db" }
  | { readonly kind: "no_compilations" }
  | {
      readonly kind: "ok";
      readonly request: StatusRequest;
      readonly aggregates: StatusAggregates;
      readonly budget: number;
    };

const NO_DB_MESSAGE =
  "No AIC database found. Run 'aic init' or use AIC via your editor first.\n";
const NO_COMPILATIONS_MESSAGE =
  "No compilations recorded yet. Run 'aic compile' or use AIC via your editor.\n";

export async function loadStatusContext(
  baseArgs: StatusFlowBaseArgs,
  runner: StatusRunner,
): Promise<StatusFlowResult> {
  const projectRoot = toAbsolutePath(baseArgs.projectRoot);
  const dbPath =
    baseArgs.dbPath !== null
      ? toFilePath(baseArgs.dbPath)
      : toFilePath(path.join(baseArgs.projectRoot, ".aic", "aic.sqlite"));
  if (!fs.existsSync(dbPath)) {
    return { kind: "no_db" };
  }
  const configPath =
    baseArgs.configPath !== null ? toFilePath(baseArgs.configPath) : null;
  const request: StatusRequest = {
    projectRoot,
    configPath,
    dbPath,
  };
  const loadConfig = new LoadConfigFromFile();
  const result = loadConfig.load(projectRoot, configPath ?? null);
  const budget = result.config.contextBudget.maxTokens;
  const aggregates = await runner.status(request);
  if (aggregates.compilationsTotal === 0) {
    return { kind: "no_compilations" };
  }
  return { kind: "ok", request, aggregates, budget };
}

export function handleStatusFlowResult(
  flowResult: StatusFlowResult,
  onSuccess: (
    request: StatusRequest,
    aggregates: StatusAggregates,
    budget: number,
  ) => void,
): void {
  if (flowResult.kind === "no_db") {
    process.stdout.write(NO_DB_MESSAGE);
    return;
  }
  if (flowResult.kind === "no_compilations") {
    process.stdout.write(NO_COMPILATIONS_MESSAGE);
    return;
  }
  onSuccess(flowResult.request, flowResult.aggregates, flowResult.budget);
}
