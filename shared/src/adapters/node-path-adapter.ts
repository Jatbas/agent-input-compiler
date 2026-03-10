// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import path from "node:path";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { ProjectRootNormaliser } from "@jatbas/aic-core/core/interfaces/project-root-normaliser.interface.js";

export class NodePathAdapter implements ProjectRootNormaliser {
  constructor() {}

  normalise(raw: string): AbsolutePath {
    const resolved = path.resolve(raw);
    const isRoot =
      resolved === "/" || (path.sep === "\\" && /^[A-Za-z]:\\$/.test(resolved));
    const withoutTrailing =
      isRoot || !resolved.endsWith(path.sep)
        ? resolved
        : resolved.slice(0, -path.sep.length);
    const driveLowered =
      path.sep === "\\" && /^[A-Z]:/.test(withoutTrailing)
        ? withoutTrailing.slice(0, 2).toLowerCase() + withoutTrailing.slice(2)
        : withoutTrailing;
    return toAbsolutePath(driveLowered);
  }
}
