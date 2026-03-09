// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ContentTransformer } from "@jatbas/aic-core/core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import type { InclusionTier } from "@jatbas/aic-core/core/types/enums.js";

const LICENSE_KEYWORD_RE = /License|Copyright|Permission|SPDX/i;

type BlockState = {
  readonly blockLines: readonly string[];
  readonly inBlock: boolean;
  readonly blockBuf: readonly string[];
  readonly done: boolean;
};

// Stop at first blank line so only the leading license "paragraph" is removed.
function processLine(acc: BlockState, line: string): BlockState {
  if (acc.done) return acc;
  const trimmed = line.trim();
  if (acc.inBlock) {
    const buf = [...acc.blockBuf, line];
    if (trimmed.includes("*/")) {
      return {
        blockLines: [...acc.blockLines, ...buf],
        inBlock: false,
        blockBuf: [],
        done: false,
      };
    }
    return { ...acc, blockBuf: buf };
  }
  if (trimmed === "") {
    return { ...acc, blockLines: [...acc.blockLines, line], done: true };
  }
  if (
    trimmed.startsWith("//") ||
    trimmed.startsWith("#") ||
    trimmed === "<!--" ||
    trimmed === "-->"
  ) {
    return { ...acc, blockLines: [...acc.blockLines, line] };
  }
  if (trimmed.startsWith("/*")) {
    const buf = [line];
    if (trimmed.includes("*/")) {
      return {
        blockLines: [...acc.blockLines, ...buf],
        inBlock: false,
        blockBuf: [],
        done: false,
      };
    }
    return { ...acc, inBlock: true, blockBuf: buf };
  }
  return { ...acc, done: true };
}

export class LicenseHeaderStripper implements ContentTransformer {
  readonly id = "license-header-stripper";
  readonly fileExtensions: readonly FileExtension[] = [];

  transform(content: string, _tier: InclusionTier, _filePath: RelativePath): string {
    if (content.length === 0) return content;
    const lines = content.split("\n");
    const initial: BlockState = {
      blockLines: [],
      inBlock: false,
      blockBuf: [],
      done: false,
    };
    const result = lines.reduce<BlockState>(processLine, initial);
    const blockText = result.blockLines.join("\n");
    if (blockText.length === 0 || !LICENSE_KEYWORD_RE.test(blockText)) {
      return content;
    }
    const remainder = content.slice(blockText.length);
    return remainder.startsWith("\n") ? remainder.slice(1) : remainder;
  }
}
