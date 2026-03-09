// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { LanguageProvider } from "@jatbas/aic-core/core/interfaces/language-provider.interface.js";
import type { FileExtension, RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import type { ImportRef } from "@jatbas/aic-core/core/types/import-ref.js";
import type { CodeChunk } from "@jatbas/aic-core/core/types/code-chunk.js";
import type { ExportedSymbol } from "@jatbas/aic-core/core/types/exported-symbol.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toLineNumber, toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import type { SymbolKind } from "@jatbas/aic-core/core/types/enums.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "@jatbas/aic-core/core/types/enums.js";

// Best-effort regex: line starts with function/class/def/fn/pub fn (multi-language).
const SIGNATURE_LINE_RE =
  /^\s*(?:function\s+(\w+)|class\s+(\w+)|def\s+(\w+)|(?:pub\s+)?fn\s+(\w+))/;

// Export-like patterns: export const X, export function X, export class X, export { a, b }.
const EXPORT_DECL_RE = /^\s*export\s+(?:const|let|var)\s+(\w+)/gm;
const EXPORT_FN_RE = /^\s*export\s+function\s+(\w+)/gm;
const EXPORT_CLASS_RE = /^\s*export\s+class\s+(\w+)/gm;
const EXPORT_NAMED_RE = /^\s*export\s*\{\s*([^}]+)\s*\}/gm;

const EMPTY_PATH = toRelativePath("");

export class GenericProvider implements LanguageProvider {
  readonly id = "generic";
  readonly extensions: readonly FileExtension[];

  constructor() {
    this.extensions = [];
  }

  parseImports(_fileContent: string, _filePath: RelativePath): readonly ImportRef[] {
    return [];
  }

  extractSignaturesWithDocs(_fileContent: string): readonly CodeChunk[] {
    return [];
  }

  extractSignaturesOnly(fileContent: string): readonly CodeChunk[] {
    try {
      const lines = fileContent.split("\n");
      return lines.reduce<readonly CodeChunk[]>((acc, line, i) => {
        const m = SIGNATURE_LINE_RE.exec(line);
        if (m === null) return acc;
        const symbolName = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
        if (symbolName === "") return acc;
        const isClass = m[2] !== undefined && m[2] !== "";
        const lineNum = i + 1;
        const chunk: CodeChunk = {
          filePath: EMPTY_PATH,
          symbolName,
          symbolType: isClass ? SYMBOL_TYPE.CLASS : SYMBOL_TYPE.FUNCTION,
          startLine: toLineNumber(lineNum),
          endLine: toLineNumber(lineNum),
          content: line,
          tokenCount: toTokenCount(0),
        };
        return [...acc, chunk];
      }, []);
    } catch {
      return [];
    }
  }

  extractNames(fileContent: string): readonly ExportedSymbol[] {
    try {
      const all = [
        ...collectSimpleExports(fileContent, EXPORT_DECL_RE, SYMBOL_KIND.CONST),
        ...collectSimpleExports(fileContent, EXPORT_FN_RE, SYMBOL_KIND.FUNCTION),
        ...collectSimpleExports(fileContent, EXPORT_CLASS_RE, SYMBOL_KIND.CLASS),
        ...collectNamedExports(fileContent),
      ];
      return dedupeSymbols(all);
    } catch {
      return [];
    }
  }
}

function collectSimpleExports(
  fileContent: string,
  regex: RegExp,
  kind: SymbolKind,
): readonly ExportedSymbol[] {
  const re = new RegExp(regex.source, regex.flags);
  return [...fileContent.matchAll(re)].flatMap((m) => {
    const name = m[1];
    return name !== undefined ? [{ name, kind }] : [];
  });
}

function collectNamedExports(fileContent: string): readonly ExportedSymbol[] {
  return [...fileContent.matchAll(EXPORT_NAMED_RE)].flatMap((m) => {
    const list = m[1];
    if (list === undefined) return [];
    return list
      .split(",")
      .map((s) => {
        const t = s.trim().split(/\s+as\s+/);
        return (t[0] ?? "").trim();
      })
      .filter((name) => name.length > 0)
      .map((name) => ({ name, kind: SYMBOL_KIND.CONST }));
  });
}

function dedupeSymbols(symbols: readonly ExportedSymbol[]): readonly ExportedSymbol[] {
  const seen = new Set<string>();
  return symbols.filter((s) => {
    if (seen.has(s.name)) return false;
    seen.add(s.name);
    return true;
  });
}
