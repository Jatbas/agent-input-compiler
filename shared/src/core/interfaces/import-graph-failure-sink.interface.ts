// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { RelativePath } from "@jatbas/aic-core/core/types/paths.js";

export interface ImportGraphFailureSink {
  notifyImportGraphFailure(input: {
    readonly kind: "read" | "parse";
    readonly path: RelativePath;
    readonly cause: unknown;
  }): void;
}

export const noopImportGraphFailureSink: ImportGraphFailureSink = {
  notifyImportGraphFailure(_input: {
    readonly kind: "read" | "parse";
    readonly path: RelativePath;
    readonly cause: unknown;
  }): void {
    void _input;
  },
};
