// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { RelativePath } from "#core/types/paths.js";

export interface FileContentReader {
  getContent(path: RelativePath): Promise<string>;
}
