// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

export class AicError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
