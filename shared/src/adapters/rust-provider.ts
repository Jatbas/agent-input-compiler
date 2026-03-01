import {
  type Node,
  nodeText,
  childrenOf,
  buildSignatureChunk,
  findNodeName,
  oneImportRefFromNode,
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
  FileExtension,
  ImportRef,
  CodeChunk,
  ExportedSymbol,
  SymbolKind,
  SymbolType,
} from "./tree-sitter-provider-shared.js";

function rustUseGetPath(source: string, node: Node): string | null {
  const arg = node.childForFieldName("argument");
  if (arg === null) return null;
  const pathChild = arg.childForFieldName("path");
  const raw =
    pathChild !== null
      ? nodeText(source, pathChild).trim()
      : nodeText(source, arg).trim();
  return raw
    .replace(/\s*\{\s*.*\s*\}\s*$/, "")
    .trim()
    .replace(/\s*as\s+.*$/, "")
    .trim();
}

function isRelativeRustPath(p: string): boolean {
  return p.startsWith("crate::") || p.startsWith("self::") || p.startsWith("super::");
}

function extractOneUseDeclaration(source: string, node: Node): readonly ImportRef[] {
  return oneImportRefFromNode(source, node, rustUseGetPath, isRelativeRustPath);
}

function collectUseDeclarations(source: string, node: Node): readonly ImportRef[] {
  return walkTreeCollectImports(
    source,
    node,
    (t) => t === "use_declaration",
    extractOneUseDeclaration,
  );
}

const SYMBOL_TYPE_BY_NODE: Record<string, SymbolType> = {
  function_item: SYMBOL_TYPE.FUNCTION,
  function_signature_item: SYMBOL_TYPE.FUNCTION,
  impl_item: SYMBOL_TYPE.CLASS,
  struct_item: SYMBOL_TYPE.CLASS,
};

function symbolTypeForNode(node: Node): SymbolType {
  return SYMBOL_TYPE_BY_NODE[node.type] ?? SYMBOL_TYPE.FUNCTION;
}

const SYMBOL_KIND_BY_NODE: Record<string, SymbolKind> = {
  function_item: SYMBOL_KIND.FUNCTION,
  function_signature_item: SYMBOL_KIND.FUNCTION,
  impl_item: SYMBOL_KIND.CLASS,
  struct_item: SYMBOL_KIND.CLASS,
};

function symbolKindForNode(node: Node): SymbolKind {
  return SYMBOL_KIND_BY_NODE[node.type] ?? SYMBOL_KIND.FUNCTION;
}

function hasPubVisibility(node: Node, source: string): boolean {
  const first = node.child(0);
  if (first === null) return false;
  if (first.type !== "visibility_modifier") return false;
  return nodeText(source, first).includes("pub");
}

function implItemName(source: string, node: Node): string | null {
  const typeNode = node.childForFieldName("type");
  if (typeNode === null) return null;
  return nodeText(source, typeNode).trim() || null;
}

function isExportedRustName(node: Node, source: string, name: string | null): boolean {
  if (name === null || name === "") return false;
  if (node.type === "impl_item") {
    return implItemName(source, node) !== null;
  }
  return hasPubVisibility(node, source);
}

const SIGNATURE_NODE_TYPES = new Set([
  "function_item",
  "function_signature_item",
  "impl_item",
  "struct_item",
]);

function isRustSignatureNode(nodeType: string): boolean {
  return SIGNATURE_NODE_TYPES.has(nodeType);
}

function rustChunkName(source: string, node: Node): string | null {
  if (node.type === "impl_item") return implItemName(source, node);
  return findNodeName(node, source);
}

function buildRustChunk(
  source: string,
  node: Node,
  name: string,
  withDocs: boolean,
): CodeChunk {
  return buildSignatureChunk(source, node, name, withDocs, symbolTypeForNode);
}

function walkRustSignatures(
  source: string,
  node: Node,
  withDocs: boolean,
): readonly CodeChunk[] {
  if (isRustSignatureNode(node.type)) {
    const name = rustChunkName(source, node);
    if (name !== null && name !== "") {
      const chunk = buildRustChunk(source, node, name, withDocs);
      const rest = childrenOf(node).flatMap((ch) =>
        walkRustSignatures(source, ch, withDocs),
      );
      return [chunk, ...rest];
    }
  }
  return childrenOf(node).flatMap((ch) => walkRustSignatures(source, ch, withDocs));
}

function collectSignatures(
  source: string,
  node: Node,
  withDocs: boolean,
): readonly CodeChunk[] {
  return walkRustSignatures(source, node, withDocs);
}

function walkRustNames(source: string, node: Node): readonly ExportedSymbol[] {
  if (isRustSignatureNode(node.type)) {
    const name = rustChunkName(source, node);
    const kind = symbolKindForNode(node);
    const self: readonly ExportedSymbol[] = isExportedRustName(node, source, name)
      ? [{ name: name ?? "", kind }]
      : [];
    const rest = childrenOf(node).flatMap((ch) => walkRustNames(source, ch));
    return [...self, ...rest];
  }
  return childrenOf(node).flatMap((ch) => walkRustNames(source, ch));
}

export const RustProvider = defineTreeSitterProvider({
  id: "rust",
  extensions: [toFileExtension(".rs")] as readonly FileExtension[],
  getWasmPath: () => resolveTreeSitterWasm("tree-sitter-rust"),
  collectImports: collectUseDeclarations,
  collectSignatures,
  collectNames: walkRustNames,
});
