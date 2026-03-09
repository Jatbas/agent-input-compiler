// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { type Node, type Parser, type Tree } from "web-tree-sitter";
import type { CodeChunk } from "@jatbas/aic-core/core/types/code-chunk.js";
import type { ExportedSymbol } from "@jatbas/aic-core/core/types/exported-symbol.js";
import type { ImportRef } from "@jatbas/aic-core/core/types/import-ref.js";
import { SYMBOL_TYPE } from "@jatbas/aic-core/core/types/enums.js";
import type { SymbolKind, SymbolType } from "@jatbas/aic-core/core/types/enums.js";
import type { RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toLineNumber, toTokenCount } from "@jatbas/aic-core/core/types/units.js";

export type { Node } from "web-tree-sitter";

export const TREE_SITTER_EMPTY_PATH: RelativePath = toRelativePath("");

export function nodeText(source: string, node: Node): string {
  return source.slice(node.startIndex, node.endIndex);
}

export function lineFromNode(node: Node): number {
  return node.startPosition.row + 1;
}

export function childrenOf(node: Node): readonly Node[] {
  return Array.from({ length: node.childCount }, (_, c) => node.child(c)).filter(
    (ch): ch is Node => ch !== null,
  );
}

export function findNodeName(node: Node, source: string): string | null {
  const nameChild = node.childForFieldName("name");
  if (nameChild === null) return null;
  return nodeText(source, nameChild).trim();
}

// Line or block doc comment immediately before node (//, ///, /* */).
export function docCommentBefore(source: string, node: Node): string {
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

export function buildSignatureChunk(
  source: string,
  node: Node,
  name: string,
  withDocs: boolean,
  symbolTypeForNode: (n: Node) => SymbolType,
): CodeChunk {
  const startLine = lineFromNode(node);
  const sigText = nodeText(source, node);
  const endLine = startLine + Math.max(0, sigText.split("\n").length - 1);
  const doc = withDocs ? docCommentBefore(source, node) : "";
  const content = doc !== "" ? `${doc}\n${sigText}` : sigText;
  return buildCodeChunk(name, symbolTypeForNode(node), startLine, endLine, content);
}

export function singleImportRef(
  path: string,
  isRelative: (p: string) => boolean,
): ImportRef {
  return { source: path, symbols: [], isRelative: isRelative(path) };
}

export function oneImportRefFromNode(
  source: string,
  node: Node,
  getPath: (source: string, node: Node) => string | null,
  isRelative: (p: string) => boolean,
): readonly ImportRef[] {
  const path = getPath(source, node);
  return path !== null ? [singleImportRef(path, isRelative)] : [];
}

export function walkTreeCollectImports(
  source: string,
  node: Node,
  isImportNode: (nodeType: string) => boolean,
  extractOne: (source: string, node: Node) => readonly ImportRef[],
): readonly ImportRef[] {
  if (isImportNode(node.type)) return extractOne(source, node);
  return childrenOf(node).flatMap((ch) =>
    walkTreeCollectImports(source, ch, isImportNode, extractOne),
  );
}

export function buildCodeChunk(
  name: string,
  symbolType: SymbolType,
  startLine: number,
  endLine: number,
  content: string,
): CodeChunk {
  return {
    filePath: TREE_SITTER_EMPTY_PATH,
    symbolName: name,
    symbolType,
    startLine: toLineNumber(startLine),
    endLine: toLineNumber(endLine),
    content,
    tokenCount: toTokenCount(0),
  };
}

export function walkTreeForSignatures(
  source: string,
  node: Node,
  isMatchingType: (nodeType: string) => boolean,
  buildChunkForNode: (
    source: string,
    node: Node,
    name: string,
    withDocs: boolean,
  ) => CodeChunk,
  withDocs: boolean,
): readonly CodeChunk[] {
  if (isMatchingType(node.type)) {
    const name = findNodeName(node, source);
    if (name === null || name === "") {
      return childrenOf(node).flatMap((ch) =>
        walkTreeForSignatures(source, ch, isMatchingType, buildChunkForNode, withDocs),
      );
    }
    const chunk = buildChunkForNode(source, node, name, withDocs);
    return [
      chunk,
      ...childrenOf(node).flatMap((ch) =>
        walkTreeForSignatures(source, ch, isMatchingType, buildChunkForNode, withDocs),
      ),
    ];
  }
  return childrenOf(node).flatMap((ch) =>
    walkTreeForSignatures(source, ch, isMatchingType, buildChunkForNode, withDocs),
  );
}

export function createSignatureCollectors(
  symbolTypeByNode: Record<string, SymbolType>,
  signatureNodeTypes: ReadonlySet<string>,
): (source: string, node: Node, withDocs: boolean) => readonly CodeChunk[] {
  const symbolTypeForNode = (n: Node): SymbolType =>
    symbolTypeByNode[n.type] ?? SYMBOL_TYPE.FUNCTION;
  const isMatching = (nodeType: string): boolean => signatureNodeTypes.has(nodeType);
  const buildChunk = (
    source: string,
    node: Node,
    name: string,
    withDocs: boolean,
  ): CodeChunk => buildSignatureChunk(source, node, name, withDocs, symbolTypeForNode);
  return (source, node, withDocs) =>
    walkTreeForSignatures(source, node, isMatching, buildChunk, withDocs);
}

export function walkTreeForNames(
  source: string,
  node: Node,
  isMatchingType: (nodeType: string) => boolean,
  resolveKind: (node: Node) => SymbolKind,
  nameFilter: (name: string) => boolean,
): readonly ExportedSymbol[] {
  if (isMatchingType(node.type)) {
    const name = findNodeName(node, source);
    const kind = resolveKind(node);
    const self: readonly ExportedSymbol[] =
      name !== null && name !== "" && nameFilter(name) ? [{ name, kind }] : [];
    const rest = childrenOf(node).flatMap((ch) =>
      walkTreeForNames(source, ch, isMatchingType, resolveKind, nameFilter),
    );
    return [...self, ...rest];
  }
  return childrenOf(node).flatMap((ch) =>
    walkTreeForNames(source, ch, isMatchingType, resolveKind, nameFilter),
  );
}

export function parseWithTreeSitter<T>(
  parser: Parser,
  fileContent: string,
  collect: (source: string, root: Node) => T,
  emptyDefault: T,
): T {
  try {
    const tree: Tree | null = parser.parse(fileContent);
    if (tree === null) return emptyDefault;
    return collect(fileContent, tree.rootNode);
  } catch {
    return emptyDefault;
  }
}
