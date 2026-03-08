// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as fs from "node:fs";
import * as path from "node:path";

export function createProjectFileReader(
  projectRoot: string,
): (relativePath: string) => string | null {
  return (relativePath: string): string | null => {
    const full = path.join(projectRoot, relativePath);
    return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
  };
}
