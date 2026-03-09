// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ContentTransformer } from "@jatbas/aic-core/core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toFileExtension } from "@jatbas/aic-core/core/types/paths.js";
import type { InclusionTier } from "@jatbas/aic-core/core/types/enums.js";

const DTS_EXTENSIONS: readonly FileExtension[] = [toFileExtension(".d.ts")];

const DECL_START_RE = /^(export\s+)?(type|interface|enum|declare)\s/;

type DeclKind = "type" | "interface" | "enum" | "declare";

function isDeclarationStart(line: string): boolean {
  return DECL_START_RE.test(line.trim());
}

function getDeclarationKind(line: string): DeclKind | null {
  const m = line.trim().match(DECL_START_RE);
  const k = m?.[2];
  if (k === "type" || k === "interface" || k === "enum" || k === "declare") return k;
  return null;
}

function braceDelta(line: string): number {
  const open = (line.match(/{/g) ?? []).length;
  const close = (line.match(/}/g) ?? []).length;
  return open - close;
}

function isTypeEnd(line: string): boolean {
  return line.includes(";");
}

function isBraceBlockEnd(line: string, nextDepth: number): boolean {
  return nextDepth === 0 && (line.includes("}") || line.includes("};"));
}

function isDeclareEnd(line: string, nextDepth: number): boolean {
  return nextDepth === 0 && (line.includes(";") || line.includes("}"));
}

function declarationEnded(line: string, kind: DeclKind, nextDepth: number): boolean {
  if (kind === "type") return isTypeEnd(line);
  if (kind === "interface" || kind === "enum") return isBraceBlockEnd(line, nextDepth);
  return isDeclareEnd(line, nextDepth);
}

function collapse(lines: readonly string[]): string {
  return lines
    .map((l) => l.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

type Acc = {
  readonly resultParts: readonly string[];
  readonly currentDeclLines: readonly string[] | null;
  readonly braceDepth: number;
  readonly kind: DeclKind | null;
};

function flushAndMaybeStartNew(acc: Acc, line: string): Acc {
  const current = acc.currentDeclLines;
  if (current === null) return acc;
  const collapsed = collapse(current);
  const parts = [...acc.resultParts, collapsed];
  const newKind = getDeclarationKind(line);
  const nextDepth = braceDelta(line);
  const endsNow = newKind !== null && declarationEnded(line, newKind, nextDepth);
  if (endsNow) {
    return {
      resultParts: [...parts, collapse([line])],
      currentDeclLines: null,
      braceDepth: 0,
      kind: null,
    };
  }
  return {
    resultParts: parts,
    currentDeclLines: [line],
    braceDepth: nextDepth,
    kind: newKind,
  };
}

function appendAndMaybeFlush(acc: Acc, line: string): Acc {
  const current = acc.currentDeclLines;
  if (current === null) return acc;
  const depth = acc.braceDepth;
  const kind = acc.kind;
  const nextDepth = depth + braceDelta(line);
  const lines = [...current, line];
  const ended = kind !== null && declarationEnded(line, kind, nextDepth);
  if (ended) {
    return {
      resultParts: [...acc.resultParts, collapse(lines)],
      currentDeclLines: null,
      braceDepth: 0,
      kind: null,
    };
  }
  return {
    resultParts: acc.resultParts,
    currentDeclLines: lines,
    braceDepth: nextDepth,
    kind,
  };
}

function startNewAndMaybeFlush(acc: Acc, line: string): Acc {
  const newKind = getDeclarationKind(line);
  const nextDepth = braceDelta(line);
  const endsNow = newKind !== null && declarationEnded(line, newKind, nextDepth);
  if (endsNow) {
    return {
      resultParts: [...acc.resultParts, collapse([line])],
      currentDeclLines: null,
      braceDepth: 0,
      kind: null,
    };
  }
  return {
    resultParts: acc.resultParts,
    currentDeclLines: [line],
    braceDepth: nextDepth,
    kind: newKind,
  };
}

function scanLine(acc: Acc, line: string): Acc {
  const inDecl = acc.currentDeclLines !== null;
  if (inDecl && isDeclarationStart(line)) return flushAndMaybeStartNew(acc, line);
  if (inDecl) return appendAndMaybeFlush(acc, line);
  if (isDeclarationStart(line)) return startNewAndMaybeFlush(acc, line);
  return {
    resultParts: [...acc.resultParts, line],
    currentDeclLines: null,
    braceDepth: 0,
    kind: null,
  };
}

export class TypeDeclarationCompactor implements ContentTransformer {
  readonly id = "type-declaration-compactor";
  readonly fileExtensions: readonly FileExtension[] = DTS_EXTENSIONS;

  transform(content: string, _tier: InclusionTier, _filePath: RelativePath): string {
    if (content.length === 0) return content;
    const lines = content.split("\n");
    const initial: Acc = {
      resultParts: [],
      currentDeclLines: null,
      braceDepth: 0,
      kind: null,
    };
    const final = lines.reduce(scanLine, initial);
    const resultParts =
      final.currentDeclLines !== null
        ? [...final.resultParts, collapse(final.currentDeclLines)]
        : final.resultParts;
    return resultParts.join("\n");
  }
}
