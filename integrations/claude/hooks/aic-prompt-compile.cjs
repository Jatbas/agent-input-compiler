// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// UserPromptSubmit hook — plain text stdout, dual-path fallback per CC §7.1, §7.2.

const fs = require("fs");
const path = require("path");

function run(stdinStr) {
  const { callAicCompile } = require("./aic-compile-helper.cjs");
  let parsed;
  try {
    parsed = JSON.parse(stdinStr);
  } catch {
    parsed = {};
  }
  const input = (parsed && parsed.input) || {};
  const intent = input.prompt != null ? String(input.prompt) : "";
  const sessionId = input.session_id != null ? input.session_id : null;
  const projectRoot =
    input.cwd && input.cwd.trim()
      ? input.cwd.trim()
      : process.env.CLAUDE_PROJECT_DIR || process.cwd();

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
          (sessionId ? "\nAIC_CONVERSATION_ID=" + sessionId : "");
        invariantsBlock = bulletLines.length
          ? header + "\n\n" + bulletLines.join("\n")
          : "";
      }
    }
  }

  const promptContext = callAicCompile(intent, projectRoot, sessionId, 30000);
  if (promptContext == null) return null;

  if (invariantsBlock.length > 0) {
    return invariantsBlock + "\n\n" + promptContext;
  }
  return promptContext;
}

if (require.main === module) {
  const raw = fs.readFileSync(0, "utf8");
  const out = run(raw);
  if (out != null) process.stdout.write(out);
  process.exit(0);
}

module.exports = { run };
