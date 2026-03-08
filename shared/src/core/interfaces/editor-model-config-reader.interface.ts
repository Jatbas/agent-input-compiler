// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { EditorId } from "@jatbas/aic-shared/core/types/enums.js";

export interface EditorModelConfigReader {
  read(editorId: EditorId): string | null;
}
