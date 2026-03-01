import {
  type Node,
  nodeText,
  childrenOf,
  findNodeName,
  singleImportRef,
  createSignatureCollectors,
  walkTreeCollectImports,
} from "./tree-sitter-node-utils.js";
import {
  defineTreeSitterProvider,
  resolveTreeSitterWasm,
  toFileExtension,
  SYMBOL_KIND,
  SYMBOL_TYPE,
} from "./tree-sitter-provider-shared.js";
import type {
  ExportedSymbol,
  FileExtension,
  ImportRef,
  SymbolKind,
  SymbolType,
} from "./tree-sitter-provider-shared.js";

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

function extractOneJavaImport(source: string, node: Node): readonly ImportRef[] {
  const path = javaImportPath(source, node);
  return path !== "" ? [singleImportRef(path, isRelativeJavaImport)] : [];
}

function collectImports(source: string, node: Node): readonly ImportRef[] {
  return walkTreeCollectImports(
    source,
    node,
    (t) => t === "import_declaration",
    extractOneJavaImport,
  );
}

const SYMBOL_TYPE_BY_NODE: Record<string, SymbolType> = {
  method_declaration: SYMBOL_TYPE.FUNCTION,
  class_declaration: SYMBOL_TYPE.CLASS,
  interface_declaration: SYMBOL_TYPE.CLASS,
};

const SYMBOL_KIND_BY_NODE: Record<string, SymbolKind> = {
  method_declaration: SYMBOL_KIND.FUNCTION,
  class_declaration: SYMBOL_KIND.CLASS,
  interface_declaration: SYMBOL_KIND.CLASS,
};

function symbolKindForNode(node: Node): SymbolKind {
  return SYMBOL_KIND_BY_NODE[node.type] ?? SYMBOL_KIND.FUNCTION;
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

function walkJavaNames(source: string, node: Node): readonly ExportedSymbol[] {
  if (JAVA_SIGNATURE_NODE_TYPES.has(node.type)) {
    const name = findNodeName(node, source);
    const kind = symbolKindForNode(node);
    const self: readonly ExportedSymbol[] =
      name !== null && name !== "" && isExportedJavaName(node, source, name)
        ? [{ name, kind }]
        : [];
    const rest = childrenOf(node).flatMap((ch) => walkJavaNames(source, ch));
    return [...self, ...rest];
  }
  return childrenOf(node).flatMap((ch) => walkJavaNames(source, ch));
}

function collectExportedNames(source: string, node: Node): readonly ExportedSymbol[] {
  return walkJavaNames(source, node);
}

export const JavaProvider = defineTreeSitterProvider({
  id: "java",
  extensions: [toFileExtension(".java")] as readonly FileExtension[],
  getWasmPath: () => resolveTreeSitterWasm("tree-sitter-java"),
  collectImports,
  collectSignatures,
  collectNames: collectExportedNames,
});
