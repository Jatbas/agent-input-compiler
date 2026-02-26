import type { GuardScanner } from "#core/interfaces/guard-scanner.interface.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { GuardFinding } from "#core/types/guard-types.js";
import { GUARD_SEVERITY } from "#core/types/enums.js";
import { GUARD_FINDING_TYPE } from "#core/types/enums.js";
import { toLineNumber } from "#core/types/units.js";

const PROMPT_INJECTION_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
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
  {
    pattern: /<\|?(system|im_start|endofprompt)\|?>/i,
    label: "special token",
  },
  { pattern: /\[INST\].*\[\/INST\]/i, label: "instruction block" },
];

function lineNumberAt(content: string, index: number): number {
  const before = content.slice(0, index);
  return before.split("\n").length;
}

export class PromptInjectionScanner implements GuardScanner {
  readonly name = "PromptInjectionScanner";

  scan(file: SelectedFile, content: string): readonly GuardFinding[] {
    return PROMPT_INJECTION_PATTERNS.flatMap(({ pattern, label }): GuardFinding[] => {
      const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
      const re = new RegExp(pattern.source, flags);
      return [...content.matchAll(re)].map(
        (m): GuardFinding => ({
          severity: GUARD_SEVERITY.BLOCK,
          type: GUARD_FINDING_TYPE.PROMPT_INJECTION,
          file: file.path,
          line: toLineNumber(lineNumberAt(content, m.index)),
          message: `Prompt injection pattern: ${label}`,
          pattern: pattern.source,
        }),
      );
    });
  }
}
