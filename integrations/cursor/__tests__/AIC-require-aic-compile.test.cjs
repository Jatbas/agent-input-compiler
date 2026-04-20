// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, spawnSync } = require("child_process");
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

function getRecencyFile(projectRoot) {
  const hash = crypto.createHash("md5").update(projectRoot).digest("hex").slice(0, 12);
  return path.join(os.tmpdir(), `aic-gate-recent-${hash}`);
}

function cleanupGeneration(generationId) {
  for (const f of [getGateFile(generationId), getPromptFile(generationId)]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* ignore */
    }
  }
}

function cleanupRecency(projectRoot) {
  try {
    fs.unlinkSync(getRecencyFile(projectRoot));
  } catch {
    /* ignore */
  }
}

function hookPayload(obj) {
  return JSON.stringify({ cursor_version: "1", ...obj });
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
    const stdin = hookPayload({
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

function hook_emergency_bypass_allows() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-devmode-test-"));
  fs.writeFileSync(
    path.join(tmpDir, "aic.config.json"),
    JSON.stringify({ devMode: true, skipCompileGate: true }),
    "utf8",
  );
  const result = spawnSync("node", [hookPath], {
    input: hookPayload({
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
      `Expected "allow" with emergency bypass (devMode+skipCompileGate), got ${out.permission}`,
    );
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log("hook_emergency_bypass_allows: pass");
}

function hook_dev_mode_alone_denies() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-devmode-test-"));
  fs.writeFileSync(
    path.join(tmpDir, "aic.config.json"),
    JSON.stringify({ devMode: true }),
    "utf8",
  );
  const generationId = crypto.randomBytes(8).toString("hex");
  const result = spawnSync("node", [hookPath], {
    input: hookPayload({
      generation_id: generationId,
      tool_name: "other_tool",
      tool_input: {},
    }),
    encoding: "utf8",
    env: { ...process.env, CURSOR_PROJECT_DIR: tmpDir },
  });
  const out = JSON.parse(result.stdout.trim());
  if (out.permission !== "deny") {
    throw new Error(
      `Expected "deny" with devMode alone (no skipCompileGate), got ${out.permission}`,
    );
  }
  cleanupGeneration(generationId);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log("hook_dev_mode_alone_denies: pass");
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
      hookPayload({
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
      hookPayload({
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
        hookPayload({
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
    const stdin = hookPayload({
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

function gate_keeps_denying_without_compile() {
  const generationId = crypto.randomBytes(8).toString("hex");
  try {
    const stdin = hookPayload({
      generation_id: generationId,
      tool_name: "some_other_tool",
      tool_input: {},
    });
    const first = JSON.parse(runHook(stdin));
    if (first.permission !== "deny") {
      throw new Error(`Expected "deny" on first call, got ${first.permission}`);
    }
    const second = JSON.parse(runHook(stdin));
    if (second.permission !== "deny") {
      throw new Error(
        `Expected "deny" on second call (no escape), got ${second.permission}`,
      );
    }
    console.log("gate_keeps_denying_without_compile: pass");
  } finally {
    cleanupGeneration(generationId);
  }
}

function gate_allows_after_aic_compile() {
  const generationId = crypto.randomBytes(8).toString("hex");
  try {
    // Call aic_compile first
    const compileStdin = hookPayload({
      generation_id: generationId,
      tool_name: "mcp",
      tool_input: { toolName: "aic_compile" },
    });
    const compileOut = JSON.parse(runHook(compileStdin));
    if (compileOut.permission !== "allow") {
      throw new Error(`Expected "allow" for aic_compile, got ${compileOut.permission}`);
    }
    // Subsequent tool should be allowed via state file
    const toolStdin = hookPayload({
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
      input: hookPayload({
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

function gate_allows_with_recent_compile() {
  const generationId = crypto.randomBytes(8).toString("hex");
  const recencyFile = getRecencyFile(emptyDir);
  fs.writeFileSync(recencyFile, String(Date.now()));
  try {
    const stdin = hookPayload({
      generation_id: generationId,
      tool_name: "some_other_tool",
      tool_input: {},
    });
    const out = JSON.parse(runHook(stdin));
    if (out.permission !== "allow") {
      throw new Error(`Expected "allow" with recent compile, got ${out.permission}`);
    }
    console.log("gate_allows_with_recent_compile: pass");
  } finally {
    cleanupGeneration(generationId);
    cleanupRecency(emptyDir);
  }
}

function gate_denies_with_stale_recency() {
  const generationId = crypto.randomBytes(8).toString("hex");
  const recencyFile = getRecencyFile(emptyDir);
  fs.writeFileSync(recencyFile, String(Date.now() - 400_000));
  try {
    const stdin = hookPayload({
      generation_id: generationId,
      tool_name: "some_other_tool",
      tool_input: {},
    });
    const out = JSON.parse(runHook(stdin));
    if (out.permission !== "deny") {
      throw new Error(`Expected "deny" with stale recency, got ${out.permission}`);
    }
    console.log("gate_denies_with_stale_recency: pass");
  } finally {
    cleanupGeneration(generationId);
    cleanupRecency(emptyDir);
  }
}

function gate_denies_indefinitely_without_compile() {
  const generationId = crypto.randomBytes(8).toString("hex");
  cleanupRecency(emptyDir);
  try {
    const stdin = hookPayload({
      generation_id: generationId,
      tool_name: "some_other_tool",
      tool_input: {},
    });
    for (let i = 1; i <= 5; i++) {
      const r = JSON.parse(runHook(stdin));
      if (r.permission !== "deny") {
        throw new Error(
          `Call ${i}: expected deny (no 3-strike bypass), got ${r.permission}`,
        );
      }
    }
    console.log("gate_denies_indefinitely_without_compile: pass");
  } finally {
    cleanupGeneration(generationId);
  }
}

function gate_allows_when_sibling_compile_writes_during_poll() {
  const generationId = crypto.randomBytes(8).toString("hex");
  cleanupRecency(emptyDir);
  try {
    const child = spawn("node", [hookPath], {
      stdio: ["pipe", "pipe", "inherit"],
      env: { ...process.env, CURSOR_PROJECT_DIR: emptyDir },
    });
    let stdout = "";
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stdin.write(
      hookPayload({
        generation_id: generationId,
        tool_name: "some_other_tool",
        tool_input: {},
      }),
    );
    child.stdin.end();
    setTimeout(() => {
      fs.writeFileSync(getGateFile(generationId), "1");
    }, 60);
    return new Promise((resolve, reject) => {
      child.on("close", () => {
        try {
          const out = JSON.parse(stdout.trim());
          if (out.permission !== "allow") {
            throw new Error(
              `Expected "allow" when sibling writes state mid-poll, got ${out.permission}`,
            );
          }
          console.log("gate_allows_when_sibling_compile_writes_during_poll: pass");
          resolve();
        } catch (e) {
          reject(e);
        } finally {
          cleanupGeneration(generationId);
        }
      });
    });
  } catch (e) {
    cleanupGeneration(generationId);
    throw e;
  }
}

function gate_denies_after_poll_timeout_without_sibling() {
  const generationId = crypto.randomBytes(8).toString("hex");
  cleanupRecency(emptyDir);
  try {
    const start = Date.now();
    const stdin = hookPayload({
      generation_id: generationId,
      tool_name: "some_other_tool",
      tool_input: {},
    });
    const out = JSON.parse(runHook(stdin));
    const elapsed = Date.now() - start;
    if (out.permission !== "deny") {
      throw new Error(`Expected "deny" after poll timeout, got ${out.permission}`);
    }
    if (elapsed < 400) {
      throw new Error(`Expected poll to delay deny ≥ 400ms, only took ${elapsed}ms`);
    }
    console.log(`gate_denies_after_poll_timeout_without_sibling: pass (${elapsed}ms)`);
  } finally {
    cleanupGeneration(generationId);
  }
}

function aic_compile_allows_subsequent_without_counter() {
  const generationId = crypto.randomBytes(8).toString("hex");
  cleanupRecency(emptyDir);
  try {
    const toolStdin = hookPayload({
      generation_id: generationId,
      tool_name: "some_other_tool",
      tool_input: {},
    });
    const r1 = JSON.parse(runHook(toolStdin));
    if (r1.permission !== "deny")
      throw new Error(`Pre-compile: expected deny, got ${r1.permission}`);

    const compileStdin = hookPayload({
      generation_id: generationId,
      tool_name: "mcp",
      tool_input: { toolName: "aic_compile" },
    });
    const rc = JSON.parse(runHook(compileStdin));
    if (rc.permission !== "allow")
      throw new Error(`Compile: expected allow, got ${rc.permission}`);

    const r2 = JSON.parse(runHook(toolStdin));
    if (r2.permission !== "allow")
      throw new Error(
        `Post-compile same gen: expected allow via state file, got ${r2.permission}`,
      );

    cleanupRecency(emptyDir);
    const newGenId = crypto.randomBytes(8).toString("hex");
    const toolStdin2 = hookPayload({
      generation_id: newGenId,
      tool_name: "some_other_tool",
      tool_input: {},
    });
    const r3 = JSON.parse(runHook(toolStdin2));
    if (r3.permission !== "deny")
      throw new Error(`New gen with stale recency: expected deny, got ${r3.permission}`);
    console.log("aic_compile_allows_subsequent_without_counter: pass");
  } finally {
    cleanupGeneration(generationId);
    cleanupRecency(emptyDir);
  }
}

function cleanup_removes_stale_gate_files() {
  const marker = path.join(os.tmpdir(), "aic-gate-cleanup-marker");
  try {
    fs.unlinkSync(marker);
  } catch {
    /* ignore */
  }

  const staleId = "cleanup-test-stale-" + crypto.randomBytes(4).toString("hex");
  const freshId = "cleanup-test-fresh-" + crypto.randomBytes(4).toString("hex");
  const staleGate = path.join(os.tmpdir(), `aic-gate-${staleId}`);
  const staleDeny = path.join(os.tmpdir(), `aic-gate-deny-${staleId}`);
  const stalePrompt = path.join(os.tmpdir(), `aic-prompt-${staleId}`);
  const freshGate = path.join(os.tmpdir(), `aic-gate-${freshId}`);

  fs.writeFileSync(staleGate, "1");
  fs.writeFileSync(staleDeny, "2");
  fs.writeFileSync(stalePrompt, "test prompt");
  fs.writeFileSync(freshGate, "1");

  const past = Date.now() / 1000 - 700;
  fs.utimesSync(staleGate, past, past);
  fs.utimesSync(staleDeny, past, past);
  fs.utimesSync(stalePrompt, past, past);

  try {
    const stdin = hookPayload({
      generation_id: crypto.randomBytes(8).toString("hex"),
      tool_name: "mcp",
      tool_input: { toolName: "aic_compile" },
    });
    runHook(stdin);

    if (fs.existsSync(staleGate)) throw new Error("Stale gate file not cleaned");
    if (fs.existsSync(staleDeny)) throw new Error("Stale deny file not cleaned");
    if (fs.existsSync(stalePrompt)) throw new Error("Stale prompt file not cleaned");
    if (!fs.existsSync(freshGate))
      throw new Error("Fresh gate file was incorrectly cleaned");
    console.log("cleanup_removes_stale_gate_files: pass");
  } finally {
    for (const f of [staleGate, staleDeny, stalePrompt, freshGate, marker]) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
  }
}

async function runAll() {
  deny_message_intent_stripped_when_saved_prompt_has_ide_selection();
  hook_emergency_bypass_allows();
  hook_dev_mode_alone_denies();
  hook_dev_mode_false_or_absent_denies();
  hook_missing_aic_config_denies();
  gate_denies_first_unknown_tool();
  gate_keeps_denying_without_compile();
  gate_allows_after_aic_compile();
  deny_message_uses_dynamic_project_root();
  gate_allows_with_recent_compile();
  gate_denies_with_stale_recency();
  gate_denies_indefinitely_without_compile();
  gate_denies_after_poll_timeout_without_sibling();
  await gate_allows_when_sibling_compile_writes_during_poll();
  aic_compile_allows_subsequent_without_counter();
  cleanup_removes_stale_gate_files();
}

function cursor_require_compile_allows_when_no_cursor_version() {
  const result = spawnSync("node", [hookPath], {
    input: JSON.stringify({
      generation_id: "gen-no-cv",
      tool_name: "other_tool",
      tool_input: {},
    }),
    encoding: "utf8",
    env: { ...process.env, CURSOR_PROJECT_DIR: emptyDir },
  });
  const out = JSON.parse(result.stdout.trim());
  if (out.permission !== "allow") {
    throw new Error(
      `Expected permission "allow" for non-Cursor payload, got ${out.permission}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(`Expected exit 0, got ${result.status}`);
  }
  console.log("cursor_require_compile_allows_when_no_cursor_version: pass");
}

runAll()
  .then(() => {
    cursor_require_compile_allows_when_no_cursor_version();
    console.log("All tests passed.");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
