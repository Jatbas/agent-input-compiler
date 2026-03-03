import { StatusArgsSchema } from "@aic/cli/schemas/status-args.js";
import type { StatusArgs } from "@aic/cli/schemas/status-args.js";
import type { StatusRunner } from "@aic/shared/core/interfaces/status-runner.interface.js";
import type { StatusRequest } from "@aic/shared/core/types/status-types.js";
import type { StatusAggregates } from "@aic/shared/core/types/status-types.js";
import { toAbsolutePath, toFilePath } from "@aic/shared/core/types/paths.js";
import { LoadConfigFromFile } from "@aic/shared/config/load-config-from-file.js";
import { handleCommandError } from "@aic/cli/utils/handle-command-error.js";
import * as path from "node:path";
import * as fs from "node:fs";

function formatInstallationLine(aggregates: StatusAggregates): string {
  if (aggregates.installationOk === true) return "Installation: OK";
  if (aggregates.installationOk === false && aggregates.installationNotes !== null) {
    return "Installation: " + aggregates.installationNotes;
  }
  return "Installation: —";
}

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

function formatLastCompilationLine(lc: StatusAggregates["lastCompilation"]): string {
  if (lc === null) return "";
  const base = `\nLast compilation: "${lc.intent}"\n  ${lc.filesTotal} files → ${lc.filesSelected} selected (${lc.tokensCompiled.toLocaleString()} tokens, ${lc.tokenReductionPct}% reduction)`;
  const hasModel = lc.modelId !== null && lc.modelId !== "";
  return hasModel
    ? `${base}\n  editor: ${lc.editorId}, model: ${lc.modelId}`
    : `${base}\n  editor: ${lc.editorId}`;
}

function formatStatusOutput(
  request: StatusRequest,
  aggregates: StatusAggregates,
  budget: number,
): string {
  const configPathStr = request.configPath ?? "—";
  const configExists =
    request.configPath !== null ? fs.existsSync(request.configPath) : false;
  const configLine = `${configPathStr}${configExists ? "" : " (not found)"}`;

  const triggerPath = path.join(request.projectRoot, ".cursor", "rules", "AIC.mdc");
  const triggerExists = fs.existsSync(triggerPath);
  const triggerLine = `.cursor/rules/AIC.mdc ${triggerExists ? "✓" : "✗"}`;

  const installationLine = formatInstallationLine(aggregates);

  const dbPathStr = request.dbPath;
  const dbSize = fs.existsSync(dbPathStr) ? formatSize(fs.statSync(dbPathStr).size) : "—";
  const databaseRel = path.relative(request.projectRoot, dbPathStr);
  const databaseLine = `${databaseRel || dbPathStr} (${dbSize})`;

  const cacheLine =
    aggregates.cacheHitRatePct !== null
      ? `${Math.round(aggregates.cacheHitRatePct)}%`
      : "—";
  const avgReductionLine = formatAvgReductionLine(aggregates);
  const totalTokensLine = `${aggregates.totalTokensRaw.toLocaleString()} raw → ${aggregates.totalTokensCompiled.toLocaleString()} compiled`;
  const totalSavedLine = formatTotalSavedLine(aggregates);
  const budgetUtilLine =
    aggregates.lastCompilation !== null
      ? `Budget utilization: ${Math.round(aggregates.lastCompilation.tokensCompiled / budget * 100)}% (last: ${aggregates.lastCompilation.tokensCompiled.toLocaleString()}/${budget.toLocaleString()})`
      : "Budget utilization: —";

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

  const lastLine = formatLastCompilationLine(aggregates.lastCompilation);

  return [
    `Compilations:     ${aggregates.compilationsTotal} (${aggregates.compilationsToday} today)`,
    `Cache hit rate:   ${cacheLine}`,
    `Avg reduction:    ${avgReductionLine}`,
    `Total tokens:     ${totalTokensLine}`,
    `Total tokens saved: ${totalSavedLine}`,
    budgetUtilLine,
    `Guard:            ${guardLine}`,
    `Top task classes: ${topClassesLine}`,
    "Rules health:     —",
    `Config:           ${configLine}`,
    `Trigger rule:     ${triggerLine}`,
    installationLine,
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
    const loadConfig = new LoadConfigFromFile();
    const result = loadConfig.load(projectRoot, configPath ?? null);
    const budget = result.config.contextBudget.maxTokens;
    const aggregates = await runner.status(request);
    if (aggregates.compilationsTotal === 0) {
      process.stdout.write(
        "No compilations recorded yet. Run 'aic compile' or use AIC via your editor.\n",
      );
      return;
    }
    process.stdout.write(formatStatusOutput(request, aggregates, budget) + "\n");
  } catch (err) {
    handleCommandError(err);
  }
}
