import type { SelectedFile } from "#core/types/selected-file.js";
import type { TokenCount } from "#core/types/units.js";

export interface SummarisationLadder {
  compress(
    files: readonly SelectedFile[],
    budget: TokenCount,
  ): Promise<readonly SelectedFile[]>;
}
