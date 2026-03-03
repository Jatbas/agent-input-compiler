import type { ContentTransformer } from "#core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import { toFileExtension } from "#core/types/paths.js";
import type { InclusionTier } from "#core/types/enums.js";

const TEST_SPEC_EXTENSIONS: readonly FileExtension[] = [
  toFileExtension(".ts"),
  toFileExtension(".js"),
  toFileExtension(".tsx"),
  toFileExtension(".jsx"),
  toFileExtension(".mjs"),
  toFileExtension(".cjs"),
  toFileExtension(".py"),
  toFileExtension(".go"),
  toFileExtension(".rs"),
  toFileExtension(".java"),
  toFileExtension(".rb"),
  toFileExtension(".php"),
  toFileExtension(".swift"),
  toFileExtension(".kt"),
  toFileExtension(".dart"),
];

function isTestOrSpecPath(path: string): boolean {
  return path.includes(".test.") || path.includes(".spec.");
}

const TEST_CALL_RE = /\b(describe|it|test)\s*\(/g;

function findStringEnd(content: string, start: number): number | null {
  const q = content[start];
  if (q !== '"' && q !== "'" && q !== "`") return null;
  let i = start + 1;
  while (i < content.length) {
    if (content[i] === "\\") {
      i += 2;
      continue;
    }
    if (content[i] === q) return i + 1;
    if (q === "`" && content[i] === "$" && content[i + 1] === "{") {
      const close = content.indexOf("}", i + 2);
      if (close === -1) return null;
      i = close + 1;
      continue;
    }
    i++;
  }
  return null;
}

function findMatchingParen(content: string, open: number): number | null {
  let depth = 1;
  let pos = open + 1;
  while (pos < content.length) {
    const c = content[pos];
    if (c === "\\") {
      pos += 2;
      continue;
    }
    if (c === "(") {
      depth++;
      pos++;
      continue;
    }
    if (c === ")") {
      depth--;
      if (depth === 0) return pos;
      pos++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const end = findStringEnd(content, pos);
      if (end === null) return null;
      pos = end;
      continue;
    }
    pos++;
  }
  return null;
}

function findMatchingBrace(content: string, open: number): number | null {
  let depth = 1;
  for (let i = open + 1; i < content.length; i++) {
    if (content[i] === "{") depth++;
    else if (content[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return null;
}

function skipWs(content: string, from: number): number {
  let pos = from;
  while (pos < content.length) {
    const ch = content[pos];
    if (ch === undefined || !/\s/.test(ch)) break;
    pos++;
  }
  return pos;
}

function findCallbackBodyStart(content: string, afterStringEnd: number): number | null {
  let j = afterStringEnd;
  while (j < content.length) {
    const ch = content[j];
    if (ch === undefined || !/[\s,]/.test(ch)) break;
    j++;
  }
  if (j >= content.length) return null;
  if (content[j] !== "(") return null;
  const closeParen = findMatchingParen(content, j);
  if (closeParen === null) return null;
  j = skipWs(content, closeParen + 1);
  if (content.slice(j, j + 2) === "=>") j += 2;
  j = skipWs(content, j);
  if (content.slice(j, j + 5) === "async") j += 5;
  j = skipWs(content, j);
  if (content.slice(j, j + 8) === "function") {
    j += 8;
    j = skipWs(content, j);
    if (content[j] === "(") {
      const cp = findMatchingParen(content, j);
      if (cp === null) return null;
      j = cp + 1;
    }
  }
  j = skipWs(content, j);
  if (content[j] === "{") return j;
  return null;
}

function getBodyRange(
  content: string,
  callStart: number,
): { start: number; end: number } | null {
  const openParen = content.indexOf("(", callStart);
  if (openParen === -1) return null;
  const afterOpen = content.slice(openParen + 1).replace(/^\s+/, "");
  const firstChar = afterOpen.length > 0 ? afterOpen[0] : null;
  const stringStart =
    openParen + 1 + (content.slice(openParen + 1).length - afterOpen.length);
  if (firstChar !== '"' && firstChar !== "'" && firstChar !== "`") return null;
  const stringEnd = findStringEnd(content, stringStart);
  if (stringEnd === null) return null;
  const bodyStart = findCallbackBodyStart(content, stringEnd);
  if (bodyStart === null) return null;
  const bodyEnd = findMatchingBrace(content, bodyStart);
  if (bodyEnd === null) return null;
  return { start: bodyStart, end: bodyEnd };
}

function applyReplacements(
  result: string,
  ranges: readonly { start: number; end: number }[],
): string {
  if (ranges.length === 0) return result;
  const [r, ...rest] = ranges;
  if (r === undefined) return result;
  const newResult = result.slice(0, r.start) + "{}" + result.slice(r.end + 1);
  return applyReplacements(newResult, rest);
}

function isLeafRange(
  r: { start: number; end: number },
  all: readonly { start: number; end: number }[],
): boolean {
  return !all.some((s) => s.start !== r.start && s.start > r.start && s.end < r.end);
}

function stripTestBodies(content: string): string {
  const re = new RegExp(TEST_CALL_RE.source, "g");
  const matches = [...content.matchAll(re)];
  const ranges = matches.flatMap((m) => {
    const idx = (m as { index: number }).index;
    const name = m[1];
    if (name === undefined) return [];
    const range = getBodyRange(content, idx + name.length);
    return range !== null ? [range] : [];
  });
  const leafOnly = ranges.filter((r) => isLeafRange(r, ranges));
  const byStartDesc = leafOnly.toSorted((a, b) => b.start - a.start);
  return applyReplacements(content, byStartDesc);
}

export class TestStructureExtractor implements ContentTransformer {
  readonly id = "test-structure-extractor";
  readonly fileExtensions = TEST_SPEC_EXTENSIONS;

  transform(content: string, _tier: InclusionTier, filePath: RelativePath): string {
    if (content.length === 0) return content;
    if (!isTestOrSpecPath(filePath)) return content;
    return stripTestBodies(content);
  }
}
