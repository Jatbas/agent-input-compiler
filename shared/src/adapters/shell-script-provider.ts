// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { LanguageProvider } from "@jatbas/aic-shared/core/interfaces/language-provider.interface.js";
import type {
  CodeChunk,
  ExportedSymbol,
  FileExtension,
  ImportRef,
  RelativePath,
} from "./language-provider-common.js";
import { SYMBOL_KIND, SYMBOL_TYPE, toFileExtension } from "./language-provider-common.js";
import {
  extractNamesFromMatchers,
  extractSignaturesFromLineMatchers,
  parseImportsFromPatterns,
  tryOrEmpty,
} from "./regex-language-provider-helpers.js";

const SOURCE_RE = /source\s+["']?([^"']+)["']?/g;
const DOT_RE = /\.\s+["']?([^"']+)["']?/g;

function isRelativeShellPath(source: string): boolean {
  return source.startsWith(".");
}

const FUNCTION_LINE_RE = /^\s*function\s+(\w+)/;
const NAME_PAREN_LINE_RE = /^\s*(\w+)\s*\(\)\s*\{/;

const FUNCTION_NAME_RE = /function\s+(\w+)/g;
const NAME_PAREN_NAME_RE = /(\w+)\s*\(\)\s*\{/g;

export class ShellScriptProvider implements LanguageProvider {
  readonly id = "shell";
  readonly extensions: readonly FileExtension[] = [
    toFileExtension(".sh"),
    toFileExtension(".bash"),
  ];

  parseImports(fileContent: string, _filePath: RelativePath): readonly ImportRef[] {
    return tryOrEmpty(() =>
      parseImportsFromPatterns(fileContent, [
        { re: SOURCE_RE, isRelative: isRelativeShellPath },
        { re: DOT_RE, isRelative: isRelativeShellPath },
      ]),
    );
  }

  extractSignaturesWithDocs(_fileContent: string): readonly CodeChunk[] {
    return [];
  }

  extractSignaturesOnly(fileContent: string): readonly CodeChunk[] {
    return tryOrEmpty(() =>
      extractSignaturesFromLineMatchers(fileContent, [
        { re: FUNCTION_LINE_RE, symbolType: SYMBOL_TYPE.FUNCTION },
        { re: NAME_PAREN_LINE_RE, symbolType: SYMBOL_TYPE.FUNCTION },
      ]),
    );
  }

  extractNames(fileContent: string): readonly ExportedSymbol[] {
    return tryOrEmpty(() =>
      extractNamesFromMatchers(fileContent, [
        { re: FUNCTION_NAME_RE, kind: SYMBOL_KIND.FUNCTION },
        { re: NAME_PAREN_NAME_RE, kind: SYMBOL_KIND.FUNCTION },
      ]),
    );
  }
}
