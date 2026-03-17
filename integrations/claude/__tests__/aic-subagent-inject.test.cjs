// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("path");

const hooksDir = path.join(__dirname, "..", "hooks");
const hookPath = path.join(hooksDir, "aic-subagent-inject.cjs");

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
  delete require.cache[path.join(hooksDir, "aic-subagent-inject.cjs")];
}

async function hookSpecificOutput_json_when_helper_returns_text() {
  const key = mockHelper("compiled text");
  delete require.cache[hookPath];
  const { run } = require(hookPath);
  const result = await run(
    JSON.stringify({ agent_type: "Explore", session_id: "s1", cwd: "/tmp" }),
  );
  cleanup(key);
  if (!result || result.hookSpecificOutput?.hookEventName !== "SubagentStart") {
    throw new Error(
      `Expected hookEventName "SubagentStart", got ${JSON.stringify(result)}`,
    );
  }
  if (result.hookSpecificOutput?.additionalContext !== "compiled text") {
    throw new Error(
      `Expected additionalContext "compiled text", got ${JSON.stringify(result.hookSpecificOutput?.additionalContext)}`,
    );
  }
  console.log("hookSpecificOutput_json_when_helper_returns_text: pass");
}

async function output_empty_object_when_helper_returns_null() {
  const key = mockHelper(null);
  delete require.cache[hookPath];
  const { run } = require(hookPath);
  const result = await run(JSON.stringify({ session_id: "s1", cwd: "/tmp" }));
  cleanup(key);
  if (result !== null) {
    throw new Error(`Expected null, got ${JSON.stringify(result)}`);
  }
  console.log("output_empty_object_when_helper_returns_null: pass");
}

async function conversationId_falls_back_to_env_when_not_in_payload() {
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
  delete require.cache[hookPath];
  const { run } = require(hookPath);
  process.env.AIC_CONVERSATION_ID = "env-conv-id-123";
  await run(
    JSON.stringify({ agent_type: "general-purpose", session_id: "s1", cwd: "/tmp" }),
  );
  delete process.env.AIC_CONVERSATION_ID;
  cleanup(resolvedHelper);
  if (capturedConversationId !== "env-conv-id-123") {
    throw new Error(
      `Expected conversationId "env-conv-id-123", got ${JSON.stringify(capturedConversationId)}`,
    );
  }
  console.log("conversationId_falls_back_to_env_when_not_in_payload: pass");
}

async function conversationId_falls_back_to_file_when_not_in_env() {
  const os = require("os");
  const fs = require("fs");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-subagent-test-"));
  const aicDir = path.join(tmpDir, ".aic");
  fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(aicDir, ".current-conversation-id"),
    JSON.stringify({ conversationId: "file-conv-id-456", sessionId: "s1" }),
    "utf8",
  );
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
  delete require.cache[hookPath];
  const { run } = require(hookPath);
  delete process.env.AIC_CONVERSATION_ID;
  await run(
    JSON.stringify({ agent_type: "general-purpose", session_id: "s1", cwd: tmpDir }),
  );
  cleanup(resolvedHelper);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (capturedConversationId !== "file-conv-id-456") {
    throw new Error(
      `Expected "file-conv-id-456", got ${JSON.stringify(capturedConversationId)}`,
    );
  }
  console.log("conversationId_falls_back_to_file_when_not_in_env: pass");
}

(async () => {
  await hookSpecificOutput_json_when_helper_returns_text();
  await output_empty_object_when_helper_returns_null();
  await conversationId_falls_back_to_env_when_not_in_payload();
  await conversationId_falls_back_to_file_when_not_in_env();
  console.log("All tests passed.");
})();
