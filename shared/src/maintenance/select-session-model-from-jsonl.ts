// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import {
  isValidConversationId,
  isValidEditorId,
  isValidModelId,
} from "./cache-field-validators.js";

export function reduceSessionModelJsonlState(
  raw: string,
  conversationId: string | null,
  editorId: string,
): Readonly<{ match: string | null; last: string | null }> {
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const cid = typeof conversationId === "string" ? conversationId.trim() : "";
  return lines.reduce<Readonly<{ match: string | null; last: string | null }>>(
    (s, line) => {
      try {
        const entry = JSON.parse(line) as { m?: unknown; c?: unknown; e?: unknown };
        if (
          typeof entry.m !== "string" ||
          !isValidModelId(entry.m) ||
          entry.m === "auto" ||
          typeof entry.c !== "string" ||
          !isValidConversationId(entry.c) ||
          typeof entry.e !== "string" ||
          !isValidEditorId(entry.e) ||
          entry.e !== editorId
        ) {
          return s;
        }
        return {
          last: entry.m,
          match: cid.length > 0 && entry.c === cid ? entry.m : s.match,
        };
      } catch {
        return s;
      }
    },
    { match: null, last: null },
  );
}

export function selectSessionModelIdFromJsonlContent(
  raw: string,
  conversationId: string | null,
  editorId: string,
): string | null {
  const state = reduceSessionModelJsonlState(raw, conversationId, editorId);
  return state.match ?? state.last;
}
