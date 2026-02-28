import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { ImportRef } from "#core/types/import-ref.js";
import type { CodeChunk } from "#core/types/code-chunk.js";
import type { ExportedSymbol } from "#core/types/exported-symbol.js";
import { toFileExtension, toRelativePath } from "#core/types/paths.js";
import { toLineNumber, toTokenCount } from "#core/types/units.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "#core/types/enums.js";

const EMPTY_PATH = toRelativePath("");

const EXT_PY = ".py";
const EXT_GO = ".go";
const EXT_RS = ".rs";
const EXT_JAVA = ".java";

function extensionFromPath(filePath: RelativePath): string {
  const s = filePath.trim();
  const last = s.lastIndexOf(".");
  return last >= 0 ? s.slice(last) : "";
}

function isRelativeSource(source: string): boolean {
  return source.startsWith(".") || source.startsWith("/");
}

function refFromSource(source: string, symbols: readonly string[]): ImportRef {
  return { source, symbols, isRelative: isRelativeSource(source) };
}

function parseImportsPython(content: string): readonly ImportRef[] {
  const importSingle = /^\s*import\s+([\w.]+)\s*(?:#|$)/gm;
  const fromImport = /^\s*from\s+([\w.]+)\s+import\s+(.+?)\s*(?:#|$)/gm;
  const singles = [...content.matchAll(importSingle)]
    .map((m) => m[1] ?? "")
    .filter((s) => s.length > 0)
    .map((source) => refFromSource(source, []));
  const froms = [...content.matchAll(fromImport)].map((m) => {
    const source = m[1] ?? "";
    const symStr = m[2] ?? "";
    const symbols = symStr
      .split(",")
      .map((s) => (s.trim().split(/\s+as\s+/)[0] ?? "").trim())
      .filter(Boolean);
    return refFromSource(source, symbols);
  });
  return [...singles, ...froms];
}

function parseGoGroupImports(lines: readonly string[]): readonly ImportRef[] {
  return lines.reduce<{ readonly inGroup: boolean; readonly refs: readonly ImportRef[] }>(
    (state, line) => {
      if (/^\s*import\s*\(\s*$/.test(line)) {
        return { ...state, inGroup: true };
      }
      if (state.inGroup && /^\s*\)\s*/.test(line)) {
        return { ...state, inGroup: false };
      }
      if (state.inGroup) {
        const g = /^\s*"([^"]+)"/.exec(line);
        if (g) {
          const source = g[1] ?? "";
          return { ...state, refs: [...state.refs, refFromSource(source, [])] };
        }
      }
      return state;
    },
    { inGroup: false, refs: [] },
  ).refs;
}

function parseImportsGo(content: string): readonly ImportRef[] {
  const single = /^\s*import\s+"([^"]+)"/gm;
  const singles = [...content.matchAll(single)]
    .map((m) => m[1] ?? "")
    .filter((s) => s.length > 0)
    .map((source) => refFromSource(source, []));
  const grouped = parseGoGroupImports(content.split("\n"));
  return [...singles, ...grouped];
}

function parseImportsRust(content: string): readonly ImportRef[] {
  const useStmt = /^\s*use\s+([\w:{}.,\s]+)\s*;/gm;
  return [...content.matchAll(useStmt)].map((m) => {
    const full = m[1] ?? "";
    const source = full.includes("{")
      ? full.replace(/\s*\{[^}]*\}\s*$/, "").trim()
      : full;
    const brace = full.match(/\{\s*([^}]+)\s*\}/);
    const symbols = brace
      ? (brace[1] ?? "")
          .split(",")
          .map((s) => (s.trim().split(/\s+as\s+/)[0] ?? "").trim())
          .filter(Boolean)
      : [];
    return refFromSource(source, symbols);
  });
}

function parseImportsJava(content: string): readonly ImportRef[] {
  const importLine = /^\s*import\s+(?:static\s+)?([\w.*]+)\s*;/gm;
  return [...content.matchAll(importLine)]
    .map((m) => m[1] ?? "")
    .filter((s) => s.length > 0)
    .map((source) => refFromSource(source, []));
}

function makeChunk(
  name: string,
  symbolType: CodeChunk["symbolType"],
  lineNum: number,
  line: string,
): CodeChunk {
  return {
    filePath: EMPTY_PATH,
    symbolName: name,
    symbolType,
    startLine: toLineNumber(lineNum),
    endLine: toLineNumber(lineNum),
    content: line,
    tokenCount: toTokenCount(0),
  };
}

interface LineMatcher {
  readonly re: RegExp;
  readonly symbolType: CodeChunk["symbolType"];
}

function extractSignaturesWithMatchers(
  content: string,
  matchers: readonly LineMatcher[],
): readonly CodeChunk[] {
  const lines = content.split("\n");
  return lines.reduce<readonly CodeChunk[]>((chunks, line, i) => {
    const lineNum = i + 1;
    const matched = matchers.reduce<CodeChunk | null>((found, matcher) => {
      if (found !== null) return found;
      const m = matcher.re.exec(line);
      return m !== null ? makeChunk(m[1] ?? "", matcher.symbolType, lineNum, line) : null;
    }, null);
    return matched !== null ? [...chunks, matched] : chunks;
  }, []);
}

const PY_SIG_MATCHERS: readonly LineMatcher[] = [
  { re: /^\s*def\s+(\w+)\s*\(/, symbolType: SYMBOL_TYPE.FUNCTION },
  { re: /^\s*class\s+(\w+)/, symbolType: SYMBOL_TYPE.CLASS },
];

const GO_SIG_MATCHERS: readonly LineMatcher[] = [
  { re: /^\s*func\s+(?:\(\s*\w+\s*\)\s+)?(\w+)\s*\(/, symbolType: SYMBOL_TYPE.FUNCTION },
  { re: /^\s*type\s+(\w+)\s+/, symbolType: SYMBOL_TYPE.CLASS },
];

const RS_SIG_MATCHERS: readonly LineMatcher[] = [
  { re: /^\s*(?:pub\s+)?fn\s+(\w+)\s*\(/, symbolType: SYMBOL_TYPE.FUNCTION },
  { re: /^\s*(?:pub\s+)?struct\s+(\w+)/, symbolType: SYMBOL_TYPE.CLASS },
  { re: /^\s*impl\s+(?:[\w:<>]+)\s+for\s+(\w+)/, symbolType: SYMBOL_TYPE.CLASS },
];

const JAVA_SIG_MATCHERS: readonly LineMatcher[] = [
  {
    re: /^\s*(?:public\s+)?(?:abstract\s+)?class\s+(\w+)/,
    symbolType: SYMBOL_TYPE.CLASS,
  },
  {
    re: /^\s*(?:public|private|protected)\s+(?:\w+\s+)+(\w+)\s*\(\s*[^)]*\)/,
    symbolType: SYMBOL_TYPE.METHOD,
  },
];

function extractSignaturesPython(content: string): readonly CodeChunk[] {
  return extractSignaturesWithMatchers(content, PY_SIG_MATCHERS);
}

function extractSignaturesGo(content: string): readonly CodeChunk[] {
  return extractSignaturesWithMatchers(content, GO_SIG_MATCHERS);
}

function extractSignaturesRust(content: string): readonly CodeChunk[] {
  return extractSignaturesWithMatchers(content, RS_SIG_MATCHERS);
}

function extractSignaturesJava(content: string): readonly CodeChunk[] {
  return extractSignaturesWithMatchers(content, JAVA_SIG_MATCHERS);
}

interface NameMatcher {
  readonly re: RegExp;
  readonly kind: ExportedSymbol["kind"];
}

function extractNamesWithMatchers(
  content: string,
  matchers: readonly NameMatcher[],
): readonly ExportedSymbol[] {
  return matchers.reduce<readonly ExportedSymbol[]>(
    (symbols, matcher) =>
      [...content.matchAll(matcher.re)].reduce<readonly ExportedSymbol[]>(
        (acc, m) => [...acc, { name: m[1] ?? "", kind: matcher.kind }],
        symbols,
      ),
    [],
  );
}

function extractNamesPython(content: string): readonly ExportedSymbol[] {
  return extractNamesWithMatchers(content, [
    { re: /^\s*def\s+(\w+)\s*\(/gm, kind: SYMBOL_KIND.FUNCTION },
    { re: /^\s*class\s+(\w+)/gm, kind: SYMBOL_KIND.CLASS },
  ]);
}

function extractNamesGo(content: string): readonly ExportedSymbol[] {
  return extractNamesWithMatchers(content, [
    {
      re: /^\s*func\s+(?:\(\s*\w+\s*\)\s+)?([A-Z]\w*)\s*\(/gm,
      kind: SYMBOL_KIND.FUNCTION,
    },
    { re: /^\s*type\s+([A-Z]\w*)\s+/gm, kind: SYMBOL_KIND.CLASS },
  ]);
}

function extractNamesRust(content: string): readonly ExportedSymbol[] {
  const pubSymbols = extractNamesWithMatchers(content, [
    { re: /^\s*pub\s+fn\s+(\w+)\s*\(/gm, kind: SYMBOL_KIND.FUNCTION },
    { re: /^\s*pub\s+struct\s+(\w+)/gm, kind: SYMBOL_KIND.CLASS },
  ]);
  const pubNames = new Set(pubSymbols.map((s) => s.name));
  const allSymbols = extractNamesWithMatchers(content, [
    { re: /^\s*fn\s+(\w+)\s*\(/gm, kind: SYMBOL_KIND.FUNCTION },
    { re: /^\s*struct\s+(\w+)/gm, kind: SYMBOL_KIND.CLASS },
  ]);
  const nonPub = allSymbols.filter((s) => !pubNames.has(s.name));
  return [...pubSymbols, ...nonPub];
}

function extractNamesJava(content: string): readonly ExportedSymbol[] {
  return extractNamesWithMatchers(content, [
    { re: /^\s*public\s+class\s+(\w+)/gm, kind: SYMBOL_KIND.CLASS },
    { re: /^\s*public\s+(?:\w+\s+)+(\w+)\s*\(\s*[^)]*\)/gm, kind: SYMBOL_KIND.FUNCTION },
  ]);
}

type ParseImportsFn = (content: string) => readonly ImportRef[];

const PARSE_IMPORTS: Record<string, ParseImportsFn> = {
  [EXT_PY]: parseImportsPython,
  [EXT_GO]: parseImportsGo,
  [EXT_RS]: parseImportsRust,
  [EXT_JAVA]: parseImportsJava,
};

export class GenericImportProvider implements LanguageProvider {
  readonly id = "generic-import";
  readonly extensions: readonly FileExtension[];

  constructor() {
    this.extensions = [
      toFileExtension(EXT_PY),
      toFileExtension(EXT_GO),
      toFileExtension(EXT_RS),
      toFileExtension(EXT_JAVA),
    ];
  }

  parseImports(fileContent: string, filePath: RelativePath): readonly ImportRef[] {
    try {
      const ext = extensionFromPath(filePath);
      const fn = PARSE_IMPORTS[ext];
      return fn !== undefined ? fn(fileContent) : [];
    } catch {
      return [];
    }
  }

  extractSignaturesWithDocs(_fileContent: string): readonly CodeChunk[] {
    return [];
  }

  extractSignaturesOnly(fileContent: string): readonly CodeChunk[] {
    try {
      return [
        ...extractSignaturesPython(fileContent),
        ...extractSignaturesGo(fileContent),
        ...extractSignaturesRust(fileContent),
        ...extractSignaturesJava(fileContent),
      ];
    } catch {
      return [];
    }
  }

  extractNames(fileContent: string): readonly ExportedSymbol[] {
    try {
      return [
        ...extractNamesPython(fileContent),
        ...extractNamesGo(fileContent),
        ...extractNamesRust(fileContent),
        ...extractNamesJava(fileContent),
      ];
    } catch {
      return [];
    }
  }
}
