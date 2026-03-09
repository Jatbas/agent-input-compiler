// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ContentTransformer } from "@jatbas/aic-core/core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import type { InclusionTier } from "@jatbas/aic-core/core/types/enums.js";

export class WhitespaceNormalizer implements ContentTransformer {
  readonly id = "whitespace-normalizer";
  readonly fileExtensions: readonly FileExtension[] = [];

  constructor(private readonly excludedExtensions: readonly FileExtension[] = []) {}

  transform(content: string, _tier: InclusionTier, filePath: RelativePath): string {
    const idx = filePath.lastIndexOf(".");
    const ext = idx >= 0 ? filePath.slice(idx).toLowerCase() : "";
    if (this.excludedExtensions.some((e) => e.toLowerCase() === ext)) {
      return content;
    }
    const collapsed = content.replace(/\n{3,}/g, "\n\n");
    const lines = collapsed.split("\n");
    const normalized = lines.map((line) => {
      const trimmed = line.trimEnd();
      const lead = trimmed.match(/^\s*/)?.[0] ?? "";
      const rest = trimmed.slice(lead.length);
      if (rest.length === 0) return "";
      const indentLevel = lead.replace(/\t/g, "  ").length;
      const twoSpaces = "  ".repeat(Math.max(0, Math.floor(indentLevel / 2)));
      return twoSpaces + rest;
    });
    return normalized.join("\n").trimEnd();
  }
}
