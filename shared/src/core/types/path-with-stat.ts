// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { RelativePath } from "#core/types/paths.js";
import type { Bytes } from "#core/types/units.js";
import type { ISOTimestamp } from "#core/types/identifiers.js";

export interface PathWithStat {
  readonly path: RelativePath;
  readonly sizeBytes: Bytes;
  readonly lastModified: ISOTimestamp;
}
