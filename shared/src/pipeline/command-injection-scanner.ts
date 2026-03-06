import type { GuardScanner } from "#core/interfaces/guard-scanner.interface.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { GuardFinding } from "#core/types/guard-types.js";
import type { ScanPattern } from "#core/interfaces/scan-pattern.interface.js";
import { scanWithPatterns } from "./pattern-scanner.js";
import { GUARD_SEVERITY, GUARD_FINDING_TYPE } from "#core/types/enums.js";

const COMMAND_INJECTION_PATTERNS: readonly ScanPattern[] = [
  { pattern: /\$\([^)]*\)/, label: "dollar-paren substitution" },
  { pattern: /`[^`]*`/, label: "backtick substitution" },
  { pattern: /\|\s*\S+/, label: "pipe chain" },
];

export class CommandInjectionScanner implements GuardScanner {
  readonly name = "CommandInjectionScanner";

  scan(file: SelectedFile, content: string): readonly GuardFinding[] {
    return scanWithPatterns(
      file,
      content,
      COMMAND_INJECTION_PATTERNS,
      GUARD_SEVERITY.BLOCK,
      GUARD_FINDING_TYPE.COMMAND_INJECTION,
      "Command injection pattern: ",
    );
  }
}
