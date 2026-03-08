// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

export interface ExecutableDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...args: unknown[]): void;
    all(...args: unknown[]): unknown[];
  };
}
