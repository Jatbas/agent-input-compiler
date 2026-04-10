// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

"use strict";

const path = require("node:path");
const assert = require("node:assert");

const hooksDir = path.join(__dirname, "..", "hooks");
const pluginPromptPath = path.join(
  __dirname,
  "..",
  "plugin",
  "scripts",
  "aic-prompt-compile.cjs",
);

async function plugin_path_forwards_model_to_callAicCompile_sixth_param() {
  const resolvedHelper = require.resolve("./aic-compile-helper.cjs", {
    paths: [hooksDir],
  });
  let capturedArgs;
  require.cache[resolvedHelper] = {
    exports: {
      callAicCompile: (...args) => {
        capturedArgs = args;
        return Promise.resolve("ok");
      },
    },
    loaded: true,
    id: resolvedHelper,
  };
  delete require.cache[require.resolve(pluginPromptPath)];
  const { run } = require(pluginPromptPath);
  await run(
    JSON.stringify({
      prompt: "hello",
      cwd: "/tmp",
      model: "  claude-opus-4  ",
    }),
  );
  delete require.cache[resolvedHelper];
  delete require.cache[require.resolve(pluginPromptPath)];
  assert.ok(Array.isArray(capturedArgs));
  assert.strictEqual(capturedArgs.length, 7);
  assert.strictEqual(capturedArgs[5], "claude-opus-4");
  assert.strictEqual(capturedArgs[6], "claude-code");
  console.log("plugin_path_forwards_model_to_callAicCompile_sixth_param: pass");
}

(async () => {
  await plugin_path_forwards_model_to_callAicCompile_sixth_param();
  console.log("All tests passed.");
})();
