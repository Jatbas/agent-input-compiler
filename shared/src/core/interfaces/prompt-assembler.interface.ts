// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { TaskClassification } from "#core/types/task-classification.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { OutputFormat } from "#core/types/enums.js";

export interface PromptAssembler {
  assemble(
    task: TaskClassification,
    files: readonly SelectedFile[],
    constraints: readonly string[],
    format: OutputFormat,
    specFiles?: readonly SelectedFile[],
    sessionContextSummary?: string,
    structuralMap?: string,
  ): Promise<string>;
}
