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
  runs it with `execFileSync` when the bootstrap gate passes (see that file — not only `.cursor/` / `CURSOR_PROJECT_DIR` may open the gate). Installer resolution matches [installation.md](../installation.md#first-compile-bootstrap): `<project>/integrations/cursor/install.cjs` when that file exists under the opened workspace root, otherwise the copy bundled inside the published `@jatbas/aic` package at package-relative `integrations/cursor/install.cjs`. Triggers: workspace roots listed (if the client supports roots) or **first** `aic_compile` for that project. No copy/merge logic duplicated in `mcp/src/`. For a one-off refresh, diagnostics, or nonstandard layouts, run `node` on the resolved installer path with cwd at the project root (see [installation.md](../installation.md#first-compile-bootstrap)).

- **The `aic_compile` MCP tool is neutral.** It requires `intent` and `projectRoot`; shipped Cursor hooks also send `editorId`, `triggerSource`, and often `conversationId` / `modelId`. It does not know who called it. The hook adapter in `integrations/cursor/hooks/`
  translates Cursor's hook protocol into that call — that translation is integration-layer work only. Optional wire fields beyond what hooks send are listed in §2.1.

### 2.1 Optional `aic_compile` arguments (`toolOutputs` and agentic fields)

The MCP schema (`mcp/src/schemas/compilation-request.ts`, summarized in [Implementation specification §8c](../implementation-spec.md#8c-input-validation-zod-schemas)) accepts optional agentic fields such as `stepIndex`, `stepIntent`, `previousFiles`, `toolOutputs`, and `conversationTokens`. When callers supply structured `toolOutputs[].relatedFiles` (repo-relative paths by convention), the pipeline merges them into heuristic `boostPatterns` before scoring; when the deduplicated related-path set is non-empty, a sorted NUL-separated canonical encoding of those paths is included in the cache preimage that `compilation-runner` hashes ([Step 4 — ContextSelector](../implementation-spec.md#step-4-contextselector-relatedfilesboostcontextselector)).

**Shipped hooks** in `integrations/cursor/hooks/` that invoke `aic_compile` do not set `toolOutputs` or `relatedFiles` (for example `AIC-compile-context.cjs`, `AIC-subagent-compile.cjs`, and `AIC-subagent-stop.cjs`). Custom integrations may forward `toolOutputs` when the MCP client exposes prior tool results in that shape.

- **Shared utilities are welcome** in `shared/` only when they are genuinely editor-agnostic
  (e.g. a `buildSessionContext()` helper that any editor integration could use). If a
  utility only makes sense for Cursor, it goes in `integrations/cursor/`.

---

## 3. Deployment scope

**Cursor:** The AIC MCP server is global in Cursor (`~/.cursor/mcp.json`), but **Cursor does not support global hooks**. The hook configuration (`.cursor/hooks.json`) and scripts (`.cursor/hooks/AIC-*.cjs`) are per-project artifacts — they must exist inside each project directory.

**How they get there:** The MCP server resolves the installer the same way as [installation.md](../installation.md#first-compile-bootstrap): in-project `integrations/cursor/install.cjs` when present under the workspace root, otherwise the bundled copy from `@jatbas/aic`, then runs it when the bootstrap gate in `editor-integration-dispatch.ts` passes — on workspace roots listing (if supported) or on the first `aic_compile` for the project. For a manual refresh or when bootstrap did not run, execute `node` on that resolved path with cwd at the project root (see [installation.md](../installation.md#first-compile-bootstrap)).

The installer is idempotent: it merges `hooks.json` and copies every script name in `integrations/cursor/aic-hook-scripts.json` from `integrations/cursor/hooks/` to `.cursor/hooks/` (currently **13** files: **thirteen** `AIC-*.cjs`). That manifest is the canonical script list.

**Optional: commit hooks to the repo.** Teams can commit `.cursor/hooks.json` and every `.cursor/hooks/AIC-*.cjs` script so every clone gets hooks without re-running the installer.

> **Verified:** Cursor documents `sessionStart`, `beforeSubmitPrompt`, `preToolUse`, `postToolUse`,
> `beforeShellExecution`, `afterFileEdit`, `sessionEnd`, `stop`, `subagentStart`, and `subagentStop` (paired with `subagentStart` for Task-tool subagent lifecycle). See [Cursor agent hooks](https://cursor.com/docs/agent/hooks) and per-event sections below.

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
  │  (session compile / subagent telemetry / subagent reparent) JSON-RPC: tools/call aic_compile — §2.1
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

All event hooks are **authored** in `integrations/cursor/hooks/`. The installer deploys them to `.cursor/hooks/` per project and does not modify `mcp/` or `shared/` on disk — but hooks may call the MCP tool, and the server uses `mcp/` and `shared/` at runtime (e.g. `subagent_stop` reparent updates `compilation_log` via `shared/src/storage/reparent-subagent-compilations.ts`).

`AIC-compile-context.cjs`, `AIC-subagent-compile.cjs`, and `AIC-subagent-stop.cjs` each spawn the MCP server via `execSync` and JSON-RPC to call `aic_compile`. Every other hook is pure Node (gate, inject, tracker, blockers, telemetry).

### 4.3 Input field mapping

| Cursor hook input field                         | How AIC uses it                                                                                                                                                         |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `input.conversation_id`                         | → `conversationId` for `aic_compile` (sessionStart hook and preToolUse)                                                                                                 |
| `input.model`                                   | → `modelId` on `aic_compile` (sessionStart and preToolUse inject)                                                                                                       |
| `input.generation_id`                           | temp file key for per-generation state (`aic-gate-<id>`, `aic-prompt-<id>`, `aic-gate-deny-<id>`); the recency marker `aic-gate-recent-<hash>` is project-scoped (§7.3) |
| `input.prompt`                                  | saved to temp file by `beforeSubmitPrompt` for gate deny message                                                                                                        |
| `input.command`                                 | inspected by `beforeShellExecution` for `--no-verify`                                                                                                                   |
| `input.files` / `input.file` / `input.filePath` | edited file paths, recorded by `afterFileEdit`                                                                                                                          |
| `input.reason` / `input.duration_ms`            | session end telemetry                                                                                                                                                   |
| `CURSOR_PROJECT_DIR` env var                    | project root for hooks that need it                                                                                                                                     |
| `AIC_PROJECT_ROOT` env var                      | injected via `env:` when `AIC-compile-context.cjs` completes a successful `aic_compile` (§7.1); not emitted by `AIC-session-init.cjs`                                   |
| `AIC_CONVERSATION_ID` env var                   | same `env:` path as `AIC_PROJECT_ROOT`; `AIC-inject-conversation-id.cjs` also falls back to `process.env.AIC_CONVERSATION_ID`; stdin `conversation_id` when present     |
| `input.agent_transcript_path`                   | `subagentStop` only — path to the subagent transcript `.jsonl`; child session id is the basename without `.jsonl` (see §7.11)                                           |

---

## 5. Target file layout

`integrations/cursor/` is the source. `.cursor/` is the per-project deployment target.
Hook sources live only under `integrations/cursor/`; runtime handling for some `aic_compile` calls (including `subagent_stop` reparent) lives in `mcp/` and `shared/`.

```
integrations/cursor/               ← SOURCE (authored here)
  hooks/
    AIC-session-init.cjs           # sessionStart — architectural invariants (additional_context only)
    AIC-compile-context.cjs        # sessionStart — calls aic_compile, injects compiled context
    AIC-before-submit-prewarm.cjs  # beforeSubmitPrompt — prompt logging + gate prewarm
    AIC-require-aic-compile.cjs    # preToolUse — compile gate (enforces aic_compile with recency fallback and deny-count cap; emergency bypass when both devMode and skipCompileGate are true)
    AIC-inject-conversation-id.cjs # preToolUse (MCP) — injects conversationId into MCP args
    AIC-post-compile-context.cjs   # postToolUse (MCP) — confirmation after aic_compile
    AIC-block-no-verify.cjs        # beforeShellExecution (git) — blocks --no-verify
    AIC-after-file-edit-tracker.cjs # afterFileEdit — records edited files to temp file
    AIC-stop-quality-check.cjs     # stop — ESLint + typecheck quality gate
    AIC-session-end.cjs            # sessionEnd — temp file cleanup + session telemetry
    AIC-subagent-compile.cjs       # subagentStart — aic_compile for compilation_log telemetry
    AIC-subagent-stop.cjs          # subagentStop — reparent compilation_log to parent conversation
    AIC-subagent-start-model-id.cjs # helper: subagent_model → modelId (deployed beside hooks)
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

### 6.1 sessionStart — two hooks (`additional_context`; `env` only after successful compile)

`sessionStart` runs two commands in order (see `hooks.json.template`).

**`AIC-session-init.cjs`** writes JSON with **`additional_context` only** — architectural invariant bullets and optional `AIC_CONVERSATION_ID=…` text for the model. It does **not** emit an `env` object.

**`AIC-compile-context.cjs`** calls `aic_compile`. On success it may write JSON that includes both `env` and `additional_context`:

```js
process.stdout.write(
  JSON.stringify({
    env: { AIC_PROJECT_ROOT: "...", AIC_CONVERSATION_ID: "..." },
    additional_context: ["...", compiledPrompt].join("\n"),
  }),
);
```

When present, the `env` field sets environment variables for subsequent hooks in the session via `process.env`. If this hook times out or exits without a successful compile response, `env` is not set until a later successful compile path sets it.

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

### 6.9 subagentStop — empty `{}`

Same stdout contract as §6.6: write `JSON.stringify({})`. The hook performs a best-effort MCP call and must not block the parent session if spawn or RPC fails.

---

## 7. Hook events — details

Cursor's hook system is documented at [docs.cursor.com/context/rules](https://docs.cursor.com/context/rules).
AIC registers **12** hook **command** entries across **10** event types (some types run more than one command); **13** hook **script files** are copied from `aic-hook-scripts.json` (all **thirteen** `AIC-*.cjs`). Limitations and workarounds are per hook below.

### 7.1 sessionStart — two hooks (architectural invariants + compiled context)

**Event:** `sessionStart`

**Why two hooks:** The first hook (`AIC-session-init.cjs`) injects architectural invariants from the project's `AIC-architect.mdc` rule file — fast, no external call, always succeeds. The second hook (`AIC-compile-context.cjs`) calls `aic_compile` to inject a broad project context snapshot — may time out, fail non-fatally.

**AIC-session-init.cjs:**

- Reads the `## Critical reminders` section from `.cursor/rules/AIC-architect.mdc` (path resolved as `../rules/` from `.cursor/hooks/`; on case-sensitive volumes the filename must match the hook’s expected name)
- Extracts bullet points and outputs them as `additional_context`
- Injects `AIC_CONVERSATION_ID=${conversationId}` into that text for the model when `conversation_id` is present in stdin — not as an `env` payload

**AIC-compile-context.cjs:**

- Reads `conversation_id` from stdin → passes as `conversationId` to `aic_compile`
- Calls `aic_compile` with intent `"understand project structure, architecture, and recent changes"`
- On success, outputs `additional_context` with the compiled project snapshot and **`env`** with `AIC_PROJECT_ROOT` and `AIC_CONVERSATION_ID` for downstream hooks
- **If this hook times out (20s), it exits 0 silently** — session creation is never blocked

**Known limitation — `aic_compile` from sessionStart is best-effort:** The compiled context from `AIC-compile-context.cjs` is broad and intent-agnostic (project structure only). The primary per-intent context delivery in Cursor relies on the model calling `aic_compile` itself (enforced by the `preToolUse` gate — see §7.3; the gate is always active unless the emergency bypass is enabled). There is **no per-prompt context injection hook** in Cursor — `beforeSubmitPrompt` does not support `additional_context` output (see §7.2).

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
   `AIC-require-aic-compile.cjs` can include the exact intent in its deny message when the
   enforcement path runs (§7.3). Without this, the deny message falls back to a generic placeholder, reducing the chance the model
   uses the correct intent for `aic_compile`. When the emergency bypass is active (`devMode` + `skipCompileGate` both true in `aic.config.json`), §7.3 returns allow before deny logic, so the exact-intent deny path does not run.

**Always returns `{ continue: true }`** — this hook must never block prompt submission.

**Known limitation — no context injection:** `beforeSubmitPrompt` does not support an
`additional_context` output field in Cursor's current hook schema. The schema allows allow/block for the submission in general; AIC's hook always returns allow here (see above).

**File:** `.cursor/hooks/AIC-before-submit-prewarm.cjs`

---

### 7.3 preToolUse (unmatched) — `aic_compile` enforcement gate

**Event:** `preToolUse` (no matcher — Cursor invokes this hook for every tool call; the script may return allow immediately without reading stdin.)

**Emergency bypass:** Before stdin handling, the script resolves the project root via `integrations/shared/resolve-project-root.cjs`, reads `aic.config.json`, and `JSON.parse`s it. The gate is bypassed **only** when the config is a plain object with **both** `devMode === true` **and** `skipCompileGate === true`. `devMode` alone does **not** bypass the gate. Any read or parse failure continues to the enforcement path below. The `skipCompileGate` key is intended for emergencies only (e.g., the MCP server is broken and must be fixed without the gate blocking tool calls) and should be removed immediately after the issue is resolved.

**Input fields used (enforcement path only):**

- `input.generation_id` → per-generation state file key
- `input.tool_name` → to detect if the call is `aic_compile`
- `input.tool_input` → alternative detection for `aic_compile`

**Purpose (enforcement path):** Ensure `aic_compile` runs before other tools. The gate combines per-generation state tracking, a 120-second project-scoped recency window, and a deny-count cap.

**Mechanics (enforcement path):**

1. When the tool call is `aic_compile`: write `os.tmpdir()/aic-gate-<generation_id>`, update the project-scoped recency marker `os.tmpdir()/aic-gate-recent-<project_hash>` with the current timestamp, and delete any deny counter for this generation. Allow the call.
2. On any other tool call, evaluate in order:
   - **Per-generation marker:** if `aic-gate-<generation_id>` exists, allow.
   - **Recency fallback:** if `aic-gate-recent-<project_hash>` exists and its timestamp is within 120 seconds (`RECENCY_WINDOW_MS`), allow. This covers `generation_id` changes within the same project.
   - **Deny-count cap:** if `aic-gate-deny-<generation_id>` records 3 or more prior denials (`MAX_DENIES`), allow. This prevents infinite denial loops when per-generation state is lost.
   - Otherwise: increment the deny counter in `aic-gate-deny-<generation_id>` and deny.
3. The deny message includes the exact user prompt (from the prewarm temp file) as the
   recommended `intent` argument — making it likely the model calls `aic_compile` with
   the correct intent and gets a cache hit from the prewarm.

**Output:** `{ permission: "allow" }` or `{ permission: "deny", user_message, agent_message }`. Under the emergency bypass (`devMode` + `skipCompileGate`), the hook emits allow only and never deny.

**`failClosed` behavior:** The `hooks.json` entry has `"failClosed": true` — if this hook crashes or times out, Cursor denies the tool call (fail-closed). The gate is strict enforcement, not a reminder. If the gate itself has a bug, use the emergency bypass (`"devMode": true` + `"skipCompileGate": true` in `aic.config.json`) to unblock work while fixing the hook.

**Temp file cleanup:** On each invocation the hook runs an opportunistic sweep, throttled to once per 10 minutes via `os.tmpdir()/aic-gate-cleanup-marker`. It deletes `aic-gate-*` and `aic-prompt-*` files older than 10 minutes, excluding `aic-gate-recent-*` (per-project singletons) and the cleanup marker itself.

**File:** `.cursor/hooks/AIC-require-aic-compile.cjs`

---

### 7.4 preToolUse (MCP matcher) — `conversationId` injection

**Event:** `preToolUse` with `matcher: "MCP"`

**Input fields used:**

- `input.conversation_id` → preferred source
- `AIC_CONVERSATION_ID` env var → fallback when `AIC-compile-context` has set `env` after a successful compile, else `process.env` may be unset until then
- `input.generation_id` → key for the prewarmed prompt temp file `aic-prompt-<generation_id>` (see purpose below)
- `input.tool_name` → to scope injection to `aic_compile` and `aic_chat_summary`
- `input.tool_input` → the arguments object to augment

**Purpose:** Cursor does not pass a `conversationId` in `aic_compile` tool arguments automatically. This hook intercepts every MCP tool call, checks if it is `aic_compile` or `aic_chat_summary`, and injects `conversationId` into `updated_input` so the MCP server receives it. Other MCP tools (`aic_status`, `aic_last`, `aic_inspect`, `aic_projects`, `aic_model_test`, `aic_compile_spec`, and any future additions) pass through unchanged — only `aic_compile` and `aic_chat_summary` are augmented here. For `aic_compile`, when `input.generation_id` is present and `aic-prompt-<generation_id>` in the temp directory contains non-empty text after the same normalization as the compile gate, a weak tool intent (including the MCP omitted-intent default string) may be replaced with that text (truncated) before the request reaches the server.

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

**Purpose:** Maintain a cumulative list of file paths the agent edited during the current conversation. Written under `os.tmpdir()` using `integrations/shared/edited-files-cache.cjs` as `aic-edited-cursor-<conversation_key>.json` (sanitized key). The `stop` hook reads this list to run lint and typecheck on only the touched files.

**Why flexible extraction:** Cursor's `afterFileEdit` input schema is not fully stable (v2 vs. earlier field names). The hook tries multiple field names to accommodate schema changes.

**Output:** `{}` always — side-effect only.

**File:** `.cursor/hooks/AIC-after-file-edit-tracker.cjs`

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

---

### 7.9 sessionEnd — cleanup and telemetry

**Event:** `sessionEnd`

**Input fields used:**

- `input.session_id` → logged to `.aic/session-log.jsonl`
- `input.reason` → reason Cursor ended the session
- `input.duration_ms` → session duration

**Purpose:**

1. **Cleanup:** Delete `aic-gate-*`, `aic-deny-*`, and `aic-prompt-*` temp files from
   `os.tmpdir()` (per-generation state, deny counters, prewarm prompts). The preToolUse gate (§7.3) also sweeps stale files opportunistically, throttled to once per 10 minutes.
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
- `input.subagent_model` → when valid (trimmed length 1–256, printable ASCII), passed as `modelId` on the `aic_compile` JSON-RPC `arguments` for `compilation_log.model_id`; also appended to `.aic/session-models.jsonl` via `writeSessionModelCache` (same as other hooks that record model id)
- **Cache fallback:** when `input.subagent_model` is missing or invalid, the hook uses `readSessionModelCache` on `.aic/session-models.jsonl` for this conversation and editor `cursor`, and uses that value as `modelId` if valid (same trimmed-length and printable-ASCII checks). This ensures `compilation_log.model_id` is populated even when Cursor omits `subagent_model` from the payload. The read path matches the MCP compile handler: bounded tail of the JSONL file with deterministic full-file fallback ([Implementation specification — Model id resolution](../implementation-spec.md#model-id-resolution-aic_compile); [AIC JSONL caches](aic-jsonl-caches.md)).

**Purpose:** When a subagent (Task tool) is about to start, the hook calls `aic_compile` with `triggerSource: "subagent_start"` and the parent conversation ID. Cursor's subagentStart output schema does not support `additional_context`, so the hook does not inject context; it always returns `permission: "allow"`. The sole purpose is so `compilation_log` has one row per subagent start with valid token data for telemetry.

**Must never block:** On parse or exec error the hook still returns `permission: "allow"` so subagent start is never blocked; the compile is best-effort.

**File:** `.cursor/hooks/AIC-subagent-compile.cjs`

---

### 7.11 subagentStop — reparent `compilation_log` to parent conversation

**Event:** `subagentStop`

**Reference:** [Cursor agent hooks](https://cursor.com/docs/agent/hooks) — fires when a Task-tool subagent completes; paired with `subagentStart` for subagent lifecycle.

**Input fields used:**

- `input.conversation_id` → parent chat id; passed as `conversationId` on `aic_compile`
- `input.agent_transcript_path` → path to the subagent transcript `.jsonl`; `conversationIdFromAgentTranscriptPath` in `integrations/shared/conversation-id.cjs` yields the child session id (basename without `.jsonl`)

**Purpose:** Subagents run under a separate session id. Compilations inside the subagent would otherwise stay on that child id. When parent and child ids differ, the hook calls `aic_compile` with `triggerSource: "subagent_stop"`, `conversationId` (parent), and `reparentFromConversationId` (child). The MCP compile handler runs `reparentSubagentCompilations` in `shared/src/storage/reparent-subagent-compilations.ts` only — no full compile pipeline — so existing `compilation_log` rows move to the parent. That keeps `aic_chat_summary` and per-conversation diagnostics on one thread for the whole chat.

**Must never block:** On parse or exec error the hook still writes `{}` to stdout; reparent is best-effort.

**File:** `.cursor/hooks/AIC-subagent-stop.cjs`

---

## 8. Full event coverage

**Cursor:** Ten documented event types get AIC registrations; **twelve** hook command entries total (some types run two commands); **thirteen** script files deployed per `aic-hook-scripts.json`. Unused events are listed after the table.

| Event                        | AIC use | Notes                                                                                                                   |
| ---------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `sessionStart`               | §7.1    | Two hooks: invariants (AIC-session-init) + compile (AIC-compile-context)                                                |
| `beforeSubmitPrompt`         | §7.2    | Prewarm gate, prompt log. No context injection (schema limitation)                                                      |
| `preToolUse` (unmatched)     | §7.3    | aic_compile enforcement gate (emergency bypass when both `devMode` and `skipCompileGate` are true in `aic.config.json`) |
| `preToolUse` (MCP)           | §7.4    | conversationId injection                                                                                                |
| `postToolUse` (MCP)          | §7.5    | Compile confirmation                                                                                                    |
| `beforeShellExecution` (git) | §7.6    | --no-verify blocker                                                                                                     |
| `afterFileEdit`              | §7.7    | File edit tracker                                                                                                       |
| `stop`                       | §7.8    | Quality gate                                                                                                            |
| `sessionEnd`                 | §7.9    | Cleanup + telemetry                                                                                                     |
| `subagentStart`              | §7.10   | Telemetry compile per subagent start                                                                                    |
| `subagentStop`               | §7.11   | Reparent `compilation_log` from subagent session to parent conversation                                                 |

**Not registered:** `preCompact` and any other Cursor event without a row above — no entry in
`hooks.json.template`. `subagentStart` cannot inject context; it exists for `compilation_log`
telemetry only. `subagentStop` does not inject context; it exists for reparent only.

---

## 9. MCP compile invocation from hooks

**Cursor:** `AIC-compile-context.cjs`, `AIC-subagent-compile.cjs`, and `AIC-subagent-stop.cjs` spawn MCP and call `aic_compile` directly. All other compilation goes through the model after the preToolUse gate when §7.3 is enforcing (default unless the emergency bypass is active — both `devMode` and `skipCompileGate` true in `aic.config.json`). Because `beforeSubmitPrompt` cannot emit `additional_context`, session-wide snapshot injection depends on `AIC-compile-context.cjs`.

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

Same spawn pattern for a best-effort `compilation_log` row; on failure the hook still allows subagent start. §9.1’s `conversationId` requirement applies to parent attribution: without `parent_conversation_id`, subagent telemetry rows cannot roll up for `aic_chat_summary`.

### 9.3 Subagent reparent — `AIC-subagent-stop.cjs`

Same `execSync` + JSON-RPC spawn pattern as §9.2. The tool response is `{ reparented: true, rowsUpdated: N }` JSON text (not `compiledPrompt`). On failure the hook still prints `{}` so the parent session continues. All other hooks are pure Node (under ~50ms), except the three in §9 opening paragraph.

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
        "failClosed": true
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
    "subagentStop": [{ "command": "node .cursor/hooks/AIC-subagent-stop.cjs" }],
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

**Cursor:** When the bootstrap gate passes (see §2) and Cursor is detected, `runEditorBootstrapIfNeeded` resolves the installer path: `<project>/integrations/cursor/install.cjs` if that file exists, otherwise the copy bundled in `@jatbas/aic` at `integrations/cursor/install.cjs` relative to the installed package, then runs `node` on that path with cwd at the project root. Same triggers as §3: roots listed (if supported) or first `aic_compile` per project.

```
listRoots (if supported) or first aic_compile
  ↓
runEditorBootstrapIfNeeded → resolve installer (in-project overrides bundled)
  ↓
node <resolved>/integrations/cursor/install.cjs
  ↓
.cursor/hooks/ + hooks.json merged
```

If bootstrap does not run (wrong editor detection) or you need a one-off refresh, run `node` on an installer path manually — [installation.md](../installation.md#first-compile-bootstrap).

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

**Cursor:** `.cursor/rules/AIC.mdc` with `alwaysApply: true` instructs the model to call `aic_compile` first on every message. The `preToolUse` gate (§7.3) enforces that unless the emergency bypass is active (both `devMode` and `skipCompileGate` true in `aic.config.json`).

- Without the rule: the model may not call `aic_compile` at all until blocked by the gate. The deny message then provides the intent, creating a round-trip penalty.
- Without the gate (or when the emergency bypass is active): the rule is advisory only — the model can ignore it without consequence.

The trigger rule + gate are the **primary** delivery mechanism for per-intent context in Cursor when enforcement is active. Because there is no per-prompt context injection hook, these two components are essential for most workflows — not a fallback.

Auto-installed when the Cursor installer runs. Version-stamped so it is overwritten when the AIC package version changes.

---

## 15. Known bugs tracker

| Bug                                                                                               | Issue | Status                           | Workaround                                                                              |
| ------------------------------------------------------------------------------------------------- | ----- | -------------------------------- | --------------------------------------------------------------------------------------- |
| `afterFileEdit` input schema varies across Cursor versions                                        | —     | No issue filed                   | Flexible field extraction in `AIC-after-file-edit-tracker.cjs` (§7.7)                   |
| `conversation_id` not passed to all hooks — only `beforeSubmitPrompt` and `preToolUse` receive it | —     | Cursor behavior — no issue filed | `AIC_CONVERSATION_ID` env var injected by sessionStart; used as fallback in other hooks |
| `subagentStart` does not support `additional_context` output                                      | —     | Cursor capability gap            | No workaround — subagent context injection is structurally impossible in Cursor         |
| `subagentStop` does not support `additional_context` output                                       | —     | Cursor capability gap            | AIC uses it for reparent only (`compilation_log`); see §7.11                            |
| `preCompact` is observational only — no output injected into new context                          | —     | Cursor capability gap            | No workaround — recompile after compaction is structurally impossible in Cursor         |

---

## 16. Verification checklist

All of the following must be verified for the Cursor integration to be complete:

Context delivery:

- [ ] `AIC-session-init.cjs` injects architectural invariants via `additional_context` (§7.1)
- [ ] `AIC-compile-context.cjs` calls `aic_compile` with `conversationId` from `conversation_id` (§9.1)
- [ ] `AIC-before-submit-prewarm.cjs` saves prompt for gate deny message (§7.2)
- [ ] `AIC-require-aic-compile.cjs` enforces `aic_compile` via per-generation marker, 120s recency fallback, and deny-count cap unless emergency bypass is active (§7.3)
- [ ] `AIC-inject-conversation-id.cjs` injects `conversationId` into MCP args (§7.4)
- [ ] `AIC-post-compile-context.cjs` injects confirmation after compile (§7.5)
- [ ] `AIC-subagent-compile.cjs` runs telemetry `aic_compile` on subagentStart (§7.10)
- [ ] `AIC-subagent-stop.cjs` runs reparent `aic_compile` on subagentStop (§7.11)

Quality gate (Cursor-specific):

- [ ] `AIC-after-file-edit-tracker.cjs` records edited files to temp file (§7.7)
- [ ] `AIC-stop-quality-check.cjs` runs lint/typecheck, uses `followup_message` (§7.8)
- [ ] `AIC-block-no-verify.cjs` blocks `--no-verify` via `beforeShellExecution` (§7.6)

Settings:

- [ ] `hooks.json` matches template: 12 command entries across ten event keys, including `subagentStart` and `subagentStop` (§10)

Init behavior:

- [ ] Bootstrap: `install.cjs` runs from in-project path when present, else bundled package copy (§2–§3); manual run if needed ([installation.md#first-compile-bootstrap](../installation.md#first-compile-bootstrap))

Temp file conventions:

- [ ] `aic-gate-<generation_id>`: written by preToolUse gate on successful `aic_compile`, deleted by sessionEnd and opportunistic cleanup (not written when emergency bypass is active — §7.3)
- [ ] `aic-gate-deny-<generation_id>`: written by preToolUse gate on each denial, reset on successful `aic_compile`, deleted by sessionEnd (matches `aic-gate-*` prefix)
- [ ] `aic-gate-recent-<project_hash>`: project-scoped recency marker written on successful `aic_compile`, excluded from opportunistic cleanup (§7.3)
- [ ] `aic-gate-cleanup-marker`: throttle stamp for opportunistic cleanup; sweep runs at most once per 10 minutes (§7.3)
- [ ] `aic-prompt-<generation_id>`: written by beforeSubmitPrompt, deleted by sessionEnd and opportunistic cleanup
- [ ] `aic-edited-cursor-<conversation_key>.json` under `os.tmpdir()`: written by afterFileEdit, read by stop (not removed by sessionEnd; overwritten per session key)

---

## 17. Uninstall

`integrations/cursor/uninstall.cjs` defaults to **project-local** cleanup: `<project>/.cursor/mcp.json`, project hooks and `AIC.mdc`, and (unless `--keep-project-artifacts`) project `aic.config.json`, `.aic/`, matching ignore-file lines, and the AIC managed span in `.claude/CLAUDE.md`. **`--global`** adds `~/.cursor/mcp.json`, **global Claude Code AIC state** under `~/.claude/` (because Cursor bootstrap can install Claude hooks), and `~/.aic/` cleanup (SQLite preserved unless `--global --remove-database` or env overrides). **`devMode: true`** in **`aic.config.json`** skips all changes unless **`--force`**. Full ordering, flags, and bundled paths under `node_modules/@jatbas/aic` are documented in [installation.md § Uninstall](../installation.md#uninstall).
