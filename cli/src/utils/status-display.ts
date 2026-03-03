import * as fs from "node:fs";
import * as path from "node:path";
import type { StatusRequest } from "@aic/shared/core/types/status-types.js";
import type { StatusAggregates } from "@aic/shared/core/types/status-types.js";

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatInstallationValue(aggregates: StatusAggregates): string {
  if (aggregates.installationOk === true) return "OK";
  if (aggregates.installationOk === false && aggregates.installationNotes !== null) {
    return aggregates.installationNotes;
  }
  return "—";
}

function formatAvgReductionValue(aggregates: StatusAggregates): string {
  if (aggregates.telemetryDisabled)
    return "(telemetry disabled — enable in aic.config.json)";
  if (aggregates.avgReductionPct !== null)
    return `${aggregates.avgReductionPct.toFixed(1)}%`;
  return "—";
}

function formatTotalSavedValue(aggregates: StatusAggregates): string {
  if (aggregates.telemetryDisabled) return "(telemetry disabled)";
  if (aggregates.totalTokensSaved !== null)
    return aggregates.totalTokensSaved.toLocaleString();
  return "—";
}

function formatInstallationLineTerminal(aggregates: StatusAggregates): string {
  if (aggregates.installationOk === true) return "Installation: OK";
  if (
    aggregates.installationOk === false &&
    aggregates.installationNotes !== null
  ) {
    return "Installation: " + aggregates.installationNotes;
  }
  return "Installation: —";
}

export interface StatusSection {
  readonly terminalPrefix: string;
  readonly label: string;
  readonly valueForTerminal: string;
  readonly valueForDisplay: string;
  readonly userControlled: boolean;
}

export interface StatusSectionsResult {
  readonly sections: readonly StatusSection[];
  readonly lastCompilation: StatusAggregates["lastCompilation"];
}

export function buildStatusSections(
  request: StatusRequest,
  aggregates: StatusAggregates,
  budget: number,
): StatusSectionsResult {
  const configPathStr = request.configPath ?? "—";
  const configExists =
    request.configPath !== null ? fs.existsSync(request.configPath) : false;
  const configLine = `${configPathStr}${configExists ? "" : " (not found)"}`;

  const triggerPath = path.join(request.projectRoot, ".cursor", "rules", "AIC.mdc");
  const triggerExists = fs.existsSync(triggerPath);
  const triggerLine = `.cursor/rules/AIC.mdc ${triggerExists ? "✓" : "✗"}`;

  const installationValue = formatInstallationValue(aggregates);
  const installationLine = formatInstallationLineTerminal(aggregates);

  const dbPathStr = request.dbPath;
  const dbSize = fs.existsSync(dbPathStr) ? formatSize(fs.statSync(dbPathStr).size) : "—";
  const databaseRel = path.relative(request.projectRoot, dbPathStr);
  const databaseLine = `${databaseRel || dbPathStr} (${dbSize})`;

  const cacheLine =
    aggregates.cacheHitRatePct !== null
      ? `${Math.round(aggregates.cacheHitRatePct)}%`
      : "—";
  const avgReductionLine = formatAvgReductionValue(aggregates);
  const totalTokensLine = `${aggregates.totalTokensRaw.toLocaleString()} raw → ${aggregates.totalTokensCompiled.toLocaleString()} compiled`;
  const totalSavedLine = formatTotalSavedValue(aggregates);
  const budgetUtilLine =
    aggregates.lastCompilation !== null
      ? `${Math.round(aggregates.lastCompilation.tokensCompiled / budget * 100)}% (last: ${aggregates.lastCompilation.tokensCompiled.toLocaleString()}/${budget.toLocaleString()})`
      : "—";

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

  const sections: readonly StatusSection[] = [
    {
      terminalPrefix: "Compilations:     ",
      label: "Compilations",
      valueForTerminal: `${aggregates.compilationsTotal} (${aggregates.compilationsToday} today)`,
      valueForDisplay: `${aggregates.compilationsTotal} (${aggregates.compilationsToday} today)`,
      userControlled: false,
    },
    {
      terminalPrefix: "Cache hit rate:   ",
      label: "Cache hit rate",
      valueForTerminal: cacheLine,
      valueForDisplay: cacheLine,
      userControlled: false,
    },
    {
      terminalPrefix: "Avg reduction:    ",
      label: "Avg reduction",
      valueForTerminal: avgReductionLine,
      valueForDisplay: avgReductionLine,
      userControlled: false,
    },
    {
      terminalPrefix: "Total tokens:     ",
      label: "Total tokens",
      valueForTerminal: totalTokensLine,
      valueForDisplay: totalTokensLine,
      userControlled: false,
    },
    {
      terminalPrefix: "Total tokens saved: ",
      label: "Total tokens saved",
      valueForTerminal: totalSavedLine,
      valueForDisplay: totalSavedLine,
      userControlled: false,
    },
    {
      terminalPrefix: "Budget utilization: ",
      label: "Budget utilization",
      valueForTerminal: budgetUtilLine,
      valueForDisplay: budgetUtilLine,
      userControlled: false,
    },
    {
      terminalPrefix: "Guard:            ",
      label: "Guard",
      valueForTerminal: guardLine,
      valueForDisplay: guardLine,
      userControlled: true,
    },
    {
      terminalPrefix: "Top task classes: ",
      label: "Top task classes",
      valueForTerminal: topClassesLine,
      valueForDisplay: topClassesLine,
      userControlled: true,
    },
    {
      terminalPrefix: "Rules health:     ",
      label: "Rules health",
      valueForTerminal: "—",
      valueForDisplay: "—",
      userControlled: false,
    },
    {
      terminalPrefix: "Config:           ",
      label: "Config",
      valueForTerminal: configLine,
      valueForDisplay: configLine,
      userControlled: true,
    },
    {
      terminalPrefix: "Trigger rule:     ",
      label: "Trigger rule",
      valueForTerminal: triggerLine,
      valueForDisplay: triggerLine,
      userControlled: false,
    },
    {
      terminalPrefix: "",
      label: "Installation",
      valueForTerminal: installationLine,
      valueForDisplay: installationValue,
      userControlled:
        aggregates.installationNotes !== null && aggregates.installationNotes !== "",
    },
    {
      terminalPrefix: "Database:         ",
      label: "Database",
      valueForTerminal: databaseLine,
      valueForDisplay: databaseLine,
      userControlled: true,
    },
  ];

  return {
    sections,
    lastCompilation: aggregates.lastCompilation,
  };
}

export function formatLastCompilationTerminal(
  lc: StatusAggregates["lastCompilation"],
): string {
  if (lc === null) return "";
  const base = `\nLast compilation: "${lc.intent}"\n  ${lc.filesTotal} files → ${lc.filesSelected} selected (${lc.tokensCompiled.toLocaleString()} tokens, ${lc.tokenReductionPct}% reduction)`;
  const hasModel = lc.modelId !== null && lc.modelId !== "";
  return hasModel
    ? `${base}\n  editor: ${lc.editorId}, model: ${lc.modelId}`
    : `${base}\n  editor: ${lc.editorId}`;
}

export function formatLastCompilationHtml(
  lc: StatusAggregates["lastCompilation"],
  escapeHtml: (s: string) => string,
): string {
  if (lc === null) return "";
  const intentEscaped = escapeHtml(lc.intent);
  const base = `<dt>Last compilation</dt><dd>"${intentEscaped}"<br>${lc.filesTotal} files → ${lc.filesSelected} selected (${lc.tokensCompiled.toLocaleString()} tokens, ${lc.tokenReductionPct}% reduction)`;
  const hasModel = lc.modelId !== null && lc.modelId !== "";
  return hasModel
    ? `${base}<br>editor: ${escapeHtml(lc.editorId)}, model: ${escapeHtml(lc.modelId)}</dd>`
    : `${base}<br>editor: ${escapeHtml(lc.editorId)}</dd>`;
}
