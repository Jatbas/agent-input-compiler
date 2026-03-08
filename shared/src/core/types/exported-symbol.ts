// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { SymbolKind } from "#core/types/enums.js";

export interface ExportedSymbol {
  readonly name: string;
  readonly kind: SymbolKind;
}
