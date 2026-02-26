import type { SymbolKind } from "#core/types/enums.js";

export interface ExportedSymbol {
  readonly name: string;
  readonly kind: SymbolKind;
}
