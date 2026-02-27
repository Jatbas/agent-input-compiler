import type { CompilationLogEntry } from "#core/types/compilation-log-entry.js";

export interface CompilationLogStore {
  record(entry: CompilationLogEntry): void;
}
