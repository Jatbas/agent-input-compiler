# Claude Code Integration Layer — Implementation Guide

---

## 1. Purpose

This document is the single source of truth for building and maintaining the Claude Code integration layer. It covers the hook scripts in `integrations/claude/hooks/` (source) and their deployment to `~/.claude/hooks/` (editor target), the settings wiring in `~/.claude/settings.json`, the adapter pattern, and every known bug with its workaround.

---

## 2. Clean-layer architectural principle — mandatory

The AIC core (anything in `shared/` or `mcp/src/`) has **zero knowledge of Claude Code**.
All Claude Code-specific source code lives in `integrations/claude/`. The `.claude/` directory and `~/.claude/` are **deployment targets** that Claude Code reads — they are not source directories. This distinction is not a preference — it is a structural invariant.

What this means concretely:

- **All Claude Code hook and settings logic lives in `integrations/claude/`.** The installer
  (`integrations/claude/install.cjs`) is standalone. `mcp/src/editor-integration-dispatch.ts`
  detects a Claude Code workspace when `.claude/` exists, `CLAUDE_PROJECT_DIR` is set, or (in
  auto mode with Cursor detected) the Anthropic Claude Code extension is present under
  `~/.cursor/extensions` (directory name prefix `anthropic.claude-code`). It resolves the
  installer path the same way as Cursor: `<project>/integrations/claude/install.cjs` when that
  file exists under the workspace root, otherwise the copy bundled inside the published
  `@jatbas/aic` package at package-relative `integrations/claude/install.cjs`, then runs it with
  `execFileSync` when the MCP client lists workspace roots (if the client supports roots) or on
  the **first** `aic_compile` for that project (`mcp/src/server.ts` /
  `mcp/src/handlers/compile-handler.ts`). It does not duplicate copy/merge logic. Manual run:
  `node integrations/claude/install.cjs`. Idempotent (writes only when content differs).

- **The `aic_compile` MCP tool is neutral.** It requires `intent` and `projectRoot`; shipped Claude Code hooks also send `editorId`, `triggerSource`, and often `conversationId` / `modelId`. It does not know who called it. The hook adapter in
  `integrations/claude/hooks/` translates Claude Code's hook protocol into that call —
  that translation is integration-layer work only. Optional wire fields beyond what hooks send are listed in §2.1.

### 2.1 Optional `aic_compile` arguments (`toolOutputs` and agentic fields)

The MCP schema (`mcp/src/schemas/compilation-request.ts`, summarized in [Implementation specification §8c](../implementation-spec.md#8c-input-validation-zod-schemas)) accepts optional agentic fields such as `stepIndex`, `stepIntent`, `previousFiles`, `toolOutputs`, and `conversationTokens`. When callers supply structured `toolOutputs[].relatedFiles` (repo-relative paths by convention), the pipeline merges them into heuristic `boostPatterns` before scoring; when the deduplicated related-path set is non-empty, a sorted NUL-separated canonical encoding of those paths is included in the cache preimage that `compilation-runner` hashes ([Step 4 — ContextSelector](../implementation-spec.md#step-4-contextselector-relatedfilesboostcontextselector)).

**Shipped hooks** that call `aic_compile` through `aic-compile-helper.cjs` do not set `toolOutputs` or `relatedFiles` (that helper sends `intent`, `projectRoot`, `editorId`, and optional `conversationId`, `triggerSource`, `modelId` only). Custom integrations may forward `toolOutputs` when the MCP client exposes prior tool results in that shape.

- **Shared utilities are welcome** in `shared/` only when they are genuinely editor-agnostic
  (a `buildSessionContext()`-style helper that any editor integration could use). If a
  utility only makes sense for Claude Code, it goes in `integrations/claude/`.

---

## 3. Deployment scope

**Claude Code:** Hook settings are read from the same files by all three deployment modes:

| Mode                                                            | Hook support                                                          | Settings source                                                                                                                         |
| --------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **CLI** (`claude`)                                              | Full Claude Code hook lifecycle (all hook events the product exposes) | `~/.claude/settings.json` + `.claude/settings.json`                                                                                     |
| **VS Code extension** (`anthropic.claude-code`)                 | Same hooks via shared settings                                        | Same files — settings shared between CLI and extension ([IDE integrations docs](https://code.claude.com/docs/en/ide-integrations))      |
| **Cursor extension** (`cursor:extension/anthropic.claude-code`) | Same                                                                  | Same files — supported install target ([IDE integrations docs](https://code.claude.com/docs/en/ide-integrations#install-the-extension)) |

One set of hook scripts, one settings file. All three modes pick them up without any mode-specific code. The VS Code docs explicitly confirm: "Claude Code settings in `~/.claude/settings.json`: shared between the extension and CLI. Use for allowed commands, environment variables, hooks, and MCP servers." ([source](https://code.claude.com/docs/en/ide-integrations#configure-settings))

---

## 4. Architecture — adapter pattern, no core changes needed

### 4.1 Why no AIC core changes are needed

AIC's pipeline operates on `CompilationRequest → CompilationResult`. It does not know which editor or tool initiated the call. This is the hexagonal architecture invariant: core/pipeline has zero knowledge of callers.

The integration layer is a thin adapter that translates Claude Code's hook protocol into an
`aic_compile` MCP call:

```
Claude Code runtime
  │
  │  stdin: { prompt, cwd, session_id, hook_event_name, … }
  ▼
~/.claude/hooks/aic-compile-helper.cjs   ← shared MCP caller (used by several hooks)
  │
  │  JSON-RPC: tools/call aic_compile (intent, projectRoot, editorId, optional session fields — §2.1)
  ▼
mcp/src/server.ts → CompilationRunner.run()
  │
  │  result: { compiledPrompt, … }
  ▼
~/.claude/hooks/<hook>.cjs (deployed script finishes the event)
  │
  │  stdout: plain text or hookSpecificOutput JSON (see §6)
  ▼
Claude Code runtime → injects as context
```

> **Two transports to the same server**
>
> The diagram above shows the hook-driven path end-to-end. The same `mcp/src/server.ts` pipeline and `aic_compile` tool also appear when **Claude Code's registered MCP client** invokes the tool; **caller, framing, and host limits differ**:
>
> 1. **Hook-driven path (context hooks):** Hooks invoke `aic-compile-helper.cjs`, which **spawns** a short-lived server process and exchanges MCP-style JSON-RPC over that process's **stdio** (`initialize`, `notifications/initialized`, `tools/call` for `aic_compile` — see `integrations/claude/hooks/aic-compile-helper.cjs`). The registered MCP client is **not** on this path; only the hook-spawned child performs JSON-RPC to the server.
> 2. **Registered MCP tool path:** When tool execution uses the **`aic`** MCP server from `~/.claude/settings.json` (see §10), **`aic_compile`** runs through Claude Code's MCP client with normal tool-result handling. **Host-level result-size limits apply.** From **Claude Code 2.1.91**, large tool results may declare `_meta["anthropic/maxResultSizeChars"]` (up to **500,000** characters) on the tool result; that applies to **registered MCP tool results**, not to the hook-driven pipe in item 1. See the [Claude Code changelog](https://docs.anthropic.com/en/docs/claude-code/changelog) (v2.1.91 notes) and [anthropics/claude-code#42869](https://github.com/anthropics/claude-code/issues/42869) for `_meta` context where official MCP docs lag.

### 4.2 Where the adapter lives

The adapter (`aic-compile-helper.cjs`) and all event hooks are **authored** in
`integrations/claude/hooks/`. The installer **writes** them only under `~/.claude/hooks/`.
When run from a project directory that is not the user home, it also removes legacy
`aic-*.cjs` copies from that project’s `.claude/hooks/`. Nothing outside
`integrations/claude/` changes at dev time.

### 4.3 Input field mapping

| Claude Code hook input field                                | AIC `aic_compile` argument                                                                                                                                                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `input.prompt` (UserPromptSubmit)                           | `intent`                                                                                                                                                                                                                                         |
| `input.agent_type` (SubagentStart)                          | part of `intent` string                                                                                                                                                                                                                          |
| Generic for session events                                  | fixed intent string `"understand project structure, architecture, and recent changes"`                                                                                                                                                           |
| `input.cwd`                                                 | `projectRoot` (fallback to `$CLAUDE_PROJECT_DIR` → `process.cwd()`)                                                                                                                                                                              |
| `input.transcript_path`                                     | Primary source for `conversationId` via `conversationIdFromTranscriptPath` — basename without `.jsonl`                                                                                                                                           |
| `input.conversation_id` (top-level or nested under `input`) | Fallback for `conversationId` when no non-empty transcript path — trimmed string (same helper; see [Integrations shared modules](integrations-shared-modules.md))                                                                                |
| `explicitEditorId` (derived, not a wire field)              | `explicitEditorIdFromClaudeHookEnvelope(parsed)` → `cursor-claude-code` when only direct `conversation_id` is present without transcript path; otherwise `claude-code`. Passed through `callAicCompile` for correct `compilation_log.editor_id`. |
| `input.model` (SessionStart when present)                   | `modelId`; SessionStart passes it; other hooks use `readSessionModelCache` on `.aic/session-models.jsonl` (written when SessionStart or other hooks record a valid model)                                                                        |

`readSessionModelCache` uses the same bounded tail read and deterministic full-file fallback as the MCP compile handler ([Implementation specification — Model id resolution](../implementation-spec.md#model-id-resolution-aic_compile); [AIC JSONL caches](aic-jsonl-caches.md)).

**Resolving `conversationId`:** Hooks use `conversationIdFromTranscriptPath(parsed)` in `integrations/shared/conversation-id.cjs` first (transcript basename, then trimmed direct `conversation_id`). When that returns `null`, compile/inject/reparent hooks call `resolveConversationIdFallback(parsed)` so `aic_compile` still receives a deterministic synthetic id when `parent_conversation_id`, `session_id`, or `generation_id` / camelCase variants yield a valid candidate (printable ASCII, max 128 chars — see [Integrations shared modules](integrations-shared-modules.md)). Claude Code normally includes `transcript_path` in hook input ([common input fields](https://code.claude.com/docs/en/hooks#common-input-fields)); the UUID in the transcript filename is stable across hooks in the same chat. `aic-compile-helper` forwards `conversationId` and explicit `editorId` from the caller.

**Entry guard:** If `cursor_version` or `input.cursor_version` is present, Claude hooks return immediately without calling `aic_compile` — see [Runtime boundary guards (`cursor_version`)](cursor-integration-layer.md#44-runtime-boundary-guards-cursor_version).

> Note: Synthetic fallbacks may use `session_id` or `generation_id` when transcript/direct ids are absent — they stabilize `compilation_log` attribution for those hook paths but are not the transcript UUID. Prefer transcript/direct ids when the host supplies them.

---

## 5. Target file layout

`integrations/claude/` is the source. Deployment target for hook registration is
`~/.claude/` (global) only. Nothing in `mcp/` or `shared/` changes. The installer deploys every listed script to `~/.claude/hooks/`; `aic-compile-helper.cjs` is deployed and is required at runtime by the context hooks (aic-prompt-compile, aic-session-start, aic-subagent-inject, aic-pre-compact).

```
integrations/claude/               ← SOURCE (authored here)
  hooks/
    aic-compile-helper.cjs         # Protocol adapter (deployed; required by context hooks)
    aic-prompt-compile.cjs         # UserPromptSubmit — PRIMARY context delivery
    aic-session-start.cjs          # SessionStart — bootstrapping + post-compaction
    aic-subagent-inject.cjs        # SubagentStart — subagent context injection
    aic-subagent-stop.cjs          # SubagentStop — reparent compilation_log rows
    aic-after-file-edit-tracker.cjs  # PostToolUse(Edit|Write) — feeds Stop hook
    aic-stop-quality-check.cjs     # Stop — ESLint + typecheck quality gate
    aic-block-no-verify.cjs        # PreToolUse(Bash) — block --no-verify git commits
    aic-pre-tool-gate.cjs          # PreToolUse(unmatched) — blocks non–aic_compile tools until recency / turn markers pass
    aic-inject-conversation-id.cjs # conversationId injection for MCP calls (registered in settings template)
    aic-pre-compact.cjs            # PreCompact — re-inject context before compaction
    aic-session-end.cjs            # SessionEnd — telemetry only
  install.cjs                      # Installer: deploys hooks + merges settings

~/.claude/hooks/                   ← DEPLOYMENT TARGET (global, created by install.cjs)
  aic-*.cjs                        # Deployed from integrations/claude/hooks/
~/.claude/settings.json            # AIC hook entries merged in by install.cjs

.claude/ (in project, optional)    ← CLAUDE.md — Fallback trigger rule only
  CLAUDE.md                        # Written by install.cjs when run from project dir
```

---

## 6. Output format — event-specific rules

Claude Code's hooks use two distinct output mechanisms: plain text stdout for `UserPromptSubmit`, and JSON `hookSpecificOutput` for the events listed in the subsections below. Getting this wrong produces silent drops or "hook error" banners.

### 6.1 UserPromptSubmit — use plain text stdout

**Recommended:** write plain text directly to stdout. Any non-JSON text is added as context
([docs](https://code.claude.com/docs/en/hooks#userpromptsubmit)):

```js
// RECOMMENDED — works on every message including first
process.stdout.write(compiled);
```

The docs also support a JSON format with `hookSpecificOutput`, but issue
[#17550](https://github.com/anthropics/claude-code/issues/17550) (filed Jan 2026, **closed as `not_planned`**) shows that `hookSpecificOutput` JSON causes a "UserPromptSubmit hook error" on the **first message of every new session**. The hook runs correctly (exit code 0, valid JSON), but Claude Code's session-init path cannot process it. Anthropic declined to fix this. Plain text avoids the bug entirely and is the documented first-class path.

```js
// AVOID — triggers #17550 on first message of new session
process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: compiled,
    },
  }),
);
```

#### 6.1.1 Maintenance — #17550 workaround

**Last verified (Claude Code build):** _[On first merge, leave this placeholder. After each checklist run, replace with the exact version line printed by `claude --version` on the host where you ran the repro, then add a short outcome note.]_

**Re-verification at each Claude Code major or minor release:**

1. Start a **new** session. Reproduce the [#17550](https://github.com/anthropics/claude-code/issues/17550) failure mode by emitting `hookSpecificOutput` JSON for `UserPromptSubmit` (same shape as the AVOID example above). Run the repro from a throwaway branch with experimental hook edits so production hooks stay on plain text.
2. If Claude Code **no longer** surfaces a "UserPromptSubmit hook error" on the first message, reassess `integrations/claude/hooks/aic-prompt-compile.cjs` and whether the dual-path marker logic remains necessary. Keep JSON `hookSpecificOutput` off the production `UserPromptSubmit` path until that reassessment completes.
3. If the error **still** appears, keep plain-text stdout. Update **Last verified** with the exact version string tested and a one-line outcome describing that the first-message error still reproduces.
4. **Implementation reference:** `integrations/claude/hooks/aic-prompt-compile.cjs` uses `process.stdout.write` for hook output and `isSessionAlreadyInjected` from `integrations/shared/session-markers.cjs` for the SessionStart fallback (§7.2).

### 6.2 SessionStart — use `hookSpecificOutput` JSON

For `SessionStart`, the [official docs](https://code.claude.com/docs/en/hooks#sessionstart-decision-control) only document the `hookSpecificOutput` format for `additionalContext` injection. There is no plain text path specified for this event. Use the documented format:

```js
process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: text,
    },
  }),
);
```

> Note: issue [#10373](https://github.com/anthropics/claude-code/issues/10373) (**open** since Oct 2025) means this hook's output is silently discarded for _brand new_ interactive sessions in CLI mode. The format is not the problem — the hook fires but its output is dropped at the session-init path. Workaround: dual-path injection via `UserPromptSubmit` (see §7.2).

### 6.3 SubagentStart — use `hookSpecificOutput` JSON

Same behavior as `SessionStart`. The [docs](https://code.claude.com/docs/en/hooks#subagentstart) only document `hookSpecificOutput` for `additionalContext` injection on this event:

```js
process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SubagentStart",
      additionalContext: text,
    },
  }),
);
```

### 6.4 PreToolUse (deny) — use `hookSpecificOutput` with `permissionDecision`

```js
process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "...",
    },
  }),
);
```

([PreToolUse decision control](https://code.claude.com/docs/en/hooks#pretooluse-decision-control))

### 6.5 Stop — use top-level `decision: "block"`

```js
process.stdout.write(
  JSON.stringify({
    decision: "block",
    reason:
      "Fix lint and typecheck errors on the files you edited. Run pnpm lint and pnpm typecheck.",
  }),
);
```

The sample shows the both-fail case. If only ESLint fails, `reason` is `Fix lint errors on the files you edited. Run pnpm lint and pnpm typecheck.`; if only typecheck fails, `reason` uses `typecheck` in place of `lint` in that pattern. The hook never appends eslint or `tsc` stderr to `reason`.

([Stop decision control](https://code.claude.com/docs/en/hooks#stop-decision-control))

### 6.6 PostToolUse, SessionEnd — empty JSON `{}`

These hooks have no context-injection or decision output. Exit 0 with no stdout (or empty
`{}`) signals success.

---

## 7. Hook events — details

All 18 Claude Code lifecycle events are documented at
[code.claude.com/docs/en/hooks#hook-lifecycle](https://code.claude.com/docs/en/hooks#hook-lifecycle).
AIC uses nine of them for integration work (see §8). Known product bugs and workarounds are called out per hook below.

### 7.1 UserPromptSubmit — PRIMARY delivery

**Reference:** [hooks#userpromptsubmit](https://code.claude.com/docs/en/hooks#userpromptsubmit)

**Why this is AIC's core value for Claude Code:** Fires before every user message, before the model processes it. The user's actual prompt text is available as `input.prompt` — this is the intent. No trigger rule needed; no model compliance required. Context delivery becomes deterministic and automatic.

**Input fields used:**

- `input.prompt` → `intent` for `aic_compile`
- `input.transcript_path` (and related fields) → `conversationId` for `aic_compile` via `conversation-id.cjs` (see §4.3)
- `input.cwd` → `projectRoot` fallback

**Output:** Plain text stdout (see §6.1).

**Matcher:** `UserPromptSubmit` does not support matchers — it fires on every prompt
([matcher reference](https://code.claude.com/docs/en/hooks#matcher-patterns)). Do not add a
`matcher` field; it is silently ignored.

**Known bug — `hookSpecificOutput` format:** See §6.1. Fix: plain text stdout.

**File:** `.claude/hooks/aic-prompt-compile.cjs`

---

### 7.2 SessionStart — bootstrapping and post-compaction

**Reference:** [hooks#sessionstart](https://code.claude.com/docs/en/hooks#sessionstart)

**Purpose:** Inject architectural invariants and a broad project context snapshot at the start of a session. `model` from hook input is passed as `modelId` to `aic_compile`; other hooks that call the helper resolve model id via `readSessionModelCache` on `.aic/session-models.jsonl` when SessionStart (or another hook) has recorded a valid model (same JSONL read semantics as the MCP handler — [Implementation specification](../implementation-spec.md#model-id-resolution-aic_compile)). Also fires on `compact` — re-injecting context after compaction is the primary reliable use case.

**Matcher values:** `startup`, `resume`, `clear`, `compact`
([matcher reference](https://code.claude.com/docs/en/hooks#matcher-patterns)).
The hook as written uses no matcher (fires on all four).

**Known bug — not firing for new sessions in CLI:** Issue
[#10373](https://github.com/anthropics/claude-code/issues/10373) (filed Oct 2025, **still open** as of Mar 2026). `SessionStart` fires on `/clear`, `/compact`, and URL resume, but **not on brand new interactive sessions** in CLI mode. The hook executes but its output is discarded. This is a runtime processing bug, not a format issue.

**Workaround — dual-path injection:** Because `SessionStart` is unreliable for new sessions,
`UserPromptSubmit` acts as a fallback for the first prompt. Pattern:

```js
// aic-session-start.cjs writes a marker file on success:
const INJECTED_MARKER = path.join(projectRoot, ".aic", ".session-context-injected");
fs.writeFileSync(INJECTED_MARKER, sessionId);

// aic-prompt-compile.cjs reads the marker:
const alreadyInjected =
  fs.existsSync(INJECTED_MARKER) &&
  fs.readFileSync(INJECTED_MARKER, "utf8").trim() === sessionId;
if (!alreadyInjected) {
  // SessionStart missed this session — inject architectural context now
  const sessionContext = buildSessionContext(projectRoot);
  parts.unshift(sessionContext);
}
// Always inject prompt-specific context
parts.push(promptContext);
```

The marker is scoped by `session_id` so multiple concurrent sessions don't interfere. Delete the marker in `SessionEnd`.

Lock file layout (`.session-start-lock`), merge options, and ordering with this marker are recorded in [Session start lock and session context marker](session-start-lock-and-marker.md).

**Output:** `hookSpecificOutput` JSON (see §6.2).

**File:** `.claude/hooks/aic-session-start.cjs`

---

### 7.3 SubagentStart — subagent context injection

**Reference:** [hooks#subagentstart](https://code.claude.com/docs/en/hooks#subagentstart)

**Why this matters:** Subagents lose parent context. Without this hook, every Claude Code subagent (`Bash`, `Explore`, `Plan`, or custom agents from `.claude/agents/`) starts without knowing the project architecture or conventions.

**Input fields used:**

- `input.agent_type` → `"Bash"`, `"Explore"`, `"Plan"`, or custom agent name
- `input.transcript_path` → `conversationId` (via `path.basename`)
- `input.prompt` → `intent` (with IDE markup blocks like `<ide_selection>…</ide_selection>` and other `<ide_*>` regions stripped; falls back to agent_type-based intent when absent)

**Matcher:** Use `"*"` or omit — inject context into all subagent types. Use an `Explore|Plan` matcher when Bash subagents should not receive full context.

**Output:** `hookSpecificOutput` JSON (see §6.3).

**File:** `.claude/hooks/aic-subagent-inject.cjs`

---

### 7.4 PreToolUse — Bash and MCP matchers

**Reference:** [hooks#pretooluse](https://code.claude.com/docs/en/hooks#pretooluse)

**Bash matcher — `--no-verify` blocker**

**Purpose:** Block any `git` command that includes `--no-verify` or `-n`. Project rules forbid skipping pre-commit hooks (Husky + lint-staged enforce formatting and linting). An agent sometimes adds `--no-verify` to get past a failing commit — this hook stops it deterministically, not via instruction.

**Matcher:** `Bash` — fires only on Bash tool calls.

**Decision output:** `hookSpecificOutput` with `permissionDecision: "deny"` (see §6.4).

**Input fields used:** `input.tool_input.command`

**File:** `.claude/hooks/aic-block-no-verify.cjs`

**MCP matcher — `conversationId` injection**

**Purpose:** Ensure `aic_compile` receives `conversationId`, `editorId`, and often `modelId` in tool arguments when the model omits them. `settings.json.template` registers `aic-inject-conversation-id.cjs` only for matcher `mcp__.*__aic_compile` (there is no separate PreToolUse matcher for `aic_chat_summary`; on Claude Code, chat-summary attribution relies on earlier hooks passing `conversationId` from transcript and fallback resolution — Cursor injects `aic_chat_summary` separately; see [Cursor integration layer §7.4](cursor-integration-layer.md#74-pretooluse-mcp-matcher--conversationid-injection)). Other MCP tools such as `aic_model_test` are not covered by this matcher.

**Behaviour (implementation):** Parse stdin JSON. If `isCursorNativeHookPayload` (`integrations/cursor/is-cursor-native-hook-payload.cjs`) is true — `cursor_version` / `input.cursor_version`, or fresh `editor-runtime-marker` for `cursor` when `conversationId` resolves — return `permissionDecision: "allow"` with no `updatedInput` so Cursor-shaped invocations do not mutate MCP args on this hook path. Otherwise resolve `conversationId` as `conversationIdFromTranscriptPath(parsed) ?? resolveConversationIdFallback(parsed)` ([Integrations shared modules](integrations-shared-modules.md)). Treat the tool call as `aic_compile` when the tool name matches `aic_compile` or the payload looks like a compile request (`intent` and `projectRoot` strings). If not `aic_compile`, allow with no mutation. Set `editorId` to `cursor-claude-code` when `CURSOR_TRACE_ID` is set, else `claude-code`. Merge `conversationId`, `editorId`, and `modelId` from `readSessionModelCache` when the cached model normalises to something other than `auto`. When intent is weak (`isWeakAicCompileIntent`) and `conversationId` is set, replace intent from `readAicPrewarmPrompt(\`cc-${conversationId}\`)`(temp file under`os.tmpdir()`), matching the prewarm key used on this path.

**File:** `.claude/hooks/aic-inject-conversation-id.cjs` (see §10 for registration)

#### PreToolUse (unmatched) — compile gate (`aic-pre-tool-gate.cjs`)

**Reference:** [hooks#pretooluse](https://code.claude.com/docs/en/hooks#pretooluse) — unmatched `PreToolUse` runs before other PreToolUse matchers in `integrations/claude/settings.json.template`.

**Purpose:** Block tool calls that are not an `aic_compile` path until the current conversation has a fresh compile marker or passes the shared recency window (same intent as Cursor `AIC-require-aic-compile.cjs`, different stdin shape).

**Early exits:** Returns `{}` when `isCursorNativeHookPayload` is true (Cursor-shaped payloads must not run Claude enforcement). Resolves `projectRoot` by walking parents until `aic.config.json` exists (`findEffectiveProjectRoot` in the script).

**Compile detection (`isAicCompileCall`):** Allows when the tool name matches `aic_compile` (case-insensitive), when `ToolSearch` runs with a `query` matching `aic_compile` (schema discovery escape hatch), or when `tool_input` carries both `intent` and `projectRoot` strings.

**Allow path:** On a compile hit, calls `writeCompileRecency(projectRoot)` and returns allow (empty hook output).

**Otherwise:** Allows when `isTurnCompiled(projectRoot, conversationId)` or `isCompileRecent(projectRoot)` from `integrations/shared/compile-recency.cjs` succeeds (default recency **300** seconds unless `compileRecencyWindowSecs` in `aic.config.json` overrides). If still blocked, polls at **20** ms intervals for up to **500** ms (`SIBLING_POLL_INTERVAL_MS` / `SIBLING_POLL_TOTAL_MS` in `aic-pre-tool-gate.cjs`), re-checking those markers so a sibling `aic_compile` in the same parallel batch can satisfy the gate before a deny. If still blocked, returns a deny `hookSpecificOutput` with suggested `intent` from `readAicPrewarmPrompt(\`cc-${conversationId}\`)`. There is no deny-count cap (same sibling-race story as Cursor; rationale in [Cursor integration layer §7.3](cursor-integration-layer.md#73-pretooluse-unmatched--aic_compile-enforcement-gate)).

**File:** `.claude/hooks/aic-pre-tool-gate.cjs`

---

### 7.5 PostToolUse (Edit|Write matcher) — file edit tracker

**Reference:** [hooks#posttooluse](https://code.claude.com/docs/en/hooks#posttooluse)

**Purpose:** Record every file path the agent edits during a session into a temp file keyed by
`session_id`. The `Stop` hook (§7.6) reads this list to run lint and typecheck only on touched files. Without the tracker, the `Stop` hook has no file list to operate on.

**Matcher:** `Edit|Write` — regex, matches both tool names
([matcher patterns](https://code.claude.com/docs/en/hooks#matcher-patterns)).

**Input fields used:**

- `input.tool_input.path` → the absolute path of the file that was edited or written
- `input.session_id` → temp file key

**Output:** Empty JSON `{}` — this hook has no decision to make, only a side effect (write to temp file). Exit 0.

**File:** `.claude/hooks/aic-after-file-edit-tracker.cjs`

---

### 7.6 Stop — quality gate (ESLint + typecheck)

**Reference:** [hooks#stop](https://code.claude.com/docs/en/hooks#stop)

**Purpose:** Before Claude reports "done", read the touched-file list from the tracker in §7.5. Run ESLint with those `.ts` / `.js` paths and run `tsc --noEmit` once at the project root (TypeScript does not receive a per-file path list).

If either command exits non-zero, the hook returns JSON with `decision: "block"` and the generic `reason` pattern in §6.5 (failed stages only, fixed `pnpm` lines, no subprocess stderr in the string). Claude Code surfaces that payload as the stop denial so the agent can fix issues and try stopping again.

**Matcher:** `Stop` does not support matchers — fires on every stop.

**Input fields used:** `input.session_id` → temp file key (to load the edited-files list)

**Implementation note:** If the temp file for this `session_id` does not exist (no files were edited, or the tracker missed it), exit 0 immediately — do not block.

**Implementation note:** If `tsconfig.json` is absent at the project root, the hook does not invoke `tsc` (treated as success); ESLint alone can still produce `decision: "block"`.

**File:** `.claude/hooks/aic-stop-quality-check.cjs`

---

### 7.7 PreCompact — context preservation before compaction

**Reference:** [hooks#precompact](https://code.claude.com/docs/en/hooks#precompact)

**Purpose:** Fires before Claude Code compacts the context window. AIC can inject a fresh compilation so the model retains the most relevant project context through the compaction boundary. This is an observational/enrichment hook — it cannot prevent compaction.

**Matcher values:** `manual`, `auto`

**Output:** Plain text stdout (same as §6.1 — `UserPromptSubmit` rule applies here; plain text is the safe path).

**File:** `.claude/hooks/aic-pre-compact.cjs`

---

### 7.8 SessionEnd — telemetry

**Reference:** [hooks#sessionend](https://code.claude.com/docs/en/hooks#sessionend)

**Purpose:** Log session lifecycle data to `.aic/prompt-log.jsonl`. The hook appends lines only.

Age-based pruning runs when the AIC MCP server starts (`shared/src/maintenance/prune-jsonl-by-timestamp.ts`).

No context injection — this hook produces no stdout. Exit 0 always (telemetry must never block the session from ending).

**Input fields used:** `input.session_id`, `input.reason`

**Additional responsibility:** Delete the `.aic/.session-context-injected` marker for this `session_id` (see the dual-path workaround in §7.2) so it doesn't persist across sessions. The hook also calls `releaseSessionLock`; see [Session start lock and session context marker](session-start-lock-and-marker.md) for lock and marker interaction.

**File:** `.claude/hooks/aic-session-end.cjs`

---

### 7.9 SubagentStop — reparent `compilation_log`

**Reference:** [hooks#subagentstop](https://code.claude.com/docs/en/hooks#subagentstop)

**Purpose:** When a subagent finishes, reparent that subagent’s `compilation_log` rows to the parent conversation so `aic_chat_summary` and diagnostics roll up correctly. Implemented by calling `aic_compile` with `triggerSource: "subagent_stop"`, `conversationId` = parent id, and `reparentFromConversationId` = child id (handler reparent path in [implementation-spec](../implementation-spec.md) — **Agentic workflows** under Pipeline orchestration).

**Input fields used:** Parent resolution uses the same transcript and fallback chain as other hooks (`conversationIdFromTranscriptPath` then `resolveConversationIdFallback`). Child id comes from `conversationIdFromAgentTranscriptPath` on `agent_transcript_path` / `input.agent_transcript_path`. Cursor-native envelopes (`cursor_version`) exit without MCP I/O.

**File:** `.claude/hooks/aic-subagent-stop.cjs` (see §10). **Cursor** equivalent: [cursor-integration-layer §7.11](cursor-integration-layer.md#711-subagent-stop--reparent-compilation_log).

---

## 8. Full event coverage

**Claude Code:** Of 18 lifecycle events ([table](https://code.claude.com/docs/en/hooks#hook-lifecycle)), AIC registers nine and skips nine.

| Event                               | AIC use | Reason skipped                                                                                                                                                                                                      |
| ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SessionStart`                      | §7.2    | —                                                                                                                                                                                                                   |
| `UserPromptSubmit`                  | §7.1    | —                                                                                                                                                                                                                   |
| `SubagentStart`                     | §7.3    | —                                                                                                                                                                                                                   |
| `PreToolUse` (Bash + MCP)           | §7.4    | —                                                                                                                                                                                                                   |
| `PostToolUse` (Edit\|Write)         | §7.5    | —                                                                                                                                                                                                                   |
| `Stop`                              | §7.6    | —                                                                                                                                                                                                                   |
| `PreCompact`                        | §7.7    | —                                                                                                                                                                                                                   |
| `SessionEnd`                        | §7.8    | —                                                                                                                                                                                                                   |
| `SubagentStop`                      | §7.9    | Reparents subagent `compilation_log` rows to the parent conversation via `aic_compile` (not the Stop quality gate). **Cursor:** same reparent role — [cursor-integration-layer](cursor-integration-layer.md) §7.11. |
| `PostToolUse` (aic_compile)         | skipped | `UserPromptSubmit` already runs `aic_compile` before the model starts. Model-triggered `aic_compile` calls are a fallback only; confirming them adds noise without value.                                           |
| `PostToolUseFailure`                | skipped | No AIC-specific recovery action on tool failure.                                                                                                                                                                    |
| `PermissionRequest`                 | skipped | Not AIC's concern — no policy to enforce here.                                                                                                                                                                      |
| `Notification`                      | skipped | Observational only; no value for AIC.                                                                                                                                                                               |
| `InstructionsLoaded`                | skipped | Fires when CLAUDE.md loads; AIC has no audit requirement here.                                                                                                                                                      |
| `ConfigChange`                      | skipped | No AIC policy triggered by config changes.                                                                                                                                                                          |
| `TeammateIdle`                      | skipped | Agent teams feature, out of scope.                                                                                                                                                                                  |
| `TaskCompleted`                     | skipped | Agent teams feature, out of scope.                                                                                                                                                                                  |
| `WorktreeCreate` / `WorktreeRemove` | skipped | Out of scope for the current AIC integration (lifecycle hooks only; not Git worktrees).                                                                                                                             |

---

## 9. MCP compile invocation from hooks

**Claude Code:** `aic-session-start.cjs` and `aic-prompt-compile.cjs` call `callAicCompile` from `aic-compile-helper.cjs` for full `aic_compile` runs. `aic-subagent-inject.cjs` uses the same helper with `triggerSource: "subagent_start"` for `compilation_log` telemetry. `aic-subagent-stop.cjs` issues a narrow stdio `tools/call` `aic_compile` reparent sequence (reparent-only path; no full pipeline). `aic-pre-compact.cjs` also uses the helper. Compile gates and PreToolUse behaviour are in §7.

### 9.1 Shared helper — `aic-compile-helper.cjs`

The shared helper mediates between a hook script and the AIC MCP server via MCP stdio. Its signature in `integrations/claude/hooks/aic-compile-helper.cjs` is:

```js
callAicCompile(
  intent,
  projectRoot,
  conversationId,
  timeoutMs,
  triggerSource,
  modelId,
  explicitEditorId,
);
```

**Emergency bypass:** Before spawning the MCP server, the helper checks `aic.config.json` via `isCompileGateSkipped()` (from `integrations/shared/read-project-dev-mode.cjs`). When **both** `devMode` and `skipCompileGate` are `true`, it returns `null` immediately without any I/O. This prevents all compilation hooks (SessionStart, UserPromptSubmit, SubagentStart) from hanging on a broken MCP server. Remove `skipCompileGate` from the config immediately after resolving the issue.

Shipped hooks resolve `conversationId` before building MCP arguments from `integrations/shared/conversation-id.cjs` ([Integrations shared modules](integrations-shared-modules.md)). The example below matches that resolution order inside the JSON-RPC body real hooks build (outer `jsonrpc` / `id` omitted).

```js
const {
  conversationIdFromTranscriptPath,
  resolveConversationIdFallback,
} = require("../../shared/conversation-id.cjs");
const conversationId =
  conversationIdFromTranscriptPath(parsed) ?? resolveConversationIdFallback(parsed);
// ...
JSON.stringify({
  method: "tools/call",
  params: {
    name: "aic_compile",
    arguments: {
      intent,
      projectRoot,
      editorId,
      ...(conversationId ? { conversationId } : {}),
      // optional: triggerSource, modelId (hook args and helper-side model resolution)
    },
  },
});
```

The snippet omits the outer `jsonrpc` / `id` envelope; the helper always supplies `editorId` via `detectEditorId()` in the same file.

Without a resolvable `conversationId`, `compilation_log` rows from Claude Code hooks have null `conversation_id`, and `aic_chat_summary` cannot aggregate them. Prefer transcript- or direct-`conversation_id`-derived ids. `resolveConversationIdFallback` may use validated `session_id` or `generation_id` only when they pass printable-ASCII length checks — they stabilise telemetry when the transcript UUID is unavailable; they are not interchangeable with the transcript filename id as the long-term conversation key when the host supplies the latter.

**Cold start:** Each hook invocation spawns a new process for the MCP stdio child. In `integrations/claude/hooks/aic-compile-helper.cjs`, when `mcp/src/server.ts` exists, the helper always launches it with `spawn("npx", ["tsx", serverPath], { cwd: projectRoot })` where `serverPath` is the resolved absolute path to that file — argv-only, so `projectRoot` and `serverPath` are never parsed by a shell.

When `shared/package.json` is also present, the helper compares `.ts` mtimes under `shared/src` and `mcp/src` against a temp-directory stamp keyed by the project root; when sources are newer, it runs `spawnSync("pnpm", ["--filter", "@jatbas/aic-core", "build"], { cwd: projectRoot, stdio: ["ignore", "inherit", "inherit"] })`, returns `null` on non-zero status, otherwise appends an empty write to the stamp (`fs.writeFileSync` with `{ flag: "a" }`) so later invocations skip the build until sources change again. When `mcp/src/server.ts` is absent, the helper runs `spawn("npx", ["@jatbas/aic"], { cwd: projectRoot })` for the published package.

On a cold filesystem cache the dev-oriented path is often ~500–1500ms before the first response. §10 hook entries use **30s**; the helper uses **25s** only when `timeoutMs` is omitted — shipped compile hooks pass **30s**, so runtime matches §10. For hook-spawned stdio versus Claude Code's registered MCP client, see §4.1 **Two transports to the same server**. §11 describes the HTTP hook path that avoids per-invocation spawn cost.

### 9.2 Session compile and UserPromptSubmit

`aic-session-start.cjs` calls `callAicCompile` with a fixed session-wide intent, **30s** timeout, `triggerSource` **`"session_start"`**, optional `modelId`, and `explicitEditorId` from the hook envelope. `aic-prompt-compile.cjs` calls `callAicCompile` with the classified user intent, **30s**, `triggerSource` **`"prompt_submit"`**, optional `modelId`, and `explicitEditorId`. Both paths use the `conversationId` resolution described in §9.1. Registration and command paths appear in §10.

### 9.3 Subagent telemetry and reparent

`aic-subagent-inject.cjs` calls `callAicCompile` with a derived subagent intent, **30s**, `triggerSource` **`"subagent_start"`**, and optional `modelId`. When `callAicCompile` returns `null`, the hook script still writes `{}` to stdout so the subagent can start (best-effort telemetry).

`aic-subagent-stop.cjs` does **not** use `callAicCompile`; it builds stdio JSON-RPC (`initialize`, `notifications/initialized`, `tools/call` on **`aic_compile`** with `triggerSource: "subagent_stop"`, parent `conversationId`, and `reparentFromConversationId` for the child) via `execSync` in `integrations/claude/hooks/aic-subagent-stop.cjs` (reparent-only tool response, not a full compile).

---

## 10. Registration payload

**Claude Code:** The JSON below merges into the `hooks` section of `~/.claude/settings.json` (global). The shipped `settings.json.template` uses `$HOME` in command paths instead of `~` for shell portability; structure matches.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.claude/hooks/aic-session-start.cjs\"",
            "timeout": 30,
            "statusMessage": "Compiling AIC project context..."
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.claude/hooks/aic-prompt-compile.cjs\"",
            "timeout": 30,
            "statusMessage": "Compiling intent-specific context..."
          }
        ]
      }
    ],
    "SubagentStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.claude/hooks/aic-subagent-inject.cjs\"",
            "timeout": 30,
            "statusMessage": "Compiling subagent context..."
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.claude/hooks/aic-subagent-stop.cjs\"",
            "timeout": 10
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.claude/hooks/aic-pre-compact.cjs\"",
            "timeout": 30,
            "statusMessage": "Compiling pre-compaction context..."
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.claude/hooks/aic-after-file-edit-tracker.cjs\""
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.claude/hooks/aic-stop-quality-check.cjs\"",
            "timeout": 60,
            "statusMessage": "Running lint and typecheck..."
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.claude/hooks/aic-pre-tool-gate.cjs\"",
            "timeout": 10,
            "statusMessage": "Checking AIC compile gate..."
          }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.claude/hooks/aic-block-no-verify.cjs\""
          }
        ]
      },
      {
        "matcher": "mcp__.*__aic_compile",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.claude/hooks/aic-inject-conversation-id.cjs\""
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.claude/hooks/aic-session-end.cjs\""
          }
        ]
      }
    ]
  }
}
```

---

## 11. HTTP hook — future optimization (eliminates cold start)

The hooks API supports `type: "http"` alongside `type: "command"`
([HTTP hook fields](https://code.claude.com/docs/en/hooks#http-hook-fields)). Claude Code sends the hook's JSON input as an HTTP POST request body. The response body uses the same output format as command hooks:

- `2xx` with plain text body → text added as context
- `2xx` with JSON body → parsed using the same JSON output schema

Since the AIC MCP server is already running when Claude Code is active, the MCP server can expose a lightweight HTTP endpoint for the hook URL in `settings.json`. The hook configuration changes from spawning a Node process to a single HTTP round-trip:

```json
{
  "type": "http",
  "url": "http://localhost:${AIC_HTTP_PORT}/hooks/user-prompt-submit",
  "timeout": 15
}
```

Benefits:

- Zero cold start — MCP server already has SQLite connection, pipeline initialized, tiktoken loaded
- No `npx tsx` overhead — pre-compiled JS already running
- Response body is plain text (§6.1 rule applies)

This is a future optimization, not a blocker. Command hooks work correctly and the 30-second timeout provides headroom.

---

## 12. Plugin distribution

**Claude Code:** A plugin exists — AIC ships as a native Claude Code Plugin (`integrations/claude/plugin/`) via the Plugin Marketplace. For manual install, `install.cjs`, and MCP bootstrap, see §13.

---

## 13. Direct installer path

**Claude Code:** Manual run or MCP bootstrap. The installer is `integrations/claude/install.cjs` in the repo — standalone, no dependency on `mcp/src/`. When the MCP server runs bootstrap, it prefers `<project>/integrations/claude/install.cjs` if that file exists under the opened workspace root; otherwise it runs the copy shipped inside the published `@jatbas/aic` package at package-relative `integrations/claude/install.cjs` (mirroring Cursor installer resolution in `editor-integration-dispatch.ts`).

```
node integrations/claude/install.cjs
```

The installer:

1. Ensures `~/.claude/hooks/` directory exists (resolve `~/.claude` from home).
2. For each hook script in `AIC_SCRIPT_NAMES`: reads content from
   `integrations/claude/hooks/` and writes to `~/.claude/hooks/` only if content differs
   (idempotent).
3. Deletes any `aic-*.cjs` files in `~/.claude/hooks/` that are not in `AIC_SCRIPT_NAMES`
   (stale script cleanup).
4. Reads `~/.claude/settings.json` (if present) and merges AIC entries into existing
   config, preserving non-AIC entries; writes only if merged content differs.
5. Removes legacy project-local AIC hooks: when cwd is not the user home, deletes any
   `aic-*.cjs` in `.claude/hooks/` and removes that directory if empty. For
   `.claude/settings.local.json`, strips the `hooks` key or deletes the file if nothing
   remains or the file is unparseable.
6. Writes the trigger rule (`.claude/CLAUDE.md` in the current working directory when
   writable), version-stamped; overwrites only when the installed version differs from
   the current package version.

The MCP server runs this installer when auto or forced bootstrap opens a Claude Code context
(detection per §2) and a resolved installer path exists (in-project or bundled). Triggers: on
workspace root listing (if the client supports roots) or on the first `aic_compile` for that
project. See [installation.md](../installation.md) for the user-facing path, including Cursor +
extension detection under `~/.cursor/extensions`.

For end-user distribution, AIC is also packaged as a native Claude Code Plugin (`integrations/claude/plugin/`) installable via the Plugin Marketplace. See `integrations/claude/plugin/` for the plugin structure.

---

## 14. Trigger rule

**Claude Code:** `.claude/CLAUDE.md` is a fallback when hooks are disabled
(`disableAllHooks: true`). It tells the model to call `aic_compile` manually on every message.
With hooks active, the trigger rule becomes redundant — but it is kept because
[users can disable all hooks](https://code.claude.com/docs/en/hooks#disable-or-remove-hooks) and it costs nothing when hooks are running.

---

## 15. Known bugs tracker

| Bug                                                                                            | Issue                                                            | Status                                                         | Workaround                                                                                               |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `hookSpecificOutput` JSON causes "UserPromptSubmit hook error" on first message of new session | [#17550](https://github.com/anthropics/claude-code/issues/17550) | Closed **not_planned**                                         | Use plain text stdout for `UserPromptSubmit` and `PreCompact` (§6.1)                                     |
| `SessionStart` hook output silently discarded for new sessions in CLI                          | [#10373](https://github.com/anthropics/claude-code/issues/10373) | **Open** since Oct 2025                                        | Dual-path injection via `UserPromptSubmit` fallback (§7.2)                                               |
| Plain text stdout caused "UserPromptSubmit hook error" in v2.0.69 (regression)                 | [#13912](https://github.com/anthropics/claude-code/issues/13912) | Closed as duplicate of #12151 — **resolved in later versions** | No workaround needed; plain text now works                                                               |
| Plugin hook `hookSpecificOutput` drops concurrent user hook flat `additionalContext`           | [#31658](https://github.com/anthropics/claude-code/issues/31658) | **Open** Mar 2026                                              | Use consistent `hookSpecificOutput` format for events that require it; plain text for `UserPromptSubmit` |

---

## 16. Verification checklist

All of the following must be verified for the Claude Code integration to be complete:

Context delivery:

- [ ] `aic-prompt-compile.cjs` runs on UserPromptSubmit and passes `intent` and `conversationId` (transcript path, direct id, or `resolveConversationIdFallback`) to `aic_compile` (§7.1)
- [ ] `aic-session-start.cjs` injects architectural invariants and project context via `hookSpecificOutput` (§7.2)
- [ ] `aic-subagent-inject.cjs` injects context into subagents (§7.3)

Quality gate (Claude Code–specific):

- [ ] `aic-after-file-edit-tracker.cjs` records edited files to temp file (§7.5)
- [ ] `aic-stop-quality-check.cjs` runs lint/typecheck, uses `decision: "block"` when needed (§7.6)
- [ ] `aic-block-no-verify.cjs` / `aic-inject-conversation-id.cjs` on PreToolUse (Bash + MCP) (§7.4)

Settings:

- [ ] `settings.json` (or plugin `hooks.json`) has all nine top-level hook keys (including `SubagentStop`) with correct matchers and options (§10)

Plugin and direct-install:

- [ ] Plugin path: the plugin provides hooks and MCP registration; direct installer path: `install.cjs` copies to `~/.claude/hooks/` and merges into `~/.claude/settings.json` (§12, §13)

Temp file and marker conventions:

- [ ] Temp file `aic-edited-claude_code-<session_id>.json` under `os.tmpdir()` (sanitized key): written by PostToolUse (Edit|Write), read by Stop, cleaned by SessionEnd (`integrations/shared/edited-files-cache.cjs`)
- [ ] `.aic/.session-context-injected`: written by SessionStart (dual-path workaround), read by UserPromptSubmit, deleted by SessionEnd (§7.2)

---

## 17. Uninstall

`integrations/claude/uninstall.cjs` defaults to **project-local** cleanup: (unless `--keep-project-artifacts`) project `aic.config.json`, `.aic/`, matching ignore-file lines, and the AIC managed span in `.claude/CLAUDE.md`. It does not modify **`<project>/.cursor/`**; use the Cursor uninstall script for Cursor MCP and hooks. **`--global`** adds AIC entries in `~/.claude/settings.json`, AIC scripts under `~/.claude/hooks/`, and the same `~/.aic/` cleanup as the Cursor script (SQLite preserved unless **`--global --remove-database`** or env overrides). **`devMode: true`** in **`aic.config.json`** skips all changes unless **`--force`**. See [installation.md § Uninstall](../installation.md#uninstall) for ordering, flags, and bundled paths inside `@jatbas/aic`.
