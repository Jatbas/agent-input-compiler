// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// Claude Code hook — UserPromptSubmit
// THE key differentiator from Cursor: compiles intent-specific context on every
// prompt using the user's actual message as the intent. The compiled result is
// injected as additionalContext before the model processes the prompt.
// Also logs prompts to .aic/prompt-log.jsonl for telemetry.
const fs = require("fs");
const path = require("path");
const { callAicCompile } = require("./aic-compile-helper.cjs");

const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const LOG_FILE = path.join(projectRoot, ".aic", "prompt-log.jsonl");

function appendLog(entry) {
  try {
    const dir = path.dirname(LOG_FILE);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // Non-fatal
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
    const prompt = (input.prompt || "").trim();
    const sessionId = input.session_id || "unknown";

    if (prompt.length === 0) {
      process.exit(0);
      return;
    }

    // Log prompt for telemetry
    appendLog({
      sessionId,
      title: prompt.slice(0, 200),
      timestamp: new Date().toISOString(),
    });

    // Compile context using the user's actual prompt as intent
    const compiled = callAicCompile(prompt, projectRoot, 25000);
    if (compiled) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            additionalContext: [
              "## AIC Compiled Context (auto-injected for this prompt)",
              "Intent-specific project context compiled by AIC hooks.",
              "",
              compiled,
            ].join("\n"),
          },
        }),
      );
    }
  } catch {
    // Non-fatal — never block prompt processing
    process.exit(0);
  }
});
