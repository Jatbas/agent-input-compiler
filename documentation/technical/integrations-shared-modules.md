# Integrations shared modules reference

This document lists every canonical CommonJS module under `integrations/shared/`, its exported API, filesystem artifacts, which other shared modules it imports, and which hook or install scripts in the repository load it. It supports integration-layer reviews of JSONL caches, session markers, and related hook state.

## When to update this document

Update this document when:

- You add, remove, or rename a top-level module under `integrations/shared/*.cjs`.
- You change exported names or the behavior summarized in the module inventory table.
- You change non-test `require` edges from Cursor or Claude hooks or install scripts into shared modules (caller matrix).
- You change filesystem artifacts under `.aic/`, temp patterns under `os.tmpdir()`, or the shared-internal `require` graph.
- You add or remove a file under `.cursor/hooks/` that must stay a mirror of `integrations/shared/`.

## Canonical location

Shared hook utilities live in:

- `integrations/shared/*.cjs`

Unit tests live in `integrations/shared/__tests__/` and are not listed as callers here.

## Cursor copies under `.cursor/hooks/`

Cursor installs copies of shared modules next to hook scripts in `.cursor/hooks/`. Those copies import each other with `require("./…")`. When changing logic under `integrations/shared/`, update the matching files under `.cursor/hooks/` in the same commit.

Files in `.cursor/hooks/` that correspond to `integrations/shared/` modules:

- `aic-dir.cjs`
- `cache-field-validators.cjs`
- `conversation-id.cjs`
- `edited-files-cache.cjs`
- `prompt-log.cjs`
- `read-stdin-sync.cjs`
- `resolve-project-root.cjs`
- `session-log.cjs`
- `session-markers.cjs`
- `read-session-model-jsonl.cjs`
- `select-session-model-from-jsonl.cjs`
- `session-model-cache.cjs`

`integrations/cursor/hooks/subagent-start-model-id.cjs` is a Cursor hook script (not duplicated from `integrations/shared/`). At runtime in `.cursor/hooks/` it imports `./session-model-cache.cjs`; in the repository tree it uses `require("../../shared/session-model-cache.cjs")` and calls `normalizeModelId` only.

## Claude plugin scripts

Every file in `integrations/claude/plugin/scripts/*.cjs` is a one-line re-export of `../../hooks/<same-base-name>.cjs`. They do not `require` `integrations/shared/` directly; shared modules are pulled in through the hook implementation.

## Module inventory

| File | Exported names | Behavior summary |
| ---- | -------------- | ---------------- |
| `aic-dir.cjs` | `getAicDir`, `ensureAicDir`, `appendJsonl` | Returns `.aic` path; creates directory with mode `0o700`; appends one JSON line per call to `.aic/<filename>`, errors swallowed. |
| `cache-field-validators.cjs` | `isValidModelId`, `isValidConversationId`, `isValidEditorId`, `isValidTimestamp`, `isValidPromptLogTitle`, `isValidPromptLogReason`, `isValidGenerationId` | Printable ASCII and length checks for cache and log fields; mirrors TypeScript in `shared/src/maintenance/cache-field-validators.ts`. |
| `conversation-id.cjs` | `conversationIdFromTranscriptPath`, `conversationIdFromAgentTranscriptPath` | `conversationIdFromTranscriptPath` reads `transcript_path` from hook payload; `conversationIdFromAgentTranscriptPath` reads `agent_transcript_path` (Cursor `subagentStop`) and returns basename without `.jsonl` or `null`. |
| `edited-files-cache.cjs` | `getTempPath`, `readEditedFiles`, `writeEditedFiles`, `cleanupEditedFiles` | Persists edited-file path arrays in `os.tmpdir()` as `aic-edited-<editor>-<key>.json` with sanitized segments. |
| `prompt-log.cjs` | `appendPromptLog` | Validates `prompt` or `session_end` entries, then appends to `.aic/prompt-log.jsonl`. |
| `read-stdin-sync.cjs` | `readStdinSync` | Reads entire stdin synchronously as UTF-8 string. |
| `resolve-project-root.cjs` | `resolveProjectRoot` | Resolves absolute project root from Cursor env, Claude `cwd` or env, plus `options.env`, `options.toolInputOverride`, and `options.useAicProjectRoot` when supplied, falling back to `process.cwd()`. |
| `read-project-dev-mode.cjs` | `isDevModeTrue`, `isCompileGateSkipped` | Reads `<project>/aic.config.json`. `isDevModeTrue` returns `true` only when `devMode === true` after `JSON.parse`; otherwise `false` (missing file or parse error). `isCompileGateSkipped` returns `true` only when both `devMode === true` and `skipCompileGate === true`; used by the Cursor compile gate and the Claude Code compile helper for emergency bypass. |
| `session-log.cjs` | `appendSessionLog` | Validates session telemetry fields, appends to `.aic/session-log.jsonl`. |
| `session-markers.cjs` | `acquireSessionLock`, `releaseSessionLock`, `writeSessionMarker`, `readSessionMarker`, `clearSessionMarker`, `isSessionAlreadyInjected` | Manages `.aic/.session-start-lock` and `.aic/.session-context-injected`; creates `.aic` with mode `0o700` inline. |
| `read-session-model-jsonl.cjs` | `readSessionModelIdFromSessionModelsJsonl` | Bounded tail read of `.aic/session-models.jsonl` with deterministic full-file fallback; uses `select-session-model-from-jsonl.cjs` for the fold; mirrors TypeScript in `shared/src/maintenance/read-session-model-jsonl.ts`. |
| `select-session-model-from-jsonl.cjs` | `reduceSessionModelJsonlState`, `selectSessionModelIdFromJsonlContent` | Parses JSONL text and returns the selected model id; mirrors TypeScript in `shared/src/maintenance/select-session-model-from-jsonl.ts`. |
| `session-model-cache.cjs` | `isValidModelId`, `normalizeModelId`, `readSessionModelCache`, `writeSessionModelCache` | Reads and appends `.aic/session-models.jsonl`; `readSessionModelCache` delegates to `read-session-model-jsonl.cjs`; `isValidModelId` is re-exported from `cache-field-validators.cjs`; `normalizeModelId` maps `"default"` to `"auto"`. |

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
| All other shared modules | — |

Hook scripts never import `aic-dir.cjs` or `cache-field-validators.cjs` directly from `integrations/shared/`; they import them indirectly through `prompt-log.cjs`, `session-log.cjs`, or `session-model-cache.cjs`, or through peer copies under `.cursor/hooks/`.

## Repository callers (non-test)

Each row lists files that `require("../shared/…")` or `require("../../shared/…")` from `integrations/cursor/` or `integrations/claude/`. Paths are repo-relative.

| Shared module | Callers |
| ------------- | ------- |
| `resolve-project-root.cjs` | `integrations/cursor/install.cjs`, `integrations/cursor/uninstall.cjs`, `integrations/claude/install.cjs`, `integrations/claude/uninstall.cjs`, `integrations/cursor/hooks/AIC-inject-conversation-id.cjs`, `integrations/cursor/hooks/AIC-session-init.cjs`, `integrations/cursor/hooks/AIC-require-aic-compile.cjs`, `integrations/cursor/hooks/AIC-before-submit-prewarm.cjs`, `integrations/cursor/hooks/AIC-compile-context.cjs`, `integrations/cursor/hooks/AIC-subagent-compile.cjs`, `integrations/cursor/hooks/AIC-subagent-stop.cjs`, `integrations/cursor/hooks/AIC-session-end.cjs`, `integrations/claude/hooks/aic-prompt-compile.cjs`, `integrations/claude/hooks/aic-pre-compact.cjs`, `integrations/claude/hooks/aic-session-start.cjs`, `integrations/claude/hooks/aic-subagent-inject.cjs`, `integrations/claude/hooks/aic-inject-conversation-id.cjs`, `integrations/claude/hooks/aic-session-end.cjs`, `integrations/claude/hooks/aic-stop-quality-check.cjs` |
| `read-project-dev-mode.cjs` | `integrations/cursor/uninstall.cjs`, `integrations/claude/uninstall.cjs` |
| `conversation-id.cjs` | `integrations/cursor/hooks/AIC-subagent-stop.cjs`, `integrations/claude/hooks/aic-prompt-compile.cjs`, `integrations/claude/hooks/aic-inject-conversation-id.cjs`, `integrations/claude/hooks/aic-pre-compact.cjs`, `integrations/claude/hooks/aic-subagent-inject.cjs`, `integrations/claude/hooks/aic-session-start.cjs` |
| `session-markers.cjs` | `integrations/claude/hooks/aic-prompt-compile.cjs`, `integrations/claude/hooks/aic-session-start.cjs`, `integrations/claude/hooks/aic-session-end.cjs` |
| `prompt-log.cjs` | `integrations/cursor/hooks/AIC-before-submit-prewarm.cjs`, `integrations/claude/hooks/aic-session-end.cjs` |
| `session-log.cjs` | `integrations/cursor/hooks/AIC-session-end.cjs` |
| `session-model-cache.cjs` | `integrations/cursor/hooks/AIC-inject-conversation-id.cjs`, `integrations/cursor/hooks/AIC-before-submit-prewarm.cjs`, `integrations/cursor/hooks/AIC-compile-context.cjs`, `integrations/cursor/hooks/AIC-subagent-compile.cjs`, `integrations/cursor/hooks/subagent-start-model-id.cjs` (imports `normalizeModelId` only), `integrations/claude/hooks/aic-inject-conversation-id.cjs`, `integrations/claude/hooks/aic-compile-helper.cjs` |
| `read-stdin-sync.cjs` | `integrations/cursor/hooks/AIC-stop-quality-check.cjs`, `integrations/cursor/hooks/AIC-after-file-edit-tracker.cjs`, `integrations/claude/hooks/aic-stop-quality-check.cjs`, `integrations/claude/hooks/aic-after-file-edit-tracker.cjs`, `integrations/claude/hooks/aic-block-no-verify.cjs` |
| `edited-files-cache.cjs` | `integrations/cursor/hooks/AIC-stop-quality-check.cjs`, `integrations/cursor/hooks/AIC-after-file-edit-tracker.cjs`, `integrations/cursor/hooks/AIC-session-end.cjs`, `integrations/claude/hooks/aic-stop-quality-check.cjs`, `integrations/claude/hooks/aic-after-file-edit-tracker.cjs`, `integrations/claude/hooks/aic-session-end.cjs` |

## Related documentation

- [Cursor integration layer](cursor-integration-layer.md)
- [Claude Code integration layer](claude-code-integration-layer.md)
- [AIC JSONL caches under `.aic/`](aic-jsonl-caches.md)
- [Session start lock and session context marker](session-start-lock-and-marker.md)
- [MCP server and shared CJS boundary](mcp-and-shared-cjs-boundary.md)
