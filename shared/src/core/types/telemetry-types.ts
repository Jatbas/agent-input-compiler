import type { UUIDv7, ISOTimestamp, RepoId } from "#core/types/identifiers.js";
import type { TokenCount, Milliseconds } from "#core/types/units.js";
import type { TaskClass, InclusionTier } from "#core/types/enums.js";

export interface TelemetryEvent {
  readonly id: UUIDv7;
  readonly timestamp: ISOTimestamp;
  readonly repoId: RepoId;
  readonly taskClass: TaskClass;
  readonly tokensRaw: TokenCount;
  readonly tokensCompiled: TokenCount;
  readonly filesSelected: number;
  readonly filesTotal: number;
  readonly summarisationTiers: Readonly<Record<InclusionTier, number>>;
  readonly guardBlockedCount: number;
  readonly guardFindingsCount: number;
  readonly cacheHit: boolean;
  readonly durationMs: Milliseconds;
  readonly model: string | null;
}
