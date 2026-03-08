// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { EditorId } from "#core/types/enums.js";

export interface EditorModelConfigReader {
  read(editorId: EditorId): string | null;
}
