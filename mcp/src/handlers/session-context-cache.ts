import type { EditorId } from "@aic/shared/core/types/enums.js";
import { EDITOR_ID } from "@aic/shared/core/types/enums.js";
import type { SessionId } from "@aic/shared/core/types/identifiers.js";

// Single place for session and editor resolution before we persist.
// Editor: detect from client; if generic, use last known (cursor/claude-code). Session: server's primary only.
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
