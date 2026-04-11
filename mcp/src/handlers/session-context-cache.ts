// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { EditorId } from "@jatbas/aic-core/core/types/enums.js";
import { EDITOR_ID } from "@jatbas/aic-core/core/types/enums.js";
import type { SessionId } from "@jatbas/aic-core/core/types/identifiers.js";

// Falls back to last known editor when generic — prevents per-call editor ID oscillation.
export class SessionContext {
  private lastEditorId: EditorId | null = null;

  constructor(private readonly primarySessionId: SessionId) {}

  getEditorId(detect: () => EditorId): EditorId {
    const resolved = detect();
    if (resolved !== EDITOR_ID.GENERIC) {
      this.lastEditorId = resolved;
      return resolved;
    }
    return this.lastEditorId ?? resolved;
  }

  getSessionId(): SessionId {
    return this.primarySessionId;
  }
}
