// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("fs");
const path = require("path");
const os = require("os");

const { run } = require(path.join(__dirname, "..", "hooks", "aic-session-end.cjs"));
const { run: runPlugin } = require(
  path.join(__dirname, "..", "plugin", "scripts", "aic-session-end.cjs"),
);
const { getTempPath } = require("../../shared/edited-files-cache.cjs");

function marker_and_temp_deleted_after_run() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-session-end-test-"));
  const aicDir = path.join(tmpDir, ".aic");
  const markerPath = path.join(aicDir, ".session-context-injected");
  fs.mkdirSync(aicDir, { recursive: true });
  fs.writeFileSync(markerPath, "sid-del", "utf8");
  const tempPath = getTempPath("claude_code", "sid-del");
  fs.writeFileSync(tempPath, "[]", "utf8");
  run(JSON.stringify({ session_id: "sid-del", reason: "test", cwd: tmpDir }));
  if (fs.existsSync(markerPath)) {
    throw new Error("Expected marker file deleted");
  }
  if (fs.existsSync(tempPath)) {
    throw new Error("Expected temp file deleted");
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log("marker_and_temp_deleted_after_run: pass");
}

function prompt_log_jsonl_appended() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-session-end-test-"));
  run(JSON.stringify({ session_id: "s1", reason: "end", cwd: tmpDir }));
  const logPath = path.join(tmpDir, ".aic", "prompt-log.jsonl");
  if (!fs.existsSync(logPath)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error("Expected prompt-log.jsonl to exist");
  }
  const content = fs.readFileSync(logPath, "utf8");
  const lines = content.trim().split("\n");
  const last = lines[lines.length - 1];
  const obj = JSON.parse(last);
  if (
    obj.conversationId !== "s1" ||
    obj.reason !== "end" ||
    typeof obj.timestamp !== "string"
  ) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error(
      `Expected { conversationId: 's1', reason: 'end', timestamp }, got ${last}`,
    );
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log("prompt_log_jsonl_appended: pass");
}

function exit_0_always() {
  run("{}");
  run("not json");
  console.log("exit_0_always: pass");
}

function plugin_session_end_removes_session_start_lock() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-session-end-test-"));
  const aicDir = path.join(tmpDir, ".aic");
  const lockPath = path.join(aicDir, ".session-start-lock");
  fs.mkdirSync(aicDir, { recursive: true });
  fs.writeFileSync(lockPath, "", "utf8");
  runPlugin(JSON.stringify({ session_id: "s1", reason: "test", cwd: tmpDir }));
  if (fs.existsSync(lockPath)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error("Expected .session-start-lock to be removed by plugin session-end");
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log("plugin_session_end_removes_session_start_lock: pass");
}

marker_and_temp_deleted_after_run();
plugin_session_end_removes_session_start_lock();
prompt_log_jsonl_appended();
exit_0_always();
console.log("All tests passed.");
