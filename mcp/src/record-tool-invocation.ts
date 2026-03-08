import type { ToolInvocationLogStore } from "@aic/shared/core/interfaces/tool-invocation-log-store.interface.js";
import type { Clock } from "@aic/shared/core/interfaces/clock.interface.js";
import type { IdGenerator } from "@aic/shared/core/interfaces/id-generator.interface.js";
import type { SessionId } from "@aic/shared/core/types/identifiers.js";

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
