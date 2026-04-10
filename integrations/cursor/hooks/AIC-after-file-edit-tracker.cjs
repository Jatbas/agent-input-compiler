// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// afterFileEdit hook — records edited file paths to a temp file keyed by conversation/session
// so the stop hook can run lint/typecheck on those files. Cumulative list: read existing,
// merge new paths from input, dedupe, overwrite temp file.
const path = require("path");
const { readStdinSync } = require("../../shared/read-stdin-sync.cjs");
const { writeEditedFiles } = require("../../shared/edited-files-cache.cjs");

function extractPaths(input) {
  if (!input || typeof input !== "object") return [];
  const raw = input.files ?? input.paths ?? input.editedFiles ?? input.edited_paths;
  if (Array.isArray(raw)) {
    return raw.filter((p) => typeof p === "string").map((p) => path.resolve(p));
  }
  const single = input.file ?? input.path ?? input.filePath;
  if (typeof single === "string") return [path.resolve(single)];
  const edit = input.edit ?? input.edits;
  if (edit && typeof edit === "object") {
    const p = edit.file ?? edit.path ?? edit.filePath;
    if (typeof p === "string") return [path.resolve(p)];
  }
  if (Array.isArray(edit)) {
    return edit
      .map((e) => (e && typeof e === "object" ? (e.file ?? e.path ?? e.filePath) : null))
      .filter((p) => typeof p === "string")
      .map((p) => path.resolve(p));
  }
  return [];
}

try {
  const raw = readStdinSync();
  const input = raw.trim() ? JSON.parse(raw) : {};
  if (!input.cursor_version && !input.input?.cursor_version) {
    process.stdout.write("{}");
    process.exit(0);
  }
  const key =
    input.conversation_id ??
    input.conversationId ??
    input.session_id ??
    input.sessionId ??
    process.env.AIC_CONVERSATION_ID ??
    "default";
  const newPaths = extractPaths(input);
  writeEditedFiles("cursor", key, newPaths);
  process.stdout.write("{}");
} catch {
  process.stdout.write("{}");
}
process.exit(0);
