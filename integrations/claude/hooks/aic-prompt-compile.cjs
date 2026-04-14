// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// UserPromptSubmit hook — plain text stdout, dual-path fallback per CC §7.1, §7.2.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { isSessionAlreadyInjected } = require("../../shared/session-markers.cjs");
const { resolveProjectRoot } = require("../../shared/resolve-project-root.cjs");
const {
  isCursorNativeHookPayload,
} = require("../../cursor/is-cursor-native-hook-payload.cjs");
const {
  conversationIdFromTranscriptPath,
  explicitEditorIdFromClaudeHookEnvelope,
  resolveConversationIdFallback,
} = require("../../shared/conversation-id.cjs");
const {
  readModelFromTranscript,
} = require("../../shared/read-model-from-transcript.cjs");
const { writeCompileRecency } = require("../../shared/compile-recency.cjs");

async function run(stdinStr) {
  const { callAicCompile } = require("./aic-compile-helper.cjs");
  let parsed;
  try {
    parsed = JSON.parse(stdinStr);
  } catch {
    parsed = {};
  }
  const isCursorNative = isCursorNativeHookPayload(parsed);
  if (isCursorNative) return null;
  // Claude Code sends fields at top level; legacy spec nested under `input`
  const top = parsed || {};
  const input = top.input || {};
  const rawIntent =
    top.prompt != null
      ? String(top.prompt)
      : input.prompt != null
        ? String(input.prompt)
        : "";
  // strip all ide_* context tags injected by Claude Code (ide_selection, ide_opened_file, etc.)
  const intent = rawIntent.replace(/<ide_[a-z_]+>[\s\S]*?<\/ide_[a-z_]+>/gi, "").trim();
  const sessionId =
    top.session_id != null
      ? top.session_id
      : input.session_id != null
        ? input.session_id
        : null;
  const projectRoot = resolveProjectRoot(parsed);
  const conversationId =
    conversationIdFromTranscriptPath(parsed) ?? resolveConversationIdFallback(parsed);
  if (conversationId != null && String(conversationId).trim() !== "") {
    try {
      const ccId = String(conversationId).trim();
      fs.writeFileSync(
        path.join(os.tmpdir(), `aic-prompt-cc-${ccId}`),
        intent.slice(0, 10000),
        "utf8",
      );
    } catch {
      /* non-fatal */
    }
  }
  const rawModel =
    top.model != null ? top.model : input.model != null ? input.model : null;
  // Claude Code hook envelope omits model; fall back to transcript tail-read (available from turn 2+).
  const transcriptPath = parsed.transcript_path ?? parsed.input?.transcript_path ?? null;
  const effectiveRawModel = rawModel ?? readModelFromTranscript(transcriptPath);
  const modelArg =
    typeof effectiveRawModel === "string" &&
    effectiveRawModel.trim().length >= 1 &&
    effectiveRawModel.trim().length <= 256 &&
    /^[\x20-\x7E]+$/.test(effectiveRawModel.trim())
      ? effectiveRawModel.trim()
      : undefined;

  const alreadyInjected = isSessionAlreadyInjected(projectRoot, sessionId);

  let invariantsBlock = "";
  if (!alreadyInjected) {
    const routerPath = path.join(projectRoot, ".cursor", "rules", "AIC-architect.mdc");
    if (fs.existsSync(routerPath)) {
      const content = fs.readFileSync(routerPath, "utf8");
      const start = content.indexOf("## Critical reminders");
      if (start !== -1) {
        const nextSection = content.indexOf("\n## ", start + 1);
        const section =
          nextSection === -1 ? content.slice(start) : content.slice(start, nextSection);
        const bulletLines = section
          .split("\n")
          .filter((line) => line.trimStart().startsWith("- **"));
        const header =
          "AIC Architectural Invariants (auto-injected):" +
          (conversationId ? "\nAIC_CONVERSATION_ID=" + conversationId : "");
        invariantsBlock = bulletLines.length
          ? header + "\n\n" + bulletLines.join("\n")
          : "";
      }
    }
  }

  const editorId = explicitEditorIdFromClaudeHookEnvelope(parsed);
  const promptContext = await callAicCompile(
    intent,
    projectRoot,
    conversationId,
    30000,
    "prompt_submit",
    modelArg,
    editorId,
  );
  if (promptContext == null) return null;
  writeCompileRecency(projectRoot);

  if (invariantsBlock.length > 0) {
    return invariantsBlock + "\n\n" + promptContext;
  }
  return promptContext;
}

if (require.main === module) {
  const raw = fs.readFileSync(0, "utf8");
  const debugLog = path.join(require("os").tmpdir(), "aic-hook-debug.log");
  fs.appendFileSync(
    debugLog,
    `[${new Date().toISOString()}] stdin: ${raw.slice(0, 500)}\n`,
  );
  run(raw)
    .then((out) => {
      fs.appendFileSync(
        debugLog,
        `[${new Date().toISOString()}] output: ${out != null ? out.slice(0, 200) : "null"}\n`,
      );
      if (out != null) process.stdout.write(out);
      process.exit(0);
    })
    .catch((err) => {
      fs.appendFileSync(debugLog, `[${new Date().toISOString()}] error: ${err}\n`);
      process.exit(0);
    });
}

module.exports = { run };
