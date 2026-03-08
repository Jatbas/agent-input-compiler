// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ContentTransformer } from "@jatbas/aic-shared/core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "@jatbas/aic-shared/core/types/paths.js";
import type { InclusionTier } from "@jatbas/aic-shared/core/types/enums.js";

const MAX_DOCSTRING_LENGTH = 200;
const PY_DOUBLE_TRIPLE_RE = /"""[\s\S]*?"""/g;
const PY_SINGLE_TRIPLE_RE = /'''[\s\S]*?'''/g;
const JSDOC_BLOCK_RE = /\/\*\*[\s\S]*?\*\//g;

function replaceDoubleTriple(match: string): string {
  const inner = match.slice(3, -3);
  if (inner.length <= MAX_DOCSTRING_LENGTH) return match;
  return `"""${`[docstring trimmed: ${inner.length} chars]`}"""`;
}

function replaceSingleTriple(match: string): string {
  const inner = match.slice(3, -3);
  if (inner.length <= MAX_DOCSTRING_LENGTH) return match;
  return `'''${`[docstring trimmed: ${inner.length} chars]`}'''`;
}

function replaceJsdoc(match: string): string {
  const inner = match.slice(3, -2);
  if (inner.length <= MAX_DOCSTRING_LENGTH) return match;
  return `/**${`[docstring trimmed: ${inner.length} chars]`}*/`;
}

export class DocstringTrimmer implements ContentTransformer {
  readonly id = "docstring-trimmer";
  readonly fileExtensions: readonly FileExtension[] = [];

  transform(content: string, _tier: InclusionTier, _filePath: RelativePath): string {
    if (content.length === 0) return content;
    return content
      .replace(PY_DOUBLE_TRIPLE_RE, replaceDoubleTriple)
      .replace(PY_SINGLE_TRIPLE_RE, replaceSingleTriple)
      .replace(JSDOC_BLOCK_RE, replaceJsdoc);
  }
}
