// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { UUIDv7, ISOTimestamp, SessionId } from "#core/types/identifiers.js";

export interface ToolInvocationLogEntry {
  readonly id: UUIDv7;
  readonly createdAt: ISOTimestamp;
  readonly toolName: string;
  readonly sessionId: SessionId;
  readonly paramsShape: string;
}
