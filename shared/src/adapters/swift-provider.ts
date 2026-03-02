import { SYMBOL_KIND, SYMBOL_TYPE } from "./language-provider-common.js";
import {
  createRegexLanguageProviderClass,
  extractNamesFromMatchers,
  extractSignaturesFromLineMatchers,
  parseImportsFromPatterns,
} from "./regex-language-provider-helpers.js";

const SWIFT_IMPORT_RE = /import\s+(?:struct\s+|class\s+|enum\s+|protocol\s+)?([\w.]+)/g;

function isRelativeSwiftImport(_source: string): boolean {
  return false;
}

const FUNC_LINE_RE = /^\s*func\s+(\w+)/;
const CLASS_LINE_RE = /^\s*class\s+(\w+)/;
const STRUCT_LINE_RE = /^\s*struct\s+(\w+)/;
const ENUM_LINE_RE = /^\s*enum\s+(\w+)/;

const FUNC_NAME_RE = /func\s+(\w+)/g;
const CLASS_NAME_RE = /class\s+(\w+)/g;
const STRUCT_NAME_RE = /struct\s+(\w+)/g;
const ENUM_NAME_RE = /enum\s+(\w+)/g;

export const SwiftProvider = createRegexLanguageProviderClass({
  id: "swift",
  extension: ".swift",
  parseImportsImpl: (fileContent) =>
    parseImportsFromPatterns(fileContent, [
      { re: SWIFT_IMPORT_RE, isRelative: isRelativeSwiftImport },
    ]),
  extractSignaturesOnlyImpl: (fileContent) =>
    extractSignaturesFromLineMatchers(fileContent, [
      { re: FUNC_LINE_RE, symbolType: SYMBOL_TYPE.FUNCTION },
      { re: CLASS_LINE_RE, symbolType: SYMBOL_TYPE.CLASS },
      { re: STRUCT_LINE_RE, symbolType: SYMBOL_TYPE.CLASS },
      { re: ENUM_LINE_RE, symbolType: SYMBOL_TYPE.CLASS },
    ]),
  extractNamesImpl: (fileContent) =>
    extractNamesFromMatchers(fileContent, [
      { re: FUNC_NAME_RE, kind: SYMBOL_KIND.FUNCTION },
      { re: CLASS_NAME_RE, kind: SYMBOL_KIND.CLASS },
      { re: STRUCT_NAME_RE, kind: SYMBOL_KIND.CLASS },
      { re: ENUM_NAME_RE, kind: SYMBOL_KIND.CLASS },
    ]),
});
