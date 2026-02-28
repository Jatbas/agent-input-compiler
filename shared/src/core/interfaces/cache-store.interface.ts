import type { CachedCompilation } from "#core/types/compilation-types.js";

export interface CacheStore {
  get(key: string): CachedCompilation | null;
  set(entry: CachedCompilation): void;
  invalidate(key: string): void;
  invalidateAll(): void;
  purgeExpired(): void;
}
