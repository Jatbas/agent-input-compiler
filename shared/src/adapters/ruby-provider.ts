import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import * as LPC from "./language-provider-common.js";

const EMPTY_SYMBOLS: readonly string[] = [];

const REQUIRE_LOAD_RE = /(?:require|load)\s*(?:\(\s*)?["']([^"']+)["']\s*(?:\))?/g;

function isRelativeRubyPath(source: string): boolean {
  return source.startsWith(".");
}

function parseImportsImpl(fileContent: string): readonly LPC.ImportRef[] {
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

function extractSignaturesOnlyImpl(fileContent: string): readonly LPC.CodeChunk[] {
  const lines = fileContent.split("\n");
  return lines.reduce<readonly LPC.CodeChunk[]>((acc, line, i) => {
    const lineNum = i + 1;
    const defMatch = DEF_LINE_RE.exec(line);
    if (defMatch !== null) {
      const name = defMatch[1] ?? "";
      if (name.length > 0) {
        return [
          ...acc,
          {
            filePath: LPC.EMPTY_RELATIVE_PATH,
            symbolName: name,
            symbolType: LPC.SYMBOL_TYPE.FUNCTION,
            startLine: LPC.toLineNumber(lineNum),
            endLine: LPC.toLineNumber(lineNum),
            content: line,
            tokenCount: LPC.toTokenCount(0),
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
            filePath: LPC.EMPTY_RELATIVE_PATH,
            symbolName: name,
            symbolType: LPC.SYMBOL_TYPE.CLASS,
            startLine: LPC.toLineNumber(lineNum),
            endLine: LPC.toLineNumber(lineNum),
            content: line,
            tokenCount: LPC.toTokenCount(0),
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

function extractNamesImpl(fileContent: string): readonly LPC.ExportedSymbol[] {
  const classNames = [...fileContent.matchAll(CLASS_NAME_RE)]
    .map((m) => m[1] ?? "")
    .filter((s) => s.length > 0)
    .map((name) => ({ name, kind: LPC.SYMBOL_KIND.CLASS }) as const);
  const moduleNames = [...fileContent.matchAll(MODULE_NAME_RE)]
    .map((m) => m[1] ?? "")
    .filter((s) => s.length > 0)
    .map((name) => ({ name, kind: LPC.SYMBOL_KIND.CLASS }) as const);
  const defSelfNames = [...fileContent.matchAll(DEF_SELF_RE)]
    .map((m) => m[1] ?? "")
    .filter((s) => s.length > 0)
    .map((name) => ({ name, kind: LPC.SYMBOL_KIND.FUNCTION }) as const);
  return [...classNames, ...moduleNames, ...defSelfNames];
}

export class RubyProvider implements LanguageProvider {
  readonly id = "ruby";
  readonly extensions: readonly LPC.FileExtension[];

  constructor() {
    this.extensions = [LPC.toFileExtension(".rb")];
  }

  parseImports(
    fileContent: string,
    _filePath: LPC.RelativePath,
  ): readonly LPC.ImportRef[] {
    try {
      return parseImportsImpl(fileContent);
    } catch {
      return [];
    }
  }

  extractSignaturesWithDocs(_fileContent: string): readonly LPC.CodeChunk[] {
    return [];
  }

  extractSignaturesOnly(fileContent: string): readonly LPC.CodeChunk[] {
    try {
      return extractSignaturesOnlyImpl(fileContent);
    } catch {
      return [];
    }
  }

  extractNames(fileContent: string): readonly LPC.ExportedSymbol[] {
    try {
      return extractNamesImpl(fileContent);
    } catch {
      return [];
    }
  }
}
