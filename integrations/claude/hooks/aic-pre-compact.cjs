// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// PreCompact hook — plain text stdout per CC §6.1, §7.7; no marker file.

const fs = require("fs");
const { callAicCompile } = require("./aic-compile-helper.cjs");

async function run(stdinStr) {
  let parsed;
  try {
    parsed = JSON.parse(stdinStr);
  } catch {
    parsed = {};
  }
  const sessionId =
    parsed.session_id != null ? parsed.session_id : (parsed.input?.session_id ?? null);
  const cwdRaw = parsed.cwd ?? parsed.input?.cwd ?? "";
  const projectRoot = cwdRaw.trim()
    ? cwdRaw.trim()
    : process.env.CLAUDE_PROJECT_DIR || process.cwd();

  const text = await callAicCompile(
    "understand project structure, architecture, and recent changes",
    projectRoot,
    sessionId,
    30000,
  );
  return text;
}

if (require.main === module) {
  const raw = fs.readFileSync(0, "utf8");
  run(raw)
    .then((out) => {
      if (out != null) process.stdout.write(out);
      process.exit(0);
    })
    .catch(() => process.exit(0));
}

module.exports = { run };
