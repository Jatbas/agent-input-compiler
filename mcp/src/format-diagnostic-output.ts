// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import { TASK_CLASS } from "@jatbas/aic-core/core/types/enums.js";
import {
  STATUS_TIME_RANGE_DAYS_MAX,
  type ConversationSummary,
  type ProjectListItem,
} from "@jatbas/aic-core/core/types/status-types.js";
import { toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import type { SelectionTraceParsed } from "./schemas/selection-trace.schema.js";

const METRIC_FOOTNOTE =
  "Avg context precision: % of repo content automatically filtered per context build.";

const STATUS_METRIC_FOOTNOTE = `${METRIC_FOOTNOTE}\nContext window used: % of token budget filled.`;

const LAST_METRIC_FOOTNOTE = "Context window used: % of token budget filled.";

const SEP =
  "──────────────────────────────────────────────────────────────────────────────";

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

function cacheHitLabel(hit: unknown): string {
  if (hit === true) return "hit";
  if (hit === false) return "miss";
  return "—";
}

function guardThisRunLabel(findingCount: unknown, blockCount: unknown): string | null {
  if (findingCount === null || findingCount === undefined) return null;
  const findings = Number(findingCount);
  if (!Number.isFinite(findings)) return null;
  if (findings === 0) return "passed";
  const blocks = Number.isFinite(Number(blockCount)) ? Number(blockCount) : 0;
  return `${formatInt(findings)} finding(s), ${formatInt(blocks)} blocked`;
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

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  return formatInt(n);
}

function formatTokensWithRatio(raw: number, compiled: number): string {
  const ratio = compiled > 0 ? Math.round(raw / compiled) : null;
  const base = `${formatCompact(raw)} → ${formatCompact(compiled)}`;
  return ratio !== null && ratio > 1 ? `${base} (${formatInt(ratio)}:1 ratio)` : base;
}

function heroLine(
  avgReductionPct: number | null | undefined,
  last: Record<string, unknown> | null | undefined,
): string | null {
  if (avgReductionPct === null || avgReductionPct === undefined) return null;
  const fs_ =
    last !== null && last !== undefined ? Number(last["filesSelected"] ?? 0) : null;
  const ft = last !== null && last !== undefined ? Number(last["filesTotal"] ?? 0) : null;
  if (ft === null || ft === 0) return null;
  const lastRunPart =
    fs_ !== null && fs_ > 0 ? ` Last run: ${formatInt(fs_)} forwarded.` : "";
  return `AIC optimised context by intent across ${formatInt(ft)} files.${lastRunPart}`;
}

function heroLineLast(
  last: Record<string, unknown> | null,
  budgetMaxTokens: number,
): string | null {
  if (last === null) return null;
  const fs_ = Number(last["filesSelected"] ?? 0);
  const ft = Number(last["filesTotal"] ?? 0);
  if (fs_ === 0) return null;
  const compiled = Number(last["tokensCompiled"] ?? 0);
  const budgetPct = budgetMaxTokens > 0 ? (compiled / budgetMaxTokens) * 100 : null;
  const exclusionRate =
    last["tokenReductionPct"] !== null && last["tokenReductionPct"] !== undefined
      ? Number(last["tokenReductionPct"])
      : null;
  const details = [
    budgetPct !== null ? `${budgetPct.toFixed(1)}% of budget` : null,
    exclusionRate !== null ? `${exclusionRate.toFixed(1)}% excluded` : null,
  ].filter((s): s is string => s !== null);
  const detailStr = details.length > 0 ? ` (${details.join(", ")})` : "";
  return `AIC optimised context by intent: ${formatInt(fs_)} of ${formatInt(ft)} files forwarded${detailStr}.`;
}

function heroLineChat(row: ConversationSummary): string | null {
  const {
    totalTokensRaw: raw,
    totalTokensCompiled: compiled,
    compilationsInConversation: count,
  } = row;
  if (count === 0 || compiled === 0) return null;
  const ratio = Math.round(raw / compiled);
  const parenParts = [
    ratio > 1 ? `${formatInt(ratio)}:1 ratio` : null,
    row.cacheHitRatePct !== null
      ? `${row.cacheHitRatePct.toFixed(1)}% cache hit rate`
      : null,
  ].filter((s): s is string => s !== null);
  const paren = parenParts.length > 0 ? ` (${parenParts.join(", ")})` : "";
  return `AIC optimised context by intent across ${formatInt(count)} compilations${paren}.`;
}

function truncatePath(path: string, maxLen: number): string {
  if (path.length <= maxLen) return path;
  return `…${path.slice(-(maxLen - 1))}`;
}

function formatSelectionMicroBlock(
  selection: SelectionTraceParsed,
  w: number,
): readonly string[] {
  const TOP_N = 3;
  const sorted = [...selection.selectedFiles].sort((a, b) => b.score - a.score);
  const topFiles = sorted.slice(0, TOP_N);
  const overflow = sorted.length - TOP_N;
  const fileStrs = topFiles.map(
    (f) => `${truncatePath(f.path, 40)} (${f.score.toFixed(2)})`,
  );
  const filesStr =
    overflow > 0 ? `${fileStrs.join(", ")} (+${overflow} more)` : fileStrs.join(", ");

  const reasonCounts: Record<string, number> = {};
  for (const f of selection.excludedFiles) {
    reasonCounts[f.reason] = (reasonCounts[f.reason] ?? 0) + 1;
  }
  const reasonEntries = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]);
  const topReasons = reasonEntries.slice(0, TOP_N);
  const excludedOverflow = reasonEntries.length - TOP_N;
  const excludedBase =
    topReasons.length === 0
      ? "none"
      : topReasons.map(([r, c]) => `${r} (${formatInt(c)})`).join(", ");
  const excludedSuffix = excludedOverflow > 0 ? ` (+${excludedOverflow} more)` : "";
  const excludedStr = `${excludedBase}${excludedSuffix}`;

  return [
    padRow("Top files", filesStr.length > 0 ? filesStr : "—", w),
    padRow("Excluded by", excludedStr, w),
  ];
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
  const w = 30;
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
  const hero = heroLine(payload["avgReductionPct"] as number | null | undefined, last);
  const heroRows: readonly string[] = hero !== null ? [SEP, hero, SEP] : [SEP];
  const rows: readonly string[] = [
    "Status = project-level AIC status.",
    ...heroRows,
    ...timeRangeRows,
    padRow(
      "Context builds (total)",
      formatInt(Number(payload["compilationsTotal"] ?? 0)),
      w,
    ),
    padRow(
      "Context builds (today)",
      formatInt(Number(payload["compilationsToday"] ?? 0)),
      w,
    ),
    padRow(
      "Repo size → context sent",
      formatTokensWithRatio(
        Number(payload["totalTokensRaw"] ?? 0),
        Number(payload["totalTokensCompiled"] ?? 0),
      ),
      w,
    ),
    padRow("Tokens excluded", tokensExcludedLabel(payload["totalTokensSaved"]), w),
    padRow(
      "Context window used (last run)",
      formatPct1(payload["budgetUtilizationPct"] as number | null),
      w,
    ),
    padRow("Cache hit rate", formatPct1(payload["cacheHitRatePct"] as number | null), w),
    padRow(
      "Avg context precision",
      formatPct1(payload["avgReductionPct"] as number | null),
      w,
    ),
    padRow("Guard scans (lifetime)", guardByTypeStr(payload["guardByType"]), w),
    padRow("Top request types", topTaskStr(payload["topTaskClasses"]), w),
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
  return `${rows.join("\n")}\n${SEP}\n${STATUS_METRIC_FOOTNOTE}\n`;
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
    padRow("Context window used", formatPct1(budgetPct), w),
    padRow("Compiled", relIso(clock, String(last["created_at"] ?? "")), w),
    padRow("Editor", String(last["editorId"] ?? "—"), w),
  ];
}

const LAST_EMPTY_DETAIL: readonly string[] = [
  "Intent",
  "Files",
  "Tokens compiled",
  "Context window used",
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
    readonly selection?: SelectionTraceParsed | null;
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
  const cacheHit = last?.["cacheHit"];
  const cacheStr = cacheHitLabel(cacheHit);
  const guardLabel = guardThisRunLabel(
    last?.["guardFindingCount"],
    last?.["guardBlockCount"],
  );
  const guardRow: readonly string[] =
    guardLabel !== null ? [padRow("Guard (this run)", guardLabel, w)] : [];
  const selectionRows: readonly string[] =
    payload.selection !== null && payload.selection !== undefined
      ? formatSelectionMicroBlock(payload.selection, w)
      : [];
  const hero = heroLineLast(last, budgetMaxTokens);
  const heroRows: readonly string[] = hero !== null ? [SEP, hero, SEP] : [SEP];
  const rows: readonly string[] = [
    "Last = most recent compilation.",
    ...heroRows,
    padRow("Context builds", formatInt(payload.compilationCount), w),
    ...detailRows,
    padRow("Cache", cacheStr, w),
    ...guardRow,
    ...selectionRows,
    promptRow,
  ];
  return `${rows.join("\n")}\n${SEP}\n${LAST_METRIC_FOOTNOTE}\n`;
}

export function formatChatSummaryTable(row: ConversationSummary, clock: Clock): string {
  const w = 30;
  const last = row.lastCompilationInConversation;
  const lastLine =
    last === null ? "—" : `${last.intent} · ${relIso(clock, last.created_at)}`;
  const hero = heroLineChat(row);
  const heroRows: readonly string[] = hero !== null ? [SEP, hero, SEP] : [SEP];
  const rows: readonly string[] = [
    "Chat = this conversation's AIC compilations.",
    ...heroRows,
    padRow("Project path", row.projectRoot.length > 0 ? row.projectRoot : "—", w),
    padRow("Context builds", formatInt(row.compilationsInConversation), w),
    padRow(
      "Repo size → context sent",
      formatTokensWithRatio(row.totalTokensRaw, row.totalTokensCompiled),
      w,
    ),
    padRow(
      "Tokens excluded",
      row.totalTokensSaved === null ? "—" : formatCompact(row.totalTokensSaved),
      w,
    ),
    padRow("Cache hit rate", formatPct1(row.cacheHitRatePct), w),
    padRow("Avg context precision", formatPct1(row.avgReductionPct), w),
    padRow("Last compilation", lastLine, w),
    padRow("Top request types", topTaskStr(row.topTaskClasses), w),
  ];
  return `${rows.join("\n")}\n${SEP}\n${METRIC_FOOTNOTE}\n`;
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

function qualityPayloadNumber(payload: Record<string, unknown>, key: string): number {
  const v = payload[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function qualityTierMixLine(tier: unknown): string {
  if (tier === null || typeof tier !== "object" || Array.isArray(tier)) {
    return "tier mix · L0 — · L1 — · L2 — · L3 —";
  }
  const r = tier as Record<string, unknown>;
  const seg = (k: string): string =>
    `L${k.slice(1)} ${formatPct1(qualityPayloadNumber(r, k) * 100)}`;
  return `tier mix · ${seg("l0")} · ${seg("l1")} · ${seg("l2")} · ${seg("l3")}`;
}

function qualityByClassLine(byTaskClass: unknown): string {
  if (
    byTaskClass === null ||
    typeof byTaskClass !== "object" ||
    Array.isArray(byTaskClass)
  ) {
    return "by class · —";
  }
  const rec = byTaskClass as Record<string, unknown>;
  const parts = (Object.values(TASK_CLASS) as readonly string[]).map((tc) => {
    const cell = rec[tc];
    if (cell === null || typeof cell !== "object" || Array.isArray(cell)) {
      return `${tc} 0`;
    }
    const c = Math.round(
      qualityPayloadNumber(cell as Record<string, unknown>, "compilations"),
    );
    return `${tc} ${String(c)}`;
  });
  return `by class · ${parts.join(" · ")}`;
}

export function formatQualityReportLines(
  payload: Record<string, unknown>,
  clock: Clock,
): string {
  void clock;
  const windowDays = Math.round(qualityPayloadNumber(payload, "windowDays"));
  const compilations = Math.round(qualityPayloadNumber(payload, "compilations"));
  const mTr = qualityPayloadNumber(payload, "medianTokenReduction");
  const mSel = qualityPayloadNumber(payload, "medianSelectionRatio");
  const mBu = qualityPayloadNumber(payload, "medianBudgetUtilisation");
  const cacheHit = qualityPayloadNumber(payload, "cacheHitRate");
  const base: readonly string[] = [
    `window=${String(windowDays)}d · ${formatInt(compilations)} compilations`,
    `median · token ${formatPct1(mTr * 100)} · selection ${formatPct1(mSel * 100)} · budget ${formatPct1(mBu * 100)}`,
    `cache hit ${formatPct1(cacheHit * 100)}`,
    qualityTierMixLine(payload["tierDistribution"]),
    qualityByClassLine(payload["byTaskClass"]),
  ];
  const cc = payload["classifierConfidence"];
  const withClassifier: readonly string[] =
    cc !== null &&
    typeof cc === "object" &&
    !Array.isArray(cc) &&
    (cc as Record<string, unknown>)["available"] === true
      ? [
          ...base,
          `classifier · mean ${formatPct1(qualityPayloadNumber(cc as Record<string, unknown>, "mean") * 100)}`,
        ]
      : base;
  return `${withClassifier.join("\n")}\n`;
}
