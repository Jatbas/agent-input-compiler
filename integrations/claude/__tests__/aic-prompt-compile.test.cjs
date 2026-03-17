// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("path");
const fs = require("fs");
const os = require("os");

const hooksDir = path.join(__dirname, "..", "hooks");
const hookPath = path.join(hooksDir, "aic-prompt-compile.cjs");

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
      session_id: "other-session",
      cwd: tmpDir,
    });
    const stdout = await run(stdin);
    cleanup(key);
    if (stdout && stdout.includes("AIC_CONVERSATION_ID=")) {
      throw new Error(
        `Expected no AIC_CONVERSATION_ID in invariants when conversationId null, got: ${String(stdout).slice(0, 300)}`,
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

async function intent_stripped_when_prompt_contains_ide_selection() {
  const captured = { value: null };
  const key = mockHelperCaptureIntent(captured);
  delete require.cache[require.resolve(hookPath)];
  const { run } = require(hookPath);
  const stdin = JSON.stringify({
    prompt: "fix bug <ide_selection>V8</ide_selection> end",
    cwd: "/tmp",
  });
  await run(stdin);
  cleanup(key);
  const intent = captured.value;
  if (intent == null) {
    throw new Error("callAicCompile was not called with intent");
  }
  if (intent.includes("ide_selection")) {
    throw new Error(
      `Intent must not contain "ide_selection", got: ${JSON.stringify(intent)}`,
    );
  }
  if (!intent.includes("fix bug")) {
    throw new Error(`Intent must include "fix bug", got: ${JSON.stringify(intent)}`);
  }
  if (!intent.includes("end")) {
    throw new Error(`Intent must include "end", got: ${JSON.stringify(intent)}`);
  }
  console.log("intent_stripped_when_prompt_contains_ide_selection: pass");
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

(async () => {
  await plain_text_stdout_when_helper_returns_prompt();
  await exit_0_silent_when_helper_returns_null();
  await dual_path_prepends_invariants_when_marker_missing();
  await prompt_compile_no_AIC_CONVERSATION_ID_when_conversationId_null();
  await prompt_compile_includes_AIC_CONVERSATION_ID_when_conversationId_truthy();
  await intent_stripped_when_prompt_contains_ide_selection();
  await prompt_compile_uses_transcript_path_as_conversationId();
  console.log("All tests passed.");
})();
