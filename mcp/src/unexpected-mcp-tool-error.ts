// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { sanitizeError } from "@jatbas/aic-core/core/errors/sanitize-error.js";

export function rethrowUnexpectedMcpToolError(toolName: string, err: unknown): never {
  const { message } = sanitizeError(err);
  process.stderr.write(`[aic] ${toolName} unexpected error: ${message}\n`);
  throw new McpError(ErrorCode.InternalError, "Internal error");
}
