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
  delete require.cache[path.join(hooksDir, "aic-session-start.cjs")];
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
      conversation_id: "conv-uuid-123",
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

(async () => {
  await output_format_hookSpecificOutput_when_helper_returns_text();
  await session_start_passes_conversationId_when_in_input();
  await session_start_passes_null_when_no_conversation_id();
  await marker_file_written_with_session_id();
  await exit_0_silent_when_helper_returns_null();
  await aic_dir_created_with_0700();
  console.log("All tests passed.");
})();
