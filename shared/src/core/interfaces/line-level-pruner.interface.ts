import type { SelectedFile } from "#core/types/selected-file.js";

export interface LineLevelPruner {
  prune(
    files: readonly SelectedFile[],
    subjectTokens: readonly string[],
  ): Promise<readonly SelectedFile[]>;
}
