// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ContentTransformer } from "@jatbas/aic-core/core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import type { InclusionTier } from "@jatbas/aic-core/core/types/enums.js";
import { toFileExtension } from "@jatbas/aic-core/core/types/paths.js";
import { INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";

// Only C-family comment syntax (// and /* */) is handled; # languages excluded
const COMMENT_STRIPPER_EXTENSIONS: readonly FileExtension[] = [
  toFileExtension(".ts"),
  toFileExtension(".js"),
  toFileExtension(".go"),
  toFileExtension(".java"),
  toFileExtension(".rs"),
  toFileExtension(".c"),
  toFileExtension(".cpp"),
];

type StripperState = {
  readonly out: readonly string[];
  readonly inBlock: boolean;
  readonly blockBuf: readonly string[];
};

function closeBlock(
  acc: StripperState,
  buf: readonly string[],
  keepJSDocParams: boolean,
): StripperState {
  const block = buf.join("\n");
  const hasJSDoc =
    keepJSDocParams && (block.includes("@param") || block.includes("@returns"));
  return { out: hasJSDoc ? [...acc.out, block] : acc.out, inBlock: false, blockBuf: [] };
}

function processLine(
  acc: StripperState,
  line: string,
  keepJSDocParams: boolean,
): StripperState {
  const trimmed = line.trim();
  if (acc.inBlock) {
    const buf = [...acc.blockBuf, line];
    if (trimmed.includes("*/")) return closeBlock(acc, buf, keepJSDocParams);
    return { ...acc, blockBuf: buf };
  }
  if (trimmed.startsWith("/*")) {
    const buf = [line];
    if (trimmed.includes("*/")) return closeBlock(acc, buf, keepJSDocParams);
    return { out: acc.out, inBlock: true, blockBuf: buf };
  }
  if (trimmed.startsWith("//")) {
    const keep =
      keepJSDocParams && (trimmed.includes("@param") || trimmed.includes("@returns"));
    return { out: keep ? [...acc.out, line] : acc.out, inBlock: false, blockBuf: [] };
  }
  const cleaned = line
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/, "")
    .trimEnd();
  return {
    out: cleaned.length > 0 ? [...acc.out, cleaned] : acc.out,
    inBlock: false,
    blockBuf: [],
  };
}

export class CommentStripper implements ContentTransformer {
  readonly id = "comment-stripper";
  readonly fileExtensions = COMMENT_STRIPPER_EXTENSIONS;

  transform(content: string, tier: InclusionTier, _filePath: RelativePath): string {
    const keepJSDocParams = tier === INCLUSION_TIER.L1;
    const lines = content.split("\n");
    const result = lines.reduce<StripperState>(
      (acc, line) => processLine(acc, line, keepJSDocParams),
      { out: [], inBlock: false, blockBuf: [] },
    );
    return result.out.join("\n");
  }
}
