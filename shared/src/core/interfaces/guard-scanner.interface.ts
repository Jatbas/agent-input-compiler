import type { SelectedFile } from "#core/types/selected-file.js";
import type { GuardFinding } from "#core/types/guard-types.js";

export interface GuardScanner {
  readonly name: string;
  scan(file: SelectedFile, content: string): readonly GuardFinding[];
}
