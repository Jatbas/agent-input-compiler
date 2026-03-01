import type { FileExtension } from "#core/types/paths.js";
import type { ImportRef } from "#core/types/import-ref.js";
import type { CodeChunk } from "#core/types/code-chunk.js";
import type { ExportedSymbol } from "#core/types/exported-symbol.js";
import type { SymbolKind, SymbolType } from "#core/types/enums.js";
import { toFileExtension } from "#core/types/paths.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "#core/types/enums.js";
import {
  type Node,
  nodeText,
  lineFromNode,
  childrenOf,
  buildCodeChunk,
  walkTreeForSignatures,
  walkTreeForNames,
} from "./tree-sitter-node-utils.js";
import {
  defineTreeSitterProvider,
  resolveTreeSitterWasm,
} from "./tree-sitter-provider-factory.js";

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

const IMPORT_HANDLERS: Record<
  string,
  (source: string, node: Node) => readonly ImportRef[]
> = {
  import_statement: (source, node) => parseImportStatementText(nodeText(source, node)),
  import_from_statement: (source, node) => {
    const r = parseImportFromText(nodeText(source, node));
    if (r === null) return [];
    return [r];
  },
};

function importRefsFromNode(source: string, node: Node): readonly ImportRef[] {
  const handler = IMPORT_HANDLERS[node.type];
  if (handler !== undefined) return handler(source, node);
  return [];
}

function collectImports(source: string, node: Node): readonly ImportRef[] {
  const self = importRefsFromNode(source, node);
  const childRefs = childrenOf(node).flatMap((ch) => collectImports(source, ch));
  return [...self, ...childRefs];
}

function docstringFromBody(source: string, bodyNode: Node): string {
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

const SYMBOL_TYPE_BY_DEF: Record<string, SymbolType> = {
  class_definition: SYMBOL_TYPE.CLASS,
  function_definition: SYMBOL_TYPE.FUNCTION,
};

function symbolTypeForDefNode(node: Node): SymbolType {
  return SYMBOL_TYPE_BY_DEF[node.type] ?? SYMBOL_TYPE.FUNCTION;
}

function signatureRange(
  source: string,
  node: Node,
): { startLine: number; endLine: number; sigText: string } {
  const startLine = lineFromNode(node);
  const full = nodeText(source, node);
  const colonIdx = full.indexOf(":");
  const sigText = colonIdx >= 0 ? full.slice(0, colonIdx + 1).trim() : full;
  const sigLines = sigText.split("\n");
  const endLine = startLine + Math.max(0, sigLines.length - 1);
  return { startLine, endLine, sigText };
}

const PYTHON_DEF_TYPES = new Set(["class_definition", "function_definition"]);

function isPythonDefNode(nodeType: string): boolean {
  return PYTHON_DEF_TYPES.has(nodeType);
}

function buildPythonChunk(
  source: string,
  node: Node,
  name: string,
  withDocs: boolean,
): CodeChunk {
  const { startLine, endLine, sigText } = signatureRange(source, node);
  const body = node.childForFieldName("body");
  const doc = withDocs && body !== null ? docstringFromBody(source, body) : "";
  const content = doc !== "" ? `${doc}\n${sigText}` : sigText;
  return buildCodeChunk(name, symbolTypeForDefNode(node), startLine, endLine, content);
}

function collectSignatures(
  source: string,
  node: Node,
  withDocs: boolean,
): readonly CodeChunk[] {
  return walkTreeForSignatures(source, node, isPythonDefNode, buildPythonChunk, withDocs);
}

const SYMBOL_KIND_BY_DEF: Record<string, SymbolKind> = {
  class_definition: SYMBOL_KIND.CLASS,
  function_definition: SYMBOL_KIND.FUNCTION,
};

function symbolKindForDefNode(node: Node): SymbolKind {
  return SYMBOL_KIND_BY_DEF[node.type] ?? SYMBOL_KIND.FUNCTION;
}

function collectExportedNames(source: string, node: Node): readonly ExportedSymbol[] {
  return walkTreeForNames(
    source,
    node,
    isPythonDefNode,
    symbolKindForDefNode,
    () => true,
  );
}

export const PythonProvider = defineTreeSitterProvider({
  id: "python",
  extensions: [toFileExtension(".py")] as readonly FileExtension[],
  getWasmPath: () => resolveTreeSitterWasm("tree-sitter-python"),
  collectImports,
  collectSignatures,
  collectNames: collectExportedNames,
});
