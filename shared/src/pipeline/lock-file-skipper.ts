// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ContentTransformer } from "@jatbas/aic-core/core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import type { InclusionTier } from "@jatbas/aic-core/core/types/enums.js";
import { toFileExtension } from "@jatbas/aic-core/core/types/paths.js";

const LOCK_EXTENSIONS: readonly FileExtension[] = [toFileExtension(".lock")];

function isLockPath(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.includes("-lock.") || lower.endsWith(".lock") || /shrinkwrap\.\w+$/.test(lower)
  );
}

export class LockFileSkipper implements ContentTransformer {
  readonly id = "lock-file-skipper";
  readonly fileExtensions = LOCK_EXTENSIONS;

  transform(content: string, _tier: InclusionTier, filePath: RelativePath): string {
    const path = filePath;
    if (!isLockPath(path)) return content;
    const segments = path.split("/");
    const name = segments.length > 0 ? (segments[segments.length - 1] ?? path) : path;
    const bytes = new TextEncoder().encode(content).length;
    return `[Lock file: ${name}, ${bytes} bytes — skipped]`;
  }
}
