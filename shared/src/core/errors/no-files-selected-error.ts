// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { AicError } from "./aic-error.js";

export class NoFilesSelectedError extends AicError {
  constructor(message: string) {
    super(message, "NO_FILES_SELECTED");
  }
}
