import * as ts from "typescript";
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { ImportRef } from "#core/types/import-ref.js";
import type { CodeChunk } from "#core/types/code-chunk.js";
import type { ExportedSymbol } from "#core/types/exported-symbol.js";
import type { SymbolType } from "#core/types/enums.js";
import { toFileExtension, toRelativePath } from "#core/types/paths.js";
import { toLineNumber, toTokenCount } from "#core/types/units.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "#core/types/enums.js";

const EMPTY_PATH = toRelativePath("");

// Regex for ES import: import [default] [* as name | { a, b }] from 'source' or "source"
const ES_IMPORT_RE =
  /^\s*import\s+(?:(?:\*\s+as\s+(\w+))|(?:\{([^}]*)\})|(\w+))?\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm;
// Regex for side-effect import: import 'source'
const SIDE_IMPORT_RE = /^\s*import\s+['"]([^'"]+)['"]\s*;?\s*$/gm;
// Regex for require: require('source') or require("source")
const REQUIRE_RE = /(?:^|\s)require\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;

function parseImports(
  fileContent: string,
  _filePath: RelativePath,
): readonly ImportRef[] {
  const seen = new Set<string>();
  let out: readonly ImportRef[] = [];

  function add(source: string, symbols: readonly string[], isRelative: boolean): void {
    const key = `${source}\0${symbols.join(",")}`;
    if (seen.has(key)) return;
    seen.add(key);
    out = [...out, { source, symbols, isRelative }];
  }

  let m: RegExpExecArray | null;
  ES_IMPORT_RE.lastIndex = 0;
  while ((m = ES_IMPORT_RE.exec(fileContent)) !== null) {
    const source = m[4];
    if (source === undefined) continue;
    const namespace = m[1];
    const named = m[2];
    const defaultName = m[3];
    const isRelative = source.startsWith(".") || source.startsWith("/");
    const symbols: readonly string[] = [
      ...(namespace !== undefined && namespace !== "" ? [namespace] : []),
      ...(named !== undefined && named !== ""
        ? named.split(",").map((s) => {
            const t = s.trim().split(/\s+as\s+/);
            return (t[1] ?? t[0] ?? "").trim();
          })
        : []),
      ...(defaultName !== undefined && defaultName !== "" ? [defaultName] : []),
    ];
    add(source, symbols, isRelative);
  }

  SIDE_IMPORT_RE.lastIndex = 0;
  while ((m = SIDE_IMPORT_RE.exec(fileContent)) !== null) {
    const source = m[1];
    if (source === undefined || ES_IMPORT_RE.test(m[0])) continue;
    const isRelative = source.startsWith(".") || source.startsWith("/");
    add(source, [], isRelative);
  }

  REQUIRE_RE.lastIndex = 0;
  while ((m = REQUIRE_RE.exec(fileContent)) !== null) {
    const source = m[1];
    if (source === undefined) continue;
    const isRelative = source.startsWith(".") || source.startsWith("/");
    add(source, [], isRelative);
  }

  return out;
}

export class TypeScriptProvider implements LanguageProvider {
  readonly id = "typescript";
  readonly extensions: readonly FileExtension[];

  constructor() {
    this.extensions = [
      toFileExtension(".ts"),
      toFileExtension(".tsx"),
      toFileExtension(".js"),
      toFileExtension(".jsx"),
    ];
  }

  parseImports(fileContent: string, filePath: RelativePath): readonly ImportRef[] {
    return parseImports(fileContent, filePath);
  }

  extractSignaturesWithDocs(fileContent: string): readonly CodeChunk[] {
    return extractSignatures(fileContent, true);
  }

  extractSignaturesOnly(fileContent: string): readonly CodeChunk[] {
    return extractSignatures(fileContent, false);
  }

  extractNames(fileContent: string): readonly ExportedSymbol[] {
    return extractNamesImpl(fileContent);
  }
}

function getLine(node: ts.Node, sourceFile: ts.SourceFile): number {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return line + 1;
}

function getEndLine(node: ts.Node, sourceFile: ts.SourceFile): number {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return line + 1;
}

function mapSyntaxKindToSymbolKind(
  kind: ts.SyntaxKind,
): (typeof SYMBOL_KIND)[keyof typeof SYMBOL_KIND] {
  if (kind === ts.SyntaxKind.ClassDeclaration) return SYMBOL_KIND.CLASS;
  if (
    kind === ts.SyntaxKind.FunctionDeclaration ||
    kind === ts.SyntaxKind.FunctionExpression
  )
    return SYMBOL_KIND.FUNCTION;
  if (kind === ts.SyntaxKind.InterfaceDeclaration) return SYMBOL_KIND.INTERFACE;
  if (kind === ts.SyntaxKind.TypeAliasDeclaration) return SYMBOL_KIND.TYPE;
  if (kind === ts.SyntaxKind.VariableStatement) return SYMBOL_KIND.CONST;
  return SYMBOL_KIND.FUNCTION;
}

function getJSDoc(node: ts.Node, sourceFile: ts.SourceFile): string {
  const full = sourceFile.getFullText();
  const start = node.getStart(sourceFile);
  const leading = full.slice(0, start);
  const match = leading.match(/\/\*\*[\s\S]*?\*\/\s*$/);
  return match ? match[0].trim() : "";
}

function extractSignatures(fileContent: string, withDocs: boolean): readonly CodeChunk[] {
  const sourceFile = ts.createSourceFile(
    "file.ts",
    fileContent,
    ts.ScriptTarget.Latest,
    true,
  );
  let chunks: readonly CodeChunk[] = [];

  function visit(node: ts.Node): void {
    let name: string | null = null;
    let symbolType: SymbolType = SYMBOL_TYPE.FUNCTION;
    let content: string;

    if (ts.isFunctionDeclaration(node)) {
      name = node.name?.getText(sourceFile) ?? null;
      symbolType = SYMBOL_TYPE.FUNCTION;
      const doc = withDocs ? getJSDoc(node, sourceFile) : "";
      const sig = node.getText(sourceFile).replace(/\s*\{[\s\S]*$/, " { }");
      content = doc ? `${doc}\n${sig}` : sig;
    } else if (ts.isClassDeclaration(node)) {
      name = node.name?.getText(sourceFile) ?? null;
      symbolType = SYMBOL_TYPE.CLASS;
      const doc = withDocs ? getJSDoc(node, sourceFile) : "";
      const sig = node.getText(sourceFile).replace(/\s*\{[\s\S]*$/, " { }");
      content = doc ? `${doc}\n${sig}` : sig;
    } else if (ts.isInterfaceDeclaration(node)) {
      name = node.name.getText(sourceFile);
      symbolType = SYMBOL_TYPE.INTERFACE;
      const doc = withDocs ? getJSDoc(node, sourceFile) : "";
      const sig = node.getText(sourceFile);
      content = doc ? `${doc}\n${sig}` : sig;
    } else if (ts.isMethodDeclaration(node) && ts.isClassDeclaration(node.parent)) {
      name = node.name.getText(sourceFile);
      symbolType = SYMBOL_TYPE.METHOD;
      const doc = withDocs ? getJSDoc(node, sourceFile) : "";
      const sig = node.getText(sourceFile).replace(/\s*\{[\s\S]*$/, " { }");
      content = doc ? `${doc}\n${sig}` : sig;
    } else {
      ts.forEachChild(node, visit);
      return;
    }

    if (name !== null && name !== "") {
      const chunk: CodeChunk = {
        filePath: EMPTY_PATH,
        symbolName: name,
        symbolType,
        startLine: toLineNumber(getLine(node, sourceFile)),
        endLine: toLineNumber(getEndLine(node, sourceFile)),
        content,
        tokenCount: toTokenCount(0),
      };
      chunks = [...chunks, chunk];
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return chunks;
}

function extractNamesImpl(fileContent: string): readonly ExportedSymbol[] {
  const sourceFile = ts.createSourceFile(
    "file.ts",
    fileContent,
    ts.ScriptTarget.Latest,
    true,
  );
  let out: readonly ExportedSymbol[] = [];

  function hasExport(node: ts.Node): boolean {
    const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
  }

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name && hasExport(node)) {
      out = [
        ...out,
        {
          name: node.name.getText(sourceFile),
          kind: mapSyntaxKindToSymbolKind(node.kind),
        },
      ];
    } else if (ts.isClassDeclaration(node) && node.name && hasExport(node)) {
      out = [
        ...out,
        {
          name: node.name.getText(sourceFile),
          kind: mapSyntaxKindToSymbolKind(node.kind),
        },
      ];
    } else if (ts.isInterfaceDeclaration(node) && hasExport(node)) {
      out = [
        ...out,
        {
          name: node.name.getText(sourceFile),
          kind: mapSyntaxKindToSymbolKind(node.kind),
        },
      ];
    } else if (ts.isTypeAliasDeclaration(node) && hasExport(node)) {
      out = [
        ...out,
        {
          name: node.name.getText(sourceFile),
          kind: SYMBOL_KIND.TYPE,
        },
      ];
    } else if (ts.isVariableStatement(node) && hasExport(node)) {
      const added: ExportedSymbol[] = node.declarationList.declarations
        .filter((d): d is ts.VariableDeclaration & { name: ts.Identifier } =>
          ts.isIdentifier(d.name),
        )
        .map((d) => ({ name: d.name.getText(sourceFile), kind: SYMBOL_KIND.CONST }));
      out = [...out, ...added];
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return out;
}
