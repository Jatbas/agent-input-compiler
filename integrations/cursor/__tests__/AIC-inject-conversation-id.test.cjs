// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const hookPath = path.join(
  repoRoot,
  "integrations",
  "cursor",
  "hooks",
  "AIC-inject-conversation-id.cjs",
);

function runHook(stdinStr) {
  const env = { ...process.env };
  const result = spawnSync("node", [hookPath], {
    input: stdinStr,
    encoding: "utf8",
    env,
  });
  return result.stdout.trim();
}

function inject_modelId_when_model_present() {
  const stdin = JSON.stringify({
    tool_name: "aic_compile",
    tool_input: {
      intent: "test intent",
      projectRoot: "/some/project",
    },
    conversation_id: "conv-abc",
    model: "claude-sonnet-4",
  });
  const stdout = runHook(stdin);
  const out = JSON.parse(stdout);
  if (out.permission !== "allow") {
    throw new Error(`Expected permission "allow", got ${out.permission}`);
  }
  if (!out.updated_input || out.updated_input.modelId !== "claude-sonnet-4") {
    throw new Error(
      `Expected updated_input.modelId "claude-sonnet-4", got ${JSON.stringify(out.updated_input?.modelId)}`,
    );
  }
  console.log("inject_modelId_when_model_present: pass");
}

function inject_allow_when_no_conversation_but_model() {
  const stdin = JSON.stringify({
    tool_name: "aic_compile",
    tool_input: {
      intent: "test intent",
      projectRoot: "/some/project",
    },
    model: "cursor-model-1",
  });
  const stdout = runHook(stdin);
  const out = JSON.parse(stdout);
  if (out.permission !== "allow") {
    throw new Error(`Expected permission "allow", got ${out.permission}`);
  }
  if (!out.updated_input) {
    throw new Error("Expected updated_input when model is present");
  }
  if (out.updated_input.modelId !== "cursor-model-1") {
    throw new Error(
      `Expected updated_input.modelId "cursor-model-1", got ${JSON.stringify(out.updated_input.modelId)}`,
    );
  }
  if (out.updated_input.editorId !== "cursor") {
    throw new Error(
      `Expected updated_input.editorId "cursor", got ${JSON.stringify(out.updated_input.editorId)}`,
    );
  }
  console.log("inject_allow_when_no_conversation_but_model: pass");
}

function inject_replaces_weak_intent_with_prewarm_prompt() {
  const prewarmPath = path.join(os.tmpdir(), "aic-prompt-gen-inject-test");
  fs.writeFileSync(prewarmPath, "fix auth module for oauth", "utf8");
  try {
    const stdin = JSON.stringify({
      generation_id: "gen-inject-test",
      tool_name: "aic_compile",
      tool_input: {
        intent: "general context compilation",
        projectRoot: "/tmp/x",
      },
    });
    const stdout = runHook(stdin);
    const out = JSON.parse(stdout);
    if (out.updated_input?.intent !== "fix auth module for oauth") {
      throw new Error(
        `Expected updated intent from prewarm, got ${JSON.stringify(out.updated_input?.intent)}`,
      );
    }
    console.log("inject_replaces_weak_intent_with_prewarm_prompt: pass");
  } finally {
    try {
      fs.unlinkSync(prewarmPath);
    } catch {
      /* ignore */
    }
  }
}

function inject_strips_ide_selection_from_prewarm() {
  const prewarmPath = path.join(os.tmpdir(), "aic-prompt-gen-ide-strip");
  fs.writeFileSync(
    prewarmPath,
    "<ide_selection>noise</ide_selection>visible intent text",
    "utf8",
  );
  try {
    const stdin = JSON.stringify({
      generation_id: "gen-ide-strip",
      tool_name: "aic_compile",
      tool_input: {
        intent: "general context compilation",
        projectRoot: "/tmp/x",
      },
    });
    const stdout = runHook(stdin);
    const out = JSON.parse(stdout);
    if (out.updated_input?.intent !== "visible intent text") {
      throw new Error(
        `Expected stripped prewarm intent, got ${JSON.stringify(out.updated_input?.intent)}`,
      );
    }
    console.log("inject_strips_ide_selection_from_prewarm: pass");
  } finally {
    try {
      fs.unlinkSync(prewarmPath);
    } catch {
      /* ignore */
    }
  }
}

function inject_skips_when_prewarm_missing() {
  const stdin = JSON.stringify({
    conversation_id: "conv-skip-prewarm",
    generation_id: "gen-no-file-xyz",
    tool_name: "aic_compile",
    tool_input: {
      intent: "general context compilation",
      projectRoot: "/tmp/x",
    },
  });
  const stdout = runHook(stdin);
  const out = JSON.parse(stdout);
  if (!out.updated_input) {
    throw new Error("Expected updated_input when conversation_id is injected");
  }
  if (out.updated_input.conversationId !== "conv-skip-prewarm") {
    throw new Error(
      `Expected conversationId conv-skip-prewarm, got ${JSON.stringify(out.updated_input.conversationId)}`,
    );
  }
  if (out.updated_input.intent !== "general context compilation") {
    throw new Error(
      `Expected default intent unchanged, got ${JSON.stringify(out.updated_input.intent)}`,
    );
  }
  console.log("inject_skips_when_prewarm_missing: pass");
}

function inject_normalizes_default_to_auto() {
  const stdin = JSON.stringify({
    tool_name: "aic_compile",
    tool_input: {
      intent: "test intent",
      projectRoot: "/some/project",
    },
    conversation_id: "conv-abc",
    model: "default",
  });
  const stdout = runHook(stdin);
  const out = JSON.parse(stdout);
  if (out.permission !== "allow") {
    throw new Error(`Expected permission "allow", got ${out.permission}`);
  }
  if (!out.updated_input || out.updated_input.modelId !== "auto") {
    throw new Error(
      `Expected updated_input.modelId "auto", got ${JSON.stringify(out.updated_input?.modelId)}`,
    );
  }
  console.log("inject_normalizes_default_to_auto: pass");
}

inject_modelId_when_model_present();
inject_allow_when_no_conversation_but_model();
inject_replaces_weak_intent_with_prewarm_prompt();
inject_strips_ide_selection_from_prewarm();
inject_skips_when_prewarm_missing();
inject_normalizes_default_to_auto();
console.log("All tests passed.");
