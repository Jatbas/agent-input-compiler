// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ContentTransformer } from "@jatbas/aic-core/core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toFileExtension } from "@jatbas/aic-core/core/types/paths.js";
import type { InclusionTier } from "@jatbas/aic-core/core/types/enums.js";

const PROSE_EXTENSIONS: readonly FileExtension[] = [
  toFileExtension(".md"),
  toFileExtension(".mdx"),
  toFileExtension(".rst"),
  toFileExtension(".txt"),
];

const ELLIPSIS = "\u2026";

function stripYamlFrontmatterAtFileStart(content: string): string {
  if (!content.startsWith("---\n")) return content;
  const lines = content.split("\n");
  if (lines[0] !== "---") return content;
  const closeIdx = lines.findIndex((ln, k) => k > 0 && ln === "---");
  if (closeIdx < 0) return content;
  return lines
    .slice(closeIdx + 1)
    .join("\n")
    .replace(/^\n+/, "");
}

function collapseBlankLines(segment: string): string {
  return segment.replace(/\n{4,}/g, "\n\n");
}

function collapseInteriorSpaceRuns(line: string): string {
  const leadMatch = /^[\t ]*/.exec(line);
  const lead = leadMatch?.[0] ?? "";
  const rest = line.slice(lead.length);
  return lead + rest.replace(/ {4,}/g, " ");
}

function nextHttpLikeIndex(segment: string, from: number): number {
  const http = segment.indexOf("http://", from);
  const https = segment.indexOf("https://", from);
  if (http < 0) return https;
  if (https < 0) return http;
  return Math.min(http, https);
}

function urlEnd(segment: string, j: number, terminators: ReadonlySet<string>): number {
  if (j >= segment.length) return j;
  if (terminators.has(segment[j] ?? "")) return j;
  return urlEnd(segment, j + 1, terminators);
}

function truncateLongUrls(segment: string): string {
  const terminators = new Set(" \t\n\r),]>\"'`}");
  const consume = (from: number): string => {
    const start = nextHttpLikeIndex(segment, from);
    if (start < 0) return segment.slice(from);
    const schemeLen = segment.startsWith("https://", start) ? 8 : 7;
    const afterScheme = start + schemeLen;
    const end = urlEnd(segment, afterScheme, terminators);
    const url = segment.slice(start, end);
    const replacement =
      url.length >= 120 ? url.slice(0, 40) + ELLIPSIS + url.slice(-20) : url;
    return `${segment.slice(from, start)}${replacement}${consume(end)}`;
  };
  return consume(0);
}

function mapLinesPreservingTrailingNewlines(segment: string): string {
  const trailingMatch = /\n*$/.exec(segment);
  const trailing = trailingMatch?.[0] ?? "";
  const core = segment.slice(0, segment.length - trailing.length);
  const mapped = core
    .split("\n")
    .map((ln) => collapseInteriorSpaceRuns(ln))
    .join("\n");
  return mapped + trailing;
}

function applyProseDensityOutsideFences(segment: string): string {
  const blanks = collapseBlankLines(segment);
  const spaced = mapLinesPreservingTrailingNewlines(blanks);
  return truncateLongUrls(spaced);
}

function matchOpeningFenceTickLen(line: string): number | null {
  const m = /^ {0,3}(`{3,})([^`]*?)\s*$/.exec(line);
  return m?.[1]?.length ?? null;
}

function isClosingFence(line: string, minTicks: number): boolean {
  const m = /^ {0,3}(`{3,})\s*$/.exec(line);
  const run = m?.[1]?.length ?? 0;
  return run >= minTicks;
}

type FenceState = {
  readonly mode: "outside" | "inside";
  readonly out: string;
  readonly outsideBuf: readonly string[];
  readonly innerBuf: readonly string[];
  readonly openTick: number;
};

function transitionFenceState(
  acc: FenceState,
  idx: number,
  line: string,
  lineCount: number,
): FenceState {
  const nl = idx < lineCount - 1 ? "\n" : "";
  if (acc.mode === "inside") {
    if (isClosingFence(line, acc.openTick)) {
      const innerJoined = acc.innerBuf.join("\n");
      const afterInner = innerJoined.length > 0 ? `${innerJoined}\n` : "";
      return {
        mode: "outside",
        out: `${acc.out}${afterInner}${line}${nl}`,
        outsideBuf: [],
        innerBuf: [],
        openTick: 0,
      };
    }
    return { ...acc, innerBuf: [...acc.innerBuf, line] };
  }
  const tickLen = matchOpeningFenceTickLen(line);
  if (tickLen !== null) {
    const flushed =
      acc.outsideBuf.length > 0
        ? `${acc.out}${applyProseDensityOutsideFences(outsideLinesToSegment(acc.outsideBuf))}`
        : acc.out;
    return {
      mode: "inside",
      out: `${flushed}${line}${nl}`,
      outsideBuf: [],
      innerBuf: [],
      openTick: tickLen,
    };
  }
  return { ...acc, outsideBuf: [...acc.outsideBuf, line] };
}

function outsideLinesToSegment(buf: readonly string[]): string {
  if (buf.length === 0) return "";
  return `${buf.join("\n")}\n`;
}

function finalizeFenceState(acc: FenceState): string {
  if (acc.mode === "inside") {
    return `${acc.out}${acc.innerBuf.join("\n")}`;
  }
  return acc.outsideBuf.length > 0
    ? `${acc.out}${applyProseDensityOutsideFences(acc.outsideBuf.join("\n"))}`
    : acc.out;
}

function transformWithFencePreservation(content: string): string {
  const lines = content.split("\n");
  const initial: FenceState = {
    mode: "outside",
    out: "",
    outsideBuf: [],
    innerBuf: [],
    openTick: 0,
  };
  const reduced = lines.reduce<FenceState>((acc, line, idx) => {
    return transitionFenceState(acc, idx, line, lines.length);
  }, initial);
  return finalizeFenceState(reduced);
}

export class ProseDensityTransformer implements ContentTransformer {
  readonly id = "prose-density";
  readonly fileExtensions: readonly FileExtension[] = PROSE_EXTENSIONS;

  transform(content: string, _tier: InclusionTier, _filePath: RelativePath): string {
    if (content.length === 0) return content;
    const withoutYaml = stripYamlFrontmatterAtFileStart(content);
    return transformWithFencePreservation(withoutYaml);
  }
}
