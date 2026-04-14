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
const {
  isCursorNativeHookPayload,
} = require("../../shared/is-cursor-native-hook-payload.cjs");
const { readAicPrewarmPrompt } = require("../../shared/read-aic-prewarm-prompt.cjs");
const {
  writeCompileRecency,
  isCompileRecent,
} = require("../../shared/compile-recency.cjs");
const MAX_DENIES = 3;
const CLEANUP_INTERVAL_MS = 600_000;
const STALE_THRESHOLD_MS = 600_000;
const GATE_REASON = {
  COMPILE_REQUIRED: "compile_required",
  PARSE_ERROR: "gate_parse_error",
};

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

function getDenyCountFile(generationId) {
  return path.join(os.tmpdir(), `aic-gate-deny-${generationId}`);
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
      try {
        fs.unlinkSync(getDenyCountFile(generationId));
      } catch {
        /* ignore */
      }
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

    const denyCountFile = getDenyCountFile(generationId);
    let denyCount = 0;
    try {
      denyCount = Number(fs.readFileSync(denyCountFile, "utf8").trim()) || 0;
    } catch {
      /* ignore */
    }
    if (denyCount >= MAX_DENIES) {
      process.stdout.write(JSON.stringify({ permission: "allow" }));
      return;
    }
    fs.writeFileSync(denyCountFile, String(denyCount + 1));

    const savedPrompt = readAicPrewarmPrompt(generationId);
    const intentArg =
      savedPrompt.length > 0
        ? savedPrompt.replace(/"/g, '\\"')
        : "<search query: name the files, components, or actions>";

    const denyMsg = blockedMessage(
      GATE_REASON.COMPILE_REQUIRED,
      `You must call the aic_compile MCP tool FIRST before using any other tool. Call it now with { "intent": "${intentArg}", "projectRoot": "${projectRoot}" }`,
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
