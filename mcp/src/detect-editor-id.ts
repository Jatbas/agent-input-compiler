import { EDITOR_ID } from "@aic/shared/core/types/enums.js";
import type { EditorId } from "@aic/shared/core/types/enums.js";

// IDE-specific names first; generic model names last to avoid false positives
const EDITOR_PATTERNS: readonly { readonly substring: string; readonly id: EditorId }[] =
  [
    { substring: "cursor", id: EDITOR_ID.CURSOR },
    { substring: "claude", id: EDITOR_ID.CLAUDE_CODE },
  ];

export function detectEditorId(clientName: string | undefined): EditorId {
  if (clientName === undefined) {
    return EDITOR_ID.GENERIC;
  }
  const lower = clientName.toLowerCase();
  const match = EDITOR_PATTERNS.find((p) => lower.includes(p.substring));
  return match?.id ?? EDITOR_ID.GENERIC;
}
