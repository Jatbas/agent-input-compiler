# Task 187: Claude Code Hook Bug Fixes

> **Status:** Pending
> **Phase:** Integration
> **Layer:** cross-layer (integrations/claude + documentation)
> **Depends on:** None — all modified files exist

## Goal

Fix three bugs in the Claude Code hook scripts (triple SessionStart firing, generic subagent intent, null conversation_id) and correct stale session_id-to-conversationId documentation in both the Claude Code and Cursor integration layer docs.

## Architecture Notes

- **conversationId derivation:** All hooks derive `conversationId` from `transcript_path` (a common field on every Claude Code hook event) via `path.basename(transcriptPath, ".jsonl")`. The UUID in the transcript filename uniquely identifies the conversation and is stable across all hooks in the same chat. This replaces the broken `conversation_id` field (always null in Claude Code hook payloads) and eliminates the file-based `.current-conversation-id` persistence mechanism entirely.
- **Lock mechanism (Bug 1):** `fs.openSync(lockPath, "wx")` provides atomic exclusive creation. On EEXIST, the hook checks `.session-context-injected` marker content: non-empty content means a prior instance already completed (stale lock), so the current invocation returns null. Empty or missing marker means a concurrent instance is running — also return null. Lock deleted in `finally` block. No `Date.now()` used.
- **Prompt intent (Bug 2):** SubagentStart hook reads `parsed.prompt ?? parsed.input?.prompt ?? null` and uses it as intent when present (with `<ide_selection>` tags stripped). Falls back to generic `"provide context for <agentType> subagent"` when absent. Claude Code docs do not list `prompt` in SubagentStart payload, but null-coalescing makes the code safe regardless and forward-proofed.
- **Pre-compact bug (discovered in exploration):** `aic-pre-compact.cjs` currently passes `sessionId` (the per-invocation session_id) as the third argument to `callAicCompile`, which is the `conversationId` parameter. This causes wrong attribution. Replaced with transcript_path-derived conversationId.
- **convFile removal:** The `.aic/.current-conversation-id` file-based mechanism is removed from all hooks and session-end cleanup. It was never written (gated on null conversationId) and transcript_path makes it unnecessary.
- **Plugin mirror sync:** All 4 plugin mirrors updated to match their hook counterparts. Plugin `aic-prompt-compile.cjs` additionally gains the `<ide_selection>` strip that was missing.
- **Cursor docs (doc-only):** The Cursor hook code already correctly uses `conversation_id` (not `session_id`), but the documentation has 5 stale references to `session_id`. No code changes needed for Cursor.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `integrations/claude/hooks/aic-session-start.cjs` (add lock + transcript_path conversationId) |
| Modify | `integrations/claude/hooks/aic-subagent-inject.cjs` (prompt intent + transcript_path + remove convFile) |
| Modify | `integrations/claude/hooks/aic-prompt-compile.cjs` (transcript_path + remove convFile) |
| Modify | `integrations/claude/hooks/aic-pre-compact.cjs` (transcript_path instead of sessionId) |
| Modify | `integrations/claude/hooks/aic-inject-conversation-id.cjs` (transcript_path + remove convFile) |
| Modify | `integrations/claude/hooks/aic-session-end.cjs` (remove convFile unlink) |
| Modify | `integrations/claude/plugin/scripts/aic-session-start.cjs` (mirror hooks version) |
| Modify | `integrations/claude/plugin/scripts/aic-subagent-inject.cjs` (mirror hooks version) |
| Modify | `integrations/claude/plugin/scripts/aic-prompt-compile.cjs` (mirror hooks version + add ide_selection strip) |
| Modify | `integrations/claude/plugin/scripts/aic-pre-compact.cjs` (mirror hooks version) |
| Modify | `integrations/claude/__tests__/aic-session-start.test.cjs` (add lock + transcript_path tests) |
| Modify | `integrations/claude/__tests__/aic-subagent-inject.test.cjs` (replace convFile tests with transcript_path + prompt intent tests) |
| Modify | `integrations/claude/__tests__/aic-prompt-compile.test.cjs` (add transcript_path tests) |
| Modify | `integrations/claude/__tests__/aic-pre-compact.test.cjs` (add transcript_path test) |
| Modify | `documentation/claude-code-integration-layer.md` (replace session_id-to-conversationId with transcript_path) |
| Modify | `documentation/cursor-integration-layer.md` (fix 5 stale session_id references in docs) |

## Interface / Signature

These are CJS scripts, not TypeScript classes. Each hook exports a `run(stdinStr)` function. The helper signature:

```javascript
// Source: integrations/claude/hooks/aic-compile-helper.cjs
// callAicCompile(intent, projectRoot, conversationId, timeoutMs) → Promise<string|null>
```

The conversationId extraction pattern used across all hooks:

```javascript
const transcriptPath = parsed.transcript_path ?? parsed.input?.transcript_path ?? null;
const conversationId = transcriptPath ? path.basename(transcriptPath, ".jsonl") : null;
```

## Dependent Types

Not applicable — CJS scripts with plain JSON parsing, no TypeScript types.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change. CJS files in `integrations/claude/` are not governed by the shared ESLint config.

## Steps

### Step 1: Modify `integrations/claude/hooks/aic-session-start.cjs`

Replace the `conversationId` derivation line and add the lock mechanism. The `run()` function body becomes:

```javascript
async function run(stdinStr) {
  let parsed;
  try {
    parsed = JSON.parse(stdinStr);
  } catch {
    parsed = {};
  }
  const sessionId =
    parsed.session_id != null ? parsed.session_id : (parsed.input?.session_id ?? null);
  const transcriptPath = parsed.transcript_path ?? parsed.input?.transcript_path ?? null;
  const conversationId = transcriptPath ? path.basename(transcriptPath, ".jsonl") : null;
  const cwdRaw = parsed.cwd ?? parsed.input?.cwd ?? "";
  const projectRoot = cwdRaw.trim()
    ? cwdRaw.trim()
    : process.env.CLAUDE_PROJECT_DIR || process.cwd();

  const aicDir = path.join(projectRoot, ".aic");
  const markerPath = path.join(projectRoot, ".aic", ".session-context-injected");
  const lockPath = path.join(aicDir, ".session-start-lock");

  fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });

  // Atomic lock — prevent concurrent SessionStart invocations
  let lockFd;
  try {
    lockFd = fs.openSync(lockPath, "wx");
    fs.closeSync(lockFd);
  } catch {
    // Lock exists — check if a prior run already succeeded
    const markerContent = fs.existsSync(markerPath)
      ? fs.readFileSync(markerPath, "utf8").trim()
      : "";
    if (markerContent.length > 0) {
      try { fs.unlinkSync(lockPath); } catch { /* stale lock cleanup */ }
    }
    return null;
  }

  try {
    const text = await callAicCompile(
      "understand project structure, architecture, and recent changes",
      projectRoot,
      conversationId,
      30000,
    );
    if (text == null) return null;
    fs.writeFileSync(markerPath, sessionId ?? "", "utf8");
    return {
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: text,
      },
    };
  } catch {
    return null;
  } finally {
    try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
  }
}
```

Changes from current code:
1. Replace `const conversationId = parsed.conversation_id ?? parsed.input?.conversation_id ?? null;` with transcript_path extraction (2 lines).
2. Add `const lockPath` declaration after `markerPath`.
3. Add the lock-acquire block between `mkdirSync` and `callAicCompile`.
4. Wrap the existing try/catch in a new try/finally that deletes the lock.

**Verify:** `node integrations/claude/__tests__/aic-session-start.test.cjs` passes (existing tests still work with the new code).

### Step 2: Modify `integrations/claude/hooks/aic-subagent-inject.cjs`

Replace the `run()` function body. Remove the `fs` and `path` requires for convFile (keep `path` for `path.basename`). Remove all convFile logic. Add prompt-based intent. Add transcript_path conversationId:

```javascript
async function run(stdinStr) {
  let parsed;
  try {
    parsed = JSON.parse(stdinStr);
  } catch {
    parsed = {};
  }
  const agentType = parsed.agent_type ?? parsed.input?.agent_type ?? "unknown";
  const cwdRaw = parsed.cwd ?? parsed.input?.cwd ?? "";
  const projectRoot = cwdRaw.trim()
    ? cwdRaw.trim()
    : process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const transcriptPath = parsed.transcript_path ?? parsed.input?.transcript_path ?? null;
  const conversationId = transcriptPath ? path.basename(transcriptPath, ".jsonl") : null;

  const rawPrompt = parsed.prompt ?? parsed.input?.prompt ?? null;
  const intent = rawPrompt
    ? String(rawPrompt).replace(/<ide_selection>[\s\S]*?<\/ide_selection>/gi, "").trim()
    : "provide context for " + agentType + " subagent";
  const text = await callAicCompile(intent, projectRoot, conversationId, 30000);
  if (text == null) return null;
  return {
    hookSpecificOutput: {
      hookEventName: "SubagentStart",
      additionalContext: text,
    },
  };
}
```

Changes from current code:
1. Remove `const sessionId` (no longer needed).
2. Remove the entire `let conversationId = ... ` block with convFile fallback (lines 22-38).
3. Add transcript_path extraction (2 lines).
4. Add `rawPrompt` extraction and `intent` derivation with `<ide_selection>` strip.
5. Replace the old fixed `intent` string.
6. Remove `fs` from the top-level requires (no longer needed — `path` stays for `path.basename`).

**Verify:** `node integrations/claude/__tests__/aic-subagent-inject.test.cjs` — existing tests that pass will need updates (Step 12), but the structure test should still pass.

### Step 3: Modify `integrations/claude/hooks/aic-prompt-compile.cjs`

Replace the conversationId derivation and remove convFile logic. The changes are in the `run()` function:

1. Replace the `convFile` declaration and the entire convFile read/write block (current lines 37-56) with transcript_path extraction:

```javascript
  const transcriptPath = parsed.transcript_path ?? parsed.input?.transcript_path ?? null;
  const conversationId = transcriptPath ? path.basename(transcriptPath, ".jsonl") : null;
```

2. Remove the `sessionId` variable declaration (lines 26-31) — it is still needed for the marker check on line 63 (`markerContent === sessionId`), so keep it.

Wait — `sessionId` is used in the `alreadyInjected` check: `markerContent === sessionId`. This check is for the dual-path invariants injection, not for conversationId. Keep `sessionId` for this purpose.

The specific changes to the `run()` function:

Replace lines 36-55 (from `const convFile` through the convFile write block) with:

```javascript
  const transcriptPath = parsed.transcript_path ?? parsed.input?.transcript_path ?? null;
  const conversationId = transcriptPath ? path.basename(transcriptPath, ".jsonl") : null;
```

This removes:
- `const convFile = path.join(...)` declaration
- The convFile read block (lines 38-48)
- The convFile write block (lines 49-56)

Everything else in the function stays the same. The `sessionId` variable stays (used for marker check). The `invariantsBlock` construction stays (uses `conversationId`). The `callAicCompile` call stays (uses `conversationId`).

**Verify:** `node integrations/claude/__tests__/aic-prompt-compile.test.cjs` passes.

### Step 4: Modify `integrations/claude/hooks/aic-pre-compact.cjs`

Add `path` require (currently only `fs` is required). Add transcript_path extraction. Remove `sessionId`. Replace the `callAicCompile` call's third argument:

The full updated file:

```javascript
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// PreCompact hook — plain text stdout per CC §6.1, §7.7; no marker file.

const fs = require("fs");
const path = require("path");
const { callAicCompile } = require("./aic-compile-helper.cjs");

async function run(stdinStr) {
  let parsed;
  try {
    parsed = JSON.parse(stdinStr);
  } catch {
    parsed = {};
  }
  const transcriptPath = parsed.transcript_path ?? parsed.input?.transcript_path ?? null;
  const conversationId = transcriptPath ? path.basename(transcriptPath, ".jsonl") : null;
  const cwdRaw = parsed.cwd ?? parsed.input?.cwd ?? "";
  const projectRoot = cwdRaw.trim()
    ? cwdRaw.trim()
    : process.env.CLAUDE_PROJECT_DIR || process.cwd();

  const text = await callAicCompile(
    "understand project structure, architecture, and recent changes",
    projectRoot,
    conversationId,
    30000,
  );
  return text;
}

if (require.main === module) {
  const raw = fs.readFileSync(0, "utf8");
  run(raw)
    .then((out) => {
      if (out != null) process.stdout.write(out);
      process.exit(0);
    })
    .catch(() => process.exit(0));
}

module.exports = { run };
```

Changes from current code:
1. Add `const path = require("path");` after `const fs`.
2. Replace `const sessionId = ...` with transcript_path extraction (2 lines).
3. Change `callAicCompile` third argument from `sessionId` to `conversationId`.

**Verify:** `node integrations/claude/__tests__/aic-pre-compact.test.cjs` passes.

### Step 5: Modify `integrations/claude/hooks/aic-inject-conversation-id.cjs`

Replace the conversationId derivation. Remove convFile fallback. Add transcript_path extraction:

Replace lines 23-34 (from `let conversationId` through the convFile try/catch) with:

```javascript
  const transcriptPath = top.transcript_path ?? input.transcript_path ?? null;
  const conversationId = transcriptPath ? path.basename(transcriptPath, ".jsonl") : null;
```

This removes the entire convFile read block. The rest of the function stays the same — it still checks `conversationId` truthiness before injecting into `updatedInput`.

Also remove `const fs = require("fs");` from the top (line 5) since `fs` is no longer used after removing the convFile read. Keep `const path = require("path");` for `path.basename`.

**Verify:** The hook returns `{ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: { ...toolInput, editorId: "claude-code", conversationId } } }` when transcript_path is present.

### Step 6: Modify `integrations/claude/hooks/aic-session-end.cjs`

Remove the convFile unlink block. Delete lines 50-54:

```javascript
  try {
    fs.unlinkSync(path.join(projectRoot, ".aic", ".current-conversation-id"));
  } catch {
    // ignore
  }
```

Also add lock file cleanup — delete the `.session-start-lock` file if it exists (handles edge case where SessionStart crashed without cleanup):

Add after the existing marker unlink block (line 48):

```javascript
  try {
    fs.unlinkSync(path.join(projectRoot, ".aic", ".session-start-lock"));
  } catch {
    // ignore
  }
```

Net effect: the `.current-conversation-id` unlink is replaced with `.session-start-lock` unlink.

**Verify:** Read the file to confirm the convFile unlink is removed and lock cleanup is added.

### Step 7: Modify `integrations/claude/plugin/scripts/aic-session-start.cjs`

Copy the full content of `integrations/claude/hooks/aic-session-start.cjs` (after Step 1 modifications) to this file. The files are identical.

**Verify:** `diff integrations/claude/hooks/aic-session-start.cjs integrations/claude/plugin/scripts/aic-session-start.cjs` reports no differences.

### Step 8: Modify `integrations/claude/plugin/scripts/aic-subagent-inject.cjs`

Copy the full content of `integrations/claude/hooks/aic-subagent-inject.cjs` (after Step 2 modifications) to this file. The files are identical.

**Verify:** `diff integrations/claude/hooks/aic-subagent-inject.cjs integrations/claude/plugin/scripts/aic-subagent-inject.cjs` reports no differences.

### Step 9: Modify `integrations/claude/plugin/scripts/aic-prompt-compile.cjs`

Copy the full content of `integrations/claude/hooks/aic-prompt-compile.cjs` (after Step 3 modifications) to this file. This also brings in the `<ide_selection>` strip that was previously missing from the plugin mirror.

**Verify:** `diff integrations/claude/hooks/aic-prompt-compile.cjs integrations/claude/plugin/scripts/aic-prompt-compile.cjs` reports no differences.

### Step 10: Modify `integrations/claude/plugin/scripts/aic-pre-compact.cjs`

Copy the full content of `integrations/claude/hooks/aic-pre-compact.cjs` (after Step 4 modifications) to this file. The files are identical.

**Verify:** `diff integrations/claude/hooks/aic-pre-compact.cjs integrations/claude/plugin/scripts/aic-pre-compact.cjs` reports no differences.

### Step 11: Modify `integrations/claude/__tests__/aic-session-start.test.cjs`

Add 3 new test functions. Update the existing `session_start_passes_conversationId_when_in_input` test to use `transcript_path` instead of `conversation_id`. Update `session_start_passes_null_when_no_conversation_id` to omit `transcript_path`.

**Update existing test** `session_start_passes_conversationId_when_in_input`:

Change the input from `{ session_id: "s1", conversation_id: "conv-uuid-123", cwd: "/tmp" }` to `{ session_id: "s1", transcript_path: "/home/user/.claude/conversations/conv-uuid-123.jsonl", cwd: "/tmp" }`. Change the expected value from `"conv-uuid-123"` to `"conv-uuid-123"` (same — basename extraction produces the same UUID).

**New test** `lock_prevents_concurrent_session_start`:

```javascript
async function lock_prevents_concurrent_session_start() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-session-start-test-"));
  try {
    let callCount = 0;
    const resolvedHelper = require.resolve("./aic-compile-helper.cjs", { paths: [hooksDir] });
    require.cache[resolvedHelper] = {
      exports: {
        callAicCompile: () => {
          callCount++;
          return new Promise((resolve) => setTimeout(() => resolve("compiled"), 100));
        },
      },
      loaded: true,
      id: resolvedHelper,
    };
    delete require.cache[hookPath];
    const { run } = require(hookPath);
    const input = JSON.stringify({ session_id: "s1", cwd: tmpDir });
    const results = await Promise.all([run(input), run(input), run(input)]);
    cleanup(resolvedHelper);
    const nonNullCount = results.filter((r) => r !== null).length;
    if (callCount !== 1) {
      throw new Error(`Expected callAicCompile called 1 time, got ${callCount}`);
    }
    if (nonNullCount !== 1) {
      throw new Error(`Expected 1 non-null result, got ${nonNullCount}`);
    }
    console.log("lock_prevents_concurrent_session_start: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
```

**New test** `lock_cleaned_up_after_success`:

```javascript
async function lock_cleaned_up_after_success() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-session-start-test-"));
  try {
    const key = mockHelper("compiled");
    delete require.cache[hookPath];
    const { run } = require(hookPath);
    await run(JSON.stringify({ session_id: "s1", cwd: tmpDir }));
    cleanup(key);
    const lockPath = path.join(tmpDir, ".aic", ".session-start-lock");
    if (fs.existsSync(lockPath)) {
      throw new Error("Lock file should be deleted after successful run");
    }
    console.log("lock_cleaned_up_after_success: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
```

**New test** `stale_lock_returns_null_when_marker_has_content`:

```javascript
async function stale_lock_returns_null_when_marker_has_content() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-session-start-test-"));
  try {
    const aicDir = path.join(tmpDir, ".aic");
    fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(aicDir, ".session-context-injected"), "prior-session", "utf8");
    fs.writeFileSync(path.join(aicDir, ".session-start-lock"), "", "utf8");
    const key = mockHelper("should not be called");
    delete require.cache[hookPath];
    const { run } = require(hookPath);
    const result = await run(JSON.stringify({ session_id: "s1", cwd: tmpDir }));
    cleanup(key);
    if (result !== null) {
      throw new Error(`Expected null (stale lock detected), got ${JSON.stringify(result)}`);
    }
    console.log("stale_lock_returns_null_when_marker_has_content: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
```

Add all 3 new tests to the main test runner at the bottom of the file. Update the 2 existing tests as described.

**Verify:** `node integrations/claude/__tests__/aic-session-start.test.cjs` — all tests pass including the 3 new ones.

### Step 12: Modify `integrations/claude/__tests__/aic-subagent-inject.test.cjs`

Remove the 2 existing convFile-based tests (`conversationId_falls_back_to_env_when_not_in_payload` and `conversationId_falls_back_to_file_when_not_in_env`). Replace with 4 new tests:

**New test** `transcript_path_used_as_conversationId`:

```javascript
async function transcript_path_used_as_conversationId() {
  const resolvedHelper = require.resolve("./aic-compile-helper.cjs", { paths: [hooksDir] });
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
  await run(JSON.stringify({
    agent_type: "general-purpose",
    cwd: "/tmp",
    transcript_path: "/home/user/.claude/conversations/abc-def-123.jsonl",
  }));
  cleanup(resolvedHelper);
  if (capturedConversationId !== "abc-def-123") {
    throw new Error(`Expected "abc-def-123", got ${JSON.stringify(capturedConversationId)}`);
  }
  console.log("transcript_path_used_as_conversationId: pass");
}
```

**New test** `null_conversationId_when_no_transcript_path`:

```javascript
async function null_conversationId_when_no_transcript_path() {
  const resolvedHelper = require.resolve("./aic-compile-helper.cjs", { paths: [hooksDir] });
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
```

**New test** `subagent_uses_prompt_as_intent_when_present`:

```javascript
async function subagent_uses_prompt_as_intent_when_present() {
  const resolvedHelper = require.resolve("./aic-compile-helper.cjs", { paths: [hooksDir] });
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
  await run(JSON.stringify({
    agent_type: "general-purpose",
    prompt: "fix the authentication bug in auth.ts",
    cwd: "/tmp",
  }));
  cleanup(resolvedHelper);
  if (capturedIntent !== "fix the authentication bug in auth.ts") {
    throw new Error(`Expected prompt-based intent, got ${JSON.stringify(capturedIntent)}`);
  }
  console.log("subagent_uses_prompt_as_intent_when_present: pass");
}
```

**New test** `subagent_strips_ide_selection_from_prompt`:

```javascript
async function subagent_strips_ide_selection_from_prompt() {
  const resolvedHelper = require.resolve("./aic-compile-helper.cjs", { paths: [hooksDir] });
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
  await run(JSON.stringify({
    agent_type: "general-purpose",
    prompt: "fix this <ide_selection>selected code here</ide_selection> please",
    cwd: "/tmp",
  }));
  cleanup(resolvedHelper);
  if (capturedIntent !== "fix this  please") {
    throw new Error(`Expected stripped intent, got ${JSON.stringify(capturedIntent)}`);
  }
  console.log("subagent_strips_ide_selection_from_prompt: pass");
}
```

Update the test runner at the bottom to call the 4 new tests and remove the 2 deleted tests. Keep the 2 existing tests that are still valid (`hookSpecificOutput_json_when_helper_returns_text` and `output_empty_object_when_helper_returns_null`).

**Verify:** `node integrations/claude/__tests__/aic-subagent-inject.test.cjs` — all 6 tests pass.

### Step 13: Modify `integrations/claude/__tests__/aic-prompt-compile.test.cjs`

Add a test that verifies transcript_path is used as conversationId. The test pattern mirrors the existing tests.

**New test** `prompt_compile_uses_transcript_path_as_conversationId`:

```javascript
async function prompt_compile_uses_transcript_path_as_conversationId() {
  const resolvedHelper = require.resolve("./aic-compile-helper.cjs", { paths: [hooksDir] });
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
  await run(JSON.stringify({
    prompt: "explain the codebase",
    cwd: "/tmp",
    transcript_path: "/home/user/.claude/conversations/prompt-conv-uuid.jsonl",
  }));
  cleanup(resolvedHelper);
  if (capturedConversationId !== "prompt-conv-uuid") {
    throw new Error(`Expected "prompt-conv-uuid", got ${JSON.stringify(capturedConversationId)}`);
  }
  console.log("prompt_compile_uses_transcript_path_as_conversationId: pass");
}
```

Add this test to the test runner. If existing tests reference `conversation_id` in their input payloads, update them to use `transcript_path` instead.

**Verify:** `node integrations/claude/__tests__/aic-prompt-compile.test.cjs` — all tests pass.

### Step 14: Modify `integrations/claude/__tests__/aic-pre-compact.test.cjs`

Add a test that verifies transcript_path is passed as conversationId (not sessionId):

**New test** `pre_compact_uses_transcript_path_not_session_id`:

```javascript
async function pre_compact_uses_transcript_path_not_session_id() {
  const resolvedHelper = require.resolve("./aic-compile-helper.cjs", { paths: [hooksDir] });
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
  delete require.cache[require.resolve(hookPath)];
  const { run } = require(hookPath);
  await run(JSON.stringify({
    session_id: "wrong-session-id",
    cwd: "/tmp",
    transcript_path: "/home/user/.claude/conversations/conv-uuid-correct.jsonl",
  }));
  cleanup(resolvedHelper);
  if (capturedConversationId !== "conv-uuid-correct") {
    throw new Error(`Expected "conv-uuid-correct", got ${JSON.stringify(capturedConversationId)}`);
  }
  console.log("pre_compact_uses_transcript_path_not_session_id: pass");
}
```

Add this test to the test runner at the bottom.

**Verify:** `node integrations/claude/__tests__/aic-pre-compact.test.cjs` — all 3 tests pass.

### Step 15: Modify `documentation/claude-code-integration-layer.md`

Apply these exact text replacements:

**Change 1 — §4.3 field mapping table (line 102):**

Replace:

```
| `input.session_id`                 | `conversationId`                                                                       |
```

With:

```
| `input.transcript_path`           | `conversationId` (via `path.basename(transcriptPath, ".jsonl")`)                       |
```

**Change 2 — §4.3 explanation paragraph (lines 104-107):**

Replace:

```
**`conversationId` must always be passed** from `session_id` so `compilation_log` rows are
attributed to the correct conversation. Claude Code resolves this cleanly because `session_id`
is present in _every_ hook input ([common input fields](https://code.claude.com/docs/en/hooks#common-input-fields)). The `aic-compile-helper`
must accept and forward it.
```

With:

```
**`conversationId` must always be passed** from `transcript_path` so `compilation_log` rows
are attributed to the correct conversation. Claude Code includes `transcript_path` in _every_
hook input ([common input fields](https://code.claude.com/docs/en/hooks#common-input-fields)).
The UUID in the transcript filename (`path.basename(transcriptPath, ".jsonl")`) uniquely
identifies the conversation and is stable across all hooks in the same chat. The
`aic-compile-helper` accepts and forwards it. Note: `session_id` is per-hook-invocation
and is NOT suitable for conversation attribution.
```

**Change 3 — §7.1 UserPromptSubmit field list (line 266):**

Replace:

```
- `input.session_id` → `conversationId` for `aic_compile`
```

With:

```
- `input.transcript_path` → `conversationId` for `aic_compile` (via `path.basename`)
```

**Change 4 — §7.3 SubagentStart field list (line 340):**

Replace:

```
- `input.session_id` → `conversationId`
```

With:

```
- `input.transcript_path` → `conversationId` (via `path.basename`)
- `input.prompt` → `intent` (with `<ide_selection>` stripped; falls back to agent_type-based intent when absent)
```

**Change 5 — §9 helper code example (lines 484-500):**

Replace:

```
The `compileRequest` arguments object must include `conversationId` when `sessionId` is
available:

```js
{
  method: "tools/call",
  params: {
    name: "aic_compile",
    arguments: {
    intent,
    projectRoot,
    ...(sessionId ? { conversationId: sessionId } : {})
  }
}
```

Without `conversationId`, `compilation_log` rows from Claude Code hooks have null
`conversation_id`, and `aic_chat_summary` cannot aggregate them.
```

With:

```
The `compileRequest` arguments object must include `conversationId` derived from
`transcript_path`:

```js
const transcriptPath = parsed.transcript_path ?? parsed.input?.transcript_path ?? null;
const conversationId = transcriptPath ? path.basename(transcriptPath, ".jsonl") : null;
// ...
{
  method: "tools/call",
  params: {
    name: "aic_compile",
    arguments: {
    intent,
    projectRoot,
    ...(conversationId ? { conversationId } : {})
  }
}
```

Without `conversationId`, `compilation_log` rows from Claude Code hooks have null
`conversation_id`, and `aic_chat_summary` cannot aggregate them. The `session_id` field is
per-hook-invocation and must NOT be used for conversation attribution.
```

**Change 6 — §7.1 checklist (line 722):**

Replace:

```
- [ ] `aic-prompt-compile.cjs` runs on UserPromptSubmit and passes `intent` and `conversationId` to `aic_compile` (§7.1)
```

With:

```
- [ ] `aic-prompt-compile.cjs` runs on UserPromptSubmit and passes `intent` and `conversationId` (from `transcript_path`) to `aic_compile` (§7.1)
```

**Verify:** Grep the file for `session_id` — no remaining references should map it to `conversationId`. References to `session_id` for marker file scoping (§7.2) and temp file keying (§7.4, §7.5, §7.6) are correct and stay as-is.

### Step 16: Modify `documentation/cursor-integration-layer.md`

Apply these exact text replacements (doc-only fixes — Cursor hook code is already correct):

**Change 1 — §7.1 AIC-session-init description (line 272):**

Replace:

```
- Injects `AIC_CONVERSATION_ID=${sessionId}` into the context text so the model is aware
```

With:

```
- Injects `AIC_CONVERSATION_ID=${conversationId}` into the context text so the model is aware
```

**Change 2 — §7.1 AIC-compile-context description (line 277):**

Replace:

```
- Reads `session_id` from stdin → passes as `conversationId` to `aic_compile`
```

With:

```
- Reads `conversation_id` from stdin → passes as `conversationId` to `aic_compile`
```

**Change 3 — §9 helper text (line 540):**

Replace:

```
The JSON-RPC call must include `conversationId` when `session_id` is available:
```

With:

```
The JSON-RPC call must include `conversationId` when `conversation_id` is available:
```

**Change 4 — §9 code example (lines 542-552):**

Replace the code block:

```js
// correct
const compileArgs = {
  intent: INTENT,
  projectRoot: projectRoot,
  editorId: "cursor",
};
if (sessionId && typeof sessionId === "string" && sessionId.length > 0) {
  compileArgs.conversationId = sessionId;
}
```

With:

```js
// correct
const compileArgs = {
  intent: INTENT,
  projectRoot: projectRoot,
  editorId: "cursor",
};
if (
  conversationId &&
  typeof conversationId === "string" &&
  conversationId.trim().length > 0
) {
  compileArgs.conversationId = conversationId.trim();
}
```

**Change 5 — Checklist item (line 717):**

Replace:

```
- [x] `AIC-compile-context.cjs` calls `aic_compile` with `conversationId` from `session_id` (§9)
```

With:

```
- [x] `AIC-compile-context.cjs` calls `aic_compile` with `conversationId` from `conversation_id` (§9)
```

**Verify:** Grep `cursor-integration-layer.md` for `session_id` — remaining references should be for non-conversationId purposes (temp file keys, session logging in §7.9).

### Step 17: Final verification

Run all test files:

```
node integrations/claude/__tests__/aic-session-start.test.cjs && \
node integrations/claude/__tests__/aic-subagent-inject.test.cjs && \
node integrations/claude/__tests__/aic-prompt-compile.test.cjs && \
node integrations/claude/__tests__/aic-pre-compact.test.cjs
```

Verify plugin mirror sync:

```
diff integrations/claude/hooks/aic-session-start.cjs integrations/claude/plugin/scripts/aic-session-start.cjs && \
diff integrations/claude/hooks/aic-subagent-inject.cjs integrations/claude/plugin/scripts/aic-subagent-inject.cjs && \
diff integrations/claude/hooks/aic-prompt-compile.cjs integrations/claude/plugin/scripts/aic-prompt-compile.cjs && \
diff integrations/claude/hooks/aic-pre-compact.cjs integrations/claude/plugin/scripts/aic-pre-compact.cjs
```

Expected: all tests pass, all diffs empty. No new lint warnings from `pnpm lint` (CJS files are not linted by the shared config).

## Tests

| Test case | Description |
| --------- | ----------- |
| `lock_prevents_concurrent_session_start` | Three concurrent `run()` calls on the same project dir — `callAicCompile` called exactly once, 1 non-null result |
| `lock_cleaned_up_after_success` | After successful run, `.session-start-lock` file does not exist |
| `stale_lock_returns_null_when_marker_has_content` | Lock file + non-empty marker → returns null immediately (stale lock detected) |
| `session_start_passes_conversationId_when_in_input` | Input with `transcript_path` → conversationId is the basename UUID (updated existing test) |
| `session_start_passes_null_when_no_conversation_id` | Input without `transcript_path` → conversationId is null (updated existing test) |
| `transcript_path_used_as_conversationId` | Subagent hook with `transcript_path` → conversationId is basename UUID |
| `null_conversationId_when_no_transcript_path` | Subagent hook without `transcript_path` → conversationId is null |
| `subagent_uses_prompt_as_intent_when_present` | Subagent hook with `prompt` field → intent is the prompt text, not generic string |
| `subagent_strips_ide_selection_from_prompt` | Subagent hook with `<ide_selection>` in prompt → tags stripped from intent |
| `prompt_compile_uses_transcript_path_as_conversationId` | Prompt hook with `transcript_path` → conversationId is basename UUID |
| `pre_compact_uses_transcript_path_not_session_id` | Pre-compact hook with both `session_id` and `transcript_path` → conversationId is from transcript_path, not session_id |

## Acceptance Criteria

- [ ] All files modified per Files table
- [ ] Bug 1: Concurrent SessionStart invocations result in exactly 1 compilation (lock mechanism)
- [ ] Bug 2: SubagentStart uses prompt text as intent when present; falls back to agent_type when absent
- [ ] Bug 3: All hooks derive conversationId from transcript_path, not session_id or conversation_id
- [ ] Pre-compact passes conversationId (not sessionId) to callAicCompile
- [ ] convFile mechanism (`.current-conversation-id`) removed from all hooks and session-end cleanup
- [ ] All 4 plugin mirrors match their hook counterparts exactly
- [ ] Plugin `aic-prompt-compile.cjs` gains `<ide_selection>` strip
- [ ] All 11 test cases pass
- [ ] `claude-code-integration-layer.md` has no stale `session_id → conversationId` mapping
- [ ] `cursor-integration-layer.md` has no stale `session_id` references for conversationId

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
