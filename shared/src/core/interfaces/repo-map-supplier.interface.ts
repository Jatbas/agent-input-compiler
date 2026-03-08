// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { AbsolutePath } from "#core/types/paths.js";
import type { RepoMap } from "#core/types/repo-map.js";

export interface RepoMapSupplier {
  getRepoMap(projectRoot: AbsolutePath): Promise<RepoMap>;
}
