// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { ImportRef } from "#core/types/import-ref.js";
import type { CodeChunk } from "#core/types/code-chunk.js";
import type { ExportedSymbol } from "#core/types/exported-symbol.js";
import { toFileExtension, toRelativePath } from "#core/types/paths.js";
import { toLineNumber, toTokenCount } from "#core/types/units.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "#core/types/enums.js";

const EMPTY_PATH = toRelativePath("");

function titleFromHeadingLine(line: string): string {
  const trimmed = line.trim();
  const afterHash = trimmed.replace(/^#+\s*/, "");
  return afterHash.trim();
}

function findHeadingLineIndices(lines: readonly string[]): readonly number[] {
  return lines.reduce<readonly number[]>((acc, line, i) => {
    if (/^#{1,6}\s+.+/.test(line.trim())) return [...acc, i];
    return acc;
  }, []);
}

function extractSignaturesWithDocsImpl(fileContent: string): readonly CodeChunk[] {
  const lines = fileContent.split("\n");
  const indices = findHeadingLineIndices(lines);
  if (indices.length === 0) return [];
  return indices.map((idx, i) => {
    const startLine = idx + 1;
    const nextIdx =
      i + 1 < indices.length ? (indices[i + 1] ?? lines.length) : lines.length;
    const endLine = nextIdx;
    const sectionLines = lines.slice(idx, nextIdx);
    const content = sectionLines.join("\n");
    const symbolName = titleFromHeadingLine(lines[idx] ?? "");
    return {
      filePath: EMPTY_PATH,
      symbolName,
      symbolType: SYMBOL_TYPE.FUNCTION,
      startLine: toLineNumber(startLine),
      endLine: toLineNumber(endLine),
      content,
      tokenCount: toTokenCount(0),
    } satisfies CodeChunk;
  });
}

function extractSignaturesOnlyImpl(fileContent: string): readonly CodeChunk[] {
  const lines = fileContent.split("\n");
  return lines.reduce<readonly CodeChunk[]>((acc, line, i) => {
    if (!/^#{1,6}\s+.+/.test(line.trim())) return acc;
    const chunk: CodeChunk = {
      filePath: EMPTY_PATH,
      symbolName: titleFromHeadingLine(line),
      symbolType: SYMBOL_TYPE.FUNCTION,
      startLine: toLineNumber(i + 1),
      endLine: toLineNumber(i + 1),
      content: line,
      tokenCount: toTokenCount(0),
    };
    return [...acc, chunk];
  }, []);
}

function extractNamesImpl(fileContent: string): readonly ExportedSymbol[] {
  const lines = fileContent.split("\n");
  return lines.reduce<readonly ExportedSymbol[]>((acc, line) => {
    if (!/^#{1,6}\s+.+/.test(line.trim())) return acc;
    const name = titleFromHeadingLine(line);
    return name === "" ? acc : [...acc, { name, kind: SYMBOL_KIND.CONST }];
  }, []);
}

export class MarkdownProvider implements LanguageProvider {
  readonly id = "markdown";
  readonly extensions: readonly FileExtension[] = [
    toFileExtension(".md"),
    toFileExtension(".mdc"),
  ];

  parseImports(_fileContent: string, _filePath: RelativePath): readonly ImportRef[] {
    return [];
  }

  extractSignaturesWithDocs(fileContent: string): readonly CodeChunk[] {
    try {
      return extractSignaturesWithDocsImpl(fileContent);
    } catch {
      return [];
    }
  }

  extractSignaturesOnly(fileContent: string): readonly CodeChunk[] {
    try {
      return extractSignaturesOnlyImpl(fileContent);
    } catch {
      return [];
    }
  }

  extractNames(fileContent: string): readonly ExportedSymbol[] {
    try {
      return extractNamesImpl(fileContent);
    } catch {
      return [];
    }
  }
}
