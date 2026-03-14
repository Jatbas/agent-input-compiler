// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// afterFileEdit hook — records edited file paths to a temp file keyed by conversation/session
// so the stop hook can run lint/typecheck on those files. Cumulative list: read existing,
// merge new paths from input, dedupe, overwrite temp file.
const fs = require("fs");
const path = require("path");
const os = require("os");

function readStdinSync() {
  const chunks = [];
  let size = 0;
  const buf = Buffer.alloc(64 * 1024);
  let n;
  while ((n = fs.readSync(0, buf, 0, buf.length, null)) > 0) {
    chunks.push(buf.slice(0, n));
    size += n;
  }
  return Buffer.concat(chunks, size).toString("utf8");
}

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
  const key =
    input.conversation_id ??
    input.conversationId ??
    input.session_id ??
    input.sessionId ??
    process.env.AIC_CONVERSATION_ID ??
    "default";
  const newPaths = extractPaths(input);
  const tmpPath = path.join(
    os.tmpdir(),
    "aic-edited-files-" + String(key).replace(/[^a-zA-Z0-9_-]/g, "_") + ".json",
  );
  let existing = [];
  if (fs.existsSync(tmpPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(tmpPath, "utf8"));
      existing = Array.isArray(data) ? data : [];
    } catch {
      existing = [];
    }
  }
  const merged = [...new Set([...existing, ...newPaths])].filter(
    (p) => typeof p === "string" && p.length > 0,
  );
  fs.writeFileSync(tmpPath, JSON.stringify(merged), "utf8");
  process.stdout.write("{}");
} catch {
  process.stdout.write("{}");
}
process.exit(0);
