// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { AbsolutePath } from "#core/types/paths.js";
import type { FilePath } from "#core/types/paths.js";
import type { LoadConfigResult } from "#core/interfaces/load-config-result.interface.js";

export interface ConfigLoader {
  load(projectRoot: AbsolutePath, configPath: FilePath | null): LoadConfigResult;
}
