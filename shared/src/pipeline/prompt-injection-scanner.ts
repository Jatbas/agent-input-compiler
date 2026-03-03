import type { GuardScanner } from "#core/interfaces/guard-scanner.interface.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { GuardFinding } from "#core/types/guard-types.js";
import { GUARD_SEVERITY } from "#core/types/enums.js";
import { GUARD_FINDING_TYPE } from "#core/types/enums.js";
import type { ScanPattern } from "#core/interfaces/scan-pattern.interface.js";
import { scanWithPatterns } from "./pattern-scanner.js";

const BLOCK_PATTERNS: readonly ScanPattern[] = [
  {
    pattern: /<\|?(system|im_start|endofprompt)\|?>/i,
    label: "special token",
  },
  { pattern: /\[INST\].*\[\/INST\]/i, label: "instruction block" },
];

const WARN_PATTERNS: readonly ScanPattern[] = [
  {
    pattern: /ignore\s+(all\s+)?(previous|above|prior)\s+instructions/i,
    label: "instruction override",
  },
  {
    pattern: /you\s+are\s+now\s+(a|an|acting\s+as)/i,
    label: "role override",
  },
  { pattern: /system\s*:\s*/i, label: "system prefix" },
  {
    pattern:
      /do\s+not\s+follow\s+(any\s+)?(other|previous)\s+(rules|instructions|constraints)/i,
    label: "constraint override",
  },
];

export class PromptInjectionScanner implements GuardScanner {
  readonly name = "PromptInjectionScanner";

  scan(file: SelectedFile, content: string): readonly GuardFinding[] {
    const blockFindings = scanWithPatterns(
      file,
      content,
      BLOCK_PATTERNS,
      GUARD_SEVERITY.BLOCK,
      GUARD_FINDING_TYPE.PROMPT_INJECTION,
      "Prompt injection pattern: ",
    );
    const warnFindings = scanWithPatterns(
      file,
      content,
      WARN_PATTERNS,
      GUARD_SEVERITY.WARN,
      GUARD_FINDING_TYPE.PROMPT_INJECTION,
      "Prompt injection pattern: ",
    );
    return [...blockFindings, ...warnFindings];
  }
}
