// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { SYMBOL_KIND, SYMBOL_TYPE } from "./language-provider-common.js";
import {
  createRegexLanguageProviderClass,
  extractNamesFromMatchers,
  extractSignaturesFromLineMatchers,
  parseImportsFromPatterns,
} from "./regex-language-provider-helpers.js";

const DART_IMPORT_RE = /import\s+['"]([^'"]+)['"]/g;

function isRelativeDartImport(source: string): boolean {
  return source.startsWith(".") || source.includes("/");
}

const VOID_LINE_RE = /^\s*void\s+(\w+)/;
const CLASS_LINE_RE = /^\s*class\s+(\w+)/;
const TYPEDEF_LINE_RE = /^\s*typedef\s+(\w+)/;
const FUNC_LINE_RE = /^\s*\w+\s+(\w+)\s*\(/;

const VOID_NAME_RE = /void\s+(\w+)/g;
const CLASS_NAME_RE = /class\s+(\w+)/g;
const TYPEDEF_NAME_RE = /typedef\s+(\w+)/g;
const FUNC_NAME_RE = /\w+\s+(\w+)\s*\(/g;

export const DartProvider = createRegexLanguageProviderClass({
  id: "dart",
  extension: ".dart",
  parseImportsImpl: (fileContent) =>
    parseImportsFromPatterns(fileContent, [
      { re: DART_IMPORT_RE, isRelative: isRelativeDartImport },
    ]),
  extractSignaturesOnlyImpl: (fileContent) =>
    extractSignaturesFromLineMatchers(fileContent, [
      { re: VOID_LINE_RE, symbolType: SYMBOL_TYPE.FUNCTION },
      { re: CLASS_LINE_RE, symbolType: SYMBOL_TYPE.CLASS },
      { re: TYPEDEF_LINE_RE, symbolType: SYMBOL_TYPE.CLASS },
      { re: FUNC_LINE_RE, symbolType: SYMBOL_TYPE.FUNCTION },
    ]),
  extractNamesImpl: (fileContent) =>
    extractNamesFromMatchers(fileContent, [
      { re: VOID_NAME_RE, kind: SYMBOL_KIND.FUNCTION },
      { re: CLASS_NAME_RE, kind: SYMBOL_KIND.CLASS },
      { re: TYPEDEF_NAME_RE, kind: SYMBOL_KIND.CLASS },
      { re: FUNC_NAME_RE, kind: SYMBOL_KIND.FUNCTION },
    ]),
});
