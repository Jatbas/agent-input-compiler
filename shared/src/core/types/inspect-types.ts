import type { AbsolutePath, FilePath } from "#core/types/paths.js";
import type { TokenCount } from "#core/types/units.js";
import type { Percentage } from "#core/types/scores.js";
import type { ISOTimestamp } from "#core/types/identifiers.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { GuardResult } from "#core/types/guard-types.js";
import type { TransformMetadata } from "#core/types/transform-types.js";
import type { InclusionTier } from "#core/types/enums.js";

export interface InspectRequest {
  readonly intent: string;
  readonly projectRoot: AbsolutePath;
  readonly configPath: FilePath | null;
  readonly dbPath: FilePath;
}

export interface PipelineTrace {
  readonly intent: string;
  readonly taskClass: TaskClassification;
  readonly rulePacks: readonly string[];
  readonly budget: TokenCount;
  readonly selectedFiles: readonly SelectedFile[];
  readonly guard: GuardResult | null;
  readonly transforms: readonly TransformMetadata[];
  readonly summarisationTiers: Readonly<Record<InclusionTier, number>>;
  readonly constraints: readonly string[];
  readonly tokenSummary: {
    readonly raw: TokenCount;
    readonly selected: TokenCount;
    readonly afterGuard: TokenCount;
    readonly afterTransforms: TokenCount;
    readonly afterLadder: TokenCount;
    readonly promptTotal: TokenCount;
    readonly reductionPct: Percentage;
  };
  readonly compiledAt: ISOTimestamp;
}
