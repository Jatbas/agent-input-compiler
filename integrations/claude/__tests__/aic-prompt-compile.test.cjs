// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawnSync } = require("node:child_process");

const hooksDir = path.join(__dirname, "..", "hooks");
const hookPath = path.join(hooksDir, "aic-prompt-compile.cjs");
const { recencyFilePath, turnMarkerPath, isTurnCompiled } = require(
  path.join(__dirname, "..", "..", "shared", "compile-recency.cjs"),
);
const { isEditorRuntimeMarkerFresh } = require(
  path.join(__dirname, "..", "..", "shared", "editor-runtime-marker.cjs"),
);

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

function mockHelperCaptureIntent(captured) {
  const resolvedHelper = require.resolve("./aic-compile-helper.cjs", {
    paths: [hooksDir],
  });
  require.cache[resolvedHelper] = {
    exports: {
      callAicCompile: (intent) => {
        captured.value = intent;
        return Promise.resolve("ok");
      },
    },
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
  const stdout = await run(
    JSON.stringify({ prompt: "x", session_id: "s1", cwd: "/tmp" }),
  );
  cleanup(key);
  if (stdout !== "compiled text") {
    throw new Error(`Expected "compiled text", got ${JSON.stringify(stdout)}`);
  }
  console.log("plain_text_stdout_when_helper_returns_prompt: pass");
}

async function exit_0_silent_when_helper_returns_null() {
  const key = mockHelper(null);
  delete require.cache[require.resolve(hookPath)];
  const { run } = require(hookPath);
  const stdout = await run(JSON.stringify({ prompt: "x", cwd: "/tmp" }));
  cleanup(key);
  if (stdout !== null) {
    throw new Error(`Expected null, got ${JSON.stringify(stdout)}`);
  }
  console.log("exit_0_silent_when_helper_returns_null: pass");
}

async function dual_path_prepends_invariants_when_marker_missing() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-prompt-compile-test-"));
  try {
    const cursorRules = path.join(tmpDir, ".cursor", "rules");
    fs.mkdirSync(cursorRules, { recursive: true });
    const routerPath = path.join(cursorRules, "AIC-architect.mdc");
    fs.writeFileSync(
      routerPath,
      "## Critical reminders\n\n- **foo:** bar\n\n- **baz:** quux\n\n## Other section\n\n",
      "utf8",
    );
    const key = mockHelper("prompt part");
    delete require.cache[require.resolve(hookPath)];
    const { run } = require(hookPath);
    const stdin = JSON.stringify({
      prompt: "x",
      session_id: "other-session",
      cwd: tmpDir,
    });
    const stdout = await run(stdin);
    cleanup(key);
    if (!stdout || !stdout.includes("AIC Architectural Invariants")) {
      throw new Error(`Expected invariants header, got: ${String(stdout).slice(0, 100)}`);
    }
    if (!stdout.includes("- **foo:** bar")) {
      throw new Error(
        `Expected bullet "- **foo:** bar", got: ${String(stdout).slice(0, 200)}`,
      );
    }
    if (!stdout.includes("prompt part")) {
      throw new Error(
        `Expected "prompt part" in output, got: ${String(stdout).slice(0, 200)}`,
      );
    }
    console.log("dual_path_prepends_invariants_when_marker_missing: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function prompt_compile_no_AIC_CONVERSATION_ID_when_conversationId_null() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-prompt-compile-test-"));
  try {
    const cursorRules = path.join(tmpDir, ".cursor", "rules");
    fs.mkdirSync(cursorRules, { recursive: true });
    fs.writeFileSync(
      path.join(cursorRules, "AIC-architect.mdc"),
      "## Critical reminders\n\n- **foo:** bar\n\n",
      "utf8",
    );
    const key = mockHelper("prompt part");
    delete require.cache[require.resolve(hookPath)];
    const { run } = require(hookPath);
    const stdin = JSON.stringify({
      prompt: "x",
      cwd: tmpDir,
    });
    const stdout = await run(stdin);
    cleanup(key);
    if (stdout && stdout.includes("AIC_CONVERSATION_ID=")) {
      throw new Error(
        `Expected no AIC_CONVERSATION_ID when no transcript/direct id and no fallback candidates, got: ${String(stdout).slice(0, 300)}`,
      );
    }
    console.log("prompt_compile_no_AIC_CONVERSATION_ID_when_conversationId_null: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function prompt_compile_includes_AIC_CONVERSATION_ID_when_conversationId_truthy() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-prompt-compile-test-"));
  try {
    const cursorRules = path.join(tmpDir, ".cursor", "rules");
    fs.mkdirSync(cursorRules, { recursive: true });
    fs.writeFileSync(
      path.join(cursorRules, "AIC-architect.mdc"),
      "## Critical reminders\n\n- **foo:** bar\n\n",
      "utf8",
    );
    const key = mockHelper("prompt part");
    delete require.cache[require.resolve(hookPath)];
    const { run } = require(hookPath);
    const stdin = JSON.stringify({
      prompt: "x",
      session_id: "s1",
      transcript_path: "/home/user/.claude/conversations/conv-456.jsonl",
      cwd: tmpDir,
    });
    const stdout = await run(stdin);
    cleanup(key);
    if (!stdout || !stdout.includes("AIC_CONVERSATION_ID=conv-456")) {
      throw new Error(
        `Expected AIC_CONVERSATION_ID=conv-456 in output when conversationId set, got: ${String(stdout).slice(0, 300)}`,
      );
    }
    console.log(
      "prompt_compile_includes_AIC_CONVERSATION_ID_when_conversationId_truthy: pass",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function prompt_compile_includes_AIC_CONVERSATION_ID_from_session_fallback() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-prompt-compile-test-"));
  try {
    const cursorRules = path.join(tmpDir, ".cursor", "rules");
    fs.mkdirSync(cursorRules, { recursive: true });
    fs.writeFileSync(
      path.join(cursorRules, "AIC-architect.mdc"),
      "## Critical reminders\n\n- **foo:** bar\n\n",
      "utf8",
    );
    const key = mockHelper("prompt part");
    delete require.cache[require.resolve(hookPath)];
    const { run } = require(hookPath);
    const stdin = JSON.stringify({
      prompt: "x",
      session_id: "prompt-sess-fb",
      cwd: tmpDir,
    });
    const stdout = await run(stdin);
    cleanup(key);
    if (!stdout || !stdout.includes("AIC_CONVERSATION_ID=prompt-sess-fb")) {
      throw new Error(
        `Expected session fallback in invariants, got: ${String(stdout).slice(0, 300)}`,
      );
    }
    console.log(
      "prompt_compile_includes_AIC_CONVERSATION_ID_from_session_fallback: pass",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function intent_stripped_when_prompt_contains_ide_tags() {
  const captured = { value: null };
  const key = mockHelperCaptureIntent(captured);
  delete require.cache[require.resolve(hookPath)];
  const { run } = require(hookPath);
  const stdin = JSON.stringify({
    prompt:
      "fix bug <ide_selection>V8</ide_selection> end\n<ide_opened_file>The user opened the file /tmp/foo.md in the IDE.</ide_opened_file>",
    cwd: "/tmp",
  });
  await run(stdin);
  cleanup(key);
  const intent = captured.value;
  if (intent == null) {
    throw new Error("callAicCompile was not called with intent");
  }
  if (/<ide_[a-z_]+>/.test(intent)) {
    throw new Error(`Intent must not contain ide_* tags, got: ${JSON.stringify(intent)}`);
  }
  if (!intent.includes("fix bug")) {
    throw new Error(`Intent must include "fix bug", got: ${JSON.stringify(intent)}`);
  }
  if (!intent.includes("end")) {
    throw new Error(`Intent must include "end", got: ${JSON.stringify(intent)}`);
  }
  console.log("intent_stripped_when_prompt_contains_ide_tags: pass");
}

async function prompt_compile_uses_transcript_path_as_conversationId() {
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
      prompt: "explain the codebase",
      cwd: "/tmp",
      transcript_path: "/home/user/.claude/conversations/prompt-conv-uuid.jsonl",
    }),
  );
  cleanup(resolvedHelper);
  if (capturedConversationId !== "prompt-conv-uuid") {
    throw new Error(
      `Expected "prompt-conv-uuid", got ${JSON.stringify(capturedConversationId)}`,
    );
  }
  console.log("prompt_compile_uses_transcript_path_as_conversationId: pass");
}

async function prompt_compile_uses_conversation_id_when_transcript_path_missing() {
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
      prompt: "hello",
      cwd: "/tmp",
      conversation_id: "cursor-style-conv-id",
    }),
  );
  delete require.cache[resolvedHelper];
  if (capturedConversationId !== "cursor-style-conv-id") {
    throw new Error(
      `Expected "cursor-style-conv-id", got ${JSON.stringify(capturedConversationId)}`,
    );
  }
  console.log("prompt_compile_uses_conversation_id_when_transcript_path_missing: pass");
}

async function prompt_compile_sets_cursor_claude_editor_id_for_cursor_envelope() {
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
  delete require.cache[require.resolve(hookPath)];
  const { run } = require(hookPath);
  try {
    await run(
      JSON.stringify({
        prompt: "x",
        cwd: "/tmp",
        conversation_id: "env-conv-only",
      }),
    );
  } finally {
    if (savedTrace !== undefined) process.env.CURSOR_TRACE_ID = savedTrace;
    else delete process.env.CURSOR_TRACE_ID;
  }
  delete require.cache[resolvedHelper];
  if (capturedEditorId !== "cursor-claude-code") {
    throw new Error(
      `Expected editorId cursor-claude-code, got ${JSON.stringify(capturedEditorId)}`,
    );
  }
  console.log("prompt_compile_sets_cursor_claude_editor_id_for_cursor_envelope: pass");
}

async function prompt_compile_noop_when_cursor_version_present() {
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
  delete require.cache[require.resolve(hookPath)];
  const { run } = require(hookPath);
  const out = await run(
    JSON.stringify({
      prompt: "hello",
      cwd: "/tmp",
      cursor_version: "3",
    }),
  );
  delete require.cache[resolvedHelper];
  if (callCount !== 0) {
    throw new Error(`Expected no compile call, got ${callCount}`);
  }
  if (out !== null) {
    throw new Error(`Expected null, got ${JSON.stringify(out)}`);
  }
  console.log("prompt_compile_noop_when_cursor_version_present: pass");
}

async function writes_turn_markers_and_recency_on_success() {
  const CONV_ID = "prompt-compile-turn-marker-test-id";
  const PROJECT_ROOT = "/tmp/aic-prompt-compile-turn-test";
  // Clean state
  for (const kind of ["start", "compiled"]) {
    try {
      fs.unlinkSync(turnMarkerPath(PROJECT_ROOT, CONV_ID, kind));
    } catch {
      /* ignore */
    }
  }
  try {
    fs.unlinkSync(recencyFilePath(PROJECT_ROOT));
  } catch {
    /* ignore */
  }
  const key = mockHelper("compiled text");
  delete require.cache[require.resolve(hookPath)];
  const { run } = require(hookPath);
  await run(
    JSON.stringify({
      prompt: "fix the bug",
      cwd: PROJECT_ROOT,
      transcript_path: `/tmp/.claude/conversations/${CONV_ID}.jsonl`,
    }),
  );
  cleanup(key);
  if (!isTurnCompiled(PROJECT_ROOT, CONV_ID)) {
    throw new Error("Expected isTurnCompiled to be true after successful compile");
  }
  if (!fs.existsSync(recencyFilePath(PROJECT_ROOT))) {
    throw new Error(
      "Expected compile recency file to be written after successful compile",
    );
  }
  console.log("writes_turn_markers_and_recency_on_success: pass");
}

async function model_sourced_from_env_var_before_transcript() {
  const resolvedHelper = require.resolve("./aic-compile-helper.cjs", {
    paths: [hooksDir],
  });
  let capturedModel;
  require.cache[resolvedHelper] = {
    exports: {
      callAicCompile: (_i, _p, _c, _t, _ts, modelArg) => {
        capturedModel = modelArg;
        return Promise.resolve("ok");
      },
    },
    loaded: true,
    id: resolvedHelper,
  };
  delete require.cache[require.resolve(hookPath)];
  const { run } = require(hookPath);
  const savedModel = process.env["ANTHROPIC_MODEL"];
  process.env["ANTHROPIC_MODEL"] = "claude-opus-4-6";
  try {
    // No model in envelope, no transcript file — env var must win
    await run(JSON.stringify({ prompt: "x", cwd: "/tmp" }));
  } finally {
    if (savedModel !== undefined) process.env["ANTHROPIC_MODEL"] = savedModel;
    else delete process.env["ANTHROPIC_MODEL"];
  }
  delete require.cache[resolvedHelper];
  if (capturedModel !== "claude-opus-4-6") {
    throw new Error(
      `Expected modelArg "claude-opus-4-6" from env var, got ${JSON.stringify(capturedModel)}`,
    );
  }
  console.log("model_sourced_from_env_var_before_transcript: pass");
}

async function writes_editor_runtime_marker_on_success() {
  const CONV_ID = "prompt-compile-rt-marker-test-id";
  const PROJECT_ROOT = "/tmp/aic-prompt-compile-rt-test";
  const key = mockHelper("compiled text");
  delete require.cache[require.resolve(hookPath)];
  const { run } = require(hookPath);
  await run(
    JSON.stringify({
      prompt: "refactor auth",
      cwd: PROJECT_ROOT,
      transcript_path: `/tmp/.claude/conversations/${CONV_ID}.jsonl`,
    }),
  );
  cleanup(key);
  if (!isEditorRuntimeMarkerFresh(PROJECT_ROOT, "claude-code", CONV_ID)) {
    throw new Error(
      "Expected editor runtime marker to be fresh after successful compile",
    );
  }
  console.log("writes_editor_runtime_marker_on_success: pass");
}

async function prompt_compile_driver_exits_nonzero_when_helper_rejects() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-prompt-compile-exit-"));
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
      input: JSON.stringify({ prompt: "PIC", session_id: "s-pic-exit", cwd: "/tmp" }),
      encoding: "utf8",
    });
    strictEqual(result.status, 1);
    console.log("prompt_compile_driver_exits_nonzero_when_helper_rejects: pass");
  } finally {
    try {
      fs.unlinkSync(preloadPath);
    } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function cc_prewarm_temp_file_mode_is_owner_only_unix() {
  const CONV_ID = "prompt-compile-cc-mode-test-id";
  const PROJECT_ROOT = "/tmp/aic-prompt-compile-cc-mode-test";
  const prompt = "secret intent text";
  const prewarmPath = path.join(os.tmpdir(), `aic-prompt-cc-${CONV_ID}`);
  const key = mockHelper("compiled text");
  delete require.cache[require.resolve(hookPath)];
  const { run } = require(hookPath);
  try {
    await run(
      JSON.stringify({
        prompt,
        cwd: PROJECT_ROOT,
        transcript_path: `/tmp/.claude/conversations/${CONV_ID}.jsonl`,
      }),
    );
    if (process.platform !== "win32") {
      const st = fs.statSync(prewarmPath);
      if ((st.mode & 0o777) !== 0o600) {
        throw new Error(
          `Expected prewarm file mode 0o600, got 0o${(st.mode & 0o777).toString(8)}`,
        );
      }
    }
  } finally {
    try {
      fs.unlinkSync(prewarmPath);
    } catch {}
    cleanup(key);
  }
  console.log("cc_prewarm_temp_file_mode_is_owner_only_unix: pass");
}

(async () => {
  await plain_text_stdout_when_helper_returns_prompt();
  await exit_0_silent_when_helper_returns_null();
  await dual_path_prepends_invariants_when_marker_missing();
  await prompt_compile_no_AIC_CONVERSATION_ID_when_conversationId_null();
  await prompt_compile_includes_AIC_CONVERSATION_ID_when_conversationId_truthy();
  await prompt_compile_includes_AIC_CONVERSATION_ID_from_session_fallback();
  await intent_stripped_when_prompt_contains_ide_tags();
  await prompt_compile_uses_transcript_path_as_conversationId();
  await prompt_compile_uses_conversation_id_when_transcript_path_missing();
  await prompt_compile_sets_cursor_claude_editor_id_for_cursor_envelope();
  await prompt_compile_noop_when_cursor_version_present();
  await writes_turn_markers_and_recency_on_success();
  await writes_editor_runtime_marker_on_success();
  await cc_prewarm_temp_file_mode_is_owner_only_unix();
  await model_sourced_from_env_var_before_transcript();
  await prompt_compile_driver_exits_nonzero_when_helper_rejects();
  console.log("All tests passed.");
})();
