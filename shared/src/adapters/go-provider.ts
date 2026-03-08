// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import {
  type Node,
  nodeText,
  childrenOf,
  oneImportRefFromNode,
  createSignatureCollectors,
  walkTreeCollectImports,
  walkTreeForNames,
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

function collectImportSpecs(source: string, node: Node): readonly ImportRef[] {
  if (node.type === "import_spec") {
    return oneImportRefFromNode(source, node, goGetPath, isRelativeGoImport);
  }
  if (node.type === "import_spec_list") {
    return childrenOf(node).flatMap((ch) => collectImportSpecs(source, ch));
  }
  return childrenOf(node).flatMap((ch) => collectImportSpecs(source, ch));
}

function collectImports(source: string, node: Node): readonly ImportRef[] {
  return walkTreeCollectImports(
    source,
    node,
    (t) => t === "import_declaration",
    collectImportSpecs,
  );
}

const SYMBOL_TYPE_BY_NODE: Record<string, SymbolType> = {
  function_declaration: SYMBOL_TYPE.FUNCTION,
  method_declaration: SYMBOL_TYPE.FUNCTION,
  type_spec: SYMBOL_TYPE.CLASS,
};

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

const GO_SIGNATURE_NODE_TYPES = new Set([
  "function_declaration",
  "method_declaration",
  "type_spec",
]);

const collectSignatures = createSignatureCollectors(
  SYMBOL_TYPE_BY_NODE,
  GO_SIGNATURE_NODE_TYPES,
);

function collectExportedNames(source: string, node: Node): readonly ExportedSymbol[] {
  return walkTreeForNames(
    source,
    node,
    (nodeType) => GO_SIGNATURE_NODE_TYPES.has(nodeType),
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
