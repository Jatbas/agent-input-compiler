import { Parser, Language, type Node, type Tree } from "web-tree-sitter";
import { createRequire } from "node:module";
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { ImportRef } from "#core/types/import-ref.js";
import type { CodeChunk } from "#core/types/code-chunk.js";
import type { ExportedSymbol } from "#core/types/exported-symbol.js";
import type { SymbolKind, SymbolType } from "#core/types/enums.js";
import { toFileExtension, toRelativePath } from "#core/types/paths.js";
import { toLineNumber, toTokenCount } from "#core/types/units.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "#core/types/enums.js";

const EMPTY_PATH = toRelativePath("");

type TSNode = Node;
type TSTree = Tree;

function nodeText(source: string, node: TSNode): string {
  return source.slice(node.startIndex, node.endIndex);
}

function lineFromNode(node: TSNode): number {
  return node.startPosition.row + 1;
}

function parseImportStatementText(text: string): readonly ImportRef[] {
  const afterImport = text.replace(/^\s*import\s+/, "").trim();
  const isRelative = afterImport.startsWith(".");
  const items = afterImport
    .split(",")
    .map((s) => s.trim().split(/\s+as\s+/)[0] ?? "")
    .filter(Boolean);
  return items.map((source) => ({
    source: source.trim(),
    symbols: [] as readonly string[],
    isRelative: isRelative || source.startsWith("."),
  }));
}

function parseImportFromText(text: string): ImportRef | null {
  const fromMatch = text.match(/^\s*from\s+(.+?)\s+import\s+(.+)\s*$/s);
  if (fromMatch === null) return null;
  const source = (fromMatch[1] ?? "").trim();
  const importPart = (fromMatch[2] ?? "").trim();
  const isRelative = source.startsWith(".");
  const symbols =
    importPart === "*"
      ? []
      : importPart
          .replace(/^\(|\)$/g, "")
          .split(",")
          .map((s) => (s.trim().split(/\s+as\s+/)[0] ?? "").trim())
          .filter(Boolean);
  return { source, symbols, isRelative };
}

function childrenOf(node: TSNode): readonly TSNode[] {
  return Array.from({ length: node.childCount }, (_, c) => node.child(c)).filter(
    (ch): ch is TSNode => ch !== null,
  );
}

const IMPORT_HANDLERS: Record<
  string,
  (source: string, node: TSNode) => readonly ImportRef[]
> = {
  import_statement: (source, node) => parseImportStatementText(nodeText(source, node)),
  import_from_statement: (source, node) => {
    const r = parseImportFromText(nodeText(source, node));
    if (r === null) return [];
    return [r];
  },
};

function importRefsFromNode(source: string, node: TSNode): readonly ImportRef[] {
  const handler = IMPORT_HANDLERS[node.type];
  if (handler !== undefined) return handler(source, node);
  return [];
}

function collectImports(source: string, node: TSNode): readonly ImportRef[] {
  const self = importRefsFromNode(source, node);
  const childRefs = childrenOf(node).flatMap((ch) => collectImports(source, ch));
  return [...self, ...childRefs];
}

function docstringFromBody(source: string, bodyNode: TSNode): string {
  const first = bodyNode.firstChild;
  if (first === null) return "";
  const t = nodeText(source, first).trim();
  if (
    (t.startsWith('"""') && t.endsWith('"""')) ||
    (t.startsWith("'''") && t.endsWith("'''"))
  )
    return t;
  return "";
}

function findDefName(node: TSNode, source: string): string | null {
  const nameChild = node.childForFieldName("name");
  if (nameChild === null) return null;
  return nodeText(source, nameChild).trim();
}

const SYMBOL_TYPE_BY_DEF: Record<string, SymbolType> = {
  class_definition: SYMBOL_TYPE.CLASS,
  function_definition: SYMBOL_TYPE.FUNCTION,
};

function symbolTypeForDefNode(node: TSNode): SymbolType {
  return SYMBOL_TYPE_BY_DEF[node.type] ?? SYMBOL_TYPE.FUNCTION;
}

function signatureRange(
  source: string,
  node: TSNode,
): { startLine: number; endLine: number; sigText: string } {
  const startLine = lineFromNode(node);
  const full = nodeText(source, node);
  const colonIdx = full.indexOf(":");
  const sigText = colonIdx >= 0 ? full.slice(0, colonIdx + 1).trim() : full;
  const sigLines = sigText.split("\n");
  const endLine = startLine + Math.max(0, sigLines.length - 1);
  return { startLine, endLine, sigText };
}

function collectSignatures(
  source: string,
  node: TSNode,
  withDocs: boolean,
): readonly CodeChunk[] {
  if (node.type === "function_definition" || node.type === "class_definition") {
    const name = findDefName(node, source);
    if (name === null || name === "") {
      return childrenOf(node).flatMap((ch) => collectSignatures(source, ch, withDocs));
    }
    const symbolType = symbolTypeForDefNode(node);
    const { startLine, endLine, sigText } = signatureRange(source, node);
    const body = node.childForFieldName("body");
    const doc = withDocs && body !== null ? docstringFromBody(source, body) : "";
    const content = doc !== "" ? `${doc}\n${sigText}` : sigText;
    const chunk: CodeChunk = {
      filePath: EMPTY_PATH,
      symbolName: name,
      symbolType,
      startLine: toLineNumber(startLine),
      endLine: toLineNumber(endLine),
      content,
      tokenCount: toTokenCount(0),
    };
    const rest = childrenOf(node).flatMap((ch) =>
      collectSignatures(source, ch, withDocs),
    );
    return [chunk, ...rest];
  }
  return childrenOf(node).flatMap((ch) => collectSignatures(source, ch, withDocs));
}

const SYMBOL_KIND_BY_DEF: Record<string, SymbolKind> = {
  class_definition: SYMBOL_KIND.CLASS,
  function_definition: SYMBOL_KIND.FUNCTION,
};

function symbolKindForDefNode(node: TSNode): SymbolKind {
  return SYMBOL_KIND_BY_DEF[node.type] ?? SYMBOL_KIND.FUNCTION;
}

function collectExportedNames(source: string, node: TSNode): readonly ExportedSymbol[] {
  if (node.type === "function_definition" || node.type === "class_definition") {
    const name = findDefName(node, source);
    const kind = symbolKindForDefNode(node);
    const self: readonly ExportedSymbol[] =
      name !== null && name !== "" ? [{ name, kind }] : [];
    const rest = childrenOf(node).flatMap((ch) => collectExportedNames(source, ch));
    return [...self, ...rest];
  }
  return childrenOf(node).flatMap((ch) => collectExportedNames(source, ch));
}

function resolveWasmPath(): string {
  const resolve = createRequire(import.meta.url).resolve;
  return resolve("tree-sitter-python/tree-sitter-python.wasm");
}

export class PythonProvider implements LanguageProvider {
  readonly id = "python";
  readonly extensions: readonly FileExtension[];

  private constructor(private readonly parser: Parser) {
    this.extensions = [toFileExtension(".py")];
  }

  static async create(): Promise<PythonProvider> {
    await Parser.init();
    const language = await Language.load(resolveWasmPath());
    const parser = new Parser();
    parser.setLanguage(language);
    return new PythonProvider(parser);
  }

  parseImports(fileContent: string, _filePath: RelativePath): readonly ImportRef[] {
    try {
      const tree: TSTree | null = this.parser.parse(fileContent);
      if (tree === null) return [];
      return collectImports(fileContent, tree.rootNode);
    } catch {
      return [];
    }
  }

  extractSignaturesWithDocs(fileContent: string): readonly CodeChunk[] {
    try {
      const tree: TSTree | null = this.parser.parse(fileContent);
      if (tree === null) return [];
      return collectSignatures(fileContent, tree.rootNode, true);
    } catch {
      return [];
    }
  }

  extractSignaturesOnly(fileContent: string): readonly CodeChunk[] {
    try {
      const tree: TSTree | null = this.parser.parse(fileContent);
      if (tree === null) return [];
      return collectSignatures(fileContent, tree.rootNode, false);
    } catch {
      return [];
    }
  }

  extractNames(fileContent: string): readonly ExportedSymbol[] {
    try {
      const tree: TSTree | null = this.parser.parse(fileContent);
      if (tree === null) return [];
      return collectExportedNames(fileContent, tree.rootNode);
    } catch {
      return [];
    }
  }
}
