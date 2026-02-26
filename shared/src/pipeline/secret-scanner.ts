import type { GuardScanner } from "#core/interfaces/guard-scanner.interface.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { GuardFinding } from "#core/types/guard-types.js";
import { GUARD_SEVERITY } from "#core/types/enums.js";
import { GUARD_FINDING_TYPE } from "#core/types/enums.js";
import { type ScanPattern, scanWithPatterns } from "./pattern-scanner.js";

const SECRET_PATTERNS: readonly ScanPattern[] = [
  { pattern: /AKIA[0-9A-Z]{16}/, label: "AWS Access Key ID" },
  { pattern: /gh[pousr]_[A-Za-z0-9]{36,}/, label: "GitHub token" },
  { pattern: /sk_(live|test)_[0-9a-zA-Z]{24,}/, label: "Stripe secret key" },
  {
    pattern: /(api_key|apikey|api-key)\s*[:=]\s*['"]?[A-Za-z0-9\-_]{20,}/i,
    label: "Generic API key",
  },
  {
    pattern: /eyJ[A-Za-z0-9\-_=]+\.eyJ[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_.+/=]+/,
    label: "JWT",
  },
  {
    pattern: /-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----/,
    label: "Private key header",
  },
];

export class SecretScanner implements GuardScanner {
  readonly name = "SecretScanner";

  scan(file: SelectedFile, content: string): readonly GuardFinding[] {
    return scanWithPatterns(
      file,
      content,
      SECRET_PATTERNS,
      GUARD_SEVERITY.BLOCK,
      GUARD_FINDING_TYPE.SECRET,
      "Potential secret detected: ",
    );
  }
}
