import { type Brand } from "./brand.js";

// Absolute filesystem path (e.g. /Users/dev/project).
export type AbsolutePath = Brand<string, "AbsolutePath">;

// Relative path from project root (e.g. src/auth/service.ts).
export type RelativePath = Brand<string, "RelativePath">;

// Generic file path — use AbsolutePath or RelativePath when direction is known.
export type FilePath = Brand<string, "FilePath">;

// Glob pattern (e.g. src/**/*.ts).
export type GlobPattern = Brand<string, "GlobPattern">;

// File extension including dot (e.g. .ts, .json).
export type FileExtension = Brand<string, "FileExtension">;

export function toAbsolutePath(value: string): AbsolutePath {
  return value as AbsolutePath;
}

export function toRelativePath(value: string): RelativePath {
  return value as RelativePath;
}

export function toFilePath(value: string): FilePath {
  return value as FilePath;
}

export function toGlobPattern(value: string): GlobPattern {
  return value as GlobPattern;
}

export function toFileExtension(value: string): FileExtension {
  return value as FileExtension;
}
