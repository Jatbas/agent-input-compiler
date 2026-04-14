// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// Stop hook — blocks stop if aic_compile was not called this turn.
// Catches pure-text responses where the PreToolUse gate never fires.
// MAX_STOP_BLOCKS=2 escape hatch prevents infinite loops when the server is unavailable.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { readStdinSync } = require("../../shared/read-stdin-sync.cjs");
const { resolveProjectRoot } = require("../../shared/resolve-project-root.cjs");
const {
  isCursorNativeHookPayload,
} = require("../../cursor/is-cursor-native-hook-payload.cjs");
const {
  conversationIdFromTranscriptPath,
  resolveConversationIdFallback,
} = require("../../shared/conversation-id.cjs");
const { isCompileRecent } = require("../../shared/compile-recency.cjs");
const { readAicPrewarmPrompt } = require("../../shared/read-aic-prewarm-prompt.cjs");

const MAX_STOP_BLOCKS = 2;

function stopBlockFile(conversationId) {
  return path.join(
    os.tmpdir(),
    `aic-stop-cc-block-${String(conversationId).slice(0, 64)}`,
  );
}

function run(stdinStr) {
  try {
    let parsed;
    try {
      parsed =
        typeof stdinStr === "string" && stdinStr.trim() ? JSON.parse(stdinStr) : {};
    } catch {
      return "";
    }

    if (isCursorNativeHookPayload(parsed)) return "";

    const projectRoot = resolveProjectRoot(parsed);

    if (isCompileRecent(projectRoot)) return "";

    const conversationId =
      (
        conversationIdFromTranscriptPath(parsed) ??
        resolveConversationIdFallback(parsed) ??
        "unknown"
      )
        .toString()
        .trim() || "unknown";

    const sbFile = stopBlockFile(conversationId);
    let blockCount = 0;
    try {
      blockCount = Number(fs.readFileSync(sbFile, "utf8").trim()) || 0;
    } catch {
      /* missing — first block */
    }

    if (blockCount >= MAX_STOP_BLOCKS) return "";

    fs.writeFileSync(sbFile, String(blockCount + 1));

    const savedPrompt = readAicPrewarmPrompt(`cc-${conversationId}`);
    const intentArg =
      savedPrompt.length > 0
        ? savedPrompt.slice(0, 200).replace(/"/g, '\\"')
        : "<describe what the user asked>";

    const reason = `You did not call aic_compile this turn. Call it now: aic_compile({ "intent": "${intentArg}", "projectRoot": "${projectRoot}" })`;

    return JSON.stringify({ decision: "block", reason });
  } catch {
    return "";
  }
}

if (require.main === module) {
  const raw = readStdinSync();
  process.stdout.write(run(raw));
  process.exit(0);
}

module.exports = { run };
