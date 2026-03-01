import { type Node, type Parser, type Tree } from "web-tree-sitter";
import type { CodeChunk } from "#core/types/code-chunk.js";
import type { ExportedSymbol } from "#core/types/exported-symbol.js";
import type { SymbolKind, SymbolType } from "#core/types/enums.js";
import type { RelativePath } from "#core/types/paths.js";
import { toRelativePath } from "#core/types/paths.js";
import { toLineNumber, toTokenCount } from "#core/types/units.js";

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
