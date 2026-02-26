import type {
  CompilationMeta,
  CompilationRequest,
} from "#core/types/compilation-types.js";
import type { TelemetryEvent } from "#core/types/telemetry-types.js";
import type { UUIDv7, ISOTimestamp, RepoId } from "#core/types/identifiers.js";

export function buildTelemetryEvent(
  meta: CompilationMeta,
  _request: CompilationRequest,
  id: UUIDv7,
  timestamp: ISOTimestamp,
  repoId: RepoId,
): TelemetryEvent {
  const guardBlockedCount = meta.guard?.filesBlocked.length ?? 0;
  const guardFindingsCount = meta.guard?.findings.length ?? 0;
  const model = meta.modelId === "" ? null : meta.modelId;
  return {
    id,
    timestamp,
    repoId,
    taskClass: meta.taskClass,
    tokensRaw: meta.tokensRaw,
    tokensCompiled: meta.tokensCompiled,
    filesSelected: meta.filesSelected,
    filesTotal: meta.filesTotal,
    summarisationTiers: meta.summarisationTiers,
    guardBlockedCount,
    guardFindingsCount,
    cacheHit: meta.cacheHit,
    durationMs: meta.durationMs,
    model,
  };
}
