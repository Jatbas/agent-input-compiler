import { StatusArgsSchema } from "@aic/cli/schemas/status-args.js";
import type { StatusArgs } from "@aic/cli/schemas/status-args.js";
import type { StatusRunner } from "@aic/shared/core/interfaces/status-runner.interface.js";
import type { StatusRequest } from "@aic/shared/core/types/status-types.js";
import type { StatusAggregates } from "@aic/shared/core/types/status-types.js";
import { toAbsolutePath, toFilePath } from "@aic/shared/core/types/paths.js";
import { handleCommandError } from "@aic/cli/utils/handle-command-error.js";
import * as path from "node:path";
import * as fs from "node:fs";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAvgReductionLine(aggregates: StatusAggregates): string {
  if (aggregates.telemetryDisabled)
    return "(telemetry disabled — enable in aic.config.json)";
  if (aggregates.avgReductionPct !== null)
    return `${aggregates.avgReductionPct.toFixed(1)}%`;
  return "—";
}

function formatTotalSavedLine(aggregates: StatusAggregates): string {
  if (aggregates.telemetryDisabled) return "(telemetry disabled)";
  if (aggregates.totalTokensSaved !== null)
    return aggregates.totalTokensSaved.toLocaleString();
  return "—";
}

function formatStatusOutput(
  request: StatusRequest,
  aggregates: StatusAggregates,
): string {
  const configPathStr = request.configPath ?? "—";
  const configExists =
    request.configPath !== null ? fs.existsSync(request.configPath) : false;
  const configLine = `${configPathStr}${configExists ? "" : " (not found)"}`;

  const triggerPath = path.join(request.projectRoot, ".cursor", "rules", "aic.mdc");
  const triggerExists = fs.existsSync(triggerPath);
  const triggerLine = `.cursor/rules/aic.mdc ${triggerExists ? "✓" : "✗"}`;

  const dbPathStr = request.dbPath;
  const dbSize = fs.existsSync(dbPathStr) ? formatSize(fs.statSync(dbPathStr).size) : "—";
  const databaseRel = path.relative(request.projectRoot, dbPathStr);
  const databaseLine = `${databaseRel || dbPathStr} (${dbSize})`;

  const cacheLine =
    aggregates.cacheHitRatePct !== null
      ? `${Math.round(aggregates.cacheHitRatePct)}%`
      : "—";
  const avgReductionLine = formatAvgReductionLine(aggregates);
  const totalSavedLine = formatTotalSavedLine(aggregates);

  const guardTotal = Object.values(aggregates.guardByType).reduce((a, b) => a + b, 0);
  const guardParts = Object.entries(aggregates.guardByType).map(
    ([type, count]) => `${count} ${type}`,
  );
  const guardLine =
    guardTotal === 0
      ? "0 files blocked"
      : `${guardTotal} files blocked (${guardParts.join(", ")})`;

  const topClassesLine =
    aggregates.topTaskClasses.length === 0
      ? "—"
      : aggregates.topTaskClasses.map((t) => `${t.taskClass} (${t.count})`).join(", ");

  const lastLine =
    aggregates.lastCompilation === null
      ? ""
      : `\nLast compilation: "${aggregates.lastCompilation.intent}"\n  ${aggregates.lastCompilation.filesTotal} files → ${aggregates.lastCompilation.filesSelected} selected (${aggregates.lastCompilation.tokensCompiled.toLocaleString()} tokens, ${aggregates.lastCompilation.tokenReductionPct}% reduction)`;

  return [
    `Compilations:     ${aggregates.compilationsTotal} (${aggregates.compilationsToday} today)`,
    `Cache hit rate:   ${cacheLine}`,
    `Avg reduction:    ${avgReductionLine}`,
    `Total tokens saved: ${totalSavedLine}`,
    `Guard:            ${guardLine}`,
    `Top task classes: ${topClassesLine}`,
    "Rules health:     —",
    `Config:           ${configLine}`,
    `Trigger rule:     ${triggerLine}`,
    `Database:         ${databaseLine}${lastLine}`,
  ].join("\n");
}

export async function statusCommand(
  args: StatusArgs,
  runner: StatusRunner,
): Promise<void> {
  try {
    StatusArgsSchema.parse(args);
    const projectRoot = toAbsolutePath(args.projectRoot);
    const dbPath =
      args.dbPath !== null
        ? toFilePath(args.dbPath)
        : toFilePath(path.join(args.projectRoot, ".aic", "aic.sqlite"));
    if (!fs.existsSync(dbPath)) {
      process.stdout.write(
        "No AIC database found. Run 'aic init' or use AIC via your editor first.\n",
      );
      return;
    }
    const configPath = args.configPath !== null ? toFilePath(args.configPath) : null;
    const request: StatusRequest = {
      projectRoot,
      configPath,
      dbPath,
    };
    const aggregates = await runner.status(request);
    if (aggregates.compilationsTotal === 0) {
      process.stdout.write(
        "No compilations recorded yet. Run 'aic compile' or use AIC via your editor.\n",
      );
      return;
    }
    process.stdout.write(formatStatusOutput(request, aggregates) + "\n");
  } catch (err) {
    handleCommandError(err);
  }
}
