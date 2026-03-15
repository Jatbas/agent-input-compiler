// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// PostToolUse (Edit|Write) — records edited file path to session-keyed temp file for Stop hook.

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

function run(stdinStr) {
  try {
    const input =
      typeof stdinStr === "string" && stdinStr.trim() ? JSON.parse(stdinStr) : {};
    const sessionId =
      input.session_id != null
        ? input.session_id
        : (input.input?.session_id ?? "default");
    const pathValue =
      input.tool_input?.path != null
        ? input.tool_input.path
        : (input.input?.tool_input?.path ?? "");
    if (typeof pathValue !== "string" || pathValue.trim() === "") {
      return "{}";
    }
    const sanitized = String(sessionId).replace(/[^a-zA-Z0-9*-]/g, "_");
    const tmpPath = path.join(os.tmpdir(), "aic-cc-edited-" + sanitized + ".json");
    let existing = [];
    if (fs.existsSync(tmpPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(tmpPath, "utf8"));
        existing = Array.isArray(data) ? data : [];
      } catch {
        existing = [];
      }
    }
    const resolved = path.resolve(pathValue);
    const merged = [...new Set([...existing, resolved])].filter(
      (p) => typeof p === "string" && p.length > 0,
    );
    fs.writeFileSync(tmpPath, JSON.stringify(merged), "utf8");
    return "{}";
  } catch {
    return "{}";
  }
}

if (require.main === module) {
  const raw = readStdinSync();
  process.stdout.write(run(raw));
  process.exit(0);
}

module.exports = { run };
