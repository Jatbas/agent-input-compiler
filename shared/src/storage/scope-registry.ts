// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { ProjectScope } from "@jatbas/aic-core/storage/create-project-scope.js";
import type { ProjectRootNormaliser } from "@jatbas/aic-core/core/interfaces/project-root-normaliser.interface.js";
import { createProjectScope } from "@jatbas/aic-core/storage/create-project-scope.js";
import { closeDatabase } from "@jatbas/aic-core/storage/open-database.js";

export class ScopeRegistry {
  private readonly scopes = new Map<string, ProjectScope>();

  constructor(private readonly normaliser: ProjectRootNormaliser) {}

  getOrCreate(projectRoot: AbsolutePath): ProjectScope {
    const key = this.normaliser.normalise(projectRoot);
    const existing = this.scopes.get(key);
    if (existing !== undefined) return existing;
    const scope = createProjectScope(projectRoot, this.normaliser);
    this.scopes.set(key, scope);
    return scope;
  }

  close(): void {
    for (const scope of this.scopes.values()) {
      closeDatabase(scope.db);
    }
    this.scopes.clear();
  }
}
