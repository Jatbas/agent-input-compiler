import type { GuardScanner } from "#core/interfaces/guard-scanner.interface.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { GuardFinding } from "#core/types/guard-types.js";
import { GUARD_SEVERITY } from "#core/types/enums.js";
import { GUARD_FINDING_TYPE } from "#core/types/enums.js";

const NEVER_INCLUDE_PATTERNS: readonly string[] = [
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  "*.pfx",
  "*.p12",
  "*secret*",
  "*credential*",
  "*password*",
  "*.cert",
];

function pathMatches(pattern: string, path: string): boolean {
  if (pattern === ".env") return path === ".env" || path.endsWith("/.env");
  if (pattern === ".env.*") return path.includes(".env.");
  if (pattern.startsWith("*") && pattern.endsWith("*") && pattern.length > 2) {
    const mid = pattern.slice(1, -1);
    return path.toLowerCase().includes(mid.toLowerCase());
  }
  if (pattern.startsWith("*.")) {
    const ext = pattern.slice(1);
    return path.endsWith(ext);
  }
  return false;
}

export class ExclusionScanner implements GuardScanner {
  readonly name = "ExclusionScanner";

  scan(file: SelectedFile, _content: string): readonly GuardFinding[] {
    const path = file.path;
    return NEVER_INCLUDE_PATTERNS.filter((pattern) => pathMatches(pattern, path)).map(
      (pattern): GuardFinding => ({
        severity: GUARD_SEVERITY.BLOCK,
        type: GUARD_FINDING_TYPE.EXCLUDED_FILE,
        file: file.path,
        message: `File matches never-include pattern: ${pattern}`,
        pattern,
      }),
    );
  }
}
