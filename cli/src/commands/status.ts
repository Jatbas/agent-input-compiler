import { StatusArgsSchema } from "@aic/cli/schemas/status-args.js";
import type { StatusArgs } from "@aic/cli/schemas/status-args.js";
import type { StatusRunner } from "@aic/shared/core/interfaces/status-runner.interface.js";
import type { StatusRequest } from "@aic/shared/core/types/status-types.js";
import type { StatusAggregates } from "@aic/shared/core/types/status-types.js";
import { handleCommandError } from "@aic/cli/utils/handle-command-error.js";
import {
  handleStatusFlowResult,
  loadStatusContext,
} from "@aic/cli/utils/status-flow.js";
import {
  buildStatusSections,
  formatLastCompilationTerminal,
} from "@aic/cli/utils/status-display.js";

function formatStatusOutput(
  request: StatusRequest,
  aggregates: StatusAggregates,
  budget: number,
): string {
  const { sections, lastCompilation } = buildStatusSections(
    request,
    aggregates,
    budget,
  );
  const lines = sections.map(
    (s) => s.terminalPrefix + s.valueForTerminal,
  );
  const lastLine = formatLastCompilationTerminal(lastCompilation);
  const withLast = lines.length > 0
    ? [...lines.slice(0, -1), lines[lines.length - 1] + lastLine]
    : lines;
  return withLast.join("\n");
}

export async function statusCommand(
  args: StatusArgs,
  runner: StatusRunner,
): Promise<void> {
  try {
    StatusArgsSchema.parse(args);
    const result = await loadStatusContext(args, runner);
    handleStatusFlowResult(result, (request, aggregates, budget) => {
      process.stdout.write(
        formatStatusOutput(request, aggregates, budget) + "\n",
      );
    });
  } catch (err) {
    handleCommandError(err);
  }
}
