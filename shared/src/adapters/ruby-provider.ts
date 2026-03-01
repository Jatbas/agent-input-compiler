import { SYMBOL_KIND, SYMBOL_TYPE } from "./language-provider-common.js";
import {
  createRegexLanguageProviderClass,
  extractNamesFromMatchers,
  extractSignaturesFromLineMatchers,
  parseImportsFromPatterns,
} from "./regex-language-provider-helpers.js";

const REQUIRE_LOAD_RE = /(?:require|load)\s*(?:\(\s*)?["']([^"']+)["']\s*(?:\))?/g;

function isRelativeRubyPath(source: string): boolean {
  return source.startsWith(".");
}

const DEF_LINE_RE = /^\s*def\s+(\w+)/;
const CLASS_LINE_RE = /^\s*class\s+(\w+)/;

const CLASS_NAME_RE = /^\s*class\s+(\w+)/gm;
const MODULE_NAME_RE = /^\s*module\s+(\w+)/gm;
const DEF_SELF_RE = /^\s*def\s+self\.(\w+)/gm;

export const RubyProvider = createRegexLanguageProviderClass({
  id: "ruby",
  extension: ".rb",
  parseImportsImpl: (fileContent) =>
    parseImportsFromPatterns(fileContent, [
      { re: REQUIRE_LOAD_RE, isRelative: isRelativeRubyPath },
    ]),
  extractSignaturesOnlyImpl: (fileContent) =>
    extractSignaturesFromLineMatchers(fileContent, [
      { re: DEF_LINE_RE, symbolType: SYMBOL_TYPE.FUNCTION },
      { re: CLASS_LINE_RE, symbolType: SYMBOL_TYPE.CLASS },
    ]),
  extractNamesImpl: (fileContent) =>
    extractNamesFromMatchers(fileContent, [
      { re: CLASS_NAME_RE, kind: SYMBOL_KIND.CLASS },
      { re: MODULE_NAME_RE, kind: SYMBOL_KIND.CLASS },
      { re: DEF_SELF_RE, kind: SYMBOL_KIND.FUNCTION },
    ]),
});
