import type { UUIDv7, ISOTimestamp } from "#core/types/identifiers.js";
import type { TokenCount, Milliseconds } from "#core/types/units.js";
import type { Percentage } from "#core/types/scores.js";
import type { TaskClass, EditorId } from "#core/types/enums.js";

export interface CompilationLogEntry {
  readonly id: UUIDv7;
  readonly intent: string;
  readonly taskClass: TaskClass;
  readonly filesSelected: number;
  readonly filesTotal: number;
  readonly tokensRaw: TokenCount;
  readonly tokensCompiled: TokenCount;
  readonly tokenReductionPct: Percentage;
  readonly cacheHit: boolean;
  readonly durationMs: Milliseconds;
  readonly editorId: EditorId;
  readonly modelId: string;
  readonly createdAt: ISOTimestamp;
}
