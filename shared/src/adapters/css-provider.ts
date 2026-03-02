import {
  EMPTY_RELATIVE_PATH,
  SYMBOL_TYPE,
  toLineNumber,
  toTokenCount,
} from "./language-provider-common.js";
import type { CodeChunk } from "./language-provider-common.js";
import {
  createRegexLanguageProviderClass,
  parseImportsFromPatterns,
} from "./regex-language-provider-helpers.js";

const CSS_IMPORT_RE = /@import\s+(?:url\s*\(\s*)?["']?([^"')]+)["']?\s*\)?\s*;?/g;

function isRelativeCssSource(source: string): boolean {
  return source.startsWith(".") || source.startsWith("/");
}

const SELECTOR_LINE_RE = /^\s*([^{]+)\s*\{/;

function extractSelectorChunks(fileContent: string): readonly CodeChunk[] {
  const lines = fileContent.split("\n");
  return lines.reduce<readonly CodeChunk[]>((acc, line, i) => {
    const m = SELECTOR_LINE_RE.exec(line);
    if (m === null || (m[1] ?? "").trim().length === 0) return acc;
    const lineNum = i + 1;
    const symbolName = (m[1] ?? "").trim();
    return [
      ...acc,
      {
        filePath: EMPTY_RELATIVE_PATH,
        symbolName,
        symbolType: SYMBOL_TYPE.CLASS,
        startLine: toLineNumber(lineNum),
        endLine: toLineNumber(lineNum),
        content: line,
        tokenCount: toTokenCount(0),
      },
    ];
  }, []);
}

export const CssProvider = createRegexLanguageProviderClass({
  id: "css",
  extension: ".css",
  parseImportsImpl: (fileContent) =>
    parseImportsFromPatterns(fileContent, [
      { re: CSS_IMPORT_RE, isRelative: isRelativeCssSource },
    ]),
  extractSignaturesOnlyImpl: extractSelectorChunks,
  extractNamesImpl: () => [],
});
