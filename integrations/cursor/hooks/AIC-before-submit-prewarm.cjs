// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// beforeSubmitPrompt hook — logs the user's prompt with conversation context,
// and saves it so the preToolUse gate can include the exact intent in the deny
// reason. Zero token cost: returns { continue: true } immediately.
//
// Writes to .aic/prompt-log.jsonl — one JSON line per prompt with:
// conversation_id, generation_id, prompt (first 200 chars as title), timestamp
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  isValidModelId,
  normalizeModelId,
  writeSessionModelCache,
} = require("../../shared/session-model-cache.cjs");

const projectRoot = process.env.CURSOR_PROJECT_DIR || process.cwd();
const LOG_FILE = path.join(projectRoot, ".aic", "prompt-log.jsonl");

function promptFile(generationId) {
  return path.join(os.tmpdir(), `aic-prompt-${generationId}`);
}

function appendLog(entry) {
  try {
    const dir = path.dirname(LOG_FILE);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // Non-fatal — never block submission
  }
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw);
    const conversationId = input.conversation_id || "unknown";
    const generationId = input.generation_id || "unknown";
    const prompt = (input.prompt || "").trim();
    const model = input.model || "";

    if (prompt.length > 0) {
      fs.writeFileSync(promptFile(generationId), prompt, "utf8");

      const ts = new Date().toISOString();
      appendLog({
        conversationId,
        generationId,
        title: prompt.slice(0, 200),
        model,
        timestamp: ts,
      });

      if (isValidModelId(model)) {
        writeSessionModelCache(
          projectRoot,
          normalizeModelId(model.trim()),
          conversationId,
          "cursor",
          ts,
        );
      }
    }
  } catch {
    // Non-fatal
  }

  process.stdout.write(JSON.stringify({ continue: true }));
});
