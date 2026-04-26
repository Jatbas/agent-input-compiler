// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// PreToolUse hook — blocks all tools until aic_compile has been called this turn.
// Writes compile recency when aic_compile is detected. When a sibling aic_compile
// fires in the same tool batch, a short poll waits for it to admit before denying.

const fs = require("fs");
const path = require("path");
const { readStdinSync } = require("../../shared/read-stdin-sync.cjs");
const { resolveProjectRoot } = require("../../shared/resolve-project-root.cjs");
const {
  isCursorNativeHookPayload,
} = require("../../cursor/is-cursor-native-hook-payload.cjs");
const {
  conversationIdFromTranscriptPath,
  resolveConversationIdFallback,
} = require("../../shared/conversation-id.cjs");
const {
  isCompileRecent,
  writeCompileRecency,
  isTurnCompiled,
  readLastConversationId,
} = require("../../shared/compile-recency.cjs");
const { readAicPrewarmPrompt } = require("../../shared/read-aic-prewarm-prompt.cjs");

// Sibling-race poll: when a parallel aic_compile tool call is admitted by its
// own hook in the same batch, its recency write races other tools' reads.
// Without this poll the losing tool deterministically denies even though
// compile is being admitted simultaneously.
const SIBLING_POLL_TOTAL_MS = 500;
const SIBLING_POLL_INTERVAL_MS = 20;

function sleepSync(ms) {
  const buf = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buf), 0, 0, ms);
}

// Walk up parent directories to find the actual project root via aic.config.json.
// Fixes the case where the Bash tool's cwd was changed to a subdirectory (e.g. /mcp).
function findEffectiveProjectRoot(startDir) {
  let dir = path.resolve(startDir);
  const fsRoot = path.parse(dir).root;
  while (dir !== fsRoot) {
    if (fs.existsSync(path.join(dir, "aic.config.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

function isAicCompileCall(toolName, toolInput) {
  if (typeof toolName === "string" && /aic_compile/i.test(toolName)) return true;
  // Allow ToolSearch when searching for the aic_compile schema — needed when the
  // MCP tool is deferred and the agent must load its schema before calling it.
  if (
    toolName === "ToolSearch" &&
    typeof toolInput?.query === "string" &&
    /aic_compile/i.test(toolInput.query)
  )
    return true;
  if (
    toolInput != null &&
    typeof toolInput.intent === "string" &&
    typeof toolInput.projectRoot === "string"
  )
    return true;
  return false;
}

function run(stdinStr) {
  try {
    let parsed;
    try {
      parsed =
        typeof stdinStr === "string" && stdinStr.trim() ? JSON.parse(stdinStr) : {};
    } catch {
      return "{}";
    }

    if (isCursorNativeHookPayload(parsed)) return "{}";

    const top = parsed || {};
    const input = top.input || {};
    const toolName = top.tool_name ?? input.tool_name ?? "";
    const toolInput = top.tool_input ?? input.tool_input ?? {};
    const projectRoot = findEffectiveProjectRoot(resolveProjectRoot(parsed));
    const conversationId =
      (
        conversationIdFromTranscriptPath(parsed) ??
        resolveConversationIdFallback(parsed) ??
        readLastConversationId(projectRoot) ??
        "unknown"
      )
        .toString()
        .trim() || "unknown";

    if (isAicCompileCall(toolName, toolInput)) {
      writeCompileRecency(projectRoot);
      return "{}";
    }

    if (isTurnCompiled(projectRoot, conversationId) || isCompileRecent(projectRoot)) {
      return "{}";
    }

    const deadline = Date.now() + SIBLING_POLL_TOTAL_MS;
    while (Date.now() < deadline) {
      sleepSync(SIBLING_POLL_INTERVAL_MS);
      if (isTurnCompiled(projectRoot, conversationId) || isCompileRecent(projectRoot)) {
        return "{}";
      }
    }

    const savedPrompt = readAicPrewarmPrompt(`cc-${conversationId}`);
    const intentArg =
      savedPrompt.length > 0
        ? savedPrompt.slice(0, 200).replace(/"/g, '\\"')
        : "<describe what the user asked>";

    const reason = `BLOCKED[compile_required]: You must call aic_compile FIRST before using any other tool. Call it now: { "intent": "${intentArg}", "projectRoot": "${projectRoot}" }. If aic_compile is not in your deferred tool list, call ToolSearch with query "aic_compile" to load its schema first (the gate allows this). Do NOT bypass this gate by writing marker files directly — that produces uncompiled context and hides upstream failures.`;

    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    });
  } catch {
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          'BLOCKED[compile_gate_error]: The aic_compile gate hit an unexpected error. Call aic_compile first with { "intent": "<your task>", "projectRoot": "<workspace>" }; if this persists, reinstall AIC.',
      },
    });
  }
}

if (require.main === module) {
  const raw = readStdinSync();
  process.stdout.write(run(raw));
  process.exit(0);
}

module.exports = { run };
