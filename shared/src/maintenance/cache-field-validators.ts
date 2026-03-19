// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// Per-field validation at cache read boundary (ADR-009). Used by server, prune, and CJS hooks copy.

const PRINTABLE_ASCII = /^[\x20-\x7E]+$/;

export function isValidModelId(s: string): boolean {
  if (typeof s !== "string") return false;
  const t = s.trim();
  return t.length >= 1 && t.length <= 256 && PRINTABLE_ASCII.test(t);
}

export function isValidConversationId(s: string): boolean {
  if (typeof s !== "string") return false;
  const t = s.trim();
  return t.length <= 128 && (t.length === 0 || PRINTABLE_ASCII.test(t));
}

export function isValidEditorId(s: string): boolean {
  if (typeof s !== "string") return false;
  const t = s.trim();
  return t.length >= 1 && t.length <= 20 && PRINTABLE_ASCII.test(t);
}

export function isValidTimestamp(s: string): boolean {
  if (typeof s !== "string") return false;
  return s.length >= 1 && s.length <= 32 && PRINTABLE_ASCII.test(s);
}
