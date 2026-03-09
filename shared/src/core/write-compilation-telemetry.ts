// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type {
  CompilationMeta,
  CompilationRequest,
} from "@jatbas/aic-core/core/types/compilation-types.js";
import type { TelemetryDeps } from "@jatbas/aic-core/core/types/telemetry-types.js";
import type { UUIDv7 } from "@jatbas/aic-core/core/types/identifiers.js";
import { toRepoId } from "@jatbas/aic-core/core/types/identifiers.js";
import { buildTelemetryEvent } from "@jatbas/aic-core/core/build-telemetry-event.js";

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
