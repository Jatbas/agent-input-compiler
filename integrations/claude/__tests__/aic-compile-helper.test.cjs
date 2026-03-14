// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("path");
const fs = require("fs");
const cp = require("child_process");

const hooksDir = path.join(__dirname, "..", "hooks");
const helperPath = path.join(hooksDir, "aic-compile-helper.cjs");
const mockReturnsPrompt = path.join(__dirname, "mock-mcp-returns-prompt.cjs");
const mockRecordsArgs = path.join(__dirname, "mock-mcp-records-args.cjs");

function happy_path_returns_compiled_prompt() {
  const mockStdout =
    '{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\\"compiledPrompt\\":\\"mock prompt\\"}"}]}}\n';
  const orig = cp.execFileSync;
  cp.execFileSync = function (cmd) {
    if (cmd === "npx") return mockStdout;
    return orig.apply(this, arguments);
  };
  delete require.cache[require.resolve(helperPath)];
  const { callAicCompile } = require(helperPath);
  const out = callAicCompile("intent", "/tmp/dummy", null, 5000);
  cp.execFileSync = orig;
  if (out !== "mock prompt") {
    throw new Error(`Expected "mock prompt", got ${JSON.stringify(out)}`);
  }
  console.log("happy_path_returns_compiled_prompt: pass");
}

function conversationId_forwarded_when_sessionId_provided() {
  const tmpFile = path.join(require("os").tmpdir(), `aic-mock-args-${process.pid}.json`);
  let lastInput = null;
  try {
    const mockStdout =
      '{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\\"compiledPrompt\\":\\"mock prompt\\"}"}]}}\n';
    const orig = cp.execFileSync;
    cp.execFileSync = function (cmd, args, opts) {
      if (cmd === "npx" && args && args[0]) {
        lastInput = (opts && opts.input) || null;
        if (lastInput) {
          orig("node", [mockRecordsArgs], {
            ...opts,
            encoding: "utf-8",
            env: { ...process.env, AIC_MOCK_ARGS_FILE: tmpFile },
          });
        }
        return mockStdout;
      }
      return orig.apply(this, arguments);
    };
    delete require.cache[require.resolve(helperPath)];
    const { callAicCompile } = require(helperPath);
    callAicCompile("intent", "/tmp/dummy", "session-123", 5000);
    cp.execFileSync = orig;
    if (!lastInput) {
      throw new Error("Stub did not receive input from helper");
    }
    const toolsCallLine = lastInput.split("\n").find((l) => l.includes("tools/call"));
    if (!toolsCallLine) {
      throw new Error("Stdin payload had no tools/call line");
    }
    const parsed = JSON.parse(toolsCallLine);
    const recorded =
      parsed.params && parsed.params.arguments ? parsed.params.arguments : {};
    if (recorded.conversationId !== "session-123") {
      throw new Error(
        `Expected conversationId "session-123", got ${JSON.stringify(recorded.conversationId)}`,
      );
    }
    console.log("conversationId_forwarded_when_sessionId_provided: pass");
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore
    }
  }
}

function returns_null_on_parse_error() {
  const orig = cp.execFileSync;
  cp.execFileSync = function (cmd) {
    if (cmd === "npx") return "not valid json\n";
    return orig.apply(this, arguments);
  };
  delete require.cache[require.resolve(helperPath)];
  const { callAicCompile } = require(helperPath);
  const out = callAicCompile("intent", "/tmp/dummy", null, 5000);
  cp.execFileSync = orig;
  if (out !== null) {
    throw new Error(`Expected null, got ${JSON.stringify(out)}`);
  }
  console.log("returns_null_on_parse_error: pass");
}

happy_path_returns_compiled_prompt();
conversationId_forwarded_when_sessionId_provided();
returns_null_on_parse_error();
console.log("All tests passed.");
