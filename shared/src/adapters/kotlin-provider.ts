// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { SYMBOL_KIND, SYMBOL_TYPE } from "./language-provider-common.js";
import {
  createRegexLanguageProviderClass,
  extractNamesFromMatchers,
  extractSignaturesFromLineMatchers,
  parseImportsFromPatterns,
} from "./regex-language-provider-helpers.js";

const KOTLIN_IMPORT_RE = /import\s+([\w.*]+)(?:\s+as\s+\w+)?/g;

function isRelativeKotlinImport(source: string): boolean {
  return source.startsWith(".");
}

const FUN_LINE_RE = /^\s*fun\s+(\w+)/;
const CLASS_LINE_RE = /^\s*class\s+(\w+)/;
const OBJECT_LINE_RE = /^\s*object\s+(\w+)/;

const FUN_NAME_RE = /fun\s+(\w+)/g;
const CLASS_NAME_RE = /class\s+(\w+)/g;
const OBJECT_NAME_RE = /object\s+(\w+)/g;

export const KotlinProvider = createRegexLanguageProviderClass({
  id: "kotlin",
  extension: ".kt",
  parseImportsImpl: (fileContent) =>
    parseImportsFromPatterns(fileContent, [
      { re: KOTLIN_IMPORT_RE, isRelative: isRelativeKotlinImport },
    ]),
  extractSignaturesOnlyImpl: (fileContent) =>
    extractSignaturesFromLineMatchers(fileContent, [
      { re: FUN_LINE_RE, symbolType: SYMBOL_TYPE.FUNCTION },
      { re: CLASS_LINE_RE, symbolType: SYMBOL_TYPE.CLASS },
      { re: OBJECT_LINE_RE, symbolType: SYMBOL_TYPE.CLASS },
    ]),
  extractNamesImpl: (fileContent) =>
    extractNamesFromMatchers(fileContent, [
      { re: FUN_NAME_RE, kind: SYMBOL_KIND.FUNCTION },
      { re: CLASS_NAME_RE, kind: SYMBOL_KIND.CLASS },
      { re: OBJECT_NAME_RE, kind: SYMBOL_KIND.CLASS },
    ]),
});
