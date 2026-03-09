// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ContentTransformer } from "@jatbas/aic-core/core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import type { InclusionTier } from "@jatbas/aic-core/core/types/enums.js";

const EMPTY_EXTENSIONS: readonly FileExtension[] = [];

function isMinifiedPath(path: RelativePath): boolean {
  const lower = path.toLowerCase();
  if (lower.endsWith(".min.js") || lower.endsWith(".min.css")) return true;
  if (path.startsWith("dist/") || path.includes("/dist/") || path === "dist") return true;
  if (path.startsWith("build/") || path.includes("/build/") || path === "build")
    return true;
  return false;
}

function lastSegment(path: RelativePath): string {
  const segments = path.split("/");
  if (segments.length === 0) return path;
  return segments[segments.length - 1] ?? path;
}

export class MinifiedCodeSkipper implements ContentTransformer {
  readonly id = "minified-code-skipper";
  readonly fileExtensions: readonly FileExtension[] = EMPTY_EXTENSIONS;

  transform(content: string, _tier: InclusionTier, filePath: RelativePath): string {
    if (content.length === 0) return content;
    if (!isMinifiedPath(filePath)) return content;
    const name = lastSegment(filePath);
    const bytes = new TextEncoder().encode(content).length;
    return `[Minified: ${name}, ${bytes} bytes — skipped]`;
  }
}
