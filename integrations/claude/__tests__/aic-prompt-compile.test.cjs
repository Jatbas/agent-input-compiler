// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("path");
const fs = require("fs");
const cp = require("child_process");

const hooksDir = path.join(__dirname, "..", "hooks");
const hookPath = path.join(hooksDir, "aic-prompt-compile.cjs");
const helperPath = path.join(hooksDir, "aic-compile-helper.cjs");

function plain_text_stdout_when_helper_returns_prompt() {
  const resolvedHelper = require.resolve("./aic-compile-helper.cjs", {
    paths: [hooksDir],
  });
  require.cache[resolvedHelper] = {
    exports: { callAicCompile: () => "compiled text" },
    loaded: true,
    id: resolvedHelper,
  };
  const { run } = require(hookPath);
  const stdout = run(
    JSON.stringify({ input: { prompt: "x", session_id: "s1", cwd: "/tmp" } }),
  );
  delete require.cache[resolvedHelper];
  delete require.cache[require.resolve(hookPath)];
  if (stdout !== "compiled text") {
    throw new Error(`Expected "compiled text", got ${JSON.stringify(stdout)}`);
  }
  console.log("plain_text_stdout_when_helper_returns_prompt: pass");
}

function exit_0_silent_when_helper_returns_null() {
  const resolvedHelper = require.resolve("./aic-compile-helper.cjs", {
    paths: [hooksDir],
  });
  require.cache[resolvedHelper] = {
    exports: { callAicCompile: () => null },
    loaded: true,
    id: resolvedHelper,
  };
  const { run } = require(hookPath);
  const stdout = run(JSON.stringify({ input: { prompt: "x", cwd: "/tmp" } }));
  delete require.cache[resolvedHelper];
  delete require.cache[require.resolve(hookPath)];
  if (stdout !== null) {
    throw new Error(`Expected null, got ${JSON.stringify(stdout)}`);
  }
  console.log("exit_0_silent_when_helper_returns_null: pass");
}

function dual_path_prepends_invariants_when_marker_missing() {
  const os = require("os");
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
    const resolvedHelper = require.resolve("./aic-compile-helper.cjs", {
      paths: [hooksDir],
    });
    require.cache[resolvedHelper] = {
      exports: { callAicCompile: () => "prompt part" },
      loaded: true,
      id: resolvedHelper,
    };
    const { run } = require(hookPath);
    const stdin = JSON.stringify({
      input: { prompt: "x", session_id: "other-session", cwd: tmpDir },
    });
    const stdout = run(stdin);
    delete require.cache[resolvedHelper];
    delete require.cache[require.resolve(hookPath)];
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

plain_text_stdout_when_helper_returns_prompt();
exit_0_silent_when_helper_returns_null();
dual_path_prepends_invariants_when_marker_missing();
console.log("All tests passed.");
