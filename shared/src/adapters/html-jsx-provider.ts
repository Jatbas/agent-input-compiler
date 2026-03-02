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

const SCRIPT_SRC_RE = /<script\s+[^>]*src=["']([^"']+)["']/g;
const LINK_HREF_RE = /<link\s+[^>]*href=["']([^"']+)["']/g;

function isRelativeHtmlSource(source: string): boolean {
  return source.startsWith(".") || source.startsWith("/");
}

const OPENING_TAG_RE = /<([a-zA-Z][a-zA-Z0-9]*)[\s>]/g;

function extractTagChunks(fileContent: string): readonly CodeChunk[] {
  const lines = fileContent.split("\n");
  return lines.reduce<readonly CodeChunk[]>((acc, line, i) => {
    const lineNum = i + 1;
    const matches = [...line.matchAll(OPENING_TAG_RE)];
    const chunks: readonly CodeChunk[] = matches.map((m) => ({
      filePath: EMPTY_RELATIVE_PATH,
      symbolName: m[1] ?? "",
      symbolType: SYMBOL_TYPE.CLASS,
      startLine: toLineNumber(lineNum),
      endLine: toLineNumber(lineNum),
      content: line,
      tokenCount: toTokenCount(0),
    }));
    return [...acc, ...chunks];
  }, []);
}

export const HtmlJsxProvider = createRegexLanguageProviderClass({
  id: "html-jsx",
  extension: ".html",
  parseImportsImpl: (fileContent) =>
    parseImportsFromPatterns(fileContent, [
      { re: SCRIPT_SRC_RE, isRelative: isRelativeHtmlSource },
      { re: LINK_HREF_RE, isRelative: isRelativeHtmlSource },
    ]),
  extractSignaturesOnlyImpl: extractTagChunks,
  extractNamesImpl: () => [],
});
