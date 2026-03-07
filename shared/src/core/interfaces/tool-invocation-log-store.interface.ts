import type { ToolInvocationLogEntry } from "#core/types/tool-invocation-log-entry.js";

export interface ToolInvocationLogStore {
  record(entry: ToolInvocationLogEntry): void;
}
