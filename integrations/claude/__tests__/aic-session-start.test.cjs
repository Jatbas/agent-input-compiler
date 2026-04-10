// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("path");
const fs = require("fs");
const os = require("os");

const hooksDir = path.join(__dirname, "..", "hooks");
const hookPath = path.join(hooksDir, "aic-session-start.cjs");

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
  delete require.cache[hookPath];
}

async function output_format_hookSpecificOutput_when_helper_returns_text() {
  const key = mockHelper("compiled text");
  delete require.cache[hookPath];
  const { run } = require(hookPath);
  const result = await run(JSON.stringify({ session_id: "s1", cwd: "/tmp" }));
  cleanup(key);
  if (!result || result.hookSpecificOutput?.hookEventName !== "SessionStart") {
    throw new Error(
      `Expected hookEventName "SessionStart", got ${JSON.stringify(result)}`,
    );
  }
  if (result.hookSpecificOutput?.additionalContext !== "compiled text") {
    throw new Error(
      `Expected additionalContext "compiled text", got ${JSON.stringify(result.hookSpecificOutput?.additionalContext)}`,
    );
  }
  console.log("output_format_hookSpecificOutput_when_helper_returns_text: pass");
}

async function session_start_passes_conversationId_when_in_input() {
  const captured = { thirdArg: null };
  const resolvedHelper = require.resolve("./aic-compile-helper.cjs", {
    paths: [hooksDir],
  });
  require.cache[resolvedHelper] = {
    exports: {
      callAicCompile: (_intent, _root, conversationId) => {
        captured.thirdArg = conversationId;
        return Promise.resolve("ok");
      },
    },
    loaded: true,
    id: resolvedHelper,
  };
  delete require.cache[hookPath];
  const { run } = require(hookPath);
  await run(
    JSON.stringify({
      session_id: "s1",
      transcript_path: "/home/user/.claude/conversations/conv-uuid-123.jsonl",
      cwd: "/tmp",
    }),
  );
  cleanup(resolvedHelper);
  if (captured.thirdArg !== "conv-uuid-123") {
    throw new Error(
      `Expected third arg "conv-uuid-123", got ${JSON.stringify(captured.thirdArg)}`,
    );
  }
  console.log("session_start_passes_conversationId_when_in_input: pass");
}

async function session_start_passes_null_when_no_conversation_id() {
  const captured = { thirdArg: undefined };
  const resolvedHelper = require.resolve("./aic-compile-helper.cjs", {
    paths: [hooksDir],
  });
  require.cache[resolvedHelper] = {
    exports: {
      callAicCompile: (_intent, _root, conversationId) => {
        captured.thirdArg = conversationId;
        return Promise.resolve("ok");
      },
    },
    loaded: true,
    id: resolvedHelper,
  };
  delete require.cache[hookPath];
  const { run } = require(hookPath);
  await run(JSON.stringify({ session_id: "s1", cwd: "/tmp" }));
  cleanup(resolvedHelper);
  if (captured.thirdArg !== null) {
    throw new Error(`Expected third arg null, got ${JSON.stringify(captured.thirdArg)}`);
  }
  console.log("session_start_passes_null_when_no_conversation_id: pass");
}

async function lock_prevents_concurrent_session_start() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-session-start-test-"));
  try {
    let callCount = 0;
    const resolvedHelper = require.resolve("./aic-compile-helper.cjs", {
      paths: [hooksDir],
    });
    require.cache[resolvedHelper] = {
      exports: {
        callAicCompile: () => {
          callCount++;
          return new Promise((resolve) => setTimeout(() => resolve("compiled"), 100));
        },
      },
      loaded: true,
      id: resolvedHelper,
    };
    delete require.cache[hookPath];
    const { run } = require(hookPath);
    const input = JSON.stringify({ session_id: "s1", cwd: tmpDir });
    const results = await Promise.all([run(input), run(input), run(input)]);
    cleanup(resolvedHelper);
    const nonNullCount = results.filter((r) => r !== null).length;
    if (callCount !== 1) {
      throw new Error(`Expected callAicCompile called 1 time, got ${callCount}`);
    }
    if (nonNullCount !== 1) {
      throw new Error(`Expected 1 non-null result, got ${nonNullCount}`);
    }
    console.log("lock_prevents_concurrent_session_start: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function lock_cleaned_up_after_success() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-session-start-test-"));
  try {
    const key = mockHelper("compiled");
    delete require.cache[hookPath];
    const { run } = require(hookPath);
    await run(JSON.stringify({ session_id: "s1", cwd: tmpDir }));
    cleanup(key);
    const lockPath = path.join(tmpDir, ".aic", ".session-start-lock");
    if (fs.existsSync(lockPath)) {
      throw new Error("Lock file should be deleted after successful run");
    }
    console.log("lock_cleaned_up_after_success: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function stale_lock_returns_null_when_marker_has_content() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-session-start-test-"));
  try {
    const aicDir = path.join(tmpDir, ".aic");
    fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      path.join(aicDir, ".session-context-injected"),
      "prior-session",
      "utf8",
    );
    fs.writeFileSync(path.join(aicDir, ".session-start-lock"), "", "utf8");
    const key = mockHelper("should not be called");
    delete require.cache[hookPath];
    const { run } = require(hookPath);
    const result = await run(JSON.stringify({ session_id: "s1", cwd: tmpDir }));
    cleanup(key);
    if (result !== null) {
      throw new Error(
        `Expected null (stale lock detected), got ${JSON.stringify(result)}`,
      );
    }
    console.log("stale_lock_returns_null_when_marker_has_content: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function marker_file_written_with_session_id() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-session-start-test-"));
  try {
    const key = mockHelper("x");
    delete require.cache[hookPath];
    const { run } = require(hookPath);
    await run(JSON.stringify({ session_id: "sid-123", cwd: tmpDir }));
    cleanup(key);
    const markerPath = path.join(tmpDir, ".aic", ".session-context-injected");
    if (!fs.existsSync(markerPath)) {
      throw new Error(`Expected marker at ${markerPath}`);
    }
    const content = fs.readFileSync(markerPath, "utf8").trim();
    if (content !== "sid-123") {
      throw new Error(
        `Expected marker content "sid-123", got ${JSON.stringify(content)}`,
      );
    }
    console.log("marker_file_written_with_session_id: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function exit_0_silent_when_helper_returns_null() {
  const key = mockHelper(null);
  delete require.cache[hookPath];
  const { run } = require(hookPath);
  const result = await run(JSON.stringify({ session_id: "s1", cwd: "/tmp" }));
  cleanup(key);
  if (result !== null) {
    throw new Error(`Expected null, got ${JSON.stringify(result)}`);
  }
  console.log("exit_0_silent_when_helper_returns_null: pass");
}

async function aic_dir_created_with_0700() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-session-start-test-"));
  try {
    const key = mockHelper("x");
    delete require.cache[hookPath];
    const { run } = require(hookPath);
    await run(JSON.stringify({ cwd: tmpDir }));
    cleanup(key);
    const aicDir = path.join(tmpDir, ".aic");
    if (!fs.existsSync(aicDir)) {
      throw new Error(`Expected .aic directory at ${aicDir}`);
    }
    if (process.platform !== "win32") {
      const mode = fs.statSync(aicDir).mode & 0o777;
      if (mode !== 0o700) {
        throw new Error(`Expected .aic mode 0700, got 0o${mode.toString(8)}`);
      }
    }
    console.log("aic_dir_created_with_0700: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function session_start_uses_conversation_id_when_transcript_path_missing() {
  const captured = { thirdArg: null };
  const resolvedHelper = require.resolve("./aic-compile-helper.cjs", {
    paths: [hooksDir],
  });
  require.cache[resolvedHelper] = {
    exports: {
      callAicCompile: (_intent, _root, conversationId) => {
        captured.thirdArg = conversationId;
        return Promise.resolve("ok");
      },
    },
    loaded: true,
    id: resolvedHelper,
  };
  delete require.cache[hookPath];
  const { run } = require(hookPath);
  await run(
    JSON.stringify({
      session_id: "s1",
      cwd: "/tmp",
      conversation_id: "direct-conv-for-session",
    }),
  );
  cleanup(resolvedHelper);
  if (captured.thirdArg !== "direct-conv-for-session") {
    throw new Error(
      `Expected third arg "direct-conv-for-session", got ${JSON.stringify(captured.thirdArg)}`,
    );
  }
  console.log("session_start_uses_conversation_id_when_transcript_path_missing: pass");
}

async function session_start_sets_cursor_claude_editor_id_for_cursor_envelope() {
  const resolvedHelper = require.resolve("./aic-compile-helper.cjs", {
    paths: [hooksDir],
  });
  let capturedEditorId;
  const savedTrace = process.env.CURSOR_TRACE_ID;
  delete process.env.CURSOR_TRACE_ID;
  require.cache[resolvedHelper] = {
    exports: {
      callAicCompile: (_i, _p, _c, _t, _ts, _m, editorId) => {
        capturedEditorId = editorId;
        return Promise.resolve("ok");
      },
    },
    loaded: true,
    id: resolvedHelper,
  };
  delete require.cache[hookPath];
  const { run } = require(hookPath);
  try {
    await run(
      JSON.stringify({
        session_id: "s1",
        cwd: "/tmp",
        conversation_id: "only-conv",
      }),
    );
  } finally {
    if (savedTrace !== undefined) process.env.CURSOR_TRACE_ID = savedTrace;
    else delete process.env.CURSOR_TRACE_ID;
  }
  cleanup(resolvedHelper);
  if (capturedEditorId !== "cursor-claude-code") {
    throw new Error(
      `Expected editorId cursor-claude-code, got ${JSON.stringify(capturedEditorId)}`,
    );
  }
  console.log("session_start_sets_cursor_claude_editor_id_for_cursor_envelope: pass");
}

async function session_start_noop_when_cursor_version_present() {
  let callCount = 0;
  const resolvedHelper = require.resolve("./aic-compile-helper.cjs", {
    paths: [hooksDir],
  });
  require.cache[resolvedHelper] = {
    exports: {
      callAicCompile: () => {
        callCount += 1;
        return Promise.resolve("x");
      },
    },
    loaded: true,
    id: resolvedHelper,
  };
  delete require.cache[hookPath];
  const { run } = require(hookPath);
  const result = await run(
    JSON.stringify({ session_id: "s1", cwd: "/tmp", cursor_version: "3" }),
  );
  cleanup(resolvedHelper);
  if (callCount !== 0) {
    throw new Error(`Expected no compile call, got ${callCount}`);
  }
  if (result !== null) {
    throw new Error(`Expected null, got ${JSON.stringify(result)}`);
  }
  console.log("session_start_noop_when_cursor_version_present: pass");
}

(async () => {
  await output_format_hookSpecificOutput_when_helper_returns_text();
  await session_start_passes_conversationId_when_in_input();
  await session_start_passes_null_when_no_conversation_id();
  await lock_prevents_concurrent_session_start();
  await lock_cleaned_up_after_success();
  await stale_lock_returns_null_when_marker_has_content();
  await marker_file_written_with_session_id();
  await exit_0_silent_when_helper_returns_null();
  await aic_dir_created_with_0700();
  await session_start_uses_conversation_id_when_transcript_path_missing();
  await session_start_sets_cursor_claude_editor_id_for_cursor_envelope();
  await session_start_noop_when_cursor_version_present();
  console.log("All tests passed.");
})();
