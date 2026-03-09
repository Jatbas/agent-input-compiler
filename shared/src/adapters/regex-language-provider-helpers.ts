// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { LanguageProvider } from "@jatbas/aic-core/core/interfaces/language-provider.interface.js";
import type {
  CodeChunk,
  ExportedSymbol,
  FileExtension,
  ImportRef,
  RelativePath,
} from "./language-provider-common.js";
import type { SymbolKind, SymbolType } from "@jatbas/aic-core/core/types/enums.js";
import {
  EMPTY_RELATIVE_PATH,
  toFileExtension,
  toLineNumber,
  toTokenCount,
} from "./language-provider-common.js";

const EMPTY_SYMBOLS: readonly string[] = [];

export function tryOrEmpty<T>(fn: () => readonly T[]): readonly T[] {
  try {
    return fn();
  } catch {
    return [];
  }
}

export interface ImportPattern {
  readonly re: RegExp;
  readonly isRelative: (source: string) => boolean;
  readonly normalize?: (source: string) => string;
}

export function parseImportsFromPatterns(
  fileContent: string,
  patterns: readonly ImportPattern[],
): readonly ImportRef[] {
  return patterns.flatMap(({ re, isRelative, normalize }) =>
    [...fileContent.matchAll(re)]
      .map((m) => {
        const raw = (m[1] ?? "").trim();
        return normalize !== undefined ? normalize(raw) : raw;
      })
      .filter((source) => source.length > 0)
      .map((source) => ({
        source,
        symbols: EMPTY_SYMBOLS,
        isRelative: isRelative(source),
      })),
  );
}

export interface LineMatcher {
  readonly re: RegExp;
  readonly symbolType: SymbolType;
}

export function extractSignaturesFromLineMatchers(
  fileContent: string,
  matchers: readonly LineMatcher[],
): readonly CodeChunk[] {
  const lines = fileContent.split("\n");
  return lines.reduce<readonly CodeChunk[]>((acc, line, i) => {
    const lineNum = i + 1;
    const matched = matchers.reduce<CodeChunk | null>((found, matcher) => {
      if (found !== null) return found;
      const m = matcher.re.exec(line);
      return m !== null && (m[1] ?? "").length > 0
        ? {
            filePath: EMPTY_RELATIVE_PATH,
            symbolName: m[1] ?? "",
            symbolType: matcher.symbolType,
            startLine: toLineNumber(lineNum),
            endLine: toLineNumber(lineNum),
            content: line,
            tokenCount: toTokenCount(0),
          }
        : null;
    }, null);
    return matched !== null ? [...acc, matched] : acc;
  }, []);
}

export interface NameMatcher {
  readonly re: RegExp;
  readonly kind: SymbolKind;
}

export function extractNamesFromMatchers(
  fileContent: string,
  matchers: readonly NameMatcher[],
): readonly ExportedSymbol[] {
  return matchers.flatMap(({ re, kind }) =>
    [...fileContent.matchAll(re)]
      .map((m) => m[1] ?? "")
      .filter((s) => s.length > 0)
      .map((name) => ({ name, kind }) as const),
  );
}

export interface RegexLanguageProviderConfig {
  readonly id: string;
  readonly extension: string;
  readonly parseImportsImpl: (fileContent: string) => readonly ImportRef[];
  readonly extractSignaturesOnlyImpl: (fileContent: string) => readonly CodeChunk[];
  readonly extractNamesImpl: (fileContent: string) => readonly ExportedSymbol[];
}

export function createRegexLanguageProviderClass(
  config: RegexLanguageProviderConfig,
): new () => LanguageProvider {
  return class implements LanguageProvider {
    readonly id = config.id;
    readonly extensions: readonly FileExtension[] = [toFileExtension(config.extension)];
    parseImports(fileContent: string, _filePath: RelativePath): readonly ImportRef[] {
      return tryOrEmpty(() => config.parseImportsImpl(fileContent));
    }
    extractSignaturesWithDocs(_fileContent: string): readonly CodeChunk[] {
      return [];
    }
    extractSignaturesOnly(fileContent: string): readonly CodeChunk[] {
      return tryOrEmpty(() => config.extractSignaturesOnlyImpl(fileContent));
    }
    extractNames(fileContent: string): readonly ExportedSymbol[] {
      return tryOrEmpty(() => config.extractNamesImpl(fileContent));
    }
  };
}
