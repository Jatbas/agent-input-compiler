// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { SelectedFile } from "@jatbas/aic-core/core/types/selected-file.js";
import type { GuardFinding } from "@jatbas/aic-core/core/types/guard-types.js";
import type {
  GuardSeverity,
  GuardFindingType,
} from "@jatbas/aic-core/core/types/enums.js";
import type { ScanPattern } from "@jatbas/aic-core/core/interfaces/scan-pattern.interface.js";
import { toLineNumber } from "@jatbas/aic-core/core/types/units.js";

function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

export function scanWithPatterns(
  file: SelectedFile,
  content: string,
  patterns: readonly ScanPattern[],
  severity: GuardSeverity,
  type: GuardFindingType,
  messagePrefix: string,
): readonly GuardFinding[] {
  return patterns.flatMap(({ pattern, label }): GuardFinding[] => {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const re = new RegExp(pattern.source, flags);
    return [...content.matchAll(re)].map(
      (m): GuardFinding => ({
        severity,
        type,
        file: file.path,
        line: toLineNumber(lineNumberAt(content, m.index)),
        message: `${messagePrefix}${label}`,
        pattern: pattern.source,
      }),
    );
  });
}
