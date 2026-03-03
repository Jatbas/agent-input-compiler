import type { GuardSeverity, GuardFindingType } from "#core/types/enums.js";
import type { RelativePath } from "#core/types/paths.js";
import type { LineNumber } from "#core/types/units.js";

export interface GuardFinding {
  readonly severity: GuardSeverity;
  readonly type: GuardFindingType;
  readonly file: RelativePath;
  readonly line?: LineNumber;
  readonly message: string;
  readonly pattern?: string;
}

export interface GuardResult {
  readonly passed: boolean;
  readonly findings: readonly GuardFinding[];
  readonly filesBlocked: readonly RelativePath[];
  readonly filesRedacted: readonly RelativePath[];
  readonly filesWarned: readonly RelativePath[];
}
