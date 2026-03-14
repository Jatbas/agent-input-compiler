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

async function conversationId_forwarded_when_sessionId_provided() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-helper-test-"));
  const mockDir = path.join(tmpDir, "mcp", "src");
  fs.mkdirSync(mockDir, { recursive: true });
  const argsFile = path.join(os.tmpdir(), `aic-mock-args-${process.pid}.json`);
  fs.copyFileSync(mockRecordsArgs, path.join(mockDir, "server.ts"));
  try {
    delete require.cache[require.resolve(helperPath)];
    const { callAicCompile } = require(helperPath);
    process.env.AIC_MOCK_ARGS_FILE = argsFile;
    await callAicCompile("intent", tmpDir, "session-123", 10000);
    delete process.env.AIC_MOCK_ARGS_FILE;
    if (!fs.existsSync(argsFile)) {
      throw new Error("Mock did not write args file");
    }
    const recorded = JSON.parse(fs.readFileSync(argsFile, "utf8"));
    const parsed = JSON.parse(recorded.stdin);
    const args = parsed.params && parsed.params.arguments ? parsed.params.arguments : {};
    if (args.conversationId !== "session-123") {
      throw new Error(
        `Expected conversationId "session-123", got ${JSON.stringify(args.conversationId)}`,
      );
    }
    console.log("conversationId_forwarded_when_sessionId_provided: pass");
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

(async () => {
  await happy_path_returns_compiled_prompt();
  await conversationId_forwarded_when_sessionId_provided();
  await returns_null_on_spawn_error();
  console.log("All tests passed.");
})();
