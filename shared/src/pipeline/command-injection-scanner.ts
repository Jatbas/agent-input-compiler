// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { GuardScanner } from "@jatbas/aic-core/core/interfaces/guard-scanner.interface.js";
import type { SelectedFile } from "@jatbas/aic-core/core/types/selected-file.js";
import type { GuardFinding } from "@jatbas/aic-core/core/types/guard-types.js";
import type { ScanPattern } from "@jatbas/aic-core/core/interfaces/scan-pattern.interface.js";
import { scanWithPatterns } from "./pattern-scanner.js";
import { GUARD_SEVERITY, GUARD_FINDING_TYPE } from "@jatbas/aic-core/core/types/enums.js";

const COMMAND_INJECTION_PATTERNS: readonly ScanPattern[] = [
  { pattern: /\$\([^)]*\)/, label: "dollar-paren substitution" },
  { pattern: /`[^`]*`/, label: "backtick substitution" },
  { pattern: /\|\s*\S+/, label: "pipe chain" },
];

export class CommandInjectionScanner implements GuardScanner {
  readonly name = "CommandInjectionScanner";

  scan(file: SelectedFile, content: string): readonly GuardFinding[] {
    return scanWithPatterns(
      file,
      content,
      COMMAND_INJECTION_PATTERNS,
      GUARD_SEVERITY.BLOCK,
      GUARD_FINDING_TYPE.COMMAND_INJECTION,
      "Command injection pattern: ",
    );
  }
}
