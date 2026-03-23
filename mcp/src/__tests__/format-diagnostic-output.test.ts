// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { SystemClock } from "@jatbas/aic-core/adapters/system-clock.js";
import { formatStatusTable } from "../format-diagnostic-output.js";

function hasPaddedLabelRow(output: string, label: string): boolean {
  const prefix = `${label.padEnd(28, " ")}  `;
  return output.split("\n").some((line) => line.startsWith(prefix));
}

const baseStatusPayload: Record<string, unknown> = {
  compilationsTotal: 0,
  compilationsToday: 0,
  totalTokensRaw: 0,
  totalTokensCompiled: 0,
  totalTokensSaved: null,
  budgetMaxTokens: 0,
  budgetUtilizationPct: null,
  cacheHitRatePct: null,
  avgReductionPct: null,
  guardByType: {},
  topTaskClasses: [],
  lastCompilation: null,
  updateAvailable: null,
};

describe("formatStatusTable", () => {
  it("status_table_ok_hides_notes", () => {
    const clock = new SystemClock();
    const out = formatStatusTable(
      {
        ...baseStatusPayload,
        installationOk: true,
        installationNotes: "Claude Code: OK",
        projectEnabled: true,
      },
      clock,
    );
    expect(hasPaddedLabelRow(out, "Installation")).toBe(true);
    expect(out).toContain("OK");
    expect(hasPaddedLabelRow(out, "Notes")).toBe(false);
    expect(hasPaddedLabelRow(out, "Project")).toBe(false);
  });

  it("status_table_issues_show_notes", () => {
    const clock = new SystemClock();
    const message = "trigger rule not found";
    const out = formatStatusTable(
      {
        ...baseStatusPayload,
        installationOk: false,
        installationNotes: message,
        projectEnabled: true,
      },
      clock,
    );
    expect(out).toContain("Issues detected");
    expect(hasPaddedLabelRow(out, "Notes")).toBe(true);
    expect(out).toContain(message);
  });

  it("format_status_table_shows_time_range_row", () => {
    const clock = new SystemClock();
    const out = formatStatusTable(
      {
        ...baseStatusPayload,
        timeRangeDays: 14,
        installationOk: true,
        projectEnabled: true,
      },
      clock,
    );
    expect(hasPaddedLabelRow(out, "Time range")).toBe(true);
    expect(out).toContain("Last 14 days");
  });

  it("status_table_no_project_row", () => {
    const clock = new SystemClock();
    const outTrue = formatStatusTable(
      { ...baseStatusPayload, installationOk: true, projectEnabled: true },
      clock,
    );
    const outFalse = formatStatusTable(
      { ...baseStatusPayload, installationOk: true, projectEnabled: false },
      clock,
    );
    expect(hasPaddedLabelRow(outTrue, "Project")).toBe(false);
    expect(hasPaddedLabelRow(outFalse, "Project")).toBe(false);
  });

  it("status_table_includes_metric_footnote", () => {
    const clock = new SystemClock();
    const out = formatStatusTable(
      { ...baseStatusPayload, installationOk: true, projectEnabled: true },
      clock,
    );
    expect(out).toContain("Exclusion rate: % of total repo tokens");
    expect(out).toContain("Budget utilization: % of token budget filled.");
  });
});
