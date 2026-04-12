// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

function isCursorNativeHookPayload(parsed) {
  if (parsed == null || typeof parsed !== "object") return false;
  return (parsed.cursor_version ?? parsed.input?.cursor_version) != null;
}

module.exports = { isCursorNativeHookPayload };
