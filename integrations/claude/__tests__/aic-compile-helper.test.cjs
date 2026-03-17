// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("path");
const fs = require("fs");
const os = require("os");

const hooksDir = path.join(__dirname, "..", "hooks");
const helperPath = path.join(hooksDir, "aic-compile-helper.cjs");
const mockReturnsPrompt = path.join(__dirname, "mock-mcp-returns-prompt.cjs");
const mockRecordsArgs = path.join(__dirname, "mock-mcp-records-args.cjs");

async function happy_path_returns_compiled_prompt() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-helper-test-"));
  const mockDir = path.join(tmpDir, "mcp", "src");
  fs.mkdirSync(mockDir, { recursive: true });
  fs.copyFileSync(mockReturnsPrompt, path.join(mockDir, "server.ts"));
  try {
    delete require.cache[require.resolve(helperPath)];
    const { callAicCompile } = require(helperPath);
    const out = await callAicCompile("intent", tmpDir, null, 10000);
    if (out !== "mock prompt") {
      throw new Error(`Expected "mock prompt", got ${JSON.stringify(out)}`);
    }
    console.log("happy_path_returns_compiled_prompt: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function conversationId_forwarded_when_provided() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-helper-test-"));
  const mockDir = path.join(tmpDir, "mcp", "src");
  fs.mkdirSync(mockDir, { recursive: true });
  const argsFile = path.join(os.tmpdir(), `aic-mock-args-${process.pid}.json`);
  fs.copyFileSync(mockRecordsArgs, path.join(mockDir, "server.ts"));
  try {
    delete require.cache[require.resolve(helperPath)];
    const { callAicCompile } = require(helperPath);
    process.env.AIC_MOCK_ARGS_FILE = argsFile;
    await callAicCompile("intent", tmpDir, "conv-123", 10000);
    delete process.env.AIC_MOCK_ARGS_FILE;
    if (!fs.existsSync(argsFile)) {
      throw new Error("Mock did not write args file");
    }
    const recorded = JSON.parse(fs.readFileSync(argsFile, "utf8"));
    const parsed = JSON.parse(recorded.stdin);
    const args = parsed.params && parsed.params.arguments ? parsed.params.arguments : {};
    if (args.conversationId !== "conv-123") {
      throw new Error(
        `Expected conversationId "conv-123", got ${JSON.stringify(args.conversationId)}`,
      );
    }
    console.log("conversationId_forwarded_when_provided: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    try {
      fs.unlinkSync(argsFile);
    } catch {
      // ignore
    }
  }
}

async function triggerSource_forwarded_when_provided() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-helper-test-"));
  const mockDir = path.join(tmpDir, "mcp", "src");
  fs.mkdirSync(mockDir, { recursive: true });
  const argsFile = path.join(os.tmpdir(), `aic-mock-args-${process.pid}-trigger.json`);
  fs.copyFileSync(mockRecordsArgs, path.join(mockDir, "server.ts"));
  try {
    delete require.cache[require.resolve(helperPath)];
    const { callAicCompile } = require(helperPath);
    process.env.AIC_MOCK_ARGS_FILE = argsFile;
    await callAicCompile("intent", tmpDir, null, 10000, "subagent_start");
    delete process.env.AIC_MOCK_ARGS_FILE;
    if (!fs.existsSync(argsFile)) {
      throw new Error("Mock did not write args file");
    }
    const recorded = JSON.parse(fs.readFileSync(argsFile, "utf8"));
    const parsed = JSON.parse(recorded.stdin);
    const args = parsed.params && parsed.params.arguments ? parsed.params.arguments : {};
    if (args.triggerSource !== "subagent_start") {
      throw new Error(
        `Expected triggerSource "subagent_start", got ${JSON.stringify(args.triggerSource)}`,
      );
    }
    console.log("triggerSource_forwarded_when_provided: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    try {
      fs.unlinkSync(argsFile);
    } catch {
      // ignore
    }
  }
}

async function returns_null_on_spawn_error() {
  delete require.cache[require.resolve(helperPath)];
  const { callAicCompile } = require(helperPath);
  const out = await callAicCompile("intent", "/nonexistent/path", null, 3000);
  if (out !== null) {
    throw new Error(`Expected null, got ${JSON.stringify(out)}`);
  }
  console.log("returns_null_on_spawn_error: pass");
}

async function helper_passes_editor_id_cursor_claude_code_when_CURSOR_TRACE_ID_set() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-helper-test-"));
  const mockDir = path.join(tmpDir, "mcp", "src");
  fs.mkdirSync(mockDir, { recursive: true });
  const argsFile = path.join(os.tmpdir(), `aic-mock-args-${process.pid}-cursor.json`);
  fs.copyFileSync(mockRecordsArgs, path.join(mockDir, "server.ts"));
  const prev = process.env.CURSOR_TRACE_ID;
  try {
    process.env.CURSOR_TRACE_ID = "test-trace-id-abc123";
    delete require.cache[require.resolve(helperPath)];
    const { callAicCompile } = require(helperPath);
    process.env.AIC_MOCK_ARGS_FILE = argsFile;
    await callAicCompile("intent", tmpDir, null, 10000);
    delete process.env.AIC_MOCK_ARGS_FILE;
    if (!fs.existsSync(argsFile)) {
      throw new Error("Mock did not write args file");
    }
    const recorded = JSON.parse(fs.readFileSync(argsFile, "utf8"));
    const parsed = JSON.parse(recorded.stdin);
    const args = parsed.params && parsed.params.arguments ? parsed.params.arguments : {};
    if (args.editorId !== "cursor-claude-code") {
      throw new Error(
        `Expected editorId "cursor-claude-code", got ${JSON.stringify(args.editorId)}`,
      );
    }
    console.log(
      "helper_passes_editor_id_cursor_claude_code_when_CURSOR_TRACE_ID_set: pass",
    );
  } finally {
    if (prev !== undefined) process.env.CURSOR_TRACE_ID = prev;
    else delete process.env.CURSOR_TRACE_ID;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    try {
      fs.unlinkSync(argsFile);
    } catch {
      // ignore
    }
  }
}

async function helper_passes_editor_id_claude_code_when_CURSOR_TRACE_ID_unset() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-helper-test-"));
  const mockDir = path.join(tmpDir, "mcp", "src");
  fs.mkdirSync(mockDir, { recursive: true });
  const argsFile = path.join(os.tmpdir(), `aic-mock-args-${process.pid}-claude.json`);
  fs.copyFileSync(mockRecordsArgs, path.join(mockDir, "server.ts"));
  const prev = process.env.CURSOR_TRACE_ID;
  try {
    delete process.env.CURSOR_TRACE_ID;
    delete require.cache[require.resolve(helperPath)];
    const { callAicCompile } = require(helperPath);
    process.env.AIC_MOCK_ARGS_FILE = argsFile;
    await callAicCompile("intent", tmpDir, null, 10000);
    delete process.env.AIC_MOCK_ARGS_FILE;
    if (!fs.existsSync(argsFile)) {
      throw new Error("Mock did not write args file");
    }
    const recorded = JSON.parse(fs.readFileSync(argsFile, "utf8"));
    const parsed = JSON.parse(recorded.stdin);
    const args = parsed.params && parsed.params.arguments ? parsed.params.arguments : {};
    if (args.editorId !== "claude-code") {
      throw new Error(
        `Expected editorId "claude-code", got ${JSON.stringify(args.editorId)}`,
      );
    }
    console.log("helper_passes_editor_id_claude_code_when_CURSOR_TRACE_ID_unset: pass");
  } finally {
    if (prev !== undefined) process.env.CURSOR_TRACE_ID = prev;
    else delete process.env.CURSOR_TRACE_ID;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    try {
      fs.unlinkSync(argsFile);
    } catch {
      // ignore
    }
  }
}

(async () => {
  await happy_path_returns_compiled_prompt();
  await conversationId_forwarded_when_provided();
  await triggerSource_forwarded_when_provided();
  await returns_null_on_spawn_error();
  await helper_passes_editor_id_cursor_claude_code_when_CURSOR_TRACE_ID_set();
  await helper_passes_editor_id_claude_code_when_CURSOR_TRACE_ID_unset();
  console.log("All tests passed.");
})();
