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

async function transcript_path_used_as_conversationId() {
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
  await run(
    JSON.stringify({
      agent_type: "general-purpose",
      cwd: "/tmp",
      transcript_path: "/home/user/.claude/conversations/abc-def-123.jsonl",
    }),
  );
  cleanup(resolvedHelper);
  if (capturedConversationId !== "abc-def-123") {
    throw new Error(
      `Expected "abc-def-123", got ${JSON.stringify(capturedConversationId)}`,
    );
  }
  console.log("transcript_path_used_as_conversationId: pass");
}

async function session_id_fallback_when_no_transcript_path() {
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
  await run(
    JSON.stringify({
      agent_type: "Explore",
      cwd: "/tmp",
      session_id: "subagent-sess-fb",
    }),
  );
  cleanup(resolvedHelper);
  if (capturedConversationId !== "subagent-sess-fb") {
    throw new Error(
      `Expected session fallback id, got ${JSON.stringify(capturedConversationId)}`,
    );
  }
  console.log("session_id_fallback_when_no_transcript_path: pass");
}

async function null_conversationId_when_no_transcript_path() {
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
  await run(JSON.stringify({ agent_type: "Explore", cwd: "/tmp" }));
  cleanup(resolvedHelper);
  if (capturedConversationId !== null) {
    throw new Error(`Expected null, got ${JSON.stringify(capturedConversationId)}`);
  }
  console.log("null_conversationId_when_no_transcript_path: pass");
}

async function subagent_uses_prompt_as_intent_when_present() {
  const resolvedHelper = require.resolve("./aic-compile-helper.cjs", {
    paths: [hooksDir],
  });
  let capturedIntent;
  require.cache[resolvedHelper] = {
    exports: {
      callAicCompile: (intent) => {
        capturedIntent = intent;
        return Promise.resolve("compiled text");
      },
    },
    loaded: true,
    id: resolvedHelper,
  };
  delete require.cache[hookPath];
  const { run } = require(hookPath);
  await run(
    JSON.stringify({
      agent_type: "general-purpose",
      prompt: "fix the authentication bug in auth.ts",
      cwd: "/tmp",
    }),
  );
  cleanup(resolvedHelper);
  if (capturedIntent !== "fix the authentication bug in auth.ts") {
    throw new Error(
      `Expected prompt-based intent, got ${JSON.stringify(capturedIntent)}`,
    );
  }
  console.log("subagent_uses_prompt_as_intent_when_present: pass");
}

async function subagent_strips_ide_selection_from_prompt() {
  const resolvedHelper = require.resolve("./aic-compile-helper.cjs", {
    paths: [hooksDir],
  });
  let capturedIntent;
  require.cache[resolvedHelper] = {
    exports: {
      callAicCompile: (intent) => {
        capturedIntent = intent;
        return Promise.resolve("compiled text");
      },
    },
    loaded: true,
    id: resolvedHelper,
  };
  delete require.cache[hookPath];
  const { run } = require(hookPath);
  await run(
    JSON.stringify({
      agent_type: "general-purpose",
      prompt: "fix this <ide_selection>selected code here</ide_selection> please",
      cwd: "/tmp",
    }),
  );
  cleanup(resolvedHelper);
  if (capturedIntent !== "fix this  please") {
    throw new Error(`Expected stripped intent, got ${JSON.stringify(capturedIntent)}`);
  }
  console.log("subagent_strips_ide_selection_from_prompt: pass");
}

async function subagent_inject_noop_when_cursor_version_present() {
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
    JSON.stringify({ agent_type: "Explore", cwd: "/tmp", cursor_version: "3" }),
  );
  cleanup(resolvedHelper);
  if (callCount !== 0) {
    throw new Error(`Expected no compile call, got ${callCount}`);
  }
  if (result !== null) {
    throw new Error(`Expected null, got ${JSON.stringify(result)}`);
  }
  console.log("subagent_inject_noop_when_cursor_version_present: pass");
}

(async () => {
  await hookSpecificOutput_json_when_helper_returns_text();
  await output_empty_object_when_helper_returns_null();
  await transcript_path_used_as_conversationId();
  await session_id_fallback_when_no_transcript_path();
  await null_conversationId_when_no_transcript_path();
  await subagent_uses_prompt_as_intent_when_present();
  await subagent_strips_ide_selection_from_prompt();
  await subagent_inject_noop_when_cursor_version_present();
  console.log("All tests passed.");
})();
