import type { RelativePath } from "#core/types/paths.js";
import type { TokenCount, LineNumber } from "#core/types/units.js";
import type { SymbolType } from "#core/types/enums.js";

export interface CodeChunk {
  readonly filePath: RelativePath;
  readonly symbolName: string;
  readonly symbolType: SymbolType;
  readonly startLine: LineNumber;
  readonly endLine: LineNumber;
  readonly content: string;
  readonly tokenCount: TokenCount;
}
