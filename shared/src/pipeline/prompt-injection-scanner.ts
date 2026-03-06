import type { GuardScanner } from "#core/interfaces/guard-scanner.interface.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { GuardFinding } from "#core/types/guard-types.js";
import { runInstructionPatternScan } from "./instruction-patterns.js";

export class PromptInjectionScanner implements GuardScanner {
  readonly name = "PromptInjectionScanner";

  scan(file: SelectedFile, content: string): readonly GuardFinding[] {
    return runInstructionPatternScan(file, content, "Prompt injection pattern: ");
  }
}
