# Claude Code Integration Layer — Implementation Guide

---

## 1. Purpose

This document is the single source of truth for building and maintaining the Claude Code
integration layer. It covers the hook scripts in `integrations/claude/hooks/` (source) and
their deployment to `~/.claude/hooks/` (editor target), the settings wiring in
`~/.claude/settings.json`, the adapter pattern, and every known bug with its workaround.

---

## 2. Clean-layer architectural principle — mandatory

The AIC core (anything in `shared/` or `mcp/src/`) has **zero knowledge of Claude Code**.
All Claude Code-specific source code lives in `integrations/claude/`. The `.claude/` directory
and `~/.claude/` are **deployment targets** that Claude Code reads — they are not source
directories. This distinction is not a preference — it is a structural invariant.

What this means concretely:

- **No Claude Code detection or installer in `mcp/src/`.** The installer
  (`integrations/claude/install.cjs`) is a standalone script. It is run either manually
  (`node integrations/claude/install.cjs`) or during first-compile bootstrap when the MCP
  server detects Claude Code — the server delegates to the script; it does not embed
  installer logic.

- **The `aic_compile` MCP tool is neutral.** It accepts `intent`, `projectRoot`, and
  `conversationId`. It does not know who called it. The hook adapter in
  `integrations/claude/hooks/` translates Claude Code's hook protocol into that call —
  that translation is integration-layer work only.

- **Shared utilities are welcome** in `shared/` only when they are genuinely editor-agnostic
  (e.g. a `buildSessionContext()` helper that any editor integration could use). If a
  utility only makes sense for Claude Code, it goes in `integrations/claude/`.

---

## 3. Deployment scope — one implementation covers all three modes

Claude Code's hook settings are read from the same files by all three deployment modes:

| Mode                                                            | Hook support                   | Settings source                                                                                                                                                |
| --------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CLI** (`claude`)                                              | Full 18-event hook lifecycle   | `~/.claude/settings.json` + `.claude/settings.json`                                                                                                            |
| **VS Code extension** (`anthropic.claude-code`)                 | Same hooks via shared settings | Same files — settings shared between CLI and extension ([IDE integrations docs](https://code.claude.com/docs/en/ide-integrations))                             |
| **Cursor extension** (`cursor:extension/anthropic.claude-code`) | Same                           | Same files — listed explicitly as a supported install target ([IDE integrations docs](https://code.claude.com/docs/en/ide-integrations#install-the-extension)) |

One set of hook scripts, one settings file. All three modes pick them up without any
mode-specific code. The VS Code docs explicitly confirm: "Claude Code settings in
`~/.claude/settings.json`: shared between the extension and CLI. Use for allowed commands,
environment variables, hooks, and MCP servers." ([source](https://code.claude.com/docs/en/ide-integrations#configure-settings))

---

## 4. Architecture — adapter pattern, zero core changes

### 4.1 Why no AIC core changes are needed

AIC's pipeline operates on `CompilationRequest → CompilationResult`. It does not know which
editor or tool initiated the call. This is the hexagonal architecture invariant: core/pipeline
has zero knowledge of callers.

The integration layer is a thin adapter that translates Claude Code's hook protocol into an
`aic_compile` MCP call:

```
Claude Code runtime
  │
  │  stdin: { prompt, cwd, session_id, hook_event_name, … }
  ▼
.claude/hooks/aic-compile-helper.cjs   ← THE ADAPTER
  │
  │  JSON-RPC: tools/call aic_compile { intent, projectRoot, conversationId }
  ▼
mcp/src/server.ts → CompilationRunner.run()
  │
  │  result: { compiledPrompt, … }
  ▼
.claude/hooks/<event-hook>.cjs
  │
  │  stdout: plain text or hookSpecificOutput JSON (see §5)
  ▼
Claude Code runtime → injects as context
```

### 4.2 Where the adapter lives

The adapter (`aic-compile-helper.cjs`) and all event hooks are **authored** in
`integrations/claude/hooks/`. The installer deploys them to `~/.claude/hooks/` (global) or
`.claude/hooks/` (project-local). Nothing outside `integrations/claude/` changes at dev time.

### 4.3 Input field mapping

| Claude Code hook input field       | AIC `aic_compile` argument                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `input.prompt` (UserPromptSubmit)  | `intent`                                                                               |
| `input.agent_type` (SubagentStart) | part of `intent` string                                                                |
| Generic for session events         | fixed intent string `"understand project structure, architecture, and recent changes"` |
| `input.cwd`                        | `projectRoot` (fallback to `$CLAUDE_PROJECT_DIR` → `process.cwd()`)                    |
| `input.session_id`                 | `conversationId`                                                                       |

**`conversationId` must always be passed** from `session_id` so `compilation_log` rows are
attributed to the correct conversation. Claude Code resolves this cleanly because `session_id`
is present in _every_ hook input ([common input fields](https://code.claude.com/docs/en/hooks#common-input-fields)). The `aic-compile-helper`
must accept and forward it.

---

## 5. Target file layout

`integrations/claude/` is the source. Deployment target for hook registration is
`~/.claude/` (global) only. Nothing in `mcp/` or `shared/` changes.

```
integrations/claude/               ← SOURCE (authored here)
  hooks/
    aic-compile-helper.cjs         # Protocol adapter (shared by all context hooks)
    aic-prompt-compile.cjs         # UserPromptSubmit — PRIMARY context delivery
    aic-session-start.cjs          # SessionStart — bootstrapping + post-compaction
    aic-subagent-inject.cjs        # SubagentStart — subagent context injection
    aic-after-file-edit-tracker.cjs  # PostToolUse(Edit|Write) — feeds Stop hook
    aic-stop-quality-check.cjs     # Stop — ESLint + typecheck quality gate
    aic-block-no-verify.cjs        # PreToolUse(Bash) — block --no-verify git commits
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

Claude Code's hooks use two distinct output mechanisms depending on the event. Getting this
wrong produces silent drops or "hook error" banners.

### 6.1 UserPromptSubmit — use plain text stdout

**Recommended:** write plain text directly to stdout. Any non-JSON text is added as context
([docs](https://code.claude.com/docs/en/hooks#userpromptsubmit)):

```js
// RECOMMENDED — works on every message including first
process.stdout.write(compiled);
```

The docs also support a JSON format with `hookSpecificOutput`, but issue
[#17550](https://github.com/anthropics/claude-code/issues/17550) (filed Jan 2026, **closed
as `not_planned`**) shows that `hookSpecificOutput` JSON causes a "UserPromptSubmit hook
error" on the **first message of every new session**. The hook runs correctly (exit code 0,
valid JSON), but Claude Code's session-init path cannot process it. Anthropic declined to fix
this. Plain text avoids the bug entirely and is the documented first-class path.

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

### 6.2 SessionStart — use `hookSpecificOutput` JSON

For `SessionStart`, the [official docs](https://code.claude.com/docs/en/hooks#sessionstart-decision-control)
only document the `hookSpecificOutput` format for `additionalContext` injection. There is no
plain text path specified for this event. Use the documented format:

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

Note: issue [#10373](https://github.com/anthropics/claude-code/issues/10373) (**open** since
Oct 2025) means this hook's output is silently discarded for _brand new_ interactive sessions
in CLI mode. The format is not the problem — the hook fires but its output is dropped at the
session-init path. Workaround: dual-path injection via `UserPromptSubmit` (see §7.2).

### 6.3 SubagentStart — use `hookSpecificOutput` JSON

Same behavior as `SessionStart`. The [docs](https://code.claude.com/docs/en/hooks#subagentstart)
only document `hookSpecificOutput` for `additionalContext` injection on this event:

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
    reason: "Fix lint/typecheck errors: ...",
  }),
);
```

([Stop decision control](https://code.claude.com/docs/en/hooks#stop-decision-control))

### 6.6 PostToolUse, SessionEnd — empty JSON `{}`

These hooks have no context-injection or decision output. Exit 0 with no stdout (or empty
`{}`) signals success.

---

## 7. Hook events — details and known bugs

All 18 Claude Code lifecycle events are documented at
[code.claude.com/docs/en/hooks#hook-lifecycle](https://code.claude.com/docs/en/hooks#hook-lifecycle).
AIC uses eight of them.

### 7.1 UserPromptSubmit — PRIMARY delivery

**Reference:** [hooks#userpromptsubmit](https://code.claude.com/docs/en/hooks#userpromptsubmit)

**Why this is AIC's core value for Claude Code:** Fires before every user message, before the
model processes it. The user's actual prompt text is available as `input.prompt` — this is the
intent. No trigger rule needed; no model compliance required. Context delivery becomes
deterministic and automatic.

**Input fields used:**

- `input.prompt` → `intent` for `aic_compile`
- `input.session_id` → `conversationId` for `aic_compile`
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

**Purpose:** Inject architectural invariants and a broad project context snapshot at the start of
a session. Also fires on `compact` — re-injecting context after compaction is the primary
reliable use case.

**Matcher values:** `startup`, `resume`, `clear`, `compact`
([matcher reference](https://code.claude.com/docs/en/hooks#matcher-patterns)).
The hook as written uses no matcher (fires on all four).

**Known bug — not firing for new sessions in CLI:** Issue
[#10373](https://github.com/anthropics/claude-code/issues/10373) (filed Oct 2025, **still open**
as of Mar 2026). `SessionStart` fires on `/clear`, `/compact`, and URL resume, but
**not on brand new interactive sessions** in CLI mode. The hook executes but its output is
discarded. This is a runtime processing bug, not a format issue.

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

The marker is scoped by `session_id` so multiple concurrent sessions don't interfere. Delete
the marker in `SessionEnd`.

**Output:** `hookSpecificOutput` JSON (see §6.2).

**File:** `.claude/hooks/aic-session-start.cjs`

---

### 7.3 SubagentStart — subagent context injection

**Reference:** [hooks#subagentstart](https://code.claude.com/docs/en/hooks#subagentstart)

**Why this matters:** Subagents lose parent context. Without this hook, every Claude Code
subagent (`Bash`, `Explore`, `Plan`, or custom agents from `.claude/agents/`) starts without
knowing the project architecture or conventions.

**Input fields used:**

- `input.agent_type` → `"Bash"`, `"Explore"`, `"Plan"`, or custom agent name
- `input.session_id` → `conversationId`

**Matcher:** Use `"*"` or omit — inject context into all subagent types. Optionally filter to
`Explore|Plan` if Bash subagents don't need full context.

**Output:** `hookSpecificOutput` JSON (see §6.3).

**File:** `.claude/hooks/aic-subagent-inject.cjs`

---

### 7.4 PreToolUse (Bash matcher) — `--no-verify` blocker

**Reference:** [hooks#pretooluse](https://code.claude.com/docs/en/hooks#pretooluse)

**Purpose:** Block any `git` command that includes `--no-verify` or `-n`. Project rules forbid
skipping pre-commit hooks (Husky + lint-staged enforce formatting and linting). An agent will
sometimes try to add `--no-verify` to get past a failing commit — this hook stops it
deterministically, not via instruction.

**Matcher:** `Bash` — fires only on Bash tool calls.

**Decision output:** `hookSpecificOutput` with `permissionDecision: "deny"` (see §6.4).

**Input fields used:** `input.tool_input.command`

**File:** `.claude/hooks/aic-block-no-verify.cjs`

---

### 7.5 PostToolUse (Edit|Write matcher) — file edit tracker

**Reference:** [hooks#posttooluse](https://code.claude.com/docs/en/hooks#posttooluse)

**Purpose:** Record every file path the agent edits during a session into a temp file keyed by
`session_id`. The `Stop` hook (§7.6) reads this list to run lint and typecheck only on touched
files. Without the tracker, the `Stop` hook has no file list to operate on.

**Matcher:** `Edit|Write` — regex, matches both tool names
([matcher patterns](https://code.claude.com/docs/en/hooks#matcher-patterns)).

**Input fields used:**

- `input.tool_input.path` → the absolute path of the file that was edited or written
- `input.session_id` → temp file key

**Output:** Empty JSON `{}` — this hook has no decision to make, only a side effect (write to
temp file). Exit 0.

**File:** `.claude/hooks/aic-after-file-edit-tracker.cjs`

---

### 7.6 Stop — quality gate (ESLint + typecheck)

**Reference:** [hooks#stop](https://code.claude.com/docs/en/hooks#stop)

**Purpose:** Before Claude reports "done", run ESLint and `tsc --noEmit` on every file the agent
touched this session (from the tracker in §7.5). If either fails, block the stop and feed the
error back so Claude auto-fixes before finishing. The `Stop` hook uses `decision: "block"`
(see §6.5) which prevents Claude from finishing, with `reason` shown as an error — Claude
continues the conversation and fixes the errors before stopping again.

**Matcher:** `Stop` does not support matchers — fires on every stop.

**Input fields used:** `input.session_id` → temp file key (to load the edited-files list)

**Implementation note:** If the temp file for this `session_id` does not exist (no files were
edited, or the tracker missed it), exit 0 immediately — do not block.

**File:** `.claude/hooks/aic-stop-quality-check.cjs`

---

### 7.7 PreCompact — context preservation before compaction

**Reference:** [hooks#precompact](https://code.claude.com/docs/en/hooks#precompact)

**Purpose:** Fires before Claude Code compacts the context window. AIC can inject a fresh
compilation so the model retains the most relevant project context through the compaction
boundary. This is an observational/enrichment hook — it cannot prevent compaction.

**Matcher values:** `manual`, `auto`

**Output:** Plain text stdout (same as §6.1 — `UserPromptSubmit` rule applies here; plain
text is the safe path).

**File:** `.claude/hooks/aic-pre-compact.cjs`

---

### 7.8 SessionEnd — telemetry

**Reference:** [hooks#sessionend](https://code.claude.com/docs/en/hooks#sessionend)

**Purpose:** Log session lifecycle data to `.aic/prompt-log.jsonl`. No context injection — this
hook produces no stdout. Exit 0 always (telemetry must never block the session from ending).

**Input fields used:** `input.session_id`, `input.reason`

**Additional responsibility:** Delete the `.aic/.session-context-injected` marker for this
`session_id` (see the dual-path workaround in §7.2) so it doesn't persist across sessions.

**File:** `.claude/hooks/aic-session-end.cjs`

---

## 8. Full event coverage — why the remaining 10 events are skipped

The 18 Claude Code hook events ([lifecycle table](https://code.claude.com/docs/en/hooks#hook-lifecycle))
break down as: 8 AIC uses, 10 consciously skipped.

| Event                               | AIC use | Reason skipped                                                                                                                                                            |
| ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SessionStart`                      | §7.2    | —                                                                                                                                                                         |
| `UserPromptSubmit`                  | §7.1    | —                                                                                                                                                                         |
| `SubagentStart`                     | §7.3    | —                                                                                                                                                                         |
| `PreToolUse` (Bash)                 | §7.4    | —                                                                                                                                                                         |
| `PostToolUse` (Edit\|Write)         | §7.5    | —                                                                                                                                                                         |
| `Stop`                              | §7.6    | —                                                                                                                                                                         |
| `PreCompact`                        | §7.7    | —                                                                                                                                                                         |
| `SessionEnd`                        | §7.8    | —                                                                                                                                                                         |
| `SubagentStop`                      | future  | Same logic as `Stop` but for subagents. Add if subagent quality gate is needed.                                                                                           |
| `PostToolUse` (aic_compile)         | skipped | `UserPromptSubmit` already runs `aic_compile` before the model starts. Model-triggered `aic_compile` calls are a fallback only; confirming them adds noise without value. |
| `PostToolUseFailure`                | skipped | No AIC-specific recovery action on tool failure.                                                                                                                          |
| `PermissionRequest`                 | skipped | Not AIC's concern — no policy to enforce here.                                                                                                                            |
| `Notification`                      | skipped | Observational only; no value for AIC.                                                                                                                                     |
| `InstructionsLoaded`                | skipped | Fires when CLAUDE.md loads; AIC has no audit requirement here.                                                                                                            |
| `ConfigChange`                      | skipped | No AIC policy triggered by config changes.                                                                                                                                |
| `TeammateIdle`                      | skipped | Agent teams feature, out of scope.                                                                                                                                        |
| `TaskCompleted`                     | skipped | Agent teams feature, out of scope.                                                                                                                                        |
| `WorktreeCreate` / `WorktreeRemove` | skipped | Out of scope for current phase.                                                                                                                                           |

---

## 9. `aic-compile-helper.cjs` — required design

The shared helper mediates between a hook script and the AIC MCP server via MCP stdio. Its
signature must be:

```js
callAicCompile(intent, projectRoot, sessionId, timeoutMs);
```

The `compileRequest` arguments object must include `conversationId` when `sessionId` is
available:

```js
// correct
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

**Cold start:** Each hook invocation spawns a new Node process and runs `npx tsx` to compile
TypeScript before executing. On a cold filesystem cache this is ~500–1500ms. The 30-second hook
timeout provides ample headroom, but §11 describes the HTTP hook path that eliminates the
overhead entirely.

---

## 10. `settings.json` — registration payload

The target JSON payload merged into the `hooks` section of `~/.claude/settings.json` (global scope):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"~/.claude/hooks/aic-session-start.cjs\"",
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
            "command": "node \"~/.claude/hooks/aic-prompt-compile.cjs\"",
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
            "command": "node \"~/.claude/hooks/aic-subagent-inject.cjs\"",
            "timeout": 30,
            "statusMessage": "Compiling subagent context..."
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"~/.claude/hooks/aic-pre-compact.cjs\"",
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
            "command": "node \"~/.claude/hooks/aic-after-file-edit-tracker.cjs\""
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"~/.claude/hooks/aic-stop-quality-check.cjs\"",
            "timeout": 60,
            "statusMessage": "Running lint and typecheck..."
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"~/.claude/hooks/aic-block-no-verify.cjs\""
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"~/.claude/hooks/aic-session-end.cjs\""
          }
        ]
      }
    ]
  }
}
```

### 10.2 Hook registration scope

Hook registration lives only in `~/.claude/settings.json`; there is no project-local hook registration.

---

## 11. HTTP hook — future optimization (eliminates cold start)

The hooks API supports `type: "http"` alongside `type: "command"`
([HTTP hook fields](https://code.claude.com/docs/en/hooks#http-hook-fields)). Claude Code sends
the hook's JSON input as an HTTP POST request body. The response body uses the same output
format as command hooks:

- `2xx` with plain text body → text added as context
- `2xx` with JSON body → parsed using the same JSON output schema

Since the AIC MCP server is already running when Claude Code is active, we can expose a
lightweight HTTP endpoint on the MCP server (e.g. `http://localhost:PORT/hooks/user-prompt-submit`).
The hook configuration changes from spawning a Node process to a single HTTP round-trip:

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

This is a future optimization, not a blocker. Command hooks work correctly and the 30-second
timeout provides headroom.

---

## 12. Plugin distribution — available

Claude Code exposes a plugin system. AIC is packaged as a native Claude Code Plugin
(`integrations/claude/plugin/`) installable via the Plugin Marketplace. This provides
zero-friction install for end users. See §13 for the direct installer path when developing
from source.

---

## 13. Direct installer path (zero-install)

The direct installer path (also called zero-install in this doc) provides a one-command install
experience. The installer is `integrations/claude/install.cjs` — a standalone script in the
integration layer that has no dependency on `mcp/src/`.

```
node integrations/claude/install.cjs
```

The installer:

1. Resolves `~/.claude` from the user's home directory
2. Copies hook scripts from `integrations/claude/hooks/` (relative to the script) to
   `~/.claude/hooks/`
3. Reads `settings.json.template` (paths are already `$HOME/.claude/hooks/`)
4. Reads `~/.claude/settings.json` if present; deep-merges AIC hook entries, preserving
   non-AIC entries; writes `~/.claude/settings.json`
5. Optionally writes `.claude/CLAUDE.md` in the current working directory for the
   trigger-rule fallback

The MCP server runs this installer during first-compile bootstrap when it detects a Claude
Code context (e.g. `.claude/` directory or `$CLAUDE_PROJECT_DIR`). The server delegates to
the integration layer — it does not embed Claude Code logic itself. See
`documentation/installation.md` for the user-facing description of this path.

For end-user distribution, AIC is also packaged as a native Claude Code Plugin
(`integrations/claude/plugin/`) installable via the Plugin Marketplace. See
`integrations/claude/plugin/` for the plugin structure.

---

## 14. Trigger rule fallback — CLAUDE.md

`.claude/CLAUDE.md` remains as a fallback for users who have hooks disabled
(`disableAllHooks: true`). It tells the model to call `aic_compile` manually on every message.
With hooks active, the trigger rule becomes redundant — but it is kept because
[users can disable all hooks](https://code.claude.com/docs/en/hooks#disable-or-remove-hooks)
and it costs nothing when hooks are running.

---

## 15. Known bugs tracker

| Bug                                                                                            | Issue                                                            | Status                                                         | Workaround in AIC                                                                                        |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `hookSpecificOutput` JSON causes "UserPromptSubmit hook error" on first message of new session | [#17550](https://github.com/anthropics/claude-code/issues/17550) | Closed **not_planned**                                         | Use plain text stdout for `UserPromptSubmit` and `PreCompact` (§6.1)                                     |
| `SessionStart` hook output silently discarded for new sessions in CLI                          | [#10373](https://github.com/anthropics/claude-code/issues/10373) | **Open** since Oct 2025                                        | Dual-path injection via `UserPromptSubmit` fallback (§7.2)                                               |
| Plain text stdout caused "UserPromptSubmit hook error" in v2.0.69 (regression)                 | [#13912](https://github.com/anthropics/claude-code/issues/13912) | Closed as duplicate of #12151 — **resolved in later versions** | No workaround needed; plain text now works                                                               |
| Plugin hook `hookSpecificOutput` drops concurrent user hook flat `additionalContext`           | [#31658](https://github.com/anthropics/claude-code/issues/31658) | **Open** Mar 2026                                              | Use consistent `hookSpecificOutput` format for events that require it; plain text for `UserPromptSubmit` |

---

## 17. Verification checklist

All of the following must be verified for the Claude Code integration to be complete:

Context delivery:

- [ ] `aic-prompt-compile.cjs` runs on UserPromptSubmit and passes `intent` and `conversationId` to `aic_compile` (§7.1)
- [ ] `aic-session-start.cjs` injects architectural invariants and project context via `hookSpecificOutput` (§7.2)
- [ ] `aic-subagent-inject.cjs` injects context into subagents (§7.3)

Quality gate (Claude Code–specific):

- [ ] `aic-after-file-edit-tracker.cjs` records edited files to temp file (§7.5)
- [ ] `aic-stop-quality-check.cjs` runs lint/typecheck, uses `decision: "block"` when needed (§7.6)
- [ ] `aic-block-no-verify.cjs` blocks `--no-verify` via PreToolUse (Bash) (§7.4)

Settings:

- [ ] `settings.json` (or plugin `hooks.json`) has all 8 hook registrations with correct matchers and options (§10)

Plugin and direct-install:

- [ ] Plugin path: the plugin provides hooks and MCP registration; direct installer path: `install.cjs` copies to `~/.claude/hooks/` and merges into `~/.claude/settings.json` (§12, §13)

Temp file and marker conventions:

- [ ] Temp file `aic-cc-edited-<session_id>.json` (in temp directory): written by PostToolUse (Edit|Write), read by Stop, cleaned by SessionEnd
- [ ] `.aic/.session-context-injected`: written by SessionStart (dual-path workaround), read by UserPromptSubmit, deleted by SessionEnd (§7.2)
