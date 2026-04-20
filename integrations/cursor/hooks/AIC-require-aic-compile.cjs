// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// preToolUse hook — blocks all tools until aic_compile has been called for this generation.
// Reads the exact user prompt saved by before-submit-prewarm.cjs and includes it
// in the deny message so the model copies it verbatim → cache hit from pre-warm.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { resolveProjectRoot } = require("../../shared/resolve-project-root.cjs");
const { isCursorNativeHookPayload } = require("../is-cursor-native-hook-payload.cjs");
const { readAicPrewarmPrompt } = require("../../shared/read-aic-prewarm-prompt.cjs");
const {
  writeCompileRecency,
  isCompileRecent,
} = require("../../shared/compile-recency.cjs");
const CLEANUP_INTERVAL_MS = 600_000;
const STALE_THRESHOLD_MS = 600_000;
// Sibling-race poll: when a parallel aic_compile tool call is admitted by its
// own hook in the same batch, its state-file write races the other tools'
// reads. Without this poll the losing tool deterministically denies even
// though compile is being admitted simultaneously. See tests.
const SIBLING_POLL_TOTAL_MS = 500;
const SIBLING_POLL_INTERVAL_MS = 20;
const GATE_REASON = {
  COMPILE_REQUIRED: "compile_required",
  PARSE_ERROR: "gate_parse_error",
};

function sleepSync(ms) {
  const buf = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buf), 0, 0, ms);
}

function blockedMessage(reason, text) {
  return `BLOCKED[${reason}]: ${text}`;
}

function cleanupStaleGateFiles() {
  const marker = path.join(os.tmpdir(), "aic-gate-cleanup-marker");
  try {
    if (Date.now() - fs.statSync(marker).mtimeMs < CLEANUP_INTERVAL_MS) return;
  } catch {
    /* marker missing — proceed */
  }
  try {
    fs.writeFileSync(marker, "1");
  } catch {
    return;
  }
  try {
    const tmpDir = os.tmpdir();
    const now = Date.now();
    for (const entry of fs.readdirSync(tmpDir)) {
      if (entry.startsWith("aic-gate-recent-")) continue;
      if (entry === "aic-gate-cleanup-marker") continue;
      if (!entry.startsWith("aic-gate-") && !entry.startsWith("aic-prompt-")) continue;
      try {
        const full = path.join(tmpDir, entry);
        if (now - fs.statSync(full).mtimeMs > STALE_THRESHOLD_MS) fs.unlinkSync(full);
      } catch {
        /* removed by another process */
      }
    }
  } catch {
    /* readdir failed */
  }
}

// Emergency bypass: requires BOTH devMode AND skipCompileGate in aic.config.json.
function isEmergencyBypass() {
  try {
    const projectRoot = resolveProjectRoot(null, { env: process.env });
    const raw = fs.readFileSync(path.join(projectRoot, "aic.config.json"), "utf8");
    const parsed = JSON.parse(raw);
    return (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      parsed.devMode === true &&
      parsed.skipCompileGate === true
    );
  } catch {
    return false;
  }
}

if (isEmergencyBypass()) {
  process.stdout.write(JSON.stringify({ permission: "allow" }));
  process.exit(0);
}

cleanupStaleGateFiles();

function getStateFile(generationId) {
  return path.join(os.tmpdir(), `aic-gate-${generationId}`);
}

function isAicCompileMcpCall(toolName, toolInput) {
  try {
    const input = typeof toolInput === "string" ? JSON.parse(toolInput) : toolInput;
    if (input && input.toolName === "aic_compile") return true;
    if (input && input.tool_name === "aic_compile") return true;
    if (input && input.name === "aic_compile") return true;
  } catch {
    /* ignore parse errors */
  }
  const inputStr =
    typeof toolInput === "string" ? toolInput : JSON.stringify(toolInput || {});
  if (inputStr.includes("aic_compile")) return true;
  if (toolName.includes("aic_compile")) return true;
  return false;
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw);
    if (!isCursorNativeHookPayload(input)) {
      process.stdout.write(JSON.stringify({ permission: "allow" }));
      process.exit(0);
    }
    const generationId = input.generation_id || "unknown";
    const toolName = input.tool_name || "";
    const toolInput = input.tool_input || {};
    const stateFile = getStateFile(generationId);

    const projectRoot = resolveProjectRoot(null, { env: process.env });

    if (isAicCompileMcpCall(toolName, toolInput)) {
      fs.writeFileSync(stateFile, "1");
      writeCompileRecency(projectRoot);
      process.stdout.write(JSON.stringify({ permission: "allow" }));
      return;
    }

    if (fs.existsSync(stateFile)) {
      process.stdout.write(JSON.stringify({ permission: "allow" }));
      return;
    }

    if (isCompileRecent(projectRoot)) {
      process.stdout.write(JSON.stringify({ permission: "allow" }));
      return;
    }

    // Poll briefly: a sibling aic_compile hook fired in the same tool batch
    // may still be writing state/recency. Without this wait, parallel batches
    // deterministically deny the non-compile siblings.
    const deadline = Date.now() + SIBLING_POLL_TOTAL_MS;
    while (Date.now() < deadline) {
      sleepSync(SIBLING_POLL_INTERVAL_MS);
      if (fs.existsSync(stateFile) || isCompileRecent(projectRoot)) {
        process.stdout.write(JSON.stringify({ permission: "allow" }));
        return;
      }
    }

    const savedPrompt = readAicPrewarmPrompt(generationId);
    const intentArg =
      savedPrompt.length > 0
        ? savedPrompt.replace(/"/g, '\\"')
        : "<search query: name the files, components, or actions>";

    const denyMsg = blockedMessage(
      GATE_REASON.COMPILE_REQUIRED,
      `You must call the aic_compile MCP tool FIRST before using any other tool. Call it now with { "intent": "${intentArg}", "projectRoot": "${projectRoot}" }. Do NOT bypass this gate by writing marker files directly — that produces uncompiled context and hides upstream failures.`,
    );
    process.stdout.write(
      JSON.stringify({
        permission: "deny",
        user_message: denyMsg,
        agent_message: denyMsg,
      }),
    );
  } catch {
    // Fail-closed: deny on parse error (hooks.json also sets failClosed: true)
    process.stdout.write(
      JSON.stringify({
        permission: "deny",
        user_message: blockedMessage(
          GATE_REASON.PARSE_ERROR,
          "aic_compile gate encountered an error. Call aic_compile first.",
        ),
        agent_message: blockedMessage(
          GATE_REASON.PARSE_ERROR,
          "aic_compile gate encountered an error. Call aic_compile first.",
        ),
      }),
    );
  }
});
