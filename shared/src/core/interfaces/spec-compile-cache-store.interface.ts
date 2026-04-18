// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { SpecCompileCacheEntry } from "@jatbas/aic-core/core/types/specification-compilation.types.js";

export interface SpecCompileCacheStore {
  get(cacheKey: string): SpecCompileCacheEntry | null;
  set(entry: SpecCompileCacheEntry): void;
  invalidate(cacheKey: string): void;
  purgeExpired(): void;
}
