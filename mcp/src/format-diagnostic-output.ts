// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import {
  STATUS_TIME_RANGE_DAYS_MAX,
  type ConversationSummary,
  type ProjectListItem,
} from "@jatbas/aic-core/core/types/status-types.js";
import { toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";

const METRIC_FOOTNOTE =
  "Exclusion rate: % of total repo tokens not included in the compiled prompt.\nBudget utilization: % of token budget filled.";

function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

function formatPct1(p: number | null | undefined): string {
  if (p === null || p === undefined) return "—";
  return `${p.toFixed(1)}%`;
}

function relIso(clock: Clock, iso: string): string {
  const ms = clock.durationMs(toISOTimestamp(iso), clock.now());
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec} sec ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  return `${day} days ago`;
}

function padRow(label: string, value: string, width: number): string {
  return `${label.padEnd(width, " ")}  ${value}`;
}

function statusTimeRangeValue(n: number): string {
  if (n === 1) {
    return "Last 1 day";
  }
  return `Last ${String(n)} days`;
}

function guardByTypeStr(v: unknown): string {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return "None";
  const entries = Object.entries(v as Record<string, number>);
  if (entries.length === 0) return "None";
  return entries.map(([k, c]) => `${k}: ${formatInt(c)}`).join(", ");
}

function installationLabel(instOk: unknown): string {
  if (instOk === true) return "OK";
  if (instOk === false) return "Issues detected";
  return "—";
}

function tokensExcludedLabel(saved: unknown): string {
  if (saved === null || saved === undefined) return "—";
  return formatInt(Number(saved));
}

function topTaskStr(v: unknown): string {
  if (!Array.isArray(v) || v.length === 0) return "—";
  return v
    .map((row) => {
      if (row === null || typeof row !== "object") return "";
      const r = row as { taskClass?: string; count?: number };
      const tc = r.taskClass ?? "";
      const c = r.count ?? 0;
      return `${tc} (${formatInt(c)})`;
    })
    .filter((s) => s.length > 0)
    .join(", ");
}

function lastCompilationSummary(
  clock: Clock,
  last: Record<string, unknown> | null | undefined,
): string {
  if (last === null || last === undefined) return "—";
  const intent = String(last["intent"] ?? "");
  const fs_ = formatInt(Number(last["filesSelected"] ?? 0));
  const ft = formatInt(Number(last["filesTotal"] ?? 0));
  const tok = formatInt(Number(last["tokensCompiled"] ?? 0));
  const when = relIso(clock, String(last["created_at"] ?? ""));
  return `${intent} · ${fs_} / ${ft} files · ${tok} tokens · ${when}`;
}

export function formatStatusTable(
  payload: Record<string, unknown>,
  clock: Clock,
): string {
  const w = 28;
  const last = payload["lastCompilation"] as Record<string, unknown> | null | undefined;
  const notes = payload["installationNotes"];
  const instOk = payload["installationOk"];
  const notesRows =
    instOk === false && typeof notes === "string" && notes.length > 0
      ? [padRow("Notes", notes, w)]
      : ([] as readonly string[]);
  const n = payload["timeRangeDays"];
  const timeRangeRows: readonly string[] =
    typeof n === "number" &&
    Number.isInteger(n) &&
    n >= 1 &&
    n <= STATUS_TIME_RANGE_DAYS_MAX
      ? [padRow("Time range", statusTimeRangeValue(n), w)]
      : [];
  const rows: readonly string[] = [
    "Status = project-level AIC status.",
    ...timeRangeRows,
    padRow(
      "Compilations (total)",
      formatInt(Number(payload["compilationsTotal"] ?? 0)),
      w,
    ),
    padRow(
      "Compilations (today)",
      formatInt(Number(payload["compilationsToday"] ?? 0)),
      w,
    ),
    padRow(
      "Tokens: raw → compiled",
      `${formatInt(Number(payload["totalTokensRaw"] ?? 0))} → ${formatInt(Number(payload["totalTokensCompiled"] ?? 0))}`,
      w,
    ),
    padRow("Tokens excluded", tokensExcludedLabel(payload["totalTokensSaved"]), w),
    padRow("Budget limit", formatInt(Number(payload["budgetMaxTokens"] ?? 0)), w),
    padRow(
      "Budget utilization",
      formatPct1(payload["budgetUtilizationPct"] as number | null),
      w,
    ),
    padRow("Cache hit rate", formatPct1(payload["cacheHitRatePct"] as number | null), w),
    padRow(
      "Avg exclusion rate",
      formatPct1(payload["avgReductionPct"] as number | null),
      w,
    ),
    padRow("Guard findings", guardByTypeStr(payload["guardByType"]), w),
    padRow("Top task classes", topTaskStr(payload["topTaskClasses"]), w),
    padRow("Last compilation", lastCompilationSummary(clock, last), w),
    padRow("Installation", installationLabel(payload["installationOk"]), w),
    ...notesRows,
    padRow(
      "Update available",
      payload["updateAvailable"] === null || payload["updateAvailable"] === undefined
        ? "—"
        : String(payload["updateAvailable"]),
      w,
    ),
  ];
  return `${rows.join("\n")}\n\n${METRIC_FOOTNOTE}\n`;
}

function lastRowsWhenPresent(
  last: Record<string, unknown>,
  clock: Clock,
  w: number,
  budgetMaxTokens: number,
): readonly string[] {
  const fs_ = Number(last["filesSelected"] ?? 0);
  const ft = Number(last["filesTotal"] ?? 0);
  const compiled = Number(last["tokensCompiled"] ?? 0);
  const budgetPct = budgetMaxTokens > 0 ? (compiled / budgetMaxTokens) * 100 : null;
  return [
    padRow("Intent", String(last["intent"] ?? "—"), w),
    padRow("Files", `${formatInt(fs_)} selected / ${formatInt(ft)} total`, w),
    padRow("Tokens compiled", formatInt(compiled), w),
    padRow("Budget utilization", formatPct1(budgetPct), w),
    padRow("Exclusion rate", formatPct1(Number(last["tokenReductionPct"] ?? 0)), w),
    padRow("Compiled", relIso(clock, String(last["created_at"] ?? "")), w),
    padRow("Editor", String(last["editorId"] ?? "—"), w),
  ];
}

const LAST_EMPTY_DETAIL: readonly string[] = [
  "Intent",
  "Files",
  "Tokens compiled",
  "Budget utilization",
  "Exclusion rate",
  "Compiled",
  "Editor",
].map((label) => padRow(label, "—", 22));

export function formatLastTable(
  payload: {
    readonly compilationCount: number;
    readonly lastCompilation: Record<string, unknown> | null;
    readonly promptSummary: {
      readonly tokenCount: number | null;
      readonly guardPassed: null;
    };
    readonly selection?: unknown;
  },
  clock: Clock,
  budgetMaxTokens: number,
): string {
  const w = 22;
  const last = payload.lastCompilation;
  const detailRows =
    last === null
      ? LAST_EMPTY_DETAIL
      : lastRowsWhenPresent(last, clock, w, budgetMaxTokens);
  const tc = payload.promptSummary.tokenCount;
  const promptRow = padRow(
    "Compiled prompt",
    tc === null
      ? "—"
      : `Available (${formatInt(tc)} tokens) — .aic/last-compiled-prompt.txt (project root)`,
    w,
  );
  const rows: readonly string[] = [
    "Last = most recent compilation.",
    padRow("Compilations", formatInt(payload.compilationCount), w),
    ...detailRows,
    padRow("Guard", "—", w),
    promptRow,
  ];
  return `${rows.join("\n")}\n\n${METRIC_FOOTNOTE}\n`;
}

export function formatChatSummaryTable(
  row: ConversationSummary,
  clock: Clock,
  budgetMaxTokens: number,
): string {
  const w = 30;
  const last = row.lastCompilationInConversation;
  const lastLine =
    last === null ? "—" : `${last.intent} · ${relIso(clock, last.created_at)}`;
  const budgetPct =
    last !== null && budgetMaxTokens > 0
      ? (last.tokensCompiled / budgetMaxTokens) * 100
      : null;
  const rows: readonly string[] = [
    "Chat = this conversation's AIC compilations.",
    padRow("Project path", row.projectRoot.length > 0 ? row.projectRoot : "—", w),
    padRow("Compilations", formatInt(row.compilationsInConversation), w),
    padRow("Tokens (raw)", formatInt(row.totalTokensRaw), w),
    padRow("Tokens (compiled)", formatInt(row.totalTokensCompiled), w),
    padRow(
      "Tokens excluded",
      row.totalTokensSaved === null ? "—" : formatInt(row.totalTokensSaved),
      w,
    ),
    padRow("Budget utilization", formatPct1(budgetPct), w),
    padRow("Cache hit rate", formatPct1(row.cacheHitRatePct), w),
    padRow("Avg exclusion rate", formatPct1(row.avgReductionPct), w),
    padRow("Last compilation", lastLine, w),
    padRow("Top task classes", topTaskStr(row.topTaskClasses), w),
  ];
  return `${rows.join("\n")}\n\n${METRIC_FOOTNOTE}\n`;
}

export function formatProjectsTable(
  projects: readonly ProjectListItem[],
  clock: Clock,
): string {
  const idW = 38;
  const pathW = 32;
  const seenW = 14;
  const cntW = 12;
  const header = `${"Project ID".padEnd(idW, " ")}${"Path".padEnd(pathW, " ")}${"Last seen".padEnd(seenW, " ")}${"Compilations".padEnd(cntW, " ")}`;
  const dataLines =
    projects.length === 0
      ? ([] as readonly string[])
      : projects.map(
          (p) =>
            `${String(p.projectId).padEnd(idW, " ")}${String(p.projectRoot).padEnd(pathW, " ")}${relIso(clock, p.lastSeenAt).padEnd(seenW, " ")}${formatInt(p.compilationCount).padEnd(cntW, " ")}`,
        );
  const body =
    projects.length === 0
      ? (["Projects = known AIC projects.", "(no projects)"] as const)
      : (["Projects = known AIC projects.", header, ...dataLines] as const);
  return `${body.join("\n")}\n`;
}
