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
import { decrementUtcCalendarDay, enumerateUtcDaysInclusive } from "./utc-calendar.js";

const METRIC_FOOTNOTE =
  "Context precision (weighted): % of repo content automatically filtered per context build.";

const STATUS_METRIC_FOOTNOTE = `${METRIC_FOOTNOTE}\nContext window used: % of token budget filled.`;

const STATUS_TABLE_LABEL_RAW_TO_SENT = "Cumulative raw → sent tokens";

const STATUS_HERO_CLAUSE_RAW_TO_SENT = "cumulative raw → sent tokens";

const LAST_METRIC_FOOTNOTE = "Context window used: % of token budget filled.";

const SEP =
  "──────────────────────────────────────────────────────────────────────────────";

function renderStandardReport(parts: {
  readonly title: string;
  readonly hero: string;
  readonly rows: readonly string[];
  readonly footnote?: string;
}): string {
  const heroLines = parts.hero.split("\n");
  const hasFootnote = parts.footnote !== undefined && parts.footnote.length > 0;
  const lines: readonly string[] = hasFootnote
    ? [parts.title, SEP, ...heroLines, SEP, ...parts.rows, SEP, parts.footnote]
    : [parts.title, SEP, ...heroLines, SEP, ...parts.rows];
  return `${lines.join("\n")}\n`;
}

function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

function formatPct1(p: number | null | undefined): string {
  if (p === null || p === undefined) return "—";
  return `${p.toFixed(1)}%`;
}

function formatCompileDurationMs(durationMs: number | null): string {
  if (durationMs === null) return "—";
  if (durationMs < 1000) return `${formatInt(durationMs)} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}

function formatElapsedDurationMs(durationMs: number | null): string {
  if (durationMs === null) return "—";
  const clampedMs = durationMs < 0 ? 0 : durationMs;
  const totalSeconds = Math.floor(clampedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours >= 1) {
    return `${formatInt(hours)}h ${formatInt(minutes)}m`;
  }
  return `${formatInt(minutes)}m ${formatInt(seconds)}s`;
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

function guardThisRunLabel(
  findingCount: unknown,
  filesBlockedCount: unknown,
  scannedFileCount: unknown,
): string | null {
  if (findingCount === null || findingCount === undefined) return null;
  const findings = Number(findingCount);
  if (!Number.isFinite(findings)) return null;
  if (findings === 0) return "passed";
  const blocks = Number.isFinite(Number(filesBlockedCount))
    ? Number(filesBlockedCount)
    : 0;
  const findingsStr =
    findings === 1 ? `${formatInt(findings)} finding` : `${formatInt(findings)} findings`;
  const blockedClause =
    blocks === 1
      ? `${formatInt(blocks)} file blocked`
      : `${formatInt(blocks)} files blocked`;
  const useLongForm = (() => {
    if (scannedFileCount === null || scannedFileCount === undefined) return false;
    const n = Number(scannedFileCount);
    return Number.isFinite(n) && n >= 0;
  })();
  if (!useLongForm) {
    return `${findingsStr} (${blockedClause})`;
  }
  const nScanned = Number(scannedFileCount);
  const fileWord = nScanned === 1 ? "file" : "files";
  return `${findingsStr} across ${formatInt(nScanned)} ${fileWord} (${blockedClause})`;
}

function tokensExcludedLabel(saved: unknown): string {
  if (saved === null || saved === undefined) return "—";
  return formatInt(Number(saved));
}

function topTaskRows(v: unknown, w: number): readonly string[] {
  if (!Array.isArray(v) || v.length === 0) {
    return [padRow("Top request types", "—", w)];
  }
  const rows = v
    .filter(
      (r): r is { taskClass: string; count: number } =>
        r !== null && typeof r === "object" && "taskClass" in r && "count" in r,
    )
    .map((r) => ({
      taskClass: String((r as { taskClass: string }).taskClass),
      count: Number((r as { count: number }).count),
    }));
  if (rows.length === 0) return [padRow("Top request types", "—", w)];
  const total = rows.reduce((acc, r) => acc + r.count, 0);
  const valueWidths = [5, 6] as const;
  const header = padMultiCol("Top request types", ["count", "share"], w, valueWidths);
  const dataRows = rows.map((r) => {
    const share = total > 0 ? (r.count / total) * 100 : 0;
    return padMultiCol(
      `  ${r.taskClass}`,
      [formatInt(r.count), formatPct1(share)],
      w,
      valueWidths,
    );
  });
  return [header, ...dataRows];
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

function statusHeroLine(payload: Record<string, unknown>): string {
  const compilationsTotal = Number(payload["compilationsTotal"] ?? 0);
  const totalTokensRaw = Number(payload["totalTokensRaw"] ?? 0);
  const totalTokensCompiled = Number(payload["totalTokensCompiled"] ?? 0);
  const cacheHitRatePct = payload["cacheHitRatePct"] as number | null | undefined;
  const avgReductionPct = payload["avgReductionPct"] as number | null | undefined;
  if (compilationsTotal === 0 && totalTokensRaw === 0 && totalTokensCompiled === 0) {
    return "No compilation aggregates yet for this project.";
  }
  const ratioPart = formatTokensWithRatio(totalTokensRaw, totalTokensCompiled);
  return `AIC optimised context across ${formatInt(compilationsTotal)} context builds; ${STATUS_HERO_CLAUSE_RAW_TO_SENT} ${ratioPart}; ${formatPct1(cacheHitRatePct)} cache hit rate; ${formatPct1(avgReductionPct)} context precision (weighted).`;
}

function lastCompilationForwardedHero(
  last: Record<string, unknown>,
  fs_: number,
  ft: number,
  compiled: number,
  budgetMaxTokens: number,
  budgetPct: number | null,
): string {
  const tokenReductionRaw =
    last["tokenReductionPct"] !== null && last["tokenReductionPct"] !== undefined
      ? Number(last["tokenReductionPct"])
      : null;
  const tokenReductionClause =
    tokenReductionRaw !== null && Number.isFinite(tokenReductionRaw)
      ? `token reduction ${tokenReductionRaw.toFixed(1)}% (raw to compiled)`
      : null;
  const budgetParen =
    budgetPct !== null && Number.isFinite(budgetPct)
      ? ` (${budgetPct.toFixed(1)}% of token budget)`
      : "";
  const tokenBlock = `tokens compiled ${formatInt(compiled)} of ${formatInt(budgetMaxTokens)} allocated${budgetParen}`;
  const clauses = [
    `files forwarded ${formatInt(fs_)} of ${formatInt(ft)}`,
    tokenBlock,
    ...(tokenReductionClause !== null ? [tokenReductionClause] : []),
  ];
  return `AIC optimised context by intent: ${clauses.join("; ")}.`;
}

function heroLineLast(
  last: Record<string, unknown> | null,
  budgetMaxTokens: number,
): string {
  if (last === null) {
    return "No compilation recorded for this workspace.";
  }
  const fs_ = Number(last["filesSelected"] ?? 0);
  const ft = Number(last["filesTotal"] ?? 0);
  const compiled = Number(last["tokensCompiled"] ?? 0);
  const budgetPct = budgetMaxTokens > 0 ? (compiled / budgetMaxTokens) * 100 : null;
  if (fs_ > 0) {
    return lastCompilationForwardedHero(
      last,
      fs_,
      ft,
      compiled,
      budgetMaxTokens,
      budgetPct,
    );
  }
  if (last["cacheHit"] === true && budgetMaxTokens > 0) {
    const cacheBudgetPct = (compiled / budgetMaxTokens) * 100;
    return `AIC served this compilation from cache — tokens compiled ${formatInt(compiled)} of ${formatInt(budgetMaxTokens)} allocated; ${cacheBudgetPct.toFixed(1)}% of token budget used.`;
  }
  if (budgetPct !== null && Number.isFinite(budgetPct)) {
    return `This compilation selected no files — ${budgetPct.toFixed(1)}% of budget used.`;
  }
  return "This compilation selected no files yet.";
}

function heroLineChat(row: ConversationSummary): string {
  const {
    totalTokensRaw: raw,
    totalTokensCompiled: compiled,
    compilationsInConversation: count,
  } = row;
  if (count === 0 || compiled === 0) {
    return "No compilations recorded for this conversation yet.";
  }
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
  labelWidth: number,
): string {
  if (last === null || last === undefined) return "—";
  const intent = String(last["intent"] ?? "");
  const fs_ = formatInt(Number(last["filesSelected"] ?? 0));
  const ft = formatInt(Number(last["filesTotal"] ?? 0));
  const tok = formatInt(Number(last["tokensCompiled"] ?? 0));
  const when = relIso(clock, String(last["created_at"] ?? ""));
  const stats = `${fs_} / ${ft} files · ${tok} tokens · ${when}`;
  const indent = " ".repeat(labelWidth + 2);
  return `${intent}\n${indent}${stats}`;
}

export function formatStatusTable(
  payload: Record<string, unknown>,
  clock: Clock,
): string {
  const w = 32;
  const last = payload["lastCompilation"] as Record<string, unknown> | null | undefined;
  const notes = payload["installationNotes"];
  const instOk = payload["installationOk"];
  const notesRows =
    instOk === false && typeof notes === "string" && notes.length > 0
      ? [padRow("Notes", notes, w)]
      : ([] as readonly string[]);
  const n = payload["timeRangeDays"];
  const hasStatusTimeWindow =
    typeof n === "number" &&
    Number.isInteger(n) &&
    n >= 1 &&
    n <= STATUS_TIME_RANGE_DAYS_MAX;
  const timeRangeRows: readonly string[] = hasStatusTimeWindow
    ? [padRow("Time range", statusTimeRangeValue(n), w)]
    : [];
  const bodyRows: readonly string[] = [
    ...timeRangeRows,
    padRow(
      "Context builds (total)",
      formatInt(Number(payload["compilationsTotal"] ?? 0)),
      w,
    ),
    padRow(
      "Context builds (today, UTC)",
      formatInt(Number(payload["compilationsToday"] ?? 0)),
      w,
    ),
    padRow(
      STATUS_TABLE_LABEL_RAW_TO_SENT,
      formatTokensWithRatio(
        Number(payload["totalTokensRaw"] ?? 0),
        Number(payload["totalTokensCompiled"] ?? 0),
      ),
      w,
    ),
    padRow("Tokens excluded", tokensExcludedLabel(payload["totalTokensSaved"]), w),
    SEP,
    padRow(
      "Context window used (last run)",
      formatPct1(payload["budgetUtilizationPct"] as number | null),
      w,
    ),
    padRow("Cache hit rate", formatPct1(payload["cacheHitRatePct"] as number | null), w),
    padRow(
      "Context precision (weighted)",
      formatPct1(payload["avgReductionPct"] as number | null),
      w,
    ),
    SEP,
    padRow(
      hasStatusTimeWindow ? `Guard scans (${String(n)}d)` : "Guard scans (lifetime)",
      guardByTypeStr(payload["guardByType"]),
      w,
    ),
    ...topTaskRows(payload["topTaskClasses"], w),
    padRow(
      "Session time",
      formatElapsedDurationMs((payload["sessionTimeMs"] as number | null) ?? null),
      w,
    ),
    padRow("Last compilation", lastCompilationSummary(clock, last, w), w),
    SEP,
    padRow(
      "Installation (global MCP server)",
      installationLabel(payload["installationOk"]),
      w,
    ),
    ...notesRows,
  ];
  return renderStandardReport({
    title: "Status = project-level AIC status.",
    hero: statusHeroLine(payload),
    rows: bodyRows,
    footnote: STATUS_METRIC_FOOTNOTE,
  });
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
    padRow(
      "Compiled in",
      formatCompileDurationMs((last["durationMs"] as number | null) ?? null),
      w,
    ),
    padRow("Context window used", formatPct1(budgetPct), w),
    padRow("Compiled", relIso(clock, String(last["created_at"] ?? "")), w),
    padRow("Editor", String(last["editorId"] ?? "—"), w),
  ];
}

const LAST_EMPTY_DETAIL: readonly string[] = [
  "Intent",
  "Files",
  "Tokens compiled",
  "Compiled in",
  "Context window used",
  "Compiled",
  "Editor",
].map((label) => padRow(label, "—", 30));

export function formatLastTable(
  payload: {
    readonly compilationCount: number;
    readonly lastCompilation: Record<string, unknown> | null;
    readonly promptSummary: {
      readonly tokenCount: number | null;
      readonly guardPassed: null;
    };
    readonly selection?: SelectionTraceParsed | null;
    readonly lastBudgetMaxTokens?: number;
  },
  clock: Clock,
): string {
  const w = 30;
  const last = payload.lastCompilation;
  const budgetMaxTokens = Number(payload.lastBudgetMaxTokens ?? 0);
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
  const scannedForGuard =
    last?.["guardScannedFileCount"] ?? last?.["filesSelected"] ?? null;
  const guardLabel = guardThisRunLabel(
    last?.["guardFindingCount"],
    last?.["guardBlockCount"],
    scannedForGuard,
  );
  const guardRow: readonly string[] =
    guardLabel !== null ? [padRow("Guard (this run)", guardLabel, w)] : [];
  const selectionRows: readonly string[] =
    payload.selection !== null && payload.selection !== undefined
      ? formatSelectionMicroBlock(payload.selection, w)
      : [];
  const bodyRows: readonly string[] = [
    padRow("Context builds", formatInt(payload.compilationCount), w),
    ...detailRows,
    padRow("Cache", cacheStr, w),
    ...guardRow,
    ...selectionRows,
    promptRow,
  ];
  return renderStandardReport({
    title: "Last = most recent compilation.",
    hero: heroLineLast(last, budgetMaxTokens),
    rows: bodyRows,
    footnote: LAST_METRIC_FOOTNOTE,
  });
}

export function formatChatSummaryTable(row: ConversationSummary, clock: Clock): string {
  const w = 30;
  const last = row.lastCompilationInConversation;
  const lastLine = (() => {
    if (last === null) return "—";
    const intent = last.intent.length > 60 ? `${last.intent.slice(0, 59)}…` : last.intent;
    return `${intent} · ${relIso(clock, last.created_at)}`;
  })();
  const bodyRows: readonly string[] = [
    padRow("Project path", row.projectRoot.length > 0 ? row.projectRoot : "—", w),
    padRow("Context builds", formatInt(row.compilationsInConversation), w),
    padRow(
      STATUS_TABLE_LABEL_RAW_TO_SENT,
      formatTokensWithRatio(row.totalTokensRaw, row.totalTokensCompiled),
      w,
    ),
    padRow(
      "Tokens excluded",
      row.totalTokensSaved === null ? "—" : formatCompact(row.totalTokensSaved),
      w,
    ),
    SEP,
    padRow("Cache hit rate", formatPct1(row.cacheHitRatePct), w),
    padRow("Context precision (weighted)", formatPct1(row.avgReductionPct), w),
    SEP,
    padRow("Last compilation", lastLine, w),
    padRow("Elapsed", formatElapsedDurationMs(row.elapsedMs), w),
    ...topTaskRows(row.topTaskClasses, w),
  ];
  return renderStandardReport({
    title: "Chat = this conversation's AIC compilations.",
    hero: heroLineChat(row),
    rows: bodyRows,
    footnote: METRIC_FOOTNOTE,
  });
}

function projectsRosterLine(
  p: ProjectListItem,
  clock: Clock,
  idW: number,
  pathW: number,
  seenW: number,
  cntW: number,
): string {
  const gap = "  ";
  const rawId = String(p.projectId);
  const idCell =
    rawId.length <= idW ? rawId.padEnd(idW, " ") : `${rawId.slice(0, idW - 1)}…`;
  const pathTrunc = truncatePath(String(p.projectRoot), pathW).padEnd(pathW, " ");
  const seen = relIso(clock, p.lastSeenAt).padEnd(seenW, " ");
  const cnt = formatInt(p.compilationCount).padStart(cntW, " ");
  return `${idCell}${gap}${pathTrunc}${gap}${seen}${gap}${cnt}`;
}

function projectsHeroLine(projects: readonly ProjectListItem[], clock: Clock): string {
  if (projects.length === 0) {
    return "No projects registered yet.";
  }
  const totalCompilations = projects.reduce((acc, p) => acc + p.compilationCount, 0);
  const freshestIso = projects.reduce<string | null>(
    (acc, p) => (acc === null || p.lastSeenAt > acc ? p.lastSeenAt : acc),
    null,
  );
  const rel =
    freshestIso === null || freshestIso.length === 0 ? "—" : relIso(clock, freshestIso);
  return `${formatInt(projects.length)} project(s); ${formatInt(totalCompilations)} compilations; latest activity ${rel}.`;
}

export function formatProjectsTable(
  projects: readonly ProjectListItem[],
  clock: Clock,
): string {
  const title = "Projects = known AIC projects.";
  const hero = projectsHeroLine(projects, clock);
  const w = 30;
  if (projects.length === 0) {
    const bodyRows: readonly string[] = [
      padRow("Project ID", "—", w),
      padRow("Path", "—", w),
      padRow("Last seen", "—", w),
      padRow("Compilations", "—", w),
    ];
    return renderStandardReport({ title, hero, rows: bodyRows });
  }
  const idW = 38;
  const pathW = 32;
  const seenW = 14;
  const cntW = 12;
  const gap = "  ";
  const header = [
    "Project ID".padEnd(idW, " "),
    "Path".padEnd(pathW, " "),
    "Last seen".padEnd(seenW, " "),
    "Compilations".padEnd(cntW, " "),
  ].join(gap);
  const dataLines = projects.map((p) =>
    projectsRosterLine(p, clock, idW, pathW, seenW, cntW),
  );
  const bodyRows: readonly string[] = [header, ...dataLines];
  return renderStandardReport({ title, hero, rows: bodyRows });
}

function qualityPayloadNumber(payload: Record<string, unknown>, key: string): number {
  const v = payload[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

const QUALITY_FOOTNOTE = [
  "Context precision  % of repo content automatically filtered per context build.",
  "Selection ratio: % of repo files selected per build.",
  "Budget used: % of token budget consumed per build.",
  "Cache hit rate: % of builds served from cache without recompiling.",
  "Tiers: full = entire file · sig+doc = signatures + docs · sigs = signatures only · names = symbol names only.",
  "Compilations     Builds AIC performed in this window (cache hits included).",
  "Task class mix   How AIC classified each build, with its share and median",
  '                 token budget used. Higher "budget" means AIC allocated',
  '                 more context for that task type. "general" is the',
  "                 classifier's fallback when confidence is low.",
  "Classifier mean  Mean confidence of the task classifier (0-100%). Low values",
  '                 mean frequent fallback to "general" — not a quality',
  "                 problem by itself, but worth noting when most builds",
  '                 are "general".',
].join("\n");

// sub-item width shared across tier and class rows so values align in one column
const QUALITY_SUB_W = 14;

const SPARK_STEPS = "▁▂▃▄▅▆▇█";

function renderSparkline(nums: readonly number[]): string {
  if (nums.length === 0) {
    return "";
  }
  const max = Math.max(...nums);
  if (max === 0) {
    return nums.reduce((acc) => `${acc}·`, "");
  }
  return nums.reduce((acc, n) => {
    const idx = Math.min(7, Math.round((n / max) * 7));
    const ch = SPARK_STEPS.charAt(idx);
    return `${acc}${ch}`;
  }, "");
}

function padMultiCol(
  label: string,
  values: readonly string[],
  labelWidth: number,
  valueWidths: readonly number[],
): string {
  const padded = values.reduce((acc: string, v, i) => {
    const width = valueWidths[i] ?? 0;
    const cell = v.length > width ? v : v.padStart(width, " ");
    const sep = i === 0 ? "" : " ";
    return `${acc}${sep}${cell}`;
  }, "");
  return `${label.padEnd(labelWidth, " ")}  ${padded}`;
}

function utcDayStringsChronologicalWindow(
  endDayInclusive: string,
  windowSize: number,
): readonly string[] {
  const safeSize = Math.max(1, windowSize);
  const startDay = Array.from({ length: Math.max(0, safeSize - 1) }, () => 0).reduce(
    (d: string) => decrementUtcCalendarDay(d),
    endDayInclusive,
  );
  return enumerateUtcDaysInclusive(startDay, endDayInclusive);
}

function utcWeekdayAbbrevFromUtcDay(day: string): string {
  const segs = day.split("-").map((s) => Number(s));
  const y = segs[0] ?? 0;
  const m = segs[1] ?? 1;
  const d = segs[2] ?? 1;
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const yy = m < 3 ? y - 1 : y;
  const monthIdx = m >= 1 && m <= 12 ? m - 1 : 0;
  const tVal = t[monthIdx];
  const coeff = tVal ?? 0;
  const rawIdx =
    yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) + coeff + d;
  const idx = ((rawIdx % 7) + 7) % 7;
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
  return names[idx] ?? "???";
}

function qualityTierMixRows(tier: unknown): readonly string[] {
  if (tier === null || typeof tier !== "object" || Array.isArray(tier)) {
    return [
      "Tier mix",
      padRow("  full", "—", QUALITY_SUB_W),
      padRow("  sig+doc", "—", QUALITY_SUB_W),
      padRow("  sigs", "—", QUALITY_SUB_W),
      padRow("  names", "—", QUALITY_SUB_W),
    ];
  }
  const r = tier as Record<string, unknown>;
  const pct = (k: string): string => formatPct1(qualityPayloadNumber(r, k) * 100);
  return [
    "Tier mix",
    padRow("  full", pct("l0"), QUALITY_SUB_W),
    padRow("  sig+doc", pct("l1"), QUALITY_SUB_W),
    padRow("  sigs", pct("l2"), QUALITY_SUB_W),
    padRow("  names", pct("l3"), QUALITY_SUB_W),
  ];
}

export function formatQualityReportLines(
  payload: Record<string, unknown>,
  clock: Clock,
): string {
  const w = 30;
  const windowDays = Math.round(qualityPayloadNumber(payload, "windowDays"));
  const compilations = Math.round(qualityPayloadNumber(payload, "compilations"));
  const mTr = qualityPayloadNumber(payload, "medianTokenReduction");
  const mSel = qualityPayloadNumber(payload, "medianSelectionRatio");
  const mBu = qualityPayloadNumber(payload, "medianBudgetUtilisation");
  const cacheHit = qualityPayloadNumber(payload, "cacheHitRate");
  const title = "Quality = context build quality metrics.";
  const idle = "No compilations in this window. Send a coding message and try again.";
  if (compilations === 0) {
    return renderStandardReport({
      title,
      hero: idle,
      rows: [
        padRow("Time range", statusTimeRangeValue(windowDays), w),
        padRow("Compilations", formatInt(0), w),
      ],
      footnote: QUALITY_FOOTNOTE,
    });
  }
  const hero = `AIC optimised context by intent across ${formatInt(compilations)} compilations in the last ${String(windowDays)} days (median ${formatPct1(mTr * 100)} filtered, ${formatPct1(cacheHit * 100)} cache hit rate).`;
  const cc = payload["classifierConfidence"];
  const classifierRows: readonly string[] =
    cc !== null &&
    typeof cc === "object" &&
    !Array.isArray(cc) &&
    (cc as Record<string, unknown>)["available"] === true
      ? [
          padRow(
            "Classifier mean",
            formatPct1(qualityPayloadNumber(cc as Record<string, unknown>, "mean") * 100),
            w,
          ),
        ]
      : [];
  const byTaskClass = payload["byTaskClass"];
  const valueWidths = [5, 6, 10] as const;
  const taskClassHeader = padMultiCol(
    "Task class mix",
    ["count", "share", "budget"],
    w,
    valueWidths,
  );
  const taskClassRows: readonly string[] = (() => {
    if (
      byTaskClass === null ||
      typeof byTaskClass !== "object" ||
      Array.isArray(byTaskClass)
    ) {
      return [padMultiCol("—", ["—", "—", "—"], w, valueWidths)];
    }
    const rec = byTaskClass as Record<string, unknown>;
    return (Object.values(TASK_CLASS) as readonly string[]).map((tc) => {
      const cell = rec[tc];
      const stratum =
        cell !== null && typeof cell === "object" && !Array.isArray(cell)
          ? (cell as Record<string, unknown>)
          : null;
      const cCount =
        stratum === null ? 0 : Math.round(qualityPayloadNumber(stratum, "compilations"));
      const budgetU =
        stratum === null ? 0 : qualityPayloadNumber(stratum, "medianBudgetUtilisation");
      const countStr = formatInt(cCount);
      const shareStr = formatPct1(cCount === 0 ? 0 : (cCount / compilations) * 100);
      const budgetStr = cCount === 0 ? "—" : formatPct1(budgetU * 100);
      return padMultiCol(tc, [countStr, shareStr, budgetStr], w, valueWidths);
    });
  })();
  const endDayInclusive = clock.now().slice(0, 10);
  const windowDayStrings = utcDayStringsChronologicalWindow(endDayInclusive, windowDays);
  const seriesDaily = payload["seriesDaily"];
  const dayToCount = new Map<string, number>();
  if (Array.isArray(seriesDaily)) {
    for (const item of seriesDaily) {
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }
      const rec2 = item as Record<string, unknown>;
      const day = String(rec2["day"] ?? "");
      if (day.length > 0) {
        dayToCount.set(day, Math.round(qualityPayloadNumber(rec2, "compilations")));
      }
    }
  }
  const sparkCounts = windowDayStrings.map((d) => dayToCount.get(d) ?? 0);
  const spark = renderSparkline(sparkCounts);
  const weekdayLine = padRow(
    "",
    windowDayStrings.map((d) => utcWeekdayAbbrevFromUtcDay(d)).join(" "),
    w,
  );
  const dailyRows: readonly string[] =
    spark.length === 0 ? [] : [padRow("Daily compilations", spark, w), weekdayLine];
  const bodyRows: readonly string[] = [
    padRow("Time range", statusTimeRangeValue(windowDays), w),
    padRow("Compilations", formatInt(compilations), w),
    SEP,
    padRow("Median context precision", formatPct1(mTr * 100), w),
    padRow("Median selection ratio", formatPct1(mSel * 100), w),
    padRow("Median budget used", formatPct1(mBu * 100), w),
    padRow("Cache hit rate", formatPct1(cacheHit * 100), w),
    ...qualityTierMixRows(payload["tierDistribution"]),
    taskClassHeader,
    ...taskClassRows,
    ...classifierRows,
    ...dailyRows,
  ];
  return renderStandardReport({
    title,
    hero,
    rows: bodyRows,
    footnote: QUALITY_FOOTNOTE,
  });
}
