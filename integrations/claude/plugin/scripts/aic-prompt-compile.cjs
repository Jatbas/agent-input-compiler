// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// UserPromptSubmit hook — plain text stdout, dual-path fallback per CC §7.1, §7.2.

const fs = require("fs");
const path = require("path");

async function run(stdinStr) {
  const { callAicCompile } = require("./aic-compile-helper.cjs");
  let parsed;
  try {
    parsed = JSON.parse(stdinStr);
  } catch {
    parsed = {};
  }
  // Claude Code sends fields at top level; legacy spec nested under `input`
  const top = parsed || {};
  const input = top.input || {};
  const rawIntent =
    top.prompt != null
      ? String(top.prompt)
      : input.prompt != null
        ? String(input.prompt)
        : "";
  const intent = rawIntent.replace(/<ide_selection>[\s\S]*?<\/ide_selection>/gi, "");
  const sessionId =
    top.session_id != null
      ? top.session_id
      : input.session_id != null
        ? input.session_id
        : null;
  const cwdRaw = top.cwd || input.cwd || "";
  const projectRoot =
    cwdRaw && cwdRaw.trim()
      ? cwdRaw.trim()
      : process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const transcriptPath = parsed.transcript_path ?? parsed.input?.transcript_path ?? null;
  const conversationId = transcriptPath ? path.basename(transcriptPath, ".jsonl") : null;

  const INJECTED_MARKER = path.join(projectRoot, ".aic", ".session-context-injected");
  const markerContent = fs.existsSync(INJECTED_MARKER)
    ? fs.readFileSync(INJECTED_MARKER, "utf8").trim()
    : "";
  const alreadyInjected =
    fs.existsSync(INJECTED_MARKER) && sessionId != null && markerContent === sessionId;

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

  const promptContext = await callAicCompile(intent, projectRoot, conversationId, 30000);
  if (promptContext == null) return null;

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
