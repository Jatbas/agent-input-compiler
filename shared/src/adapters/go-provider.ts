import {
  type Node,
  nodeText,
  childrenOf,
  buildSignatureChunk,
  oneImportRefFromNode,
  walkTreeCollectImports,
  walkTreeForSignatures,
  walkTreeForNames,
} from "./tree-sitter-node-utils.js";
import * as P from "./tree-sitter-provider-shared.js";

function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("`") && t.endsWith("`")))
    return t.slice(1, -1);
  return t;
}

function isRelativeGoImport(path: string): boolean {
  return path.startsWith(".") || path.includes("/");
}

function goGetPath(source: string, node: Node): string | null {
  const pathNode = node.childForFieldName("path");
  if (pathNode === null) return null;
  return stripQuotes(nodeText(source, pathNode));
}

function collectImportSpecs(source: string, node: Node): readonly P.ImportRef[] {
  if (node.type === "import_spec") {
    return oneImportRefFromNode(source, node, goGetPath, isRelativeGoImport);
  }
  if (node.type === "import_spec_list") {
    return childrenOf(node).flatMap((ch) => collectImportSpecs(source, ch));
  }
  return childrenOf(node).flatMap((ch) => collectImportSpecs(source, ch));
}

function collectImports(source: string, node: Node): readonly P.ImportRef[] {
  return walkTreeCollectImports(
    source,
    node,
    (t) => t === "import_declaration",
    collectImportSpecs,
  );
}

const SYMBOL_TYPE_BY_NODE: Record<string, P.SymbolType> = {
  function_declaration: P.SYMBOL_TYPE.FUNCTION,
  method_declaration: P.SYMBOL_TYPE.FUNCTION,
  type_spec: P.SYMBOL_TYPE.CLASS,
};

function symbolTypeForNode(node: Node): P.SymbolType {
  return SYMBOL_TYPE_BY_NODE[node.type] ?? P.SYMBOL_TYPE.FUNCTION;
}

const SYMBOL_KIND_BY_NODE: Record<string, P.SymbolKind> = {
  function_declaration: P.SYMBOL_KIND.FUNCTION,
  method_declaration: P.SYMBOL_KIND.FUNCTION,
  type_spec: P.SYMBOL_KIND.CLASS,
};

function symbolKindForNode(node: Node): P.SymbolKind {
  return SYMBOL_KIND_BY_NODE[node.type] ?? P.SYMBOL_KIND.FUNCTION;
}

function isExportedGoName(name: string): boolean {
  const first = name.charAt(0);
  return first !== "" && first === first.toUpperCase() && first !== first.toLowerCase();
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
): P.CodeChunk {
  return buildSignatureChunk(source, node, name, withDocs, symbolTypeForNode);
}

function collectSignatures(
  source: string,
  node: Node,
  withDocs: boolean,
): readonly P.CodeChunk[] {
  return walkTreeForSignatures(source, node, isGoSignatureNode, buildGoChunk, withDocs);
}

function collectExportedNames(source: string, node: Node): readonly P.ExportedSymbol[] {
  return walkTreeForNames(
    source,
    node,
    isGoSignatureNode,
    symbolKindForNode,
    isExportedGoName,
  );
}

export const GoProvider = P.defineTreeSitterProvider({
  id: "go",
  extensions: [P.toFileExtension(".go")] as readonly P.FileExtension[],
  getWasmPath: () => P.resolveTreeSitterWasm("tree-sitter-go"),
  collectImports,
  collectSignatures,
  collectNames: collectExportedNames,
});
