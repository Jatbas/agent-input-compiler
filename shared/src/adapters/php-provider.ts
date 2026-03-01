import { SYMBOL_KIND, SYMBOL_TYPE } from "./language-provider-common.js";
import {
  createRegexLanguageProviderClass,
  extractNamesFromMatchers,
  extractSignaturesFromLineMatchers,
  parseImportsFromPatterns,
} from "./regex-language-provider-helpers.js";

const REQUIRE_INCLUDE_RE =
  /(?:require|include)(?:_once)?\s*(?:\(\s*)?["']([^"']+)["']\s*(?:\))?/g;
const USE_RE = /^\s*use\s+([\w\\]+)(?:\s+as\s+\w+)?\s*;/gm;

function isRelativePhpPath(source: string): boolean {
  return source.startsWith(".") || source.startsWith("./");
}

function normalizeUseSource(source: string): string {
  return source.replace(/\\/g, "/");
}

const FUNCTION_LINE_RE = /function\s+(\w+)\s*\(/;
const CLASS_LINE_RE = /^\s*class\s+(\w+)/;

const CLASS_NAME_RE = /^\s*class\s+(\w+)/gm;
const FUNCTION_NAME_RE = /function\s+(\w+)\s*\(/gm;

export const PhpProvider = createRegexLanguageProviderClass({
  id: "php",
  extension: ".php",
  parseImportsImpl: (fileContent) =>
    parseImportsFromPatterns(fileContent, [
      { re: REQUIRE_INCLUDE_RE, isRelative: isRelativePhpPath },
      { re: USE_RE, isRelative: () => false, normalize: normalizeUseSource },
    ]),
  extractSignaturesOnlyImpl: (fileContent) =>
    extractSignaturesFromLineMatchers(fileContent, [
      { re: FUNCTION_LINE_RE, symbolType: SYMBOL_TYPE.FUNCTION },
      { re: CLASS_LINE_RE, symbolType: SYMBOL_TYPE.CLASS },
    ]),
  extractNamesImpl: (fileContent) =>
    extractNamesFromMatchers(fileContent, [
      { re: CLASS_NAME_RE, kind: SYMBOL_KIND.CLASS },
      { re: FUNCTION_NAME_RE, kind: SYMBOL_KIND.FUNCTION },
    ]),
});
