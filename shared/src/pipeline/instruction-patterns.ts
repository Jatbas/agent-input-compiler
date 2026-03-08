// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { SelectedFile } from "@jatbas/aic-shared/core/types/selected-file.js";
import type { GuardFinding } from "@jatbas/aic-shared/core/types/guard-types.js";
import type { ScanPattern } from "@jatbas/aic-shared/core/interfaces/scan-pattern.interface.js";
import { GUARD_SEVERITY } from "@jatbas/aic-shared/core/types/enums.js";
import { GUARD_FINDING_TYPE } from "@jatbas/aic-shared/core/types/enums.js";
import { scanWithPatterns } from "./pattern-scanner.js";

// Shared BLOCK/WARN patterns for instruction-style scanners (prompt injection, markdown instructions).
const INSTRUCTION_BLOCK_PATTERNS: readonly ScanPattern[] = [
  {
    pattern: /<\|?(system|im_start|endofprompt)\|?>/i,
    label: "special token",
  },
  { pattern: /\[INST\].*\[\/INST\]/i, label: "instruction block" },
];

const INSTRUCTION_WARN_PATTERNS: readonly ScanPattern[] = [
  {
    pattern: /ignore\s+(all\s+)?(previous|above|prior)\s+instructions/i,
    label: "instruction override",
  },
  {
    pattern: /you\s+are\s+now\s+(a|an|acting\s+as)/i,
    label: "role override",
  },
  { pattern: /system\s*:\s*/i, label: "system prefix" },
  {
    pattern:
      /do\s+not\s+follow\s+(any\s+)?(other|previous)\s+(rules|instructions|constraints)/i,
    label: "constraint override",
  },
];

export function runInstructionPatternScan(
  file: SelectedFile,
  content: string,
  messagePrefix: string,
): readonly GuardFinding[] {
  const blockFindings = scanWithPatterns(
    file,
    content,
    INSTRUCTION_BLOCK_PATTERNS,
    GUARD_SEVERITY.BLOCK,
    GUARD_FINDING_TYPE.PROMPT_INJECTION,
    messagePrefix,
  );
  const warnFindings = scanWithPatterns(
    file,
    content,
    INSTRUCTION_WARN_PATTERNS,
    GUARD_SEVERITY.WARN,
    GUARD_FINDING_TYPE.PROMPT_INJECTION,
    messagePrefix,
  );
  return [...blockFindings, ...warnFindings];
}
