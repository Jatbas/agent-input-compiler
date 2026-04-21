// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { SystemClock } from "@jatbas/aic-core/adapters/system-clock.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import { TASK_CLASS } from "@jatbas/aic-core/core/types/enums.js";
import { toISOTimestamp, toProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import type {
  ConversationSummary,
  ProjectListItem,
} from "@jatbas/aic-core/core/types/status-types.js";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import {
  formatChatSummaryTable,
  formatLastTable,
  formatProjectsTable,
  formatQualityReportLines,
  formatStatusTable,
} from "../format-diagnostic-output.js";

const SEP_LINE =
  "──────────────────────────────────────────────────────────────────────────────";

function hasPaddedLabelRow(output: string, label: string): boolean {
  const prefix = `${label.padEnd(30, " ")}  `;
  return output.split("\n").some((line) => line.startsWith(prefix));
}

function assertStandardReportLayout(
  output: string,
  options?: { footnote?: boolean },
): void {
  const expectFootnote = options?.footnote !== false;
  const lines = output.replace(/\n$/, "").split("\n");
  expect(lines[0]).toMatch(/^[A-Z][a-z-]+ = /);
  expect(lines[1]).toBe(SEP_LINE);
  expect(lines[2]).not.toBe(SEP_LINE);
  expect(lines[3]).toBe(SEP_LINE);
  const sepMatches = lines.filter((l) => l === SEP_LINE).length;
  expect(sepMatches).toBeGreaterThanOrEqual(expectFootnote ? 3 : 2);
  if (!expectFootnote) {
    expect(lines[lines.length - 1]).not.toBe(SEP_LINE);
  }
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
    expect(out).toContain(
      "Avg context precision: % of repo content automatically filtered per context build.",
    );
    expect(out).toContain("Context window used: % of token budget filled.");
  });

  it("status_table_standard_layout_and_idle_hero", () => {
    const clock = new SystemClock();
    const out = formatStatusTable(
      { ...baseStatusPayload, installationOk: true, projectEnabled: true },
      clock,
    );
    assertStandardReportLayout(out);
    expect(out).toContain("No compilation aggregates yet for this project.");
  });

  it("status_table_hero_cites_build_metrics", () => {
    const clock = new SystemClock();
    const out = formatStatusTable(
      {
        ...baseStatusPayload,
        compilationsTotal: 12,
        totalTokensRaw: 48_000,
        totalTokensCompiled: 800,
        cacheHitRatePct: 33.3,
        avgReductionPct: 55.5,
        installationOk: true,
        projectEnabled: true,
      },
      clock,
    );
    assertStandardReportLayout(out);
    expect(out).toContain("AIC optimised context across");
    expect(out).toContain("12");
    expect(out).toContain("33.3%");
    expect(out).toContain("55.5%");
    expect(out).not.toMatch(/across \d+ files/);
  });
});

function minimalChatSummary(
  overrides: Partial<ConversationSummary>,
): ConversationSummary {
  return {
    conversationId: "018f0000-0000-7000-8000-00000000c001",
    projectRoot: "/tmp/aic-chat-proj",
    compilationsInConversation: 0,
    cacheHitRatePct: null,
    avgReductionPct: null,
    totalTokensRaw: 0,
    totalTokensCompiled: 0,
    totalTokensSaved: null,
    lastCompilationInConversation: null,
    topTaskClasses: [],
    ...overrides,
  };
}

describe("formatLastTable", () => {
  it("last_table_cache_hit_zero_files_hero", () => {
    const clock = fixedClock("2026-03-02T12:00:00.000Z");
    const out = formatLastTable(
      {
        compilationCount: 1,
        lastCompilation: {
          intent: "probe",
          filesSelected: 0,
          filesTotal: 200,
          tokensCompiled: 250,
          tokenReductionPct: 0,
          created_at: "2026-03-02T11:00:00.000Z",
          editorId: "cursor",
          cacheHit: true,
        },
        promptSummary: { tokenCount: null, guardPassed: null },
      },
      clock,
      5_000,
    );
    assertStandardReportLayout(out);
    expect(out).toContain("AIC served this compilation from cache");
    expect(out).toContain("5.0% of budget used");
  });
});

describe("formatChatSummaryTable", () => {
  it("chat_summary_zero_compilations_idle_hero", () => {
    const clock = fixedClock("2026-03-02T12:00:00.000Z");
    const out = formatChatSummaryTable(minimalChatSummary({}), clock);
    assertStandardReportLayout(out);
    expect(out).toContain("No compilations recorded for this conversation yet.");
  });
});

describe("formatProjectsTable", () => {
  it("projects_empty_standard_layout", () => {
    const clock = fixedClock("2026-03-02T12:00:00.000Z");
    const out = formatProjectsTable([], clock);
    assertStandardReportLayout(out, { footnote: false });
    expect(out).toContain("No projects registered yet.");
    expect(out).not.toContain("Columns use fixed widths; MCP JSON lists full paths.");
  });

  it("projects_roster_truncates_path_with_column_gaps", () => {
    const clock = fixedClock("2026-03-02T12:00:00.000Z");
    const longRoot = `${"/tmp/".repeat(20)}project`;
    const projects: readonly ProjectListItem[] = [
      {
        projectId: toProjectId("018f0000-0000-7000-8000-00000000ab01"),
        projectRoot: toAbsolutePath(longRoot),
        lastSeenAt: "2026-03-02T10:00:00.000Z",
        compilationCount: 3,
      },
    ];
    const out = formatProjectsTable(projects, clock);
    assertStandardReportLayout(out, { footnote: false });
    expect(out).toContain("  ");
    expect(out).toContain("1 project(s); 3 compilations");
  });
});

function fixedClock(iso: string): Clock {
  const ts = toISOTimestamp(iso);
  return {
    now(): ReturnType<Clock["now"]> {
      return ts;
    },
    addMinutes(): ReturnType<Clock["addMinutes"]> {
      return ts;
    },
    durationMs(): ReturnType<Clock["durationMs"]> {
      return toMilliseconds(0);
    },
  };
}

function emptyTaskStratum(): Record<string, unknown> {
  return {
    compilations: 0,
    medianTokenReduction: 0,
    medianSelectionRatio: 0,
    medianBudgetUtilisation: 0,
    cacheHitRate: 0,
  };
}

function sparkValueFromQualityOutput(out: string): string {
  const needle = "Daily compilations";
  const idx = out.indexOf(needle);
  if (idx < 0) {
    return "";
  }
  const lineEnd = out.indexOf("\n", idx);
  const line = lineEnd < 0 ? out.slice(idx) : out.slice(idx, lineEnd);
  const parts = line.split("  ");
  const last = parts[parts.length - 1];
  return last === undefined ? "" : last.trimEnd();
}

function tierAllFull(): Record<string, number> {
  return { l0: 1, l1: 0, l2: 0, l3: 0 };
}

function baseByTaskClassOneRefactor(): Record<string, unknown> {
  return {
    [TASK_CLASS.REFACTOR]: {
      compilations: 1,
      medianTokenReduction: 0.5,
      medianSelectionRatio: 0.5,
      medianBudgetUtilisation: 0.5,
      cacheHitRate: 0,
    },
    [TASK_CLASS.BUGFIX]: emptyTaskStratum(),
    [TASK_CLASS.FEATURE]: emptyTaskStratum(),
    [TASK_CLASS.DOCS]: emptyTaskStratum(),
    [TASK_CLASS.TEST]: emptyTaskStratum(),
    [TASK_CLASS.GENERAL]: emptyTaskStratum(),
  };
}

describe("formatQualityReportLines", () => {
  it("format_quality_empty_state", () => {
    const clock = fixedClock("2026-03-02T12:00:00.000Z");
    const out = formatQualityReportLines(
      {
        windowDays: 7,
        compilations: 0,
        medianTokenReduction: 0,
        medianSelectionRatio: 0,
        medianBudgetUtilisation: 0,
        cacheHitRate: 0,
        tierDistribution: null,
        byTaskClass: null,
        classifierConfidence: null,
        seriesDaily: [],
      },
      clock,
    );
    expect(out).toContain(
      "No compilations in this window. Send a coding message and try again.",
    );
    assertStandardReportLayout(out);
    expect(out).toContain("Context precision  % of repo content automatically filtered");
    expect(out).not.toMatch(/\nTier mix\n/);
    expect(out).not.toMatch(/Task class mix\s+count\s+share\s+budget/);
    expect(out).not.toContain("Daily compilations");
  });

  it("format_quality_hero_and_task_class_header", () => {
    const clock = fixedClock("2026-03-02T12:00:00.000Z");
    const out = formatQualityReportLines(
      {
        windowDays: 7,
        compilations: 1,
        medianTokenReduction: 0.25,
        medianSelectionRatio: 0.4,
        medianBudgetUtilisation: 0.55,
        cacheHitRate: 0.5,
        tierDistribution: tierAllFull(),
        byTaskClass: baseByTaskClassOneRefactor(),
        classifierConfidence: { available: false },
        seriesDaily: [
          {
            day: "2026-03-02",
            compilations: 1,
            medianTokenReduction: 0.25,
            medianSelectionRatio: 0.4,
            medianBudgetUtilisation: 0.55,
            cacheHitRate: 0.5,
          },
        ],
      },
      clock,
    );
    assertStandardReportLayout(out);
    expect(out).toMatch(
      /AIC optimised context by intent across \d+ compilations in the last \d+ days \(median \d+\.\d% filtered, \d+\.\d% cache hit rate\)\./,
    );
    const lines = out.split("\n");
    const heroIdx = lines.findIndex((l) => l.includes("AIC optimised context"));
    expect(heroIdx).toBeGreaterThan(0);
    expect(lines[heroIdx - 1]).toContain("─");
    expect(lines[heroIdx + 1]).toContain("─");
    expect(out).toMatch(/Task class mix\s+count\s+share\s+budget/);
    expect(out).toContain("Median context precision");
    expect(out).not.toContain("Median token reduction");
  });

  it("format_quality_task_class_budget_em_dash", () => {
    const clock = fixedClock("2026-03-02T12:00:00.000Z");
    const out = formatQualityReportLines(
      {
        windowDays: 7,
        compilations: 1,
        medianTokenReduction: 0.5,
        medianSelectionRatio: 0.5,
        medianBudgetUtilisation: 0.5,
        cacheHitRate: 0.5,
        tierDistribution: tierAllFull(),
        byTaskClass: baseByTaskClassOneRefactor(),
        classifierConfidence: { available: false },
        seriesDaily: [
          {
            day: "2026-03-02",
            compilations: 1,
            medianTokenReduction: 0.5,
            medianSelectionRatio: 0.5,
            medianBudgetUtilisation: 0.5,
            cacheHitRate: 0.5,
          },
        ],
      },
      clock,
    );
    expect(out).toMatch(/docs\s+\s*0\s+0\.0%\s+—/);
  });

  it("format_quality_sparkline_all_zeros", () => {
    const clock = fixedClock("2026-03-04T12:00:00.000Z");
    const out = formatQualityReportLines(
      {
        windowDays: 3,
        compilations: 1,
        medianTokenReduction: 0.5,
        medianSelectionRatio: 0.5,
        medianBudgetUtilisation: 0.5,
        cacheHitRate: 0.5,
        tierDistribution: tierAllFull(),
        byTaskClass: baseByTaskClassOneRefactor(),
        classifierConfidence: { available: false },
        seriesDaily: [],
      },
      clock,
    );
    const spark = sparkValueFromQualityOutput(out);
    expect(spark).toBe("···");
  });

  it("format_quality_sparkline_single_nonzero", () => {
    const clock = fixedClock("2026-03-04T12:00:00.000Z");
    const out = formatQualityReportLines(
      {
        windowDays: 3,
        compilations: 1,
        medianTokenReduction: 0.5,
        medianSelectionRatio: 0.5,
        medianBudgetUtilisation: 0.5,
        cacheHitRate: 0.5,
        tierDistribution: tierAllFull(),
        byTaskClass: baseByTaskClassOneRefactor(),
        classifierConfidence: { available: false },
        seriesDaily: [
          {
            day: "2026-03-04",
            compilations: 9,
            medianTokenReduction: 0.5,
            medianSelectionRatio: 0.5,
            medianBudgetUtilisation: 0.5,
            cacheHitRate: 0.5,
          },
        ],
      },
      clock,
    );
    const spark = sparkValueFromQualityOutput(out);
    expect(spark).toBe("▁▁█");
  });

  it("format_quality_sparkline_strictly_ascending", () => {
    const clock = fixedClock("2026-03-05T12:00:00.000Z");
    const days = ["2026-03-03", "2026-03-04", "2026-03-05"];
    const counts = [1, 2, 3];
    const out = formatQualityReportLines(
      {
        windowDays: 3,
        compilations: 6,
        medianTokenReduction: 0.5,
        medianSelectionRatio: 0.5,
        medianBudgetUtilisation: 0.5,
        cacheHitRate: 0.5,
        tierDistribution: tierAllFull(),
        byTaskClass: {
          [TASK_CLASS.REFACTOR]: {
            compilations: 6,
            medianTokenReduction: 0.5,
            medianSelectionRatio: 0.5,
            medianBudgetUtilisation: 0.5,
            cacheHitRate: 0,
          },
          [TASK_CLASS.BUGFIX]: emptyTaskStratum(),
          [TASK_CLASS.FEATURE]: emptyTaskStratum(),
          [TASK_CLASS.DOCS]: emptyTaskStratum(),
          [TASK_CLASS.TEST]: emptyTaskStratum(),
          [TASK_CLASS.GENERAL]: emptyTaskStratum(),
        },
        classifierConfidence: { available: false },
        seriesDaily: days.map((day, i) => ({
          day,
          compilations: counts[i] ?? 0,
          medianTokenReduction: 0.5,
          medianSelectionRatio: 0.5,
          medianBudgetUtilisation: 0.5,
          cacheHitRate: 0.5,
        })),
      },
      clock,
    );
    const spark = sparkValueFromQualityOutput(out);
    const order = "▁▂▃▄▅▆▇█";
    const indices = [...spark].map((ch) => order.indexOf(ch));
    expect(indices.every((n) => n >= 0)).toBe(true);
    const sorted = indices.toSorted((a, b) => a - b);
    expect(indices).toEqual(sorted);
    expect(new Set(indices).size).toBe(indices.length);
  });

  it("format_quality_sparkline_strictly_descending", () => {
    const clock = fixedClock("2026-03-05T12:00:00.000Z");
    const days = ["2026-03-03", "2026-03-04", "2026-03-05"];
    const counts = [9, 4, 1];
    const out = formatQualityReportLines(
      {
        windowDays: 3,
        compilations: 14,
        medianTokenReduction: 0.5,
        medianSelectionRatio: 0.5,
        medianBudgetUtilisation: 0.5,
        cacheHitRate: 0.5,
        tierDistribution: tierAllFull(),
        byTaskClass: {
          [TASK_CLASS.REFACTOR]: {
            compilations: 14,
            medianTokenReduction: 0.5,
            medianSelectionRatio: 0.5,
            medianBudgetUtilisation: 0.5,
            cacheHitRate: 0,
          },
          [TASK_CLASS.BUGFIX]: emptyTaskStratum(),
          [TASK_CLASS.FEATURE]: emptyTaskStratum(),
          [TASK_CLASS.DOCS]: emptyTaskStratum(),
          [TASK_CLASS.TEST]: emptyTaskStratum(),
          [TASK_CLASS.GENERAL]: emptyTaskStratum(),
        },
        classifierConfidence: { available: false },
        seriesDaily: days.map((day, i) => ({
          day,
          compilations: counts[i] ?? 0,
          medianTokenReduction: 0.5,
          medianSelectionRatio: 0.5,
          medianBudgetUtilisation: 0.5,
          cacheHitRate: 0.5,
        })),
      },
      clock,
    );
    const spark = sparkValueFromQualityOutput(out);
    const order = "▁▂▃▄▅▆▇█";
    const indices = [...spark].map((ch) => order.indexOf(ch));
    const sorted = indices.toSorted((a, b) => b - a);
    expect(indices).toEqual(sorted);
    expect(new Set(indices).size).toBe(indices.length);
  });

  it("format_quality_weekday_row_frozen_clock", () => {
    const clock = fixedClock("2026-03-02T12:00:00.000Z");
    const out = formatQualityReportLines(
      {
        windowDays: 1,
        compilations: 1,
        medianTokenReduction: 0.5,
        medianSelectionRatio: 0.5,
        medianBudgetUtilisation: 0.5,
        cacheHitRate: 0.5,
        tierDistribution: tierAllFull(),
        byTaskClass: baseByTaskClassOneRefactor(),
        classifierConfidence: { available: false },
        seriesDaily: [
          {
            day: "2026-03-02",
            compilations: 1,
            medianTokenReduction: 0.5,
            medianSelectionRatio: 0.5,
            medianBudgetUtilisation: 0.5,
            cacheHitRate: 0.5,
          },
        ],
      },
      clock,
    );
    const lines = out.split("\n");
    const dIdx = lines.findIndex((l) => l.includes("Daily compilations"));
    expect(dIdx).toBeGreaterThanOrEqual(0);
    const next = lines[dIdx + 1];
    expect(next === undefined ? "" : next.trimEnd().endsWith("Mon")).toBe(true);
  });

  it("format_quality_single_sep_before_footer", () => {
    const clock = fixedClock("2026-03-02T12:00:00.000Z");
    const out = formatQualityReportLines(
      {
        windowDays: 1,
        compilations: 1,
        medianTokenReduction: 0.5,
        medianSelectionRatio: 0.5,
        medianBudgetUtilisation: 0.5,
        cacheHitRate: 0.5,
        tierDistribution: tierAllFull(),
        byTaskClass: baseByTaskClassOneRefactor(),
        classifierConfidence: { available: false },
        seriesDaily: [
          {
            day: "2026-03-02",
            compilations: 1,
            medianTokenReduction: 0.5,
            medianSelectionRatio: 0.5,
            medianBudgetUtilisation: 0.5,
            cacheHitRate: 0.5,
          },
        ],
      },
      clock,
    );
    const lines = out.split("\n");
    const footnoteIdx = lines.findIndex((l) => l.startsWith("Context precision"));
    expect(footnoteIdx).toBeGreaterThan(0);
    const prev = lines[footnoteIdx - 1] ?? "";
    const prevPrev = lines[footnoteIdx - 2] ?? "";
    expect(prev.includes("─")).toBe(true);
    expect(prevPrev.includes("─")).toBe(false);
  });
});
