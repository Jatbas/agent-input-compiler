// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ContentTransformer } from "#core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import { toFileExtension } from "#core/types/paths.js";
import type { InclusionTier } from "#core/types/enums.js";

const CSS_EXTENSIONS: readonly FileExtension[] = [
  toFileExtension(".css"),
  toFileExtension(".scss"),
];

const ROOT_SELECTOR_RE = /:root\s*$/;

function isRootBlock(selector: string): boolean {
  return ROOT_SELECTOR_RE.test(selector.trim());
}

function countDeclarations(body: string): number {
  return body
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;
}

function collapseToLine(block: string): string {
  return block.replace(/\s+/g, " ").trim();
}

type BlockSegment = { readonly prefix: string; readonly body: string };

function findTopLevelBlocks(content: string): {
  readonly blocks: readonly BlockSegment[];
  readonly trailing: string;
} {
  const chars = [...content];
  const acc = chars.reduce<{
    readonly blocks: readonly BlockSegment[];
    readonly depth: number;
    readonly blockOpen: number;
    readonly prefixStart: number;
  }>(
    (prev, c, i) => {
      if (c === "{") {
        if (prev.depth === 0) {
          return {
            blocks: prev.blocks,
            depth: prev.depth + 1,
            blockOpen: i,
            prefixStart: prev.prefixStart,
          };
        }
        return { ...prev, depth: prev.depth + 1 };
      }
      if (c === "}") {
        const nextDepth = prev.depth - 1;
        if (nextDepth === 0 && prev.blockOpen >= 0) {
          const prefix = content.slice(prev.prefixStart, prev.blockOpen);
          const body = content.slice(prev.blockOpen + 1, i);
          return {
            blocks: [...prev.blocks, { prefix, body }],
            depth: nextDepth,
            blockOpen: -1,
            prefixStart: i + 1,
          };
        }
        return { ...prev, depth: nextDepth };
      }
      return prev;
    },
    { blocks: [], depth: 0, blockOpen: -1, prefixStart: 0 },
  );
  const trailing = content.slice(acc.prefixStart);
  return { blocks: acc.blocks, trailing };
}

function processBlock(prefix: string, body: string): string {
  if (isRootBlock(prefix)) {
    return collapseToLine(prefix + "{" + body + "}");
  }
  const n = countDeclarations(body);
  return prefix + "{" + " [" + n + " declarations] " + "}";
}

export class CssVariableSummarizer implements ContentTransformer {
  readonly id = "css-variable-summarizer";
  readonly fileExtensions: readonly FileExtension[] = CSS_EXTENSIONS;

  transform(content: string, _tier: InclusionTier, _filePath: RelativePath): string {
    if (content.length === 0) return content;
    const { blocks, trailing } = findTopLevelBlocks(content);
    const parts = blocks.map((b) => processBlock(b.prefix, b.body));
    return [...parts, trailing].join("");
  }
}
