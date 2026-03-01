import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type {
  CodeChunk,
  ExportedSymbol,
  FileExtension,
  ImportRef,
  RelativePath,
} from "./language-provider-common.js";
import {
  EMPTY_RELATIVE_PATH,
  SYMBOL_KIND,
  SYMBOL_TYPE,
  toFileExtension,
  toLineNumber,
  toTokenCount,
} from "./language-provider-common.js";

const EMPTY_SYMBOLS: readonly string[] = [];

const REQUIRE_LOAD_RE = /(?:require|load)\s*(?:\(\s*)?["']([^"']+)["']\s*(?:\))?/g;

function isRelativeRubyPath(source: string): boolean {
  return source.startsWith(".");
}

function parseImportsImpl(fileContent: string): readonly ImportRef[] {
  return [...fileContent.matchAll(REQUIRE_LOAD_RE)]
    .map((m) => (m[1] ?? "").trim())
    .filter((source) => source.length > 0)
    .map((source) => ({
      source,
      symbols: EMPTY_SYMBOLS,
      isRelative: isRelativeRubyPath(source),
    }));
}

const DEF_LINE_RE = /^\s*def\s+(\w+)/;
const CLASS_LINE_RE = /^\s*class\s+(\w+)/;

function extractSignaturesOnlyImpl(fileContent: string): readonly CodeChunk[] {
  const lines = fileContent.split("\n");
  return lines.reduce<readonly CodeChunk[]>((acc, line, i) => {
    const lineNum = i + 1;
    const defMatch = DEF_LINE_RE.exec(line);
    if (defMatch !== null) {
      const name = defMatch[1] ?? "";
      if (name.length > 0) {
        return [
          ...acc,
          {
            filePath: EMPTY_RELATIVE_PATH,
            symbolName: name,
            symbolType: SYMBOL_TYPE.FUNCTION,
            startLine: toLineNumber(lineNum),
            endLine: toLineNumber(lineNum),
            content: line,
            tokenCount: toTokenCount(0),
          },
        ];
      }
    }
    const classMatch = CLASS_LINE_RE.exec(line);
    if (classMatch !== null) {
      const name = classMatch[1] ?? "";
      if (name.length > 0) {
        return [
          ...acc,
          {
            filePath: EMPTY_RELATIVE_PATH,
            symbolName: name,
            symbolType: SYMBOL_TYPE.CLASS,
            startLine: toLineNumber(lineNum),
            endLine: toLineNumber(lineNum),
            content: line,
            tokenCount: toTokenCount(0),
          },
        ];
      }
    }
    return acc;
  }, []);
}

const CLASS_NAME_RE = /^\s*class\s+(\w+)/gm;
const MODULE_NAME_RE = /^\s*module\s+(\w+)/gm;
const DEF_SELF_RE = /^\s*def\s+self\.(\w+)/gm;

function extractNamesImpl(fileContent: string): readonly ExportedSymbol[] {
  const classNames = [...fileContent.matchAll(CLASS_NAME_RE)]
    .map((m) => m[1] ?? "")
    .filter((s) => s.length > 0)
    .map((name) => ({ name, kind: SYMBOL_KIND.CLASS }) as const);
  const moduleNames = [...fileContent.matchAll(MODULE_NAME_RE)]
    .map((m) => m[1] ?? "")
    .filter((s) => s.length > 0)
    .map((name) => ({ name, kind: SYMBOL_KIND.CLASS }) as const);
  const defSelfNames = [...fileContent.matchAll(DEF_SELF_RE)]
    .map((m) => m[1] ?? "")
    .filter((s) => s.length > 0)
    .map((name) => ({ name, kind: SYMBOL_KIND.FUNCTION }) as const);
  return [...classNames, ...moduleNames, ...defSelfNames];
}

export class RubyProvider implements LanguageProvider {
  readonly id = "ruby";
  readonly extensions: readonly FileExtension[];

  constructor() {
    this.extensions = [toFileExtension(".rb")];
  }

  parseImports(fileContent: string, _filePath: RelativePath): readonly ImportRef[] {
    try {
      return parseImportsImpl(fileContent);
    } catch {
      return [];
    }
  }

  extractSignaturesWithDocs(_fileContent: string): readonly CodeChunk[] {
    return [];
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
