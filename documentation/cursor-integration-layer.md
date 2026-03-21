# Cursor Integration Layer — Implementation Guide

---

## 1. Purpose

This document is the single source of truth for building and maintaining the Cursor integration layer. It covers the hook scripts in `integrations/cursor/hooks/` (source) and their deployment to `.cursor/hooks/` (editor target), the `hooks.json` wiring, the adapter pattern, and all known limitations of Cursor's hook system.

---

## 2. Clean-layer architectural principle — mandatory

The AIC core (anything in `shared/` or `mcp/src/`) has **zero knowledge of Cursor**. All
Cursor-specific source code lives in `integrations/cursor/`. The `.cursor/` directory is a
**deployment target** that Cursor reads — it is not a source directory. This distinction is not a preference — it is a structural invariant.

What this means concretely:

- **All Cursor hook and hooks.json logic lives in `integrations/cursor/`.** The installer
  (`integrations/cursor/install.cjs`) is standalone. `mcp/src/editor-integration-dispatch.ts`
  runs it with `execFileSync` when that script exists under the project root and the module’s
  bootstrap gate passes (see that file — not only `.cursor/` / `CURSOR_PROJECT_DIR` may open
  the gate). Triggers: workspace roots listed (if the client supports roots) or **first**
  `aic_compile` for that project. No copy/merge logic duplicated in `mcp/src/`. Projects
  without `integrations/cursor/install.cjs` in the root need a manual run from an AIC checkout
  (see [installation.md](installation.md#first-compile-bootstrap)).

- **The `aic_compile` MCP tool is neutral.** It accepts `intent`, `projectRoot`, and
  `conversationId`. It does not know who called it. The hook adapter in `integrations/cursor/hooks/`
  translates Cursor's hook protocol into that call — that translation is integration-layer work only.

- **Shared utilities are welcome** in `shared/` only when they are genuinely editor-agnostic
  (e.g. a `buildSessionContext()` helper that any editor integration could use). If a
  utility only makes sense for Cursor, it goes in `integrations/cursor/`.

---

## 3. Deployment scope

**Cursor:** The AIC MCP server is global in Cursor (`~/.cursor/mcp.json`), but **Cursor does not support global hooks**. The hook configuration (`.cursor/hooks.json`) and scripts (`.cursor/hooks/AIC-*.cjs`) are per-project artifacts — they must exist inside each project directory.

**How they get there:** The MCP server runs `integrations/cursor/install.cjs` automatically when
that path exists under the opened root and the bootstrap gate in
`editor-integration-dispatch.ts` passes — on root listing (if supported) or on the first
`aic_compile` for the project. Otherwise run `node integrations/cursor/install.cjs` manually
from an AIC checkout (see [installation.md](installation.md#first-compile-bootstrap)).

The installer is idempotent: it merges `hooks.json` and copies all **11** `AIC-*.cjs` scripts from `integrations/cursor/hooks/`.

**Optional: commit hooks to the repo.** Teams can commit `.cursor/hooks.json` and `.cursor/hooks/AIC-*.cjs` so every clone gets hooks without re-running the installer.

> **Verified:** Cursor documents `sessionStart`, `beforeSubmitPrompt`, `preToolUse`, `postToolUse`,
> `beforeShellExecution`, `afterFileEdit`, `sessionEnd`, `stop`, and `subagentStart`. See
> per-event sections below for source links.

---

## 4. Architecture — adapter pattern, no core changes needed

### 4.1 Why no AIC core changes are needed

AIC's pipeline operates on `CompilationRequest → CompilationResult`. It does not know which editor or tool initiated the call. This is the hexagonal architecture invariant: core/pipeline has zero knowledge of callers.

The integration layer is a thin adapter that translates Cursor's hook protocol into an
`aic_compile` MCP call:

```
Cursor runtime
  │
  │  stdin: { session_id, generation_id, prompt, … }
  ▼
.cursor/hooks/AIC-<role>.cjs   ← one hook process per registration
  │
  │  (session compile / subagent telemetry only) JSON-RPC: tools/call aic_compile …
  ▼
mcp/src/server.ts → CompilationRunner.run()
  │
  │  result: { compiledPrompt, … }  (only for hooks that invoke MCP)
  ▼
same hook process
  │
  │  stdout: JSON — additional_context, env, permission, etc. (see §6)
  ▼
Cursor runtime → injects as context
```

### 4.2 Where the adapter lives

All event hooks are **authored** in `integrations/cursor/hooks/`. The installer deploys them to `.cursor/hooks/` per project. Nothing outside `integrations/cursor/` changes at dev time.

`AIC-compile-context.cjs` and `AIC-subagent-compile.cjs` each spawn the MCP server via `execSync`
and JSON-RPC to call `aic_compile`. Every other hook is pure Node (gate, inject, tracker,
blockers, telemetry).

### 4.3 Input field mapping

| Cursor hook input field                         | How AIC uses it                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `input.conversation_id`                         | → `conversationId` for `aic_compile` (sessionStart hook and preToolUse)             |
| `input.model`                                   | → `modelId` on `aic_compile` (sessionStart and preToolUse inject)                   |
| `input.generation_id`                           | temp file key for per-generation state (`aic-gate-<id>`, `aic-prompt-<id>`)         |
| `input.prompt`                                  | saved to temp file by `beforeSubmitPrompt` for gate deny message                    |
| `input.command`                                 | inspected by `beforeShellExecution` for `--no-verify`                               |
| `input.files` / `input.file` / `input.filePath` | edited file paths, recorded by `afterFileEdit`                                      |
| `input.reason` / `input.duration_ms`            | session end telemetry                                                               |
| `CURSOR_PROJECT_DIR` env var                    | project root for hooks that need it                                                 |
| `AIC_PROJECT_ROOT` env var                      | injected by sessionStart hook via `env:` output field                               |
| `AIC_CONVERSATION_ID` env var                   | injected by sessionStart hook; fallback for hooks where `conversation_id` is absent |

---

## 5. Target file layout

`integrations/cursor/` is the source. `.cursor/` is the per-project deployment target.
Nothing in `mcp/` or `shared/` changes.

```
integrations/cursor/               ← SOURCE (authored here)
  hooks/
    AIC-session-init.cjs           # sessionStart — architectural invariants + env setup
    AIC-compile-context.cjs        # sessionStart — calls aic_compile, injects compiled context
    AIC-before-submit-prewarm.cjs  # beforeSubmitPrompt — prompt logging + gate prewarm
    AIC-require-aic-compile.cjs    # preToolUse — blocks all tools until aic_compile called
    AIC-inject-conversation-id.cjs # preToolUse (MCP) — injects conversationId into MCP args
    AIC-post-compile-context.cjs   # postToolUse (MCP) — confirmation after aic_compile
    AIC-block-no-verify.cjs        # beforeShellExecution (git) — blocks --no-verify
    AIC-after-file-edit-tracker.cjs # afterFileEdit — records edited files to temp file
    AIC-stop-quality-check.cjs     # stop — ESLint + typecheck quality gate
    AIC-session-end.cjs            # sessionEnd — temp file cleanup + session telemetry
    AIC-subagent-compile.cjs       # subagentStart — aic_compile for compilation_log telemetry
    subagent-start-model-id.cjs    # helper: subagent_model → modelId (deployed beside hooks)
  install.cjs                      # Installer: copies hooks, merges hooks.json
  hooks.json.template              # hooks.json template

.cursor/                           ← DEPLOYMENT TARGET (per-project, created by install.cjs)
  hooks/
    AIC-*.cjs                      # Deployed from integrations/cursor/hooks/
  hooks.json                       # Merged by install.cjs
  rules/
    AIC.mdc                        # Trigger rule — instructs model to call aic_compile
```

---

## 6. Output format — event-specific rules

Cursor hooks communicate results by writing JSON to stdout. Each event has a specific schema.
Getting the schema wrong causes the hook to be silently ignored or to error.

### 6.1 sessionStart — `additional_context` + `env`

```js
process.stdout.write(
  JSON.stringify({
    additional_context: "...",
    env: { AIC_PROJECT_ROOT: "...", AIC_CONVERSATION_ID: "..." },
  }),
);
```

The `env` field sets environment variables for the session scope — all subsequent hooks in this session receive these values via `process.env`. This is the only mechanism available to propagate `conversationId` to hooks that don't receive `conversation_id` in their own stdin input.

### 6.2 beforeSubmitPrompt — `{ continue: true }`

```js
process.stdout.write(JSON.stringify({ continue: true }));
```

Must always return `{ continue: true }`. Returning `{ continue: false }` blocks prompt submission. This hook is zero-cost — it saves the prompt to a temp file and returns immediately.

### 6.3 preToolUse — `permission: "allow"` or deny

Allow:

```js
process.stdout.write(JSON.stringify({ permission: "allow" }));
```

Deny (with message shown to user and agent):

```js
process.stdout.write(
  JSON.stringify({
    permission: "deny",
    user_message: "...",
    agent_message: "...",
  }),
);
```

For the `AIC-inject-conversation-id.cjs` hook, an `updated_input` field can override the tool's input arguments:

```js
process.stdout.write(
  JSON.stringify({
    permission: "allow",
    updated_input: { ...toolInput, conversationId: "..." },
  }),
);
```

### 6.4 postToolUse — `additional_context`

```js
process.stdout.write(
  JSON.stringify({
    additional_context:
      "AIC compilation completed. Use the compiled context for your next response.",
  }),
);
```

### 6.5 beforeShellExecution — `permission: "allow"` or deny

Same schema as preToolUse §6.3.

### 6.6 afterFileEdit — empty `{}`

Side-effect only hook. Writes to temp file. Returns `{}`.

### 6.7 stop — `{ followup_message: "..." }` or `{}`

```js
// Block stop and submit a follow-up automatically:
process.stdout.write(
  JSON.stringify({ followup_message: "Fix lint and typecheck errors..." }),
);

// Allow stop:
process.stdout.write(JSON.stringify({}));
```

> The `followup_message` causes Cursor to auto-submit the text as a follow-up prompt, allowing the model to fix errors before the session ends. The `loop_limit` field in `hooks.json` prevents infinite retry loops.

### 6.8 sessionEnd — no stdout

Side-effect only. Exit 0 always. Must never block.

---

## 7. Hook events — details

Cursor's hook system is documented at [docs.cursor.com/context/rules](https://docs.cursor.com/context/rules).
AIC registers **11** hook commands across **9** event types (some types run more than one command). Limitations and workarounds are per hook below.

### 7.1 sessionStart — two hooks (architectural invariants + compiled context)

**Event:** `sessionStart`

**Why two hooks:** The first hook (`AIC-session-init.cjs`) injects architectural invariants from the project's `AIC-architect.mdc` rule file — fast, no external call, always succeeds. The second hook (`AIC-compile-context.cjs`) calls `aic_compile` to inject a broad project context snapshot — may time out, fail non-fatally.

**AIC-session-init.cjs:**

- Reads the `## Critical reminders` section from `.cursor/rules/AIC-architect.mdc`
- Extracts bullet points and outputs them as `additional_context`
- Injects `AIC_CONVERSATION_ID=${conversationId}` into the context text so the model is aware
- Sets `env: { AIC_PROJECT_ROOT, AIC_CONVERSATION_ID }` for downstream hooks

**AIC-compile-context.cjs:**

- Reads `conversation_id` from stdin → passes as `conversationId` to `aic_compile`
- Calls `aic_compile` with intent `"understand project structure, architecture, and recent changes"`
- Outputs `additional_context` with the compiled project snapshot
- **If this hook times out (20s), it exits 0 silently** — session creation is never blocked

**Known limitation — `aic_compile` from sessionStart is best-effort:** The compiled context from `AIC-compile-context.cjs` is broad and intent-agnostic (project structure only). The primary per-intent context delivery in Cursor relies on the model calling `aic_compile` itself (enforced by the `preToolUse` gate). There is **no per-prompt context injection hook** in Cursor — `beforeSubmitPrompt` does not support `additional_context` output (see §7.2).

**File:** `.cursor/hooks/AIC-compile-context.cjs`

---

### 7.2 beforeSubmitPrompt — prompt logging and gate prewarm

**Event:** `beforeSubmitPrompt`

**Input fields used:**

- `input.prompt` → saved to `os.tmpdir()/aic-prompt-<generation_id>` for gate deny message
- `input.generation_id` → temp file key
- `input.conversation_id` → logged to `.aic/prompt-log.jsonl`
- `input.model` → logged to `.aic/prompt-log.jsonl`

**Purpose:** This hook has two jobs:

1. **Prompt log:** Appends one JSON line per user message to `.aic/prompt-log.jsonl`
   (`conversationId`, `generationId`, first 200 chars as `title`, `model`, `timestamp`).
   Age-based pruning of that file is not performed inside this hook; it runs when the AIC MCP server process starts, via `shared/src/maintenance/prune-jsonl-by-timestamp.ts` (same helper as `.aic/session-log.jsonl` and `.aic/session-models.jsonl`).

2. **Gate prewarm:** Writes the full `prompt` text to a per-generation temp file so
   `AIC-require-aic-compile.cjs` can include the exact intent in its deny message. Without
   this, the deny message falls back to a generic placeholder, reducing the chance the model
   uses the correct intent for `aic_compile`.

**Always returns `{ continue: true }`** — this hook must never block prompt submission.

**Known limitation — no context injection:** `beforeSubmitPrompt` does not support an
`additional_context` output field in Cursor's current hook schema. It can only allow/block the submission.

**File:** `.cursor/hooks/AIC-before-submit-prewarm.cjs`

---

### 7.3 preToolUse (unmatched) — `aic_compile` enforcement gate

**Event:** `preToolUse` (no matcher — fires on all tools)

**Input fields used:**

- `input.generation_id` → per-generation state file key
- `input.tool_name` → to detect if the call is `aic_compile`
- `input.tool_input` → alternative detection for `aic_compile`

**Purpose:** Block every tool call until `aic_compile` has been called for the current generation. Mechanics:

1. On the first `aic_compile` call: write a marker file `os.tmpdir()/aic-gate-<generation_id>`.
   Allow the call.
2. On any subsequent tool call: if the marker file exists, allow. If not, deny.
3. The deny message includes the exact user prompt (from the prewarm temp file) as the
   recommended `intent` argument — making it likely the model calls `aic_compile` with
   the correct intent and gets a cache hit from the prewarm.

**Output:** `{ permission: "allow" }` or `{ permission: "deny", user_message, agent_message }`

**`failClosed` behavior:** The `hooks.json` entry has `"failClosed": false` — if this hook crashes or times out, Cursor allows the tool call (fail-open). This is intentional: the gate serves as a reminder mechanism, not a security enforcement. A crash in the gate must never block legitimate work.

**File:** `.cursor/hooks/AIC-require-aic-compile.cjs`

---

### 7.4 preToolUse (MCP matcher) — `conversationId` injection

**Event:** `preToolUse` with `matcher: "MCP"`

**Input fields used:**

- `input.conversation_id` → preferred source
- `AIC_CONVERSATION_ID` env var → fallback (set by sessionStart)
- `input.tool_name` → to scope injection to `aic_compile` and `aic_chat_summary`
- `input.tool_input` → the arguments object to augment

**Purpose:** Cursor does not pass a `conversationId` in `aic_compile` tool arguments automatically. This hook intercepts every MCP tool call, checks if it is `aic_compile` or `aic_chat_summary`, and injects `conversationId` into `updated_input` so the MCP server receives it.

**Output:**

```js
{ permission: "allow", updated_input: { ...toolInput, conversationId } }
```

Without this, `compilation_log` rows from this Cursor session have `conversation_id = null`, breaking `aic_chat_summary` for this conversation.

**File:** `.cursor/hooks/AIC-inject-conversation-id.cjs`

---

### 7.5 postToolUse (MCP matcher) — compile confirmation

**Event:** `postToolUse` with `matcher: "MCP"`

**Input fields used:**

- `input.tool_name` → to identify `aic_compile` calls
- `input.tool_input` → confirms `intent` + `projectRoot` fields present
- `input.tool_output` → checks for a non-empty `content` array (success)

**Purpose:** After a successful `aic_compile` call, inject a short confirmation into the model's context:

```
"AIC compilation completed. Use the compiled context for your next response."
```

This gives the model a clear signal that the compilation result is available and should be used. Without this confirmation, the model may not reliably apply the compiled context.

**Output:** `{ additional_context: "..." }` on success, `{}` on skip.

**File:** `.cursor/hooks/AIC-post-compile-context.cjs`

---

### 7.6 beforeShellExecution (git matcher) — `--no-verify` blocker

**Event:** `beforeShellExecution` with `matcher: "git"`

**Input fields used:**

- `input.command` → the full shell command string

**Purpose:** Block any git command that includes `--no-verify` or `-n` (the short form that skips hooks). Project rules (Husky + lint-staged) enforce formatting and linting in pre-commit hooks. An agent will sometimes try `--no-verify`; this hook prevents it deterministically.

**Logic:**

1. Strip quoted strings from the command (so `--no-verify` inside a commit message `-m "..."` is
   not a false positive).
2. Check if the command contains `\bgit\b` and (`--no-verify` or ` -n`).
3. If both: deny with a clear agent message explaining why.

**Output:** `{ permission: "deny", user_message, agent_message }` when blocked.

**File:** `.cursor/hooks/AIC-block-no-verify.cjs`

---

### 7.7 afterFileEdit — file edit tracker

**Event:** `afterFileEdit`

**Input fields used (flexible extraction):**

- `input.files` / `input.paths` / `input.editedFiles` / `input.edited_paths` → array of paths
- `input.file` / `input.path` / `input.filePath` → single path
- `input.edit` / `input.edits` → nested object with path field
- `input.conversation_id` / `input.conversationId` / `input.session_id` / `AIC_CONVERSATION_ID` → temp file key

**Purpose:** Maintain a cumulative list of file paths the agent edited during the current conversation. Written to `os.tmpdir()/aic-edited-files-<key>.json`. The `stop` hook reads this list to run lint and typecheck on only the touched files.

**Why flexible extraction:** Cursor's `afterFileEdit` input schema is not fully stable (v2 vs. earlier field names). The hook tries multiple field names to accommodate schema changes.

**Output:** `{}` always — side-effect only.

**File:** `.cursor/hooks/AIC-after-file-edit-tracker.cjs`

For the full edited-files flow (tracker → stop → cleanup) and file list, see [edited-files flow](edited-files-flow.md).

---

### 7.8 stop — quality gate (ESLint + typecheck)

**Event:** `stop`

**Input fields used:**

- `input.conversation_id` / `input.session_id` / `AIC_CONVERSATION_ID` → temp file key (for edited files list)

**Purpose:** Before Cursor's agent reports "done", run ESLint and `tsc --noEmit` on every file edited this session (from §7.7's temp file). If either fails, return a `followup_message` so Cursor auto-submits a fix request:

```
"Fix lint and typecheck errors on the files you edited. Run pnpm lint and pnpm typecheck."
```

The model then sees this as a new prompt, fixes the errors, and tries to stop again. The
`loop_limit: 5` in `hooks.json` caps retries.

**Guard conditions:**

- If the temp file doesn't exist → allow stop (no files edited, or tracker missed)
- If the file list is empty after filtering → allow stop
- If neither ESLint nor `tsc --noEmit` are available → allow stop (no `tsconfig.json`)

**File:** `.cursor/hooks/AIC-stop-quality-check.cjs`

For the full edited-files flow and file list, see [edited-files flow](edited-files-flow.md).

---

### 7.9 sessionEnd — cleanup and telemetry

**Event:** `sessionEnd`

**Input fields used:**

- `input.session_id` → logged to `.aic/session-log.jsonl`
- `input.reason` → reason Cursor ended the session
- `input.duration_ms` → session duration

**Purpose:**

1. **Cleanup:** Delete `aic-gate-*`, `aic-deny-*`, and `aic-prompt-*` temp files from
   `os.tmpdir()` (gate, failed gate attempts, prewarm).
2. **Session log:** Append one JSON line to `.aic/session-log.jsonl` with `session_id`,
   `reason`, `duration_ms`, `timestamp`. Age-based pruning uses the same MCP startup path and `shared/src/maintenance/prune-jsonl-by-timestamp.ts` helper as the other `.aic/*.jsonl` logs.

**Must never block:** Exit 0 always. No stdout. If `appendSessionLog` fails, silently ignore.

**File:** `.cursor/hooks/AIC-session-end.cjs`

---

### 7.10 subagentStart — compilation_log telemetry

**Event:** `subagentStart`

**Input fields used:**

- `input.task` → truncated to 200 chars as `intent` for `aic_compile` (or `"provide context for subagent"` when missing)
- `input.parent_conversation_id` → passed as `conversationId` so the compile is attributed to the parent conversation
- `input.subagent_model` → when valid (trimmed length 1–256, printable ASCII), passed as `modelId` on the `aic_compile` JSON-RPC `arguments` for `compilation_log.model_id`; also written to `.aic/.claude-session-model` like sessionStart
- **Cache fallback:** when `input.subagent_model` is missing or invalid, the hook reads `.aic/.claude-session-model` (written by the sessionStart hook) and uses its value as `modelId` if valid (same trimmed-length and printable-ASCII checks). This ensures `compilation_log.model_id` is populated even when Cursor omits `subagent_model` from the payload.

**Purpose:** When a subagent (Task tool) is about to start, the hook calls `aic_compile` with `triggerSource: "subagent_start"` and the parent conversation ID. Cursor's subagentStart output schema does not support `additional_context`, so the hook does not inject context; it always returns `permission: "allow"`. The sole purpose is so `compilation_log` has one row per subagent start with valid token data for telemetry.

**Must never block:** On parse or exec error the hook still returns `permission: "allow"` so subagent start is never blocked; the compile is best-effort.

**File:** `.cursor/hooks/AIC-subagent-compile.cjs`

---

## 8. Full event coverage

**Cursor:** Nine documented event types get AIC registrations; **eleven** hook command entries total (some types run two commands). Unused events are listed after the table.

| Event                        | AIC use | Notes                                                                    |
| ---------------------------- | ------- | ------------------------------------------------------------------------ |
| `sessionStart`               | §7.1    | Two hooks: invariants (AIC-session-init) + compile (AIC-compile-context) |
| `beforeSubmitPrompt`         | §7.2    | Prewarm gate, prompt log. No context injection (schema limitation)       |
| `preToolUse` (unmatched)     | §7.3    | aic_compile enforcement gate                                             |
| `preToolUse` (MCP)           | §7.4    | conversationId injection                                                 |
| `postToolUse` (MCP)          | §7.5    | Compile confirmation                                                     |
| `beforeShellExecution` (git) | §7.6    | --no-verify blocker                                                      |
| `afterFileEdit`              | §7.7    | File edit tracker                                                        |
| `sessionEnd`                 | §7.9    | Cleanup + telemetry                                                      |
| `subagentStart`              | §7.10   | Telemetry compile per subagent start                                     |
| `stop`                       | §7.8    | Quality gate                                                             |

**Not registered:** `preCompact` and any other Cursor event without a row above — no entry in
`hooks.json.template`. `subagentStart` cannot inject context; it exists for `compilation_log`
telemetry only.

---

## 9. MCP compile invocation from hooks

**Cursor:** Only `AIC-compile-context.cjs` and `AIC-subagent-compile.cjs` spawn MCP and call `aic_compile` directly. All other compilation goes through the model after the preToolUse gate. Because `beforeSubmitPrompt` cannot emit `additional_context`, session-wide snapshot injection depends on `AIC-compile-context.cjs`.

### 9.1 Session compile — `AIC-compile-context.cjs`

The JSON-RPC call must include `conversationId` when `conversation_id` is available:

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

Without `conversationId`, `compilation_log` rows from this session have `conversation_id = null`, and `aic_chat_summary` cannot aggregate them.

**Cold start:** `execSync` spawns the MCP server (~500–1500ms TS compile on cold cache; **2–5s** warm round-trip, up to **~10s** first run; 20s hook timeout). The published package drops TS compile overhead (~200–500ms cold).

### 9.2 Subagent telemetry — `AIC-subagent-compile.cjs`

Same spawn pattern for a best-effort `compilation_log` row; on failure the hook still allows subagent start. All other hooks are pure Node (under ~50ms).

---

## 10. Registration payload

**Cursor:** `.cursor/hooks.json` per project (merged by `install.cjs` when it runs):

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      { "command": "node .cursor/hooks/AIC-session-init.cjs" },
      { "command": "node .cursor/hooks/AIC-compile-context.cjs", "timeout": 20 }
    ],
    "beforeSubmitPrompt": [
      { "command": "node .cursor/hooks/AIC-before-submit-prewarm.cjs" }
    ],
    "preToolUse": [
      {
        "command": "node .cursor/hooks/AIC-require-aic-compile.cjs",
        "failClosed": false
      },
      { "command": "node .cursor/hooks/AIC-inject-conversation-id.cjs", "matcher": "MCP" }
    ],
    "postToolUse": [
      { "command": "node .cursor/hooks/AIC-post-compile-context.cjs", "matcher": "MCP" }
    ],
    "beforeShellExecution": [
      { "command": "node .cursor/hooks/AIC-block-no-verify.cjs", "matcher": "git" }
    ],
    "afterFileEdit": [
      { "command": "node .cursor/hooks/AIC-after-file-edit-tracker.cjs" }
    ],
    "sessionEnd": [{ "command": "node .cursor/hooks/AIC-session-end.cjs" }],
    "subagentStart": [{ "command": "node .cursor/hooks/AIC-subagent-compile.cjs" }],
    "stop": [
      { "command": "node .cursor/hooks/AIC-stop-quality-check.cjs", "loop_limit": 5 }
    ]
  }
}
```

When the MCP server runs `integrations/cursor/install.cjs` from a workspace root that contains that script, hooks are written or merged idempotently. Existing user entries outside the `AIC-*` namespace are preserved; stale `AIC-*` hook entries are pruned.

---

## 11. HTTP hook — future optimization (eliminates cold start)

Cursor does not currently expose an HTTP hook type. When it does, the round-trip can be eliminated by pointing hooks to the already-running AIC MCP server's HTTP endpoint:

```json
{
  "type": "http",
  "url": "http://localhost:${AIC_HTTP_PORT}/hooks/session-start",
  "timeout": 5
}
```

Benefits over the current `execSync` + child process approach:

- Zero cold start — MCP server already has SQLite connection, pipeline initialized, tiktoken loaded
- No `npx tsx` overhead — pre-compiled JS already running
- Single HTTP round-trip vs. four process spawns (node + tsx + server + tool call)

This is a future optimization once Cursor exposes the HTTP hook type.

---

## 12. Plugin distribution

**Cursor:** No plugin system yet; distribution is installer-only.

---

## 13. Direct installer path

**Cursor:** `runEditorBootstrapIfNeeded` runs `node integrations/cursor/install.cjs` when the
script exists under the project root and the bootstrap gate passes (see §2). Same triggers as
§3: roots listed (if supported) or first `aic_compile` per project.

```
listRoots (if supported) or first aic_compile
  ↓
runEditorBootstrapIfNeeded → integrations/cursor/install.cjs
  ↓
.cursor/hooks/ + hooks.json merged
```

Without `integrations/cursor/install.cjs` at the project root, use a manual run — [installation.md](installation.md#first-compile-bootstrap).

The installer (`integrations/cursor/install.cjs`):

1. Ensures `.cursor/hooks/` directory exists
2. For each hook script in `AIC_SCRIPT_NAMES`: reads current content from
   `integrations/cursor/hooks/` and writes to `.cursor/hooks/` only if content differs
   (idempotent — no double-writes)
3. Deletes any `AIC-*.cjs` files in `.cursor/hooks/` that are not in `AIC_SCRIPT_NAMES`
   (stale script cleanup)
4. Reads `.cursor/hooks.json` (if present) and merges AIC entries into existing user config,
   preserving non-AIC hooks
5. Installs the trigger rule (`.cursor/rules/AIC.mdc`)

The installer is a standalone `.cjs` script with no dependency on `mcp/src/`. Source scripts live in `integrations/cursor/hooks/`. The installer copies them to `.cursor/hooks/`.

---

## 14. Trigger rule

**Cursor:** `.cursor/rules/AIC.mdc` with `alwaysApply: true` instructs the model to call `aic_compile` first on every message. The `preToolUse` gate (§7.3) enforces it. They are co-dependent:

- Without the rule: the model may not call `aic_compile` at all until blocked by the gate. The deny message then provides the intent, creating a round-trip penalty.
- Without the gate: the rule is advisory only — the model can ignore it without consequence.

The trigger rule + gate are the **primary** delivery mechanism for per-intent context in Cursor. Because there is no per-prompt context injection hook, these two components are essential — not a fallback.

Auto-installed when the Cursor installer runs. Version-stamped so it is overwritten when the AIC package version changes.

---

## 15. Known bugs tracker

| Bug                                                                                               | Issue | Status                           | Workaround                                                                              |
| ------------------------------------------------------------------------------------------------- | ----- | -------------------------------- | --------------------------------------------------------------------------------------- |
| `afterFileEdit` input schema varies across Cursor versions                                        | —     | No issue filed                   | Flexible field extraction in `AIC-after-file-edit-tracker.cjs` (§7.7)                   |
| `conversation_id` not passed to all hooks — only `beforeSubmitPrompt` and `preToolUse` receive it | —     | Cursor behavior — no issue filed | `AIC_CONVERSATION_ID` env var injected by sessionStart; used as fallback in other hooks |
| `subagentStart` does not support `additional_context` output                                      | —     | Cursor capability gap            | No workaround — subagent context injection is structurally impossible in Cursor         |
| `preCompact` is observational only — no output injected into new context                          | —     | Cursor capability gap            | No workaround — recompile after compaction is structurally impossible in Cursor         |

---

## 16. Verification checklist

All of the following must be verified for the Cursor integration to be complete:

Context delivery:

- [ ] `AIC-session-init.cjs` injects architectural invariants via `additional_context` (§7.1)
- [ ] `AIC-compile-context.cjs` calls `aic_compile` with `conversationId` from `conversation_id` (§9.1)
- [ ] `AIC-before-submit-prewarm.cjs` saves prompt for gate deny message (§7.2)
- [ ] `AIC-require-aic-compile.cjs` blocks all tools until `aic_compile` called (§7.3)
- [ ] `AIC-inject-conversation-id.cjs` injects `conversationId` into MCP args (§7.4)
- [ ] `AIC-post-compile-context.cjs` injects confirmation after compile (§7.5)
- [ ] `AIC-subagent-compile.cjs` runs telemetry `aic_compile` on subagentStart (§7.10)

Quality gate (Cursor-specific):

- [ ] `AIC-after-file-edit-tracker.cjs` records edited files to temp file (§7.7)
- [ ] `AIC-stop-quality-check.cjs` runs lint/typecheck, uses `followup_message` (§7.8)
- [ ] `AIC-block-no-verify.cjs` blocks `--no-verify` via `beforeShellExecution` (§7.6)

Settings:

- [ ] `hooks.json` matches template: 11 command entries across nine event keys, including `subagentStart` (§10)

Init behaviour:

- [ ] Bootstrap: `install.cjs` runs when present under project root (§2–§3); otherwise manual run ([installation.md#first-compile-bootstrap](installation.md#first-compile-bootstrap))

Temp file conventions:

- [ ] `aic-gate-<generation_id>`: written by preToolUse gate, deleted by sessionEnd
- [ ] `aic-prompt-<generation_id>`: written by beforeSubmitPrompt, deleted by sessionEnd
- [ ] `aic-deny-*`: optional leftovers from gate deny path, deleted by sessionEnd
- [ ] `aic-edited-files-<conversation_key>.json`: written by afterFileEdit, read by stop (not removed by sessionEnd; overwritten per session key)
