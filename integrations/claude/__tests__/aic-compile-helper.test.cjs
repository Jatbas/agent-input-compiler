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

async function helper_uses_explicit_editor_id_when_provided() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-helper-test-"));
  const mockDir = path.join(tmpDir, "mcp", "src");
  fs.mkdirSync(mockDir, { recursive: true });
  const argsFile = path.join(os.tmpdir(), `aic-mock-args-${process.pid}-explicit.json`);
  fs.copyFileSync(mockRecordsArgs, path.join(mockDir, "server.ts"));
  const savedTrace = process.env.CURSOR_TRACE_ID;
  delete process.env.CURSOR_TRACE_ID;
  try {
    delete require.cache[require.resolve(helperPath)];
    const { callAicCompile } = require(helperPath);
    process.env.AIC_MOCK_ARGS_FILE = argsFile;
    await callAicCompile("intent", tmpDir, null, 10000, null, null, "cursor-claude-code");
    delete process.env.AIC_MOCK_ARGS_FILE;
    if (!fs.existsSync(argsFile)) {
      throw new Error("Mock did not write args file");
    }
    const recorded = JSON.parse(fs.readFileSync(argsFile, "utf8"));
    const parsed = JSON.parse(recorded.stdin);
    const args = parsed.params && parsed.params.arguments ? parsed.params.arguments : {};
    if (args.editorId !== "cursor-claude-code") {
      throw new Error(
        `Expected explicit editorId "cursor-claude-code", got ${JSON.stringify(args.editorId)}`,
      );
    }
    console.log("helper_uses_explicit_editor_id_when_provided: pass");
  } finally {
    if (savedTrace !== undefined) process.env.CURSOR_TRACE_ID = savedTrace;
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

async function modelId_sixth_param_forwarded() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-helper-test-"));
  const mockDir = path.join(tmpDir, "mcp", "src");
  fs.mkdirSync(mockDir, { recursive: true });
  const argsFile = path.join(os.tmpdir(), `aic-mock-args-${process.pid}-model.json`);
  fs.copyFileSync(mockRecordsArgs, path.join(mockDir, "server.ts"));
  try {
    delete require.cache[require.resolve(helperPath)];
    const { callAicCompile } = require(helperPath);
    process.env.AIC_MOCK_ARGS_FILE = argsFile;
    await callAicCompile("i", tmpDir, null, 10000, null, "claude-sonnet-4-6");
    delete process.env.AIC_MOCK_ARGS_FILE;
    if (!fs.existsSync(argsFile)) {
      throw new Error("Mock did not write args file");
    }
    const recorded = JSON.parse(fs.readFileSync(argsFile, "utf8"));
    const parsed = JSON.parse(recorded.stdin);
    const args = parsed.params && parsed.params.arguments ? parsed.params.arguments : {};
    if (args.modelId !== "claude-sonnet-4-6") {
      throw new Error(
        `Expected modelId "claude-sonnet-4-6", got ${JSON.stringify(args.modelId)}`,
      );
    }
    console.log("modelId_sixth_param_forwarded: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    try {
      fs.unlinkSync(argsFile);
    } catch {
      // ignore
    }
  }
}

async function modelId_from_cache_when_sixth_absent() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-helper-test-"));
  const mockDir = path.join(tmpDir, "mcp", "src");
  fs.mkdirSync(mockDir, { recursive: true });
  const aicDir = path.join(tmpDir, ".aic");
  fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
  const entry = JSON.stringify({
    c: "",
    m: "haiku-model",
    e: "claude-code",
    timestamp: "2026-01-01T00:00:00.000Z",
  });
  fs.writeFileSync(path.join(aicDir, "session-models.jsonl"), entry + "\n", "utf8");
  const argsFile = path.join(os.tmpdir(), `aic-mock-args-${process.pid}-cache.json`);
  fs.copyFileSync(mockRecordsArgs, path.join(mockDir, "server.ts"));
  const savedTrace = process.env.CURSOR_TRACE_ID;
  delete process.env.CURSOR_TRACE_ID;
  try {
    delete require.cache[require.resolve(helperPath)];
    const { callAicCompile } = require(helperPath);
    process.env.AIC_MOCK_ARGS_FILE = argsFile;
    await callAicCompile("i", tmpDir, null, 10000);
    delete process.env.AIC_MOCK_ARGS_FILE;
    if (!fs.existsSync(argsFile)) {
      throw new Error("Mock did not write args file");
    }
    const recorded = JSON.parse(fs.readFileSync(argsFile, "utf8"));
    const parsed = JSON.parse(recorded.stdin);
    const args = parsed.params && parsed.params.arguments ? parsed.params.arguments : {};
    if (args.modelId !== "haiku-model") {
      throw new Error(
        `Expected modelId "haiku-model", got ${JSON.stringify(args.modelId)}`,
      );
    }
    console.log("modelId_from_cache_when_sixth_absent: pass");
  } finally {
    if (savedTrace !== undefined) process.env.CURSOR_TRACE_ID = savedTrace;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    try {
      fs.unlinkSync(argsFile);
    } catch {
      // ignore
    }
  }
}

async function modelId_omitted_when_cache_invalid() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-helper-test-"));
  const mockDir = path.join(tmpDir, "mcp", "src");
  fs.mkdirSync(mockDir, { recursive: true });
  const aicDir = path.join(tmpDir, ".aic");
  fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(aicDir, "session-models.jsonl"), "not valid json\n", "utf8");
  const argsFile = path.join(os.tmpdir(), `aic-mock-args-${process.pid}-invalid.json`);
  fs.copyFileSync(mockRecordsArgs, path.join(mockDir, "server.ts"));
  try {
    delete require.cache[require.resolve(helperPath)];
    const { callAicCompile } = require(helperPath);
    process.env.AIC_MOCK_ARGS_FILE = argsFile;
    await callAicCompile("i", tmpDir, null, 10000);
    delete process.env.AIC_MOCK_ARGS_FILE;
    if (!fs.existsSync(argsFile)) {
      throw new Error("Mock did not write args file");
    }
    const recorded = JSON.parse(fs.readFileSync(argsFile, "utf8"));
    const parsed = JSON.parse(recorded.stdin);
    const args = parsed.params && parsed.params.arguments ? parsed.params.arguments : {};
    if (args.modelId !== undefined) {
      throw new Error(`Expected modelId undefined, got ${JSON.stringify(args.modelId)}`);
    }
    console.log("modelId_omitted_when_cache_invalid: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    try {
      fs.unlinkSync(argsFile);
    } catch {
      // ignore
    }
  }
}

async function modelId_default_normalized_to_auto() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-helper-test-"));
  const mockDir = path.join(tmpDir, "mcp", "src");
  fs.mkdirSync(mockDir, { recursive: true });
  const argsFile = path.join(os.tmpdir(), `aic-mock-args-${process.pid}-norm.json`);
  fs.copyFileSync(mockRecordsArgs, path.join(mockDir, "server.ts"));
  try {
    delete require.cache[require.resolve(helperPath)];
    const { callAicCompile } = require(helperPath);
    process.env.AIC_MOCK_ARGS_FILE = argsFile;
    await callAicCompile("i", tmpDir, null, 10000, null, "default");
    delete process.env.AIC_MOCK_ARGS_FILE;
    if (!fs.existsSync(argsFile)) {
      throw new Error("Mock did not write args file");
    }
    const recorded = JSON.parse(fs.readFileSync(argsFile, "utf8"));
    const parsed = JSON.parse(recorded.stdin);
    const args = parsed.params && parsed.params.arguments ? parsed.params.arguments : {};
    if (args.modelId !== "auto") {
      throw new Error(`Expected modelId "auto", got ${JSON.stringify(args.modelId)}`);
    }
    console.log("modelId_default_normalized_to_auto: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    try {
      fs.unlinkSync(argsFile);
    } catch {
      // ignore
    }
  }
}

async function modelId_from_conversation_scoped_cache() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-helper-test-"));
  const mockDir = path.join(tmpDir, "mcp", "src");
  fs.mkdirSync(mockDir, { recursive: true });
  const aicDir = path.join(tmpDir, ".aic");
  fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
  const fallback = JSON.stringify({
    c: "",
    m: "fallback-model",
    e: "claude-code",
    timestamp: "2026-01-01T00:00:00.000Z",
  });
  const scoped = JSON.stringify({
    c: "conv-xyz",
    m: "scoped-model",
    e: "claude-code",
    timestamp: "2026-01-01T00:00:01.000Z",
  });
  fs.writeFileSync(
    path.join(aicDir, "session-models.jsonl"),
    fallback + "\n" + scoped + "\n",
    "utf8",
  );
  const argsFile = path.join(os.tmpdir(), `aic-mock-args-${process.pid}-scoped.json`);
  fs.copyFileSync(mockRecordsArgs, path.join(mockDir, "server.ts"));
  const savedTrace = process.env.CURSOR_TRACE_ID;
  delete process.env.CURSOR_TRACE_ID;
  try {
    delete require.cache[require.resolve(helperPath)];
    const { callAicCompile } = require(helperPath);
    process.env.AIC_MOCK_ARGS_FILE = argsFile;
    await callAicCompile("i", tmpDir, "conv-xyz", 10000);
    delete process.env.AIC_MOCK_ARGS_FILE;
    if (!fs.existsSync(argsFile)) {
      throw new Error("Mock did not write args file");
    }
    const recorded = JSON.parse(fs.readFileSync(argsFile, "utf8"));
    const parsed = JSON.parse(recorded.stdin);
    const args = parsed.params && parsed.params.arguments ? parsed.params.arguments : {};
    if (args.modelId !== "scoped-model") {
      throw new Error(
        `Expected modelId "scoped-model", got ${JSON.stringify(args.modelId)}`,
      );
    }
    console.log("modelId_from_conversation_scoped_cache: pass");
  } finally {
    if (savedTrace !== undefined) process.env.CURSOR_TRACE_ID = savedTrace;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    try {
      fs.unlinkSync(argsFile);
    } catch {
      // ignore
    }
  }
}

async function modelId_cache_default_normalized_on_read() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-helper-test-"));
  const mockDir = path.join(tmpDir, "mcp", "src");
  fs.mkdirSync(mockDir, { recursive: true });
  const aicDir = path.join(tmpDir, ".aic");
  fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
  const entry = JSON.stringify({
    c: "",
    m: "default",
    e: "claude-code",
    timestamp: "2026-01-01T00:00:00.000Z",
  });
  fs.writeFileSync(path.join(aicDir, "session-models.jsonl"), entry + "\n", "utf8");
  const argsFile = path.join(os.tmpdir(), `aic-mock-args-${process.pid}-cnorm.json`);
  fs.copyFileSync(mockRecordsArgs, path.join(mockDir, "server.ts"));
  const savedTrace = process.env.CURSOR_TRACE_ID;
  delete process.env.CURSOR_TRACE_ID;
  try {
    delete require.cache[require.resolve(helperPath)];
    const { callAicCompile } = require(helperPath);
    process.env.AIC_MOCK_ARGS_FILE = argsFile;
    await callAicCompile("i", tmpDir, null, 10000);
    delete process.env.AIC_MOCK_ARGS_FILE;
    if (!fs.existsSync(argsFile)) {
      throw new Error("Mock did not write args file");
    }
    const recorded = JSON.parse(fs.readFileSync(argsFile, "utf8"));
    const parsed = JSON.parse(recorded.stdin);
    const args = parsed.params && parsed.params.arguments ? parsed.params.arguments : {};
    if (args.modelId !== "auto") {
      throw new Error(
        `Expected modelId "auto" (normalized from cache "default"), got ${JSON.stringify(args.modelId)}`,
      );
    }
    console.log("modelId_cache_default_normalized_on_read: pass");
  } finally {
    if (savedTrace !== undefined) process.env.CURSOR_TRACE_ID = savedTrace;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    try {
      fs.unlinkSync(argsFile);
    } catch {
      // ignore
    }
  }
}

function assertSafeRecordedArgs(args, label) {
  if (args.modelId !== undefined && args.modelId !== null) {
    if (typeof args.modelId !== "string") {
      throw new Error(
        `${label}: modelId must be string or null, got ${typeof args.modelId}`,
      );
    }
    if (args.modelId.length > 256) {
      throw new Error(`${label}: modelId length ${args.modelId.length} > 256`);
    }
    if (!/^[\x20-\x7E]*$/.test(args.modelId)) {
      throw new Error(`${label}: modelId contains control characters`);
    }
  }
  const allowedEditorIds = ["cursor", "cursor-claude-code", "claude-code", "generic"];
  if (args.editorId !== undefined && !allowedEditorIds.includes(args.editorId)) {
    throw new Error(
      `${label}: editorId must be one of ${allowedEditorIds.join(",")}, got ${JSON.stringify(args.editorId)}`,
    );
  }
  if (args.conversationId !== undefined && args.conversationId !== null) {
    if (typeof args.conversationId !== "string") {
      throw new Error(
        `${label}: conversationId must be string or null, got ${typeof args.conversationId}`,
      );
    }
    if (args.conversationId.length > 128) {
      throw new Error(
        `${label}: conversationId length ${args.conversationId.length} > 128`,
      );
    }
    if (!/^[\x20-\x7E]*$/.test(args.conversationId)) {
      throw new Error(`${label}: conversationId contains control characters`);
    }
  }
}

async function helper_malicious_cache_rejected() {
  const savedTrace = process.env.CURSOR_TRACE_ID;
  delete process.env.CURSOR_TRACE_ID;
  const cases = [
    {
      name: "overlong modelId (257 chars)",
      suffix: "overlong",
      line: JSON.stringify({
        c: "",
        m: "a".repeat(257),
        e: "claude-code",
        timestamp: "2026-01-01T00:00:00.000Z",
      }),
    },
    {
      name: "control char in modelId",
      suffix: "control",
      line: JSON.stringify({
        c: "",
        m: "a\x00b",
        e: "claude-code",
        timestamp: "2026-01-01T00:00:00.000Z",
      }),
    },
    {
      name: "nested object as modelId",
      suffix: "nested",
      line: JSON.stringify({
        c: "",
        m: { nested: true },
        e: "claude-code",
        timestamp: "2026-01-01T00:00:00.000Z",
      }),
    },
  ];
  for (const tc of cases) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-helper-test-"));
    const mockDir = path.join(tmpDir, "mcp", "src");
    fs.mkdirSync(mockDir, { recursive: true });
    const aicDir = path.join(tmpDir, ".aic");
    fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(aicDir, "session-models.jsonl"), tc.line + "\n", "utf8");
    const argsFile = path.join(
      os.tmpdir(),
      `aic-mock-args-${process.pid}-malicious-${tc.suffix}.json`,
    );
    fs.copyFileSync(mockRecordsArgs, path.join(mockDir, "server.ts"));
    try {
      delete require.cache[require.resolve(helperPath)];
      const { callAicCompile } = require(helperPath);
      process.env.AIC_MOCK_ARGS_FILE = argsFile;
      await callAicCompile("intent", tmpDir, null, 10000);
      delete process.env.AIC_MOCK_ARGS_FILE;
      if (!fs.existsSync(argsFile)) {
        throw new Error(`Mock did not write args file for ${tc.name}`);
      }
      const recorded = JSON.parse(fs.readFileSync(argsFile, "utf8"));
      const parsed = JSON.parse(recorded.stdin);
      const args =
        parsed.params && parsed.params.arguments ? parsed.params.arguments : {};
      assertSafeRecordedArgs(args, tc.name);
      if (args.modelId !== undefined) {
        throw new Error(
          `${tc.name}: expected modelId undefined/null when cache is malicious, got ${JSON.stringify(args.modelId)}`,
        );
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      try {
        fs.unlinkSync(argsFile);
      } catch {
        // ignore
      }
    }
  }
  if (savedTrace !== undefined) process.env.CURSOR_TRACE_ID = savedTrace;
  else delete process.env.CURSOR_TRACE_ID;
  console.log("helper_malicious_cache_rejected: pass");
}

(async () => {
  await happy_path_returns_compiled_prompt();
  await conversationId_forwarded_when_provided();
  await triggerSource_forwarded_when_provided();
  await returns_null_on_spawn_error();
  await helper_passes_editor_id_cursor_claude_code_when_CURSOR_TRACE_ID_set();
  await helper_uses_explicit_editor_id_when_provided();
  await helper_passes_editor_id_claude_code_when_CURSOR_TRACE_ID_unset();
  await modelId_sixth_param_forwarded();
  await modelId_from_cache_when_sixth_absent();
  await modelId_omitted_when_cache_invalid();
  await modelId_default_normalized_to_auto();
  await modelId_from_conversation_scoped_cache();
  await modelId_cache_default_normalized_on_read();
  await helper_malicious_cache_rejected();
  console.log("All tests passed.");
})();
