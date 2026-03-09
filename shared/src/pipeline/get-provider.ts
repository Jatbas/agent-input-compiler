// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { LanguageProvider } from "@jatbas/aic-core/core/interfaces/language-provider.interface.js";

export function getProvider(
  path: string,
  providers: readonly LanguageProvider[],
): LanguageProvider | undefined {
  const ext = path.slice(path.lastIndexOf("."));
  return providers.find((p) =>
    p.extensions.some((e) => e.toLowerCase() === ext.toLowerCase()),
  );
}
