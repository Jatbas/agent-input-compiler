// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ToolInvocationLogStore } from "@jatbas/aic-core/core/interfaces/tool-invocation-log-store.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { IdGenerator } from "@jatbas/aic-core/core/interfaces/id-generator.interface.js";
import type { SessionId } from "@jatbas/aic-core/core/types/identifiers.js";

export function recordToolInvocation(
  store: ToolInvocationLogStore,
  clock: Clock,
  idGenerator: IdGenerator,
  getSessionId: () => SessionId,
  toolName: string,
  args: object,
): void {
  const paramsShape = JSON.stringify(
    Object.fromEntries(Object.entries(args).map(([k, v]) => [k, typeof v])),
  );
  store.record({
    id: idGenerator.generate(),
    createdAt: clock.now(),
    toolName,
    sessionId: getSessionId(),
    paramsShape,
  });
}
