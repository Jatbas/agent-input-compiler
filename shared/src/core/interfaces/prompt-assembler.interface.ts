// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { TaskClassification } from "@jatbas/aic-core/core/types/task-classification.js";
import type { SelectedFile } from "@jatbas/aic-core/core/types/selected-file.js";
import type { AssembledPrompt } from "@jatbas/aic-core/core/types/assembled-prompt.js";

export interface PromptAssembler {
  assemble(
    task: TaskClassification,
    files: readonly SelectedFile[],
    constraints: readonly string[],
    specFiles?: readonly SelectedFile[],
    sessionContextSummary?: string,
    structuralMap?: string,
  ): Promise<AssembledPrompt>;
}
