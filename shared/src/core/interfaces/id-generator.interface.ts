// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { UUIDv7 } from "#core/types/identifiers.js";

export interface IdGenerator {
  generate(): UUIDv7;
}
