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

(async () => {
  await hookSpecificOutput_json_when_helper_returns_text();
  await output_empty_object_when_helper_returns_null();
  console.log("All tests passed.");
})();
