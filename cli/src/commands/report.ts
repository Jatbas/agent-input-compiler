import * as fs from "node:fs";
import * as path from "node:path";
import { ReportArgsSchema } from "@aic/cli/schemas/report-args.js";
import type { ReportArgs } from "@aic/cli/schemas/report-args.js";
import type { StatusRunner } from "@aic/shared/core/interfaces/status-runner.interface.js";
import type { StatusRequest } from "@aic/shared/core/types/status-types.js";
import type { StatusAggregates } from "@aic/shared/core/types/status-types.js";
import { toFilePath } from "@aic/shared/core/types/paths.js";
import { ensureAicDir } from "@aic/shared/storage/ensure-aic-dir.js";
import { handleCommandError } from "@aic/cli/utils/handle-command-error.js";
import {
  handleStatusFlowResult,
  loadStatusContext,
} from "@aic/cli/utils/status-flow.js";
import {
  buildStatusSections,
  formatLastCompilationHtml,
} from "@aic/cli/utils/status-display.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatStatusAsHtml(
  request: StatusRequest,
  aggregates: StatusAggregates,
  budget: number,
): string {
  const { sections, lastCompilation } = buildStatusSections(
    request,
    aggregates,
    budget,
  );
  const tableBody = sections
    .map((s) => {
      const value = s.userControlled ? escapeHtml(s.valueForDisplay) : s.valueForDisplay;
      return `<tr><th>${escapeHtml(s.label)}</th><td>${value}</td></tr>`;
    })
    .join("");
  const lastBlock = formatLastCompilationHtml(lastCompilation, escapeHtml);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AIC Status</title>
</head>
<body>
  <h1>AIC Status</h1>
  <table>
    <tbody>
${tableBody}
    </tbody>
  </table>
${lastBlock ? `<dl>${lastBlock}</dl>` : ""}
</body>
</html>`;
}

export async function reportCommand(
  args: ReportArgs,
  runner: StatusRunner,
): Promise<void> {
  try {
    ReportArgsSchema.parse(args);
    const result = await loadStatusContext(args, runner);
    handleStatusFlowResult(result, (request, aggregates, budget) => {
      const outputPath =
        args.outputPath !== null
          ? toFilePath(args.outputPath)
          : toFilePath(
              path.join(ensureAicDir(request.projectRoot), "report.html"),
            );
      const html = formatStatusAsHtml(request, aggregates, budget);
      fs.writeFileSync(outputPath, html, "utf8");
      const displayPath =
        path.relative(request.projectRoot, outputPath) || outputPath;
      process.stdout.write(`Report written to ${displayPath}\n`);
    });
  } catch (err) {
    handleCommandError(err);
  }
}
