// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("path");

const hooksDir = path.join(__dirname, "..", "hooks");
const hookPath = path.join(hooksDir, "aic-pre-compact.cjs");

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
  delete require.cache[require.resolve(hookPath)];
}

async function plain_text_stdout_when_helper_returns_prompt() {
  const key = mockHelper("compiled text");
  delete require.cache[require.resolve(hookPath)];
  const { run } = require(hookPath);
  const result = await run(JSON.stringify({ session_id: "s1", cwd: "/tmp" }));
  cleanup(key);
  if (result !== "compiled text") {
    throw new Error(`Expected "compiled text", got ${JSON.stringify(result)}`);
  }
  console.log("plain_text_stdout_when_helper_returns_prompt: pass");
}

async function exit_0_silent_when_helper_returns_null() {
  const key = mockHelper(null);
  delete require.cache[require.resolve(hookPath)];
  const { run } = require(hookPath);
  const result = await run(JSON.stringify({ session_id: "s1", cwd: "/tmp" }));
  cleanup(key);
  if (result !== null) {
    throw new Error(`Expected null, got ${JSON.stringify(result)}`);
  }
  console.log("exit_0_silent_when_helper_returns_null: pass");
}

(async () => {
  await plain_text_stdout_when_helper_returns_prompt();
  await exit_0_silent_when_helper_returns_null();
  console.log("All tests passed.");
})();
