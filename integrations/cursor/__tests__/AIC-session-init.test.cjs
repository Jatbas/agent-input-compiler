// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { execFileSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const installScript = path.join(repoRoot, "integrations", "cursor", "install.cjs");

function runInstaller(cwd) {
  execFileSync("node", [installScript], { cwd, encoding: "utf8" });
}

function writeMinimalArchitectRules(rulesDir) {
  fs.mkdirSync(rulesDir, { recursive: true });
  const body = `---
globs:
---
## Critical reminders

- **Test bullet one**
`;
  fs.writeFileSync(path.join(rulesDir, "AIC-architect.mdc"), body, "utf8");
}

function session_init_prefers_conversation_id_over_session_fallback() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-sess-init-"));
  try {
    runInstaller(tmp);
    writeMinimalArchitectRules(path.join(tmp, ".cursor", "rules"));
    const hookPath = path.join(tmp, ".cursor", "hooks", "AIC-session-init.cjs");
    const stdin = JSON.stringify({
      cursor_version: "1",
      conversation_id: "direct-conv-1",
      session_id: "sess-ignored",
    });
    const r = spawnSync("node", [hookPath], {
      input: stdin,
      encoding: "utf8",
      env: { ...process.env, CURSOR_PROJECT_DIR: tmp },
    });
    if (r.status !== 0) {
      throw new Error(`hook exit ${r.status} stderr ${r.stderr}`);
    }
    const out = JSON.parse(r.stdout.trim());
    if (!out.additional_context.includes("AIC_CONVERSATION_ID=direct-conv-1")) {
      throw new Error(
        `Expected direct conversation id in output, got ${String(out.additional_context).slice(0, 200)}`,
      );
    }
    console.log("session_init_prefers_conversation_id_over_session_fallback: pass");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function session_init_includes_session_id_fallback_line() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-sess-init-"));
  try {
    runInstaller(tmp);
    writeMinimalArchitectRules(path.join(tmp, ".cursor", "rules"));
    const hookPath = path.join(tmp, ".cursor", "hooks", "AIC-session-init.cjs");
    const stdin = JSON.stringify({
      cursor_version: "1",
      session_id: "sess-fallback-line",
    });
    const r = spawnSync("node", [hookPath], {
      input: stdin,
      encoding: "utf8",
      env: { ...process.env, CURSOR_PROJECT_DIR: tmp },
    });
    if (r.status !== 0) {
      throw new Error(`hook exit ${r.status} stderr ${r.stderr}`);
    }
    const out = JSON.parse(r.stdout.trim());
    if (!out.additional_context.includes("AIC_CONVERSATION_ID=sess-fallback-line")) {
      throw new Error(
        `Expected fallback session id in output, got ${String(out.additional_context).slice(0, 200)}`,
      );
    }
    console.log("session_init_includes_session_id_fallback_line: pass");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function session_init_omits_conversation_line_when_fallback_invalid() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-sess-init-"));
  try {
    runInstaller(tmp);
    writeMinimalArchitectRules(path.join(tmp, ".cursor", "rules"));
    const hookPath = path.join(tmp, ".cursor", "hooks", "AIC-session-init.cjs");
    const stdin = JSON.stringify({
      cursor_version: "1",
      session_id: "bad\nid",
    });
    const r = spawnSync("node", [hookPath], {
      input: stdin,
      encoding: "utf8",
      env: { ...process.env, CURSOR_PROJECT_DIR: tmp },
    });
    if (r.status !== 0) {
      throw new Error(`hook exit ${r.status} stderr ${r.stderr}`);
    }
    const out = JSON.parse(r.stdout.trim());
    if (out.additional_context.includes("AIC_CONVERSATION_ID=")) {
      throw new Error(
        "Expected no AIC_CONVERSATION_ID line when fallback fails sanitization",
      );
    }
    console.log("session_init_omits_conversation_line_when_fallback_invalid: pass");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

session_init_prefers_conversation_id_over_session_fallback();
session_init_includes_session_id_fallback_line();
session_init_omits_conversation_line_when_fallback_invalid();
console.log("All AIC-session-init tests passed.");
