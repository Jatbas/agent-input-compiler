// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const crypto = require("crypto");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const hookPath = path.join(
  repoRoot,
  "integrations",
  "cursor",
  "hooks",
  "AIC-require-aic-compile.cjs",
);

function getPromptFile(generationId) {
  return path.join(os.tmpdir(), `aic-prompt-${generationId}`);
}

function runHook(stdinStr) {
  const env = { ...process.env, AIC_DEV_MODE: "" };
  const result = spawnSync("node", [hookPath], {
    input: stdinStr,
    encoding: "utf8",
    env,
  });
  return result.stdout.trim();
}

function deny_message_intent_stripped_when_saved_prompt_has_ide_selection() {
  const generationId = crypto.randomBytes(8).toString("hex");
  const promptPath = getPromptFile(generationId);
  const promptContent = "hello <ide_selection>V8</ide_selection> world";
  fs.writeFileSync(promptPath, promptContent, "utf8");
  try {
    const stdin = JSON.stringify({
      generation_id: generationId,
      tool_name: "other_tool",
      tool_input: {},
    });
    const stdout = runHook(stdin);
    const out = JSON.parse(stdout);
    if (out.permission !== "deny") {
      throw new Error(`Expected permission "deny", got ${out.permission}`);
    }
    const userMessage = out.user_message || "";
    if (userMessage.includes("<ide_selection>")) {
      throw new Error(
        `user_message must not contain "<ide_selection>", got: ${userMessage.slice(0, 150)}`,
      );
    }
    if (!userMessage.includes("hello")) {
      throw new Error(
        `user_message must contain "hello", got: ${userMessage.slice(0, 150)}`,
      );
    }
    if (!userMessage.includes("world")) {
      throw new Error(
        `user_message must contain "world", got: ${userMessage.slice(0, 150)}`,
      );
    }
    console.log("deny_message_intent_stripped_when_saved_prompt_has_ide_selection: pass");
  } finally {
    try {
      fs.unlinkSync(promptPath);
    } catch {
      // ignore
    }
  }
}

deny_message_intent_stripped_when_saved_prompt_has_ide_selection();
console.log("All tests passed.");
