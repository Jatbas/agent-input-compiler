// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { createHash } from "node:crypto";
import type { StringHasher } from "@jatbas/aic-core/core/interfaces/string-hasher.interface.js";

export class Sha256Adapter implements StringHasher {
  hash(input: string): string {
    return createHash("sha256").update(input, "utf8").digest("hex");
  }
}
