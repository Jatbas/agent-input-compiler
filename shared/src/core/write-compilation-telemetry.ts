import type {
  CompilationMeta,
  CompilationRequest,
} from "#core/types/compilation-types.js";
import type { TelemetryDeps } from "#core/types/telemetry-types.js";
import type { UUIDv7 } from "#core/types/identifiers.js";
import { toRepoId } from "#core/types/identifiers.js";
import { buildTelemetryEvent } from "#core/build-telemetry-event.js";

export function writeCompilationTelemetry(
  meta: CompilationMeta,
  request: CompilationRequest,
  compilationId: UUIDv7,
  deps: TelemetryDeps,
  logFailure: (message: string) => void,
): void {
  const repoId = toRepoId(deps.stringHasher.hash(request.projectRoot));
  const event = buildTelemetryEvent(
    meta,
    deps.idGenerator.generate(),
    compilationId,
    deps.clock.now(),
    repoId,
  );
  try {
    deps.telemetryStore.write(event);
  } catch {
    logFailure("Telemetry write failed\n");
  }
}
