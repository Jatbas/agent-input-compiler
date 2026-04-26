// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { TokenCount } from "./units.js";

export interface AssembledPrompt {
  readonly prompt: string;
  readonly renderedOverheadTokens: TokenCount;
}
