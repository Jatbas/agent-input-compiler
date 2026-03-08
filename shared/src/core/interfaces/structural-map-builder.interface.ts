// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { RepoMap } from "#core/types/repo-map.js";

export interface StructuralMapBuilder {
  build(repoMap: RepoMap): string;
}
