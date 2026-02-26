import type { SelectedFile } from "#core/types/selected-file.js";
import type { GuardResult } from "#core/types/guard-types.js";

export interface ContextGuard {
  scan(files: readonly SelectedFile[]): {
    readonly result: GuardResult;
    readonly safeFiles: readonly SelectedFile[];
  };
}
