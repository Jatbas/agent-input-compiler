// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// stop hook — if the model finished its turn without calling aic_compile,
// returns a followup_message forcing it to call aic_compile before stopping.
// This catches pure-text responses where preToolUse gate never fires.
const fs = require("fs");
const path = require("path");
const os = require("os");

const { readStdinSync } = require("../../shared/read-stdin-sync.cjs");
const {
  isCursorNativeHookPayload,
} = require("../../shared/is-cursor-native-hook-payload.cjs");
const { resolveProjectRoot } = require("../../shared/resolve-project-root.cjs");
const { readAicPrewarmPrompt } = require("../../shared/read-aic-prewarm-prompt.cjs");
const { isCompileRecent } = require("../../shared/compile-recency.cjs");

function getStateFile(generationId) {
  return path.join(os.tmpdir(), `aic-gate-${generationId}`);
}

try {
  const raw = readStdinSync();
  const input = raw.trim() ? JSON.parse(raw) : {};

  if (!isCursorNativeHookPayload(input)) {
    process.stdout.write("{}");
    process.exit(0);
  }

  const generationId = input.generation_id || "unknown";
  const stateFile = getStateFile(generationId);

  if (fs.existsSync(stateFile)) {
    process.stdout.write("{}");
    process.exit(0);
  }

  const projectRoot = resolveProjectRoot(null, { env: process.env });

  if (isCompileRecent(projectRoot)) {
    process.stdout.write("{}");
    process.exit(0);
  }
  const savedPrompt = readAicPrewarmPrompt(generationId);
  const intentArg =
    savedPrompt.length > 0
      ? savedPrompt.slice(0, 200).replace(/"/g, '\\"')
      : "<describe what the user asked>";

  const msg =
    "You did not call aic_compile this turn. You MUST call it now: " +
    `aic_compile({ "intent": "${intentArg}", "projectRoot": "${projectRoot}" })`;

  process.stdout.write(JSON.stringify({ followup_message: msg }));
} catch {
  process.stdout.write("{}");
}
process.exit(0);
