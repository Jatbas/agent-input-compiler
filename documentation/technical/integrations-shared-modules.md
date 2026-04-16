# Integrations shared modules reference

This document lists the CommonJS modules under `integrations/shared/` (and the Cursor-local `is-cursor-native-hook-payload.cjs`) that integration hooks rely on: exported API, filesystem artifacts, shared-internal `require` edges, and repository callers. The **module inventory table** is the contract for those rows; additional `integrations/shared/*.cjs` files may exist for tests or future hooks — add a row when a hook or installer starts depending on them. The inventory also includes `is-cursor-native-hook-payload.cjs`, which lives under `integrations/cursor/` (not `integrations/shared/`), because Cursor install and the caller matrix treat it alongside shared utilities under `.cursor/hooks/`.

## When to update this document

Update this document when:

- You add, remove, or rename a top-level module under `integrations/shared/*.cjs`.
- You change exported names or the behavior summarized in the module inventory table.
- You change non-test `require` edges from Cursor or Claude hooks or install scripts into shared modules (caller matrix).
- You change filesystem artifacts under `.aic/`, temp patterns under `os.tmpdir()`, or the shared-internal `require` graph.
- You add or remove a file under `.cursor/hooks/` that must stay a mirror of `integrations/shared/`.
- You change `integrations/cursor/is-cursor-native-hook-payload.cjs` or Cursor install rules in `integrations/cursor/install.cjs` (`CURSOR_LOCAL_UTILITIES`) that copy it into `.cursor/hooks/`.

## Canonical location

Shared hook utilities live in:

- `integrations/shared/*.cjs`

Unit tests live in `integrations/shared/__tests__/` and are not listed as callers here.

## Cursor copies under `.cursor/hooks/`

Cursor installs copies of shared modules next to hook scripts in `.cursor/hooks/`. Those copies import each other with `require("./…")`. When changing logic under `integrations/shared/`, update the matching files under `.cursor/hooks/` in the same commit.

Deployment copies every `integrations/shared/*.cjs` that hook sources `require("../../shared/…")`, rewriting paths to `./AIC-<basename>`. Hook scripts from `integrations/cursor/hooks/` deploy as `AIC-*.cjs`. `integrations/cursor/install.cjs` `CURSOR_LOCAL_UTILITIES` lists Cursor-only sources (currently `is-cursor-native-hook-payload.cjs`) that receive the same prefix when copied. The resulting `.cursor/hooks/` directory is the union of those copies — not a fixed historical filename list.

`is-cursor-native-hook-payload.cjs` is not under `integrations/shared/`; the canonical source is `integrations/cursor/is-cursor-native-hook-payload.cjs`. Hook scripts resolve it via rewritten `require("./AIC-is-cursor-native-hook-payload.cjs")` paths after install.

`integrations/cursor/hooks/AIC-subagent-start-model-id.cjs` is a Cursor hook script (not duplicated from `integrations/shared/`). In the repository tree it uses `require("../../shared/session-model-cache.cjs")` and calls `normalizeModelId` only. The install copy under `.cursor/hooks/` rewrites that require to `./AIC-session-model-cache.cjs`.

## Claude plugin scripts

Every file in `integrations/claude/plugin/scripts/*.cjs` is a one-line re-export of `../../hooks/<same-base-name>.cjs`. They do not `require` `integrations/shared/` directly; shared modules are pulled in through the hook implementation.

## Module inventory

| File | Exported names | Behavior summary |
| ---- | -------------- | ---------------- |
| `aic-dir.cjs` | `getAicDir`, `ensureAicDir`, `appendJsonl` | Returns `.aic` path; creates directory with mode `0o700`; appends one JSON line per call to `.aic/<filename>`, errors swallowed. |
| `cache-field-validators.cjs` | `isValidModelId`, `isValidConversationId`, `isValidEditorId`, `isValidTimestamp`, `isValidPromptLogTitle`, `isValidPromptLogReason`, `isValidGenerationId` | Printable ASCII and length checks for cache and log fields; mirrors TypeScript in `shared/src/maintenance/cache-field-validators.ts`. |
| `conversation-id.cjs` | `conversationIdFromTranscriptPath`, `conversationIdFromAgentTranscriptPath`, `explicitEditorIdFromClaudeHookEnvelope`, `resolveConversationIdFallback` | `conversationIdFromTranscriptPath(parsed)` resolves in order: non-empty `transcript_path` or `input.transcript_path` → basename without `.jsonl`; else non-empty `conversation_id` or `input.conversation_id` → trimmed string. When that returns `null`, hooks use `resolveConversationIdFallback(parsed)` for a deterministic synthetic id: non-empty trimmed printable-ASCII strings only, max length 128, in order `parent_conversation_id` (top then `input`), `session_id` (top then `input`), then `generation_id` / `generationId` (top, `input`, and camelCase on top/`input`). Invalid or empty candidates are skipped; all `null` if none qualify. `conversationIdFromAgentTranscriptPath` takes a string path (callers pass `agent_transcript_path` from Cursor `subagentStop`) and returns basename without `.jsonl` or `null`. `explicitEditorIdFromClaudeHookEnvelope` returns `cursor-claude-code` when the envelope has a direct `conversation_id` but no transcript path; otherwise `claude-code`. |
| `edited-files-cache.cjs` | `getTempPath`, `readEditedFiles`, `writeEditedFiles`, `cleanupEditedFiles` | Persists edited-file path arrays in `os.tmpdir()` as `aic-edited-<editor>-<key>.json` with sanitized segments. |
| `is-weak-aic-compile-intent.cjs` | `isWeakAicCompileIntent` | Returns `true` for empty/whitespace intent, known weak subagent prefixes, or intent equal to `MCP_INTENT_OMITTED_DEFAULT` from `mcp-intent-omitted-default.cjs`. Used by MCP inject hooks. |
| `mcp-intent-omitted-default.cjs` | `MCP_INTENT_OMITTED_DEFAULT` | String constant aligned with `mcp/src/schemas/compilation-request.ts`; consumed by `is-weak-aic-compile-intent.cjs`. |
| `is-cursor-native-hook-payload.cjs` | `isCursorNativeHookPayload` | Canonical source path is `integrations/cursor/` (not `integrations/shared/`). Returns `true` when `cursor_version` or `input.cursor_version` is present, or when a resolved `conversationId` exists and `isEditorRuntimeMarkerFresh` from `editor-runtime-marker.cjs` is true for editor `"cursor"`. See [Runtime boundary guards (`cursor_version`)](cursor-integration-layer.md#44-runtime-boundary-guards-cursor_version). |
| `prompt-log.cjs` | `appendPromptLog` | Validates `prompt` or `session_end` entries, then appends to `.aic/prompt-log.jsonl`. |
| `read-stdin-sync.cjs` | `readStdinSync` | Reads entire stdin synchronously as UTF-8 string. |
| `resolve-project-root.cjs` | `resolveProjectRoot` | Resolves absolute project root from Cursor env, Claude `cwd` or env, plus `options.env`, `options.toolInputOverride`, and `options.useAicProjectRoot` when supplied, falling back to `process.cwd()`. |
| `read-project-dev-mode.cjs` | `isDevModeTrue`, `isCompileGateSkipped` | Reads `<project>/aic.config.json`. `isDevModeTrue` returns `true` only when `devMode === true` after `JSON.parse`; otherwise `false` (missing file or parse error). `isCompileGateSkipped` returns `true` only when both `devMode === true` and `skipCompileGate === true`; used by `integrations/claude/hooks/aic-compile-helper.cjs` for emergency bypass. The Cursor `preToolUse` compile gate (`AIC-require-aic-compile.cjs`) reads the same two flags inline and does not import this module. |
| `session-log.cjs` | `appendSessionLog` | Validates session telemetry fields, appends to `.aic/session-log.jsonl`. |
| `session-markers.cjs` | `acquireSessionLock`, `releaseSessionLock`, `writeSessionMarker`, `readSessionMarker`, `clearSessionMarker`, `isSessionAlreadyInjected` | Manages `.aic/.session-start-lock` and `.aic/.session-context-injected`; creates `.aic` with mode `0o700` inline. |
| `read-session-model-jsonl.cjs` | `readSessionModelIdFromSessionModelsJsonl` | Bounded tail read of `.aic/session-models.jsonl` with deterministic full-file fallback; uses `select-session-model-from-jsonl.cjs` for the fold; mirrors TypeScript in `shared/src/maintenance/read-session-model-jsonl.ts`. |
| `select-session-model-from-jsonl.cjs` | `reduceSessionModelJsonlState`, `selectSessionModelIdFromJsonlContent` | Parses JSONL text and returns the selected model id; mirrors TypeScript in `shared/src/maintenance/select-session-model-from-jsonl.ts`. |
| `session-model-cache.cjs` | `isValidModelId`, `normalizeModelId`, `readSessionModelCache`, `writeSessionModelCache` | Reads and appends `.aic/session-models.jsonl`; `readSessionModelCache` delegates to `read-session-model-jsonl.cjs`; `isValidModelId` is re-exported from `cache-field-validators.cjs`; `normalizeModelId` maps `"default"` to `"auto"`. |
| `compile-recency.cjs` | `RECENCY_WINDOW_MS`, `recencyFilePath`, `lastConversationIdPath`, `turnMarkerPath`, `writeCompileRecency`, `isCompileRecent`, `writeTurnStart`, `writeTurnCompiled`, `isTurnCompiled`, `writeLastConversationId`, `readLastConversationId` | Project-scoped recency marker and per-conversation turn markers under `os.tmpdir()`; optional `compileRecencyWindowSecs` in `aic.config.json` overrides the default **300** second window. Last-conversation id files support inject and reparent hooks. |
| `read-aic-prewarm-prompt.cjs` | `readAicPrewarmPrompt` | Reads `aic-prompt-<fileKey>` temp files for compile-gate deny text and weak-intent substitution. |
| `resolve-aic-server-id.cjs` | `resolveAicServerId`, `toCursorProjectSlug` | Locates the Cursor MCP server directory name under `~/.cursor/projects/<slug>/mcps/` by finding `tools/aic_compile.json`. |
| `editor-runtime-marker.cjs` | `touchEditorRuntimeMarker`, `isEditorRuntimeMarkerFresh` | Tmpdir markers keyed by editor + project + conversation with TTL (`EDITOR_RUNTIME_MARKER_TTL_MS`). |
| `read-model-from-transcript.cjs` | `readModelFromTranscript` | Tail-reads Claude transcript JSONL for the latest assistant `message.model`. |

## Filesystem artifacts

Paths in the table below are relative to the resolved project root; the edited-files row uses the process temporary directory from `os.tmpdir()`.

| Area | Path or pattern |
| ---- | ---------------- |
| Project AIC directory | `.aic/` (mode `0o700` when created via `ensureAicDir` or `appendJsonl`) |
| Session model cache | `.aic/session-models.jsonl` |
| Prompt log | `.aic/prompt-log.jsonl` |
| Session log | `.aic/session-log.jsonl` |
| Session lock | `.aic/.session-start-lock` |
| Session injected marker | `.aic/.session-context-injected` |
| Edited files temp cache | `<os.tmpdir()>/aic-edited-<editor>-<key>.json` |

## Shared-internal `require` graph

| Module | Imports from `integrations/shared/` |
| ------ | ----------------------------------- |
| `prompt-log.cjs` | `./aic-dir.cjs`, `./cache-field-validators.cjs` |
| `session-log.cjs` | `./aic-dir.cjs`, `./cache-field-validators.cjs` |
| `read-session-model-jsonl.cjs` | `./select-session-model-from-jsonl.cjs` |
| `select-session-model-from-jsonl.cjs` | `./cache-field-validators.cjs` |
| `session-model-cache.cjs` | `./aic-dir.cjs`, `./cache-field-validators.cjs`, `./read-session-model-jsonl.cjs` |
| `conversation-id.cjs` | `./cache-field-validators.cjs` |
| All other shared modules | — |

Hook scripts never import `aic-dir.cjs` or `cache-field-validators.cjs` directly from `integrations/shared/`; they import them indirectly through `prompt-log.cjs`, `session-log.cjs`, or `session-model-cache.cjs`, or through peer copies under `.cursor/hooks/`.

## Repository callers (non-test)

Each row lists files that `require("../shared/…")` or `require("../../shared/…")` from `integrations/cursor/` or `integrations/claude/`. Paths are repo-relative.

| Shared module | Callers |
| ------------- | ------- |
| `resolve-project-root.cjs` | `integrations/cursor/install.cjs`, `integrations/cursor/uninstall.cjs`, `integrations/claude/install.cjs`, `integrations/claude/uninstall.cjs`, `integrations/cursor/hooks/AIC-inject-conversation-id.cjs`, `integrations/cursor/hooks/AIC-session-init.cjs`, `integrations/cursor/hooks/AIC-require-aic-compile.cjs`, `integrations/cursor/hooks/AIC-before-submit-prewarm.cjs`, `integrations/cursor/hooks/AIC-compile-context.cjs`, `integrations/cursor/hooks/AIC-subagent-compile.cjs`, `integrations/cursor/hooks/AIC-subagent-stop.cjs`, `integrations/cursor/hooks/AIC-session-end.cjs`, `integrations/claude/hooks/aic-prompt-compile.cjs`, `integrations/claude/hooks/aic-pre-compact.cjs`, `integrations/claude/hooks/aic-session-start.cjs`, `integrations/claude/hooks/aic-subagent-inject.cjs`, `integrations/claude/hooks/aic-inject-conversation-id.cjs`, `integrations/claude/hooks/aic-session-end.cjs`, `integrations/claude/hooks/aic-stop-quality-check.cjs` |
| `read-project-dev-mode.cjs` | `integrations/cursor/uninstall.cjs`, `integrations/claude/uninstall.cjs`, `integrations/claude/hooks/aic-compile-helper.cjs`, `integrations/cursor/hooks/AIC-inject-conversation-id.cjs`, `integrations/claude/hooks/aic-inject-conversation-id.cjs` |
| `conversation-id.cjs` | `integrations/cursor/hooks/AIC-compile-context.cjs`, `integrations/cursor/hooks/AIC-session-init.cjs`, `integrations/cursor/hooks/AIC-inject-conversation-id.cjs`, `integrations/cursor/hooks/AIC-subagent-compile.cjs`, `integrations/cursor/hooks/AIC-subagent-stop.cjs`, `integrations/claude/hooks/aic-session-start.cjs`, `integrations/claude/hooks/aic-prompt-compile.cjs`, `integrations/claude/hooks/aic-subagent-inject.cjs`, `integrations/claude/hooks/aic-pre-compact.cjs`, `integrations/claude/hooks/aic-inject-conversation-id.cjs`, `integrations/claude/hooks/aic-subagent-stop.cjs` |
| `is-cursor-native-hook-payload.cjs` | `integrations/cursor/hooks/AIC-after-file-edit-tracker.cjs`, `integrations/cursor/hooks/AIC-before-submit-prewarm.cjs`, `integrations/cursor/hooks/AIC-block-no-verify.cjs`, `integrations/cursor/hooks/AIC-compile-context.cjs`, `integrations/cursor/hooks/AIC-inject-conversation-id.cjs`, `integrations/cursor/hooks/AIC-post-compile-context.cjs`, `integrations/cursor/hooks/AIC-require-aic-compile.cjs`, `integrations/cursor/hooks/AIC-session-end.cjs`, `integrations/cursor/hooks/AIC-session-init.cjs`, `integrations/cursor/hooks/AIC-stop-quality-check.cjs`, `integrations/cursor/hooks/AIC-subagent-compile.cjs`, `integrations/cursor/hooks/AIC-subagent-stop.cjs`, `integrations/claude/hooks/aic-after-file-edit-tracker.cjs`, `integrations/claude/hooks/aic-block-no-verify.cjs`, `integrations/claude/hooks/aic-inject-conversation-id.cjs`, `integrations/claude/hooks/aic-pre-compact.cjs`, `integrations/claude/hooks/aic-prompt-compile.cjs`, `integrations/claude/hooks/aic-session-end.cjs`, `integrations/claude/hooks/aic-session-start.cjs`, `integrations/claude/hooks/aic-stop-quality-check.cjs`, `integrations/claude/hooks/aic-subagent-inject.cjs`, `integrations/claude/hooks/aic-subagent-stop.cjs` |
| `session-markers.cjs` | `integrations/claude/hooks/aic-prompt-compile.cjs`, `integrations/claude/hooks/aic-session-start.cjs`, `integrations/claude/hooks/aic-session-end.cjs` |
| `prompt-log.cjs` | `integrations/cursor/hooks/AIC-before-submit-prewarm.cjs`, `integrations/claude/hooks/aic-session-end.cjs` |
| `session-log.cjs` | `integrations/cursor/hooks/AIC-session-end.cjs` |
| `session-model-cache.cjs` | `integrations/cursor/hooks/AIC-inject-conversation-id.cjs`, `integrations/cursor/hooks/AIC-before-submit-prewarm.cjs`, `integrations/cursor/hooks/AIC-compile-context.cjs`, `integrations/cursor/hooks/AIC-subagent-compile.cjs`, `integrations/cursor/hooks/AIC-subagent-start-model-id.cjs` (imports `normalizeModelId` only), `integrations/claude/hooks/aic-inject-conversation-id.cjs`, `integrations/claude/hooks/aic-compile-helper.cjs` |
| `read-stdin-sync.cjs` | `integrations/cursor/hooks/AIC-stop-quality-check.cjs`, `integrations/cursor/hooks/AIC-after-file-edit-tracker.cjs`, `integrations/claude/hooks/aic-stop-quality-check.cjs`, `integrations/claude/hooks/aic-after-file-edit-tracker.cjs`, `integrations/claude/hooks/aic-block-no-verify.cjs` |
| `edited-files-cache.cjs` | `integrations/cursor/hooks/AIC-stop-quality-check.cjs`, `integrations/cursor/hooks/AIC-after-file-edit-tracker.cjs`, `integrations/cursor/hooks/AIC-session-end.cjs`, `integrations/claude/hooks/aic-stop-quality-check.cjs`, `integrations/claude/hooks/aic-after-file-edit-tracker.cjs`, `integrations/claude/hooks/aic-session-end.cjs` |
| `compile-recency.cjs` | `integrations/cursor/hooks/AIC-before-submit-prewarm.cjs`, `integrations/cursor/hooks/AIC-compile-context.cjs`, `integrations/cursor/hooks/AIC-inject-conversation-id.cjs`, `integrations/cursor/hooks/AIC-require-aic-compile.cjs`, `integrations/cursor/hooks/AIC-subagent-compile.cjs`, `integrations/claude/hooks/aic-inject-conversation-id.cjs`, `integrations/claude/hooks/aic-pre-compact.cjs`, `integrations/claude/hooks/aic-pre-tool-gate.cjs`, `integrations/claude/hooks/aic-prompt-compile.cjs`, `integrations/claude/hooks/aic-session-start.cjs`, `integrations/claude/hooks/aic-subagent-inject.cjs`, `integrations/claude/hooks/aic-subagent-stop.cjs` |
| `read-aic-prewarm-prompt.cjs` | `integrations/cursor/hooks/AIC-require-aic-compile.cjs`, `integrations/cursor/hooks/AIC-inject-conversation-id.cjs`, `integrations/claude/hooks/aic-pre-tool-gate.cjs`, `integrations/claude/hooks/aic-inject-conversation-id.cjs` |
| `resolve-aic-server-id.cjs` | `integrations/cursor/hooks/AIC-inject-conversation-id.cjs` |
| `editor-runtime-marker.cjs` | `integrations/cursor/is-cursor-native-hook-payload.cjs`, `integrations/cursor/hooks/AIC-before-submit-prewarm.cjs`, `integrations/claude/is-claude-native-hook-payload.cjs`, `integrations/claude/hooks/aic-session-start.cjs`, `integrations/claude/hooks/aic-prompt-compile.cjs`, `integrations/claude/hooks/aic-subagent-inject.cjs` |
| `read-model-from-transcript.cjs` | `integrations/claude/hooks/aic-session-start.cjs`, `integrations/claude/hooks/aic-prompt-compile.cjs` |

## Related documentation

- [Implementation specification — Model id resolution](../implementation-spec.md#model-id-resolution-aic_compile)
- [Cursor integration layer](cursor-integration-layer.md)
- [Claude Code integration layer](claude-code-integration-layer.md)
- [AIC JSONL caches under `.aic/`](aic-jsonl-caches.md)
- [Session start lock and session context marker](session-start-lock-and-marker.md)
- [MCP server and shared CJS boundary](mcp-and-shared-cjs-boundary.md)
