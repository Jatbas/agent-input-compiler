import { type Brand } from "./brand.js";

/**
 * ISO 8601 UTC timestamp with millisecond precision.
 * Canonical format: `YYYY-MM-DDTHH:mm:ss.sssZ` (ADR-008).
 */
export type ISOTimestamp = Brand<string, "ISOTimestamp">;

/** UUIDv7 string (time-ordered, RFC 9562). Used as entity PK (ADR-007). */
export type UUIDv7 = Brand<string, "UUIDv7">;

/** Agentic session identifier (UUIDv7). */
export type SessionId = Brand<string, "SessionId">;

/** SHA-256 hash of the project root absolute path. */
export type RepoId = Brand<string, "RepoId">;

/** Semantic version string (e.g. `1.2.3`). */
export type SemanticVersion = Brand<string, "SemanticVersion">;

export function toISOTimestamp(value: string): ISOTimestamp {
  return value as ISOTimestamp;
}

export function toUUIDv7(value: string): UUIDv7 {
  return value as UUIDv7;
}

export function toSessionId(value: string): SessionId {
  return value as SessionId;
}

export function toRepoId(value: string): RepoId {
  return value as RepoId;
}

export function toSemanticVersion(value: string): SemanticVersion {
  return value as SemanticVersion;
}
