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

export function resolveImportSpec(
  importerPath: RelativePath,
  spec: string,
): RelativePath | null {
  const importerSegments = importerPath.split("/").filter(Boolean);
  const dir = importerSegments.slice(0, -1);
  const specSegments = spec.split("/").filter((s) => s.length > 0);
  type State = { readonly dir: readonly string[]; readonly escaped: boolean };
  const initial: State = { dir, escaped: false };
  const final = specSegments.reduce<State>((state, segment) => {
    if (state.escaped) return state;
    if (segment === "..") {
      if (state.dir.length === 0) return { dir: [], escaped: true };
      return { dir: state.dir.slice(0, -1), escaped: false };
    }
    if (segment === ".") return state;
    return { dir: [...state.dir, segment], escaped: false };
  }, initial);
  if (final.escaped) return null;
  return toRelativePath(final.dir.length === 0 ? "" : final.dir.join("/"));
}
