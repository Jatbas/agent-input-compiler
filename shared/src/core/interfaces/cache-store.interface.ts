// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { CachedCompilation } from "@jatbas/aic-shared/core/types/compilation-types.js";

export interface CacheStore {
  get(key: string): CachedCompilation | null;
  set(entry: CachedCompilation): void;
  invalidate(key: string): void;
  invalidateAll(): void;
  purgeExpired(): void;
}
