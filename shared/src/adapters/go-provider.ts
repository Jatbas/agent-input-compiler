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
import { type FileExtension, toFileExtension } from "#core/types/paths.js";
import type { ImportRef } from "#core/types/import-ref.js";
import type { CodeChunk } from "#core/types/code-chunk.js";
import type { ExportedSymbol } from "#core/types/exported-symbol.js";
import {
  type SymbolKind,
  type SymbolType,
  SYMBOL_KIND,
  SYMBOL_TYPE,
} from "#core/types/enums.js";

function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("`") && t.endsWith("`")))
    return t.slice(1, -1);
  return t;
}

function isRelativeGoImport(path: string): boolean {
  return path.startsWith(".") || path.includes("/");
}

function collectImportSpecs(source: string, node: Node): readonly ImportRef[] {
  if (node.type === "import_spec") {
    const pathNode = node.childForFieldName("path");
    if (pathNode === null) return [];
    const pathRaw = nodeText(source, pathNode);
    const path = stripQuotes(pathRaw);
    return [{ source: path, symbols: [], isRelative: isRelativeGoImport(path) }];
  }
  if (node.type === "import_spec_list") {
    return childrenOf(node).flatMap((ch) => collectImportSpecs(source, ch));
  }
  return childrenOf(node).flatMap((ch) => collectImportSpecs(source, ch));
}

function collectImports(source: string, node: Node): readonly ImportRef[] {
  if (node.type === "import_declaration") {
    return collectImportSpecs(source, node);
  }
  return childrenOf(node).flatMap((ch) => collectImports(source, ch));
}

const SYMBOL_TYPE_BY_NODE: Record<string, SymbolType> = {
  function_declaration: SYMBOL_TYPE.FUNCTION,
  method_declaration: SYMBOL_TYPE.FUNCTION,
  type_spec: SYMBOL_TYPE.CLASS,
};

function symbolTypeForNode(node: Node): SymbolType {
  return SYMBOL_TYPE_BY_NODE[node.type] ?? SYMBOL_TYPE.FUNCTION;
}

const SYMBOL_KIND_BY_NODE: Record<string, SymbolKind> = {
  function_declaration: SYMBOL_KIND.FUNCTION,
  method_declaration: SYMBOL_KIND.FUNCTION,
  type_spec: SYMBOL_KIND.CLASS,
};

function symbolKindForNode(node: Node): SymbolKind {
  return SYMBOL_KIND_BY_NODE[node.type] ?? SYMBOL_KIND.FUNCTION;
}

function isExportedGoName(name: string): boolean {
  const first = name.charAt(0);
  return first !== "" && first === first.toUpperCase() && first !== first.toLowerCase();
}

function docCommentBefore(source: string, node: Node): string {
  const start = node.startIndex;
  if (start <= 0) return "";
  const before = source.slice(0, start);
  const lastNewline = before.lastIndexOf("\n");
  const lineStart = lastNewline >= 0 ? lastNewline + 1 : 0;
  const line = before.slice(lineStart).trim();
  if (line.startsWith("//")) return line;
  const blockEnd = before.lastIndexOf("*/");
  if (blockEnd >= 0) {
    const blockStart = before.lastIndexOf("/*", blockEnd);
    if (blockStart >= 0) return before.slice(blockStart, blockEnd + 2).trim();
  }
  return "";
}

const SIGNATURE_NODE_TYPES = new Set([
  "function_declaration",
  "method_declaration",
  "type_spec",
]);

function isGoSignatureNode(nodeType: string): boolean {
  return SIGNATURE_NODE_TYPES.has(nodeType);
}

function buildGoChunk(
  source: string,
  node: Node,
  name: string,
  withDocs: boolean,
): CodeChunk {
  const startLine = lineFromNode(node);
  const sigText = nodeText(source, node);
  const endLine = startLine + Math.max(0, sigText.split("\n").length - 1);
  const doc = withDocs ? docCommentBefore(source, node) : "";
  const content = doc !== "" ? `${doc}\n${sigText}` : sigText;
  return buildCodeChunk(name, symbolTypeForNode(node), startLine, endLine, content);
}

function collectSignatures(
  source: string,
  node: Node,
  withDocs: boolean,
): readonly CodeChunk[] {
  return walkTreeForSignatures(source, node, isGoSignatureNode, buildGoChunk, withDocs);
}

function collectExportedNames(source: string, node: Node): readonly ExportedSymbol[] {
  return walkTreeForNames(
    source,
    node,
    isGoSignatureNode,
    symbolKindForNode,
    isExportedGoName,
  );
}

export const GoProvider = defineTreeSitterProvider({
  id: "go",
  extensions: [toFileExtension(".go")] as readonly FileExtension[],
  getWasmPath: () => resolveTreeSitterWasm("tree-sitter-go"),
  collectImports,
  collectSignatures,
  collectNames: collectExportedNames,
});
