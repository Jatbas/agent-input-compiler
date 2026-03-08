// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { AicError } from "./aic-error.js";

const ABSOLUTE_PATH_REGEX = /\/[^\s]+|[A-Za-z]:\\[^\s]+/g;
const ENV_VAR_REGEX = /\b[A-Z_][A-Z0-9_]*\s*=/g;

function sanitizeMessage(message: string): string {
  const parts = message
    .replace(ABSOLUTE_PATH_REGEX, "[path]")
    .replace(ENV_VAR_REGEX, "[env]=***")
    .split("\n");
  const firstLine = parts[0] ?? "";
  return firstLine.trim();
}

export function sanitizeError(err: unknown): { code: string; message: string } {
  if (err instanceof AicError) {
    return {
      code: err.code,
      message: sanitizeMessage(err.message),
    };
  }
  const message =
    err instanceof Error ? sanitizeMessage(err.message) : "An unexpected error occurred.";
  return { code: "INTERNAL_ERROR", message };
}
