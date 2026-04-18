// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { SpecificationInput } from "@jatbas/aic-core/core/types/specification-compilation.types.js";
import type { TokenCount } from "@jatbas/aic-core/core/types/units.js";

const SPEC_COMPILE_CACHE_PREIMAGE_PREFIX = "spec-compile-cache-preimage\x00v1\x00";

export const SPEC_COMPILE_CACHE_POLICY_REVISION = "1" as const;

function sortedMultisetLines(lines: readonly string[]): string {
  return lines.toSorted((a, b) => a.localeCompare(b)).join("\n");
}

export function buildSpecCompileCachePreimage(
  input: SpecificationInput,
  budget: TokenCount,
): string {
  const typeLines = input.types.map((t) =>
    JSON.stringify({
      content: t.content,
      estimatedTokens: Number(t.estimatedTokens),
      name: t.name,
      path: String(t.path),
      usage: t.usage,
    }),
  );
  const codeLines = input.codeBlocks.map((b) =>
    JSON.stringify({
      content: b.content,
      estimatedTokens: Number(b.estimatedTokens),
      label: b.label,
    }),
  );
  const proseLines = input.prose.map((p) =>
    JSON.stringify({
      content: p.content,
      estimatedTokens: Number(p.estimatedTokens),
      label: p.label,
    }),
  );
  const typesSection = sortedMultisetLines(typeLines);
  const codeSection = sortedMultisetLines(codeLines);
  const proseSection = sortedMultisetLines(proseLines);
  return `${SPEC_COMPILE_CACHE_PREIMAGE_PREFIX}${SPEC_COMPILE_CACHE_POLICY_REVISION}\x00${Number(
    budget,
  )}\x00${typesSection}\x00\x00${codeSection}\x00\x00${proseSection}`;
}
