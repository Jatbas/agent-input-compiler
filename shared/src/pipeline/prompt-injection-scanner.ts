// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { GuardScanner } from "@jatbas/aic-core/core/interfaces/guard-scanner.interface.js";
import type { SelectedFile } from "@jatbas/aic-core/core/types/selected-file.js";
import type { GuardFinding } from "@jatbas/aic-core/core/types/guard-types.js";
import { runInstructionPatternScan } from "./instruction-patterns.js";

export class PromptInjectionScanner implements GuardScanner {
  readonly name = "PromptInjectionScanner";

  scan(file: SelectedFile, content: string): readonly GuardFinding[] {
    return runInstructionPatternScan(file, content, "Prompt injection pattern: ");
  }
}
