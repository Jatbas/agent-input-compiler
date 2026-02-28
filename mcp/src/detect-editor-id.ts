import { EDITOR_ID } from "@aic/shared/core/types/enums.js";
import type { EditorId } from "@aic/shared/core/types/enums.js";

// Ordered: more specific patterns first to avoid false positives
const EDITOR_PATTERNS: readonly { readonly substring: string; readonly id: EditorId }[] =
  [
    { substring: "claude", id: EDITOR_ID.CLAUDE_CODE },
    { substring: "cursor", id: EDITOR_ID.CURSOR },
  ];

export function detectEditorId(clientName: string | undefined): EditorId {
  if (clientName === undefined) {
    return EDITOR_ID.GENERIC;
  }
  const lower = clientName.toLowerCase();
  const match = EDITOR_PATTERNS.find((p) => lower.includes(p.substring));
  return match?.id ?? EDITOR_ID.GENERIC;
}
