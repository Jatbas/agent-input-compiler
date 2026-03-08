// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { AicError } from "./aic-error.js";

export class GuardBlockedAllError extends AicError {
  constructor(message: string) {
    super(message, "GUARD_BLOCKED_ALL");
  }
}
