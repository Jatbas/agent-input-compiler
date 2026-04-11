// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("fs");

// 8 KB covers dozens of recent assistant records in any realistic session.
const TAIL_READ_BYTES = 8192;

// Extract the model ID from a Claude Code transcript JSONL by reading the tail.
// Returns the model string from the most recent assistant message, or null if not
// found (turn 0/1, file missing, empty, or any I/O error).
function readModelFromTranscript(transcriptPath) {
  if (typeof transcriptPath !== "string" || transcriptPath.trim().length === 0)
    return null;
  try {
    const stat = fs.statSync(transcriptPath);
    const readSize = Math.min(TAIL_READ_BYTES, stat.size);
    const buf = Buffer.alloc(readSize);
    const fd = fs.openSync(transcriptPath, "r");
    fs.readSync(fd, buf, 0, readSize, stat.size - readSize);
    fs.closeSync(fd);
    const lines = buf.toString("utf8").split("\n");
    // Scan backward so the most recent assistant response wins.
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        if (
          obj.message != null &&
          typeof obj.message.model === "string" &&
          obj.message.model.trim().length > 0
        ) {
          return obj.message.model.trim();
        }
      } catch {
        // partial line at chunk boundary — skip
      }
    }
    return null;
  } catch {
    return null;
  }
}

module.exports = { readModelFromTranscript };
