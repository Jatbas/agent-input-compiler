// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const hookPath = path.join(__dirname, "..", "hooks", "AIC-before-submit-prewarm.cjs");
const repoRoot = path.resolve(__dirname, "..", "..", "..");

function prewarm_unix_mode_is_0o600() {
  if (process.platform === "win32") {
    console.log("prewarm_unix_mode_is_0o600: skip (win32)");
    return;
  }
  const generationId = `test-prewarm-mode-${process.pid}-${Date.now()}`;
  const promptPath = path.join(os.tmpdir(), `aic-prompt-${generationId}`);
  const stdinJson = JSON.stringify({
    cursor_version: "1",
    conversation_id: "conv-prewarm-mode",
    generation_id: generationId,
    prompt: "non-empty prompt body",
  });
  try {
    const r = spawnSync(process.execPath, [hookPath], {
      input: stdinJson,
      encoding: "utf8",
      env: { ...process.env, CURSOR_PROJECT_DIR: repoRoot },
    });
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout.trim());
    assert.deepStrictEqual(out, { continue: true });
    const st = fs.statSync(promptPath);
    assert.strictEqual(
      st.mode & 0o777,
      0o600,
      `expected mode 0o600, got ${(st.mode & 0o777).toString(8)}`,
    );
    console.log("prewarm_unix_mode_is_0o600: pass");
  } finally {
    if (fs.existsSync(promptPath)) {
      fs.unlinkSync(promptPath);
    }
  }
}

function prewarm_skips_file_when_prompt_empty() {
  const generationId = `test-prewarm-empty-${process.pid}-${Date.now()}`;
  const promptPath = path.join(os.tmpdir(), `aic-prompt-${generationId}`);
  const stdinJson = JSON.stringify({
    cursor_version: "1",
    conversation_id: "conv-prewarm-empty",
    generation_id: generationId,
    prompt: "   \t\n  ",
  });
  const r = spawnSync(process.execPath, [hookPath], {
    input: stdinJson,
    encoding: "utf8",
    env: { ...process.env, CURSOR_PROJECT_DIR: repoRoot },
  });
  assert.strictEqual(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout.trim());
  assert.deepStrictEqual(out, { continue: true });
  assert.strictEqual(fs.existsSync(promptPath), false);
  console.log("prewarm_skips_file_when_prompt_empty: pass");
}

prewarm_unix_mode_is_0o600();
prewarm_skips_file_when_prompt_empty();
console.log("All AIC-before-submit-prewarm tests passed.");
