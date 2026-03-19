// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// PreToolUse hook — inject conversationId, editorId, and modelId (from cache) into aic_compile MCP calls.

const fs = require("fs");
const path = require("path");

function isValidModelId(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  return t.length >= 1 && t.length <= 256 && /^[\x20-\x7E]+$/.test(t);
}

function normalizeModelId(raw) {
  return raw.toLowerCase() === "default" ? "auto" : raw;
}

function readSessionModelCache(root, convId, eid) {
  try {
    const raw = fs.readFileSync(path.join(root, ".aic", "session-models.jsonl"), "utf8");
    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    const cid = typeof convId === "string" ? convId.trim() : "";
    let lastMatch = null;
    let lastAny = null;
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (typeof entry.m === "string" && isValidModelId(entry.m) && entry.e === eid) {
          lastAny = entry.m;
          if (cid.length > 0 && entry.c === cid) lastMatch = entry.m;
        }
      } catch {
        // skip malformed
      }
    }
    const result = lastMatch !== null ? lastMatch : lastAny;
    return result !== null ? normalizeModelId(result) : null;
  } catch {
    // no cache
  }
  return null;
}

function run(stdinStr) {
  let parsed;
  try {
    parsed = JSON.parse(stdinStr);
  } catch {
    parsed = {};
  }
  const top = parsed || {};
  const input = top.input || {};
  const toolName = top.tool_name ?? input.tool_name ?? "";
  const toolInput = top.tool_input ?? input.tool_input ?? {};
  const cwdRaw = top.cwd ?? input.cwd ?? "";
  const projectRoot = (toolInput.projectRoot || cwdRaw || "").trim()
    ? (toolInput.projectRoot || cwdRaw).trim()
    : process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const transcriptPath = top.transcript_path ?? input.transcript_path ?? null;
  const conversationId = transcriptPath ? path.basename(transcriptPath, ".jsonl") : null;
  const isAicCompile =
    /aic_compile/i.test(toolName) ||
    (toolInput.intent != null && toolInput.projectRoot != null);
  if (!isAicCompile) {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
      },
    };
  }
  const eid =
    process.env.CURSOR_TRACE_ID && String(process.env.CURSOR_TRACE_ID).trim() !== ""
      ? "cursor-claude-code"
      : "claude-code";
  const cachedModelId = readSessionModelCache(projectRoot, conversationId, eid);
  const updatedInput = {
    ...toolInput,
    editorId: eid,
    ...(conversationId ? { conversationId } : {}),
    ...(cachedModelId ? { modelId: cachedModelId } : {}),
  };
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      updatedInput,
    },
  };
}

if (require.main === module) {
  const raw = fs.readFileSync(0, "utf8");
  const out = run(raw);
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

module.exports = { run };
