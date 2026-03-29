// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const crypto = require("crypto");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const hookPath = path.join(
  repoRoot,
  "integrations",
  "cursor",
  "hooks",
  "AIC-require-aic-compile.cjs",
);

function getPromptFile(generationId) {
  return path.join(os.tmpdir(), `aic-prompt-${generationId}`);
}

function getGateFile(generationId) {
  return path.join(os.tmpdir(), `aic-gate-${generationId}`);
}

function getDenyMarker(generationId) {
  return path.join(os.tmpdir(), `aic-deny-${generationId}`);
}

function cleanupGeneration(generationId) {
  for (const f of [
    getGateFile(generationId),
    getDenyMarker(generationId),
    getPromptFile(generationId),
  ]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* ignore */
    }
  }
}

// Isolate from the real repo aic.config.json by pointing CURSOR_PROJECT_DIR at a temp dir.
const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-gate-empty-"));

function runHook(stdinStr, projectDir) {
  const dir = projectDir ?? emptyDir;
  const env = { ...process.env, CURSOR_PROJECT_DIR: dir };
  const result = spawnSync("node", [hookPath], {
    input: stdinStr,
    encoding: "utf8",
    env,
  });
  return result.stdout.trim();
}

function deny_message_intent_stripped_when_saved_prompt_has_ide_selection() {
  const generationId = crypto.randomBytes(8).toString("hex");
  const promptPath = getPromptFile(generationId);
  const promptContent = "hello <ide_selection>V8</ide_selection> world";
  fs.writeFileSync(promptPath, promptContent, "utf8");
  try {
    const stdin = JSON.stringify({
      generation_id: generationId,
      tool_name: "other_tool",
      tool_input: {},
    });
    const stdout = runHook(stdin);
    const out = JSON.parse(stdout);
    if (out.permission !== "deny") {
      throw new Error(`Expected permission "deny", got ${out.permission}`);
    }
    const userMessage = out.user_message || "";
    if (userMessage.includes("<ide_selection>")) {
      throw new Error(
        `user_message must not contain "<ide_selection>", got: ${userMessage.slice(0, 150)}`,
      );
    }
    if (!userMessage.includes("hello")) {
      throw new Error(
        `user_message must contain "hello", got: ${userMessage.slice(0, 150)}`,
      );
    }
    if (!userMessage.includes("world")) {
      throw new Error(
        `user_message must contain "world", got: ${userMessage.slice(0, 150)}`,
      );
    }
    console.log("deny_message_intent_stripped_when_saved_prompt_has_ide_selection: pass");
  } finally {
    try {
      fs.unlinkSync(promptPath);
    } catch {
      // ignore
    }
  }
}

function hook_dev_mode_true_allows() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-devmode-test-"));
  fs.writeFileSync(
    path.join(tmpDir, "aic.config.json"),
    JSON.stringify({ devMode: true }),
    "utf8",
  );
  const result = spawnSync("node", [hookPath], {
    input: JSON.stringify({
      generation_id: "test-gen",
      tool_name: "other_tool",
      tool_input: {},
    }),
    encoding: "utf8",
    env: { ...process.env, CURSOR_PROJECT_DIR: tmpDir },
  });
  const out = JSON.parse(result.stdout.trim());
  if (out.permission !== "allow") {
    throw new Error(
      `Expected "allow" when aic.config.json has devMode true, got ${out.permission}`,
    );
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log("hook_dev_mode_true_allows: pass");
}

function hook_dev_mode_false_or_absent_denies() {
  const forFalse = fs.mkdtempSync(path.join(os.tmpdir(), "aic-devmode-test-"));
  fs.writeFileSync(
    path.join(forFalse, "aic.config.json"),
    JSON.stringify({ devMode: false }),
    "utf8",
  );
  const genFalse = crypto.randomBytes(8).toString("hex");
  const outFalse = JSON.parse(
    runHook(
      JSON.stringify({
        generation_id: genFalse,
        tool_name: "other_tool",
        tool_input: {},
      }),
      forFalse,
    ),
  );
  if (outFalse.permission !== "deny") {
    throw new Error(`Expected "deny" when devMode false, got ${outFalse.permission}`);
  }
  cleanupGeneration(genFalse);
  fs.rmSync(forFalse, { recursive: true, force: true });

  const forAbsent = fs.mkdtempSync(path.join(os.tmpdir(), "aic-devmode-test-"));
  fs.writeFileSync(
    path.join(forAbsent, "aic.config.json"),
    JSON.stringify({ contextBudget: { maxTokens: 8000 } }),
    "utf8",
  );
  const genAbsent = crypto.randomBytes(8).toString("hex");
  const outAbsent = JSON.parse(
    runHook(
      JSON.stringify({
        generation_id: genAbsent,
        tool_name: "other_tool",
        tool_input: {},
      }),
      forAbsent,
    ),
  );
  if (outAbsent.permission !== "deny") {
    throw new Error(`Expected "deny" when devMode omitted, got ${outAbsent.permission}`);
  }
  cleanupGeneration(genAbsent);
  fs.rmSync(forAbsent, { recursive: true, force: true });
  console.log("hook_dev_mode_false_or_absent_denies: pass");
}

function hook_missing_aic_config_denies() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-devmode-test-"));
  const generationId = crypto.randomBytes(8).toString("hex");
  try {
    const out = JSON.parse(
      runHook(
        JSON.stringify({
          generation_id: generationId,
          tool_name: "other_tool",
          tool_input: {},
        }),
        tmpDir,
      ),
    );
    if (out.permission !== "deny") {
      throw new Error(`Expected "deny" without aic.config.json, got ${out.permission}`);
    }
    console.log("hook_missing_aic_config_denies: pass");
  } finally {
    cleanupGeneration(generationId);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function gate_denies_first_unknown_tool() {
  const generationId = crypto.randomBytes(8).toString("hex");
  try {
    const stdin = JSON.stringify({
      generation_id: generationId,
      tool_name: "some_other_tool",
      tool_input: {},
    });
    const out = JSON.parse(runHook(stdin));
    if (out.permission !== "deny") {
      throw new Error(`Expected "deny" on first unknown tool, got ${out.permission}`);
    }
    console.log("gate_denies_first_unknown_tool: pass");
  } finally {
    cleanupGeneration(generationId);
  }
}

function gate_allows_after_one_deny() {
  const generationId = crypto.randomBytes(8).toString("hex");
  try {
    const stdin = JSON.stringify({
      generation_id: generationId,
      tool_name: "some_other_tool",
      tool_input: {},
    });
    // First call — should deny
    const first = JSON.parse(runHook(stdin));
    if (first.permission !== "deny") {
      throw new Error(`Expected "deny" on first call, got ${first.permission}`);
    }
    // Second call with same generation — should allow (deny-once-then-allow)
    const second = JSON.parse(runHook(stdin));
    if (second.permission !== "allow") {
      throw new Error(`Expected "allow" on second call, got ${second.permission}`);
    }
    console.log("gate_allows_after_one_deny: pass");
  } finally {
    cleanupGeneration(generationId);
  }
}

function gate_allows_after_aic_compile() {
  const generationId = crypto.randomBytes(8).toString("hex");
  try {
    // Call aic_compile first
    const compileStdin = JSON.stringify({
      generation_id: generationId,
      tool_name: "mcp",
      tool_input: { toolName: "aic_compile" },
    });
    const compileOut = JSON.parse(runHook(compileStdin));
    if (compileOut.permission !== "allow") {
      throw new Error(`Expected "allow" for aic_compile, got ${compileOut.permission}`);
    }
    // Subsequent tool should be allowed via state file
    const toolStdin = JSON.stringify({
      generation_id: generationId,
      tool_name: "some_other_tool",
      tool_input: {},
    });
    const toolOut = JSON.parse(runHook(toolStdin));
    if (toolOut.permission !== "allow") {
      throw new Error(`Expected "allow" after aic_compile, got ${toolOut.permission}`);
    }
    console.log("gate_allows_after_aic_compile: pass");
  } finally {
    cleanupGeneration(generationId);
  }
}

function deny_message_uses_dynamic_project_root() {
  const generationId = crypto.randomBytes(8).toString("hex");
  const customDir = "/tmp/my-user-project";
  const env = { ...process.env, CURSOR_PROJECT_DIR: customDir };
  try {
    const result = spawnSync("node", [hookPath], {
      input: JSON.stringify({
        generation_id: generationId,
        tool_name: "other_tool",
        tool_input: {},
      }),
      encoding: "utf8",
      env,
    });
    const out = JSON.parse(result.stdout.trim());
    if (out.permission !== "deny") {
      throw new Error(`Expected "deny", got ${out.permission}`);
    }
    if (!out.user_message.includes(customDir)) {
      throw new Error(
        `Expected deny message to contain "${customDir}", got: ${out.user_message.slice(0, 200)}`,
      );
    }
    if (out.user_message.includes("/Users/jatbas/Desktop/AIC")) {
      throw new Error("Deny message still contains hardcoded path");
    }
    console.log("deny_message_uses_dynamic_project_root: pass");
  } finally {
    cleanupGeneration(generationId);
  }
}

deny_message_intent_stripped_when_saved_prompt_has_ide_selection();
hook_dev_mode_true_allows();
hook_dev_mode_false_or_absent_denies();
hook_missing_aic_config_denies();
gate_denies_first_unknown_tool();
gate_allows_after_one_deny();
gate_allows_after_aic_compile();
deny_message_uses_dynamic_project_root();
console.log("All tests passed.");
