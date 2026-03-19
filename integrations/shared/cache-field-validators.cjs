// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// Keep in sync with shared/src/maintenance/cache-field-validators.ts

const PRINTABLE_ASCII = /^[\x20-\x7E]+$/;

function isValidModelId(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  return t.length >= 1 && t.length <= 256 && PRINTABLE_ASCII.test(t);
}

function isValidConversationId(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  return t.length <= 128 && (t.length === 0 || PRINTABLE_ASCII.test(t));
}

function isValidEditorId(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  return t.length >= 1 && t.length <= 20 && PRINTABLE_ASCII.test(t);
}

function isValidTimestamp(s) {
  if (typeof s !== "string") return false;
  return s.length >= 1 && s.length <= 32 && PRINTABLE_ASCII.test(s);
}

function isValidPromptLogTitle(s) {
  if (typeof s !== "string") return false;
  return s.length <= 200 && PRINTABLE_ASCII.test(s);
}

function isValidPromptLogReason(s) {
  if (typeof s !== "string") return false;
  return s.length <= 256 && PRINTABLE_ASCII.test(s);
}

function isValidGenerationId(s) {
  if (typeof s !== "string") return false;
  return s.length <= 128 && PRINTABLE_ASCII.test(s);
}

module.exports = {
  isValidModelId,
  isValidConversationId,
  isValidEditorId,
  isValidTimestamp,
  isValidPromptLogTitle,
  isValidPromptLogReason,
  isValidGenerationId,
};
