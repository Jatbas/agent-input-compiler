// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const hooksDir = path.join(__dirname, "..", "hooks");

function readHook(name) {
  return fs.readFileSync(path.join(hooksDir, name), "utf8");
}

function subagent_compile_imports_fallback_resolver() {
  const src = readHook("AIC-subagent-compile.cjs");
  assert.ok(
    src.includes("resolveConversationIdFallback"),
    "expected resolveConversationIdFallback import",
  );
  console.log("subagent_compile_imports_fallback_resolver: pass");
}

function subagent_compile_parent_id_before_fallback_call() {
  const src = readHook("AIC-subagent-compile.cjs");
  const parentIdx = src.indexOf("parent_conversation_id");
  const fallbackCallIdx = src.indexOf("resolveConversationIdFallback(hookInput)");
  assert.ok(
    parentIdx !== -1 && fallbackCallIdx !== -1,
    "expected parent and fallback call",
  );
  assert.ok(
    parentIdx < fallbackCallIdx,
    "parent check should precede fallback invocation",
  );
  console.log("subagent_compile_parent_id_before_fallback_call: pass");
}

function subagent_compile_sets_compile_args_conversation_id_conditionally() {
  const src = readHook("AIC-subagent-compile.cjs");
  assert.ok(
    src.includes("if (conversationId) compileArgs.conversationId"),
    "expected compileArgs.conversationId guarded by conversationId",
  );
  console.log("subagent_compile_sets_compile_args_conversation_id_conditionally: pass");
}

function subagent_compile_imports_write_compile_recency() {
  const src = readHook("AIC-subagent-compile.cjs");
  assert.ok(
    src.includes("writeCompileRecency"),
    "expected writeCompileRecency import and call",
  );
  assert.ok(
    src.includes("compile-recency.cjs"),
    "expected require of compile-recency.cjs",
  );
  console.log("subagent_compile_imports_write_compile_recency: pass");
}

function subagent_compile_calls_write_compile_recency_after_exec() {
  const src = readHook("AIC-subagent-compile.cjs");
  const execIdx = src.indexOf("execSync(serverCmd");
  const recencyIdx = src.indexOf("writeCompileRecency(projectRoot)");
  assert.ok(
    execIdx !== -1 && recencyIdx !== -1,
    "expected execSync and writeCompileRecency",
  );
  assert.ok(recencyIdx > execIdx, "writeCompileRecency should follow execSync block");
  console.log("subagent_compile_calls_write_compile_recency_after_exec: pass");
}

subagent_compile_imports_fallback_resolver();
subagent_compile_parent_id_before_fallback_call();
subagent_compile_sets_compile_args_conversation_id_conditionally();
subagent_compile_imports_write_compile_recency();
subagent_compile_calls_write_compile_recency_after_exec();
console.log("All AIC-subagent-compile tests passed.");
