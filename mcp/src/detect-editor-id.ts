// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { EDITOR_ID } from "@jatbas/aic-core/core/types/enums.js";
import type { EditorId } from "@jatbas/aic-core/core/types/enums.js";

// Ordered most-specific first; first match wins
const EDITOR_PATTERNS: readonly { readonly substring: string; readonly id: EditorId }[] =
  [
    { substring: "cursor", id: EDITOR_ID.CURSOR },
    { substring: "claude-code", id: EDITOR_ID.CLAUDE_CODE },
    { substring: "claude code", id: EDITOR_ID.CLAUDE_CODE },
  ];

export interface EditorEnvHints {
  readonly cursorAgent?: boolean;
  readonly claudeCodeProjectDir?: boolean;
}

export function detectEditorId(
  clientName: string | undefined,
  envHints?: EditorEnvHints,
): EditorId {
  // Env-first: Cursor, then Claude Code, then client name (Cursor+Opus must not be misclassified)
  if (envHints?.cursorAgent === true) return EDITOR_ID.CURSOR;
  if (envHints?.claudeCodeProjectDir === true) return EDITOR_ID.CLAUDE_CODE;
  if (clientName !== undefined) {
    const lower = clientName.toLowerCase();
    const match = EDITOR_PATTERNS.find((p) => lower.includes(p.substring));
    if (match !== undefined) return match.id;
  }
  return EDITOR_ID.GENERIC;
}
