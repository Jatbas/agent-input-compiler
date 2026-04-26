// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawnSync } = require("node:child_process");

const hooksDir = path.join(__dirname, "..", "hooks");
const hookPath = path.join(hooksDir, "aic-pre-compact.cjs");
const { recencyFilePath } = require(
  path.join(__dirname, "..", "..", "shared", "compile-recency.cjs"),
);
const TEST_ROOT = "/tmp/aic-test-precompact-project";

function mockHelper(returnValue) {
  const resolvedHelper = require.resolve("./aic-compile-helper.cjs", {
    paths: [hooksDir],
  });
  require.cache[resolvedHelper] = {
    exports: { callAicCompile: () => Promise.resolve(returnValue) },
    loaded: true,
    id: resolvedHelper,
  };
  return resolvedHelper;
}

function cleanup(resolvedHelper) {
  delete require.cache[resolvedHelper];
  delete require.cache[require.resolve(hookPath)];
}

async function plain_text_stdout_when_helper_returns_prompt() {
  const key = mockHelper("compiled text");
  delete require.cache[require.resolve(hookPath)];
  const { run } = require(hookPath);
  const result = await run(JSON.stringify({ session_id: "s1", cwd: "/tmp" }));
  cleanup(key);
  if (result !== "compiled text") {
    throw new Error(`Expected "compiled text", got ${JSON.stringify(result)}`);
  }
  console.log("plain_text_stdout_when_helper_returns_prompt: pass");
}

async function exit_0_silent_when_helper_returns_null() {
  const key = mockHelper(null);
  delete require.cache[require.resolve(hookPath)];
  const { run } = require(hookPath);
  const result = await run(JSON.stringify({ session_id: "s1", cwd: "/tmp" }));
  cleanup(key);
  if (result !== null) {
    throw new Error(`Expected null, got ${JSON.stringify(result)}`);
  }
  console.log("exit_0_silent_when_helper_returns_null: pass");
}

async function pre_compact_uses_transcript_path_not_session_id() {
  const resolvedHelper = require.resolve("./aic-compile-helper.cjs", {
    paths: [hooksDir],
  });
  let capturedConversationId;
  require.cache[resolvedHelper] = {
    exports: {
      callAicCompile: (_intent, _root, conversationId) => {
        capturedConversationId = conversationId;
        return Promise.resolve("compiled text");
      },
    },
    loaded: true,
    id: resolvedHelper,
  };
  delete require.cache[require.resolve(hookPath)];
  const { run } = require(hookPath);
  await run(
    JSON.stringify({
      session_id: "wrong-session-id",
      cwd: "/tmp",
      transcript_path: "/home/user/.claude/conversations/conv-uuid-correct.jsonl",
    }),
  );
  cleanup(resolvedHelper);
  if (capturedConversationId !== "conv-uuid-correct") {
    throw new Error(
      `Expected "conv-uuid-correct", got ${JSON.stringify(capturedConversationId)}`,
    );
  }
  console.log("pre_compact_uses_transcript_path_not_session_id: pass");
}

async function pre_compact_passes_session_id_when_transcript_missing() {
  const resolvedHelper = require.resolve("./aic-compile-helper.cjs", {
    paths: [hooksDir],
  });
  let capturedConversationId;
  require.cache[resolvedHelper] = {
    exports: {
      callAicCompile: (_intent, _root, conversationId) => {
        capturedConversationId = conversationId;
        return Promise.resolve("compiled text");
      },
    },
    loaded: true,
    id: resolvedHelper,
  };
  delete require.cache[require.resolve(hookPath)];
  const { run } = require(hookPath);
  await run(
    JSON.stringify({
      session_id: "precompact-sess-fb",
      cwd: "/tmp",
    }),
  );
  cleanup(resolvedHelper);
  if (capturedConversationId !== "precompact-sess-fb") {
    throw new Error(
      `Expected session fallback id, got ${JSON.stringify(capturedConversationId)}`,
    );
  }
  console.log("pre_compact_passes_session_id_when_transcript_missing: pass");
}

async function writes_compile_recency_on_success() {
  const recencyPath = recencyFilePath(TEST_ROOT);
  try {
    fs.unlinkSync(recencyPath);
  } catch {
    /* ignore */
  }
  const key = mockHelper("compiled text");
  delete require.cache[require.resolve(hookPath)];
  const { run } = require(hookPath);
  await run(JSON.stringify({ session_id: "s1", cwd: TEST_ROOT }));
  cleanup(key);
  if (!fs.existsSync(recencyPath)) {
    throw new Error(
      "Expected compile recency file to be written after successful compile",
    );
  }
  console.log("writes_compile_recency_on_success: pass");
}

async function does_not_write_compile_recency_when_helper_returns_null() {
  const recencyPath = recencyFilePath(TEST_ROOT);
  try {
    fs.unlinkSync(recencyPath);
  } catch {
    /* ignore */
  }
  const key = mockHelper(null);
  delete require.cache[require.resolve(hookPath)];
  const { run } = require(hookPath);
  await run(JSON.stringify({ session_id: "s1", cwd: TEST_ROOT }));
  cleanup(key);
  if (fs.existsSync(recencyPath)) {
    throw new Error("Expected no compile recency file when helper returns null");
  }
  console.log("does_not_write_compile_recency_when_helper_returns_null: pass");
}

async function pre_compact_driver_exits_nonzero_when_helper_rejects() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-pre-compact-exit-"));
  const preloadPath = path.join(tmpDir, "preload-force-helper-reject.cjs");
  const strictEqual = require("assert").strictEqual;
  try {
    fs.writeFileSync(
      preloadPath,
      [
        "'use strict';",
        "const abs = process.env.AIC_HELPER_ABS;",
        "delete require.cache[abs];",
        'require.cache[abs] = { exports: { callAicCompile: () => Promise.reject(new Error("forced")) }, loaded: true, id: abs };',
        "",
      ].join("\n"),
    );
    const helperAbs = require.resolve("./aic-compile-helper.cjs", { paths: [hooksDir] });
    const result = spawnSync(process.execPath, ["-r", preloadPath, hookPath], {
      env: { ...process.env, AIC_HELPER_ABS: helperAbs },
      input: JSON.stringify({ session_id: "s-pre-exit", cwd: "/tmp" }),
      encoding: "utf8",
    });
    strictEqual(result.status, 1);
    console.log("pre_compact_driver_exits_nonzero_when_helper_rejects: pass");
  } finally {
    try {
      fs.unlinkSync(preloadPath);
    } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

(async () => {
  await plain_text_stdout_when_helper_returns_prompt();
  await exit_0_silent_when_helper_returns_null();
  await pre_compact_uses_transcript_path_not_session_id();
  await pre_compact_passes_session_id_when_transcript_missing();
  await writes_compile_recency_on_success();
  await does_not_write_compile_recency_when_helper_returns_null();
  await pre_compact_driver_exits_nonzero_when_helper_rejects();
  console.log("All tests passed.");
})();
