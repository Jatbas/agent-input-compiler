// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ContentTransformer } from "@jatbas/aic-core/core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toFileExtension } from "@jatbas/aic-core/core/types/paths.js";
import type { InclusionTier } from "@jatbas/aic-core/core/types/enums.js";

const SVG_EXTENSIONS: readonly FileExtension[] = [toFileExtension(".svg")];

const VIEWBOX_RE = /viewBox=["']([^"']+)["']/;

function extractViewBox(content: string): string {
  const match = content.match(VIEWBOX_RE);
  return match?.[1] ?? "—";
}

function countSvgElements(content: string): number {
  const tags = content.match(/<[a-zA-Z][a-zA-Z0-9:-]*/g);
  return tags?.length ?? 0;
}

function describeSvg(content: string): string {
  const viewBox = extractViewBox(content);
  const elementCount = countSvgElements(content);
  const bytes = new TextEncoder().encode(content).length;
  return `[SVG: ${viewBox}, ${elementCount} elements, ${bytes} bytes]`;
}

export class SvgDescriber implements ContentTransformer {
  readonly id = "svg-describer";
  readonly fileExtensions: readonly FileExtension[] = SVG_EXTENSIONS;

  transform(content: string, _tier: InclusionTier, _filePath: RelativePath): string {
    if (content.length === 0) return content;
    return describeSvg(content);
  }
}
