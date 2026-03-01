import {
  type Node,
  nodeText,
  childrenOf,
  findNodeName,
  singleImportRef,
  createSignatureCollectors,
  walkTreeCollectImports,
} from "./tree-sitter-node-utils.js";
import * as P from "./tree-sitter-provider-shared.js";

function javaImportPath(source: string, node: Node): string {
  const raw = nodeText(source, node).trim();
  return raw
    .replace(/^\s*import\s+(?:static\s+)?/, "")
    .replace(/;\s*$/, "")
    .trim();
}

function isRelativeJavaImport(_path: string): boolean {
  return false;
}

function extractOneJavaImport(source: string, node: Node): readonly P.ImportRef[] {
  const path = javaImportPath(source, node);
  return path !== "" ? [singleImportRef(path, isRelativeJavaImport)] : [];
}

function collectImports(source: string, node: Node): readonly P.ImportRef[] {
  return walkTreeCollectImports(
    source,
    node,
    (t) => t === "import_declaration",
    extractOneJavaImport,
  );
}

const SYMBOL_TYPE_BY_NODE: Record<string, P.SymbolType> = {
  method_declaration: P.SYMBOL_TYPE.FUNCTION,
  class_declaration: P.SYMBOL_TYPE.CLASS,
  interface_declaration: P.SYMBOL_TYPE.CLASS,
};

const SYMBOL_KIND_BY_NODE: Record<string, P.SymbolKind> = {
  method_declaration: P.SYMBOL_KIND.FUNCTION,
  class_declaration: P.SYMBOL_KIND.CLASS,
  interface_declaration: P.SYMBOL_KIND.CLASS,
};

function symbolKindForNode(node: Node): P.SymbolKind {
  return SYMBOL_KIND_BY_NODE[node.type] ?? P.SYMBOL_KIND.FUNCTION;
}

function hasPublicModifier(node: Node, source: string): boolean {
  const nameNode = node.childForFieldName("name");
  const preambleEnd = nameNode !== null ? nameNode.startIndex : node.endIndex;
  const preamble = source.slice(node.startIndex, preambleEnd);
  return preamble.includes("public");
}

function isExportedJavaName(node: Node, source: string, name: string | null): boolean {
  if (name === null || name === "") return false;
  return hasPublicModifier(node, source);
}

const JAVA_SIGNATURE_NODE_TYPES = new Set([
  "method_declaration",
  "class_declaration",
  "interface_declaration",
]);

const collectSignatures = createSignatureCollectors(
  SYMBOL_TYPE_BY_NODE,
  JAVA_SIGNATURE_NODE_TYPES,
);

function walkJavaNames(source: string, node: Node): readonly P.ExportedSymbol[] {
  if (JAVA_SIGNATURE_NODE_TYPES.has(node.type)) {
    const name = findNodeName(node, source);
    const kind = symbolKindForNode(node);
    const self: readonly P.ExportedSymbol[] =
      name !== null && name !== "" && isExportedJavaName(node, source, name)
        ? [{ name, kind }]
        : [];
    const rest = childrenOf(node).flatMap((ch) => walkJavaNames(source, ch));
    return [...self, ...rest];
  }
  return childrenOf(node).flatMap((ch) => walkJavaNames(source, ch));
}

function collectExportedNames(source: string, node: Node): readonly P.ExportedSymbol[] {
  return walkJavaNames(source, node);
}

export const JavaProvider = P.defineTreeSitterProvider({
  id: "java",
  extensions: [P.toFileExtension(".java")] as readonly P.FileExtension[],
  getWasmPath: () => P.resolveTreeSitterWasm("tree-sitter-java"),
  collectImports,
  collectSignatures,
  collectNames: collectExportedNames,
});
