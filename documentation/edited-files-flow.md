# Edited-files flow (per editor)

## Purpose

This document is the single reference for the full flow that tracks edited file paths and runs quality checks at stop time: tracker hook writes paths to a temp file, stop hook reads the list and runs ESLint and `tsc`, and sessionEnd cleans up (where implemented). It lists all 8 implementation files, their payload shapes, path extraction, output formats, and cleanup behavior. Audience: integration developers and maintainers.

## Flow overview

The pattern is identical across editors: on each file edit, the tracker appends the path(s) to a session-keyed JSON array in `os.tmpdir()`. When the user stops, the stop hook reads that array, filters to existing paths (and in Claude Code to `.ts`/`.js` only), runs `eslint` and `tsc --noEmit`, and reports success or failure in the editor's protocol format. SessionEnd may delete the temp file (Claude Code) or not (Cursor — see cleanup section).

## Comparison (Cursor vs Claude Code)

| Aspect                | Cursor                                                                                                                                           | Claude Code                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Temp file prefix      | `aic-edited-files-`                                                                                                                              | `aic-cc-edited-`                                                               |
| Key derivation        | `conversation_id` ?? `conversationId` ?? `session_id` ?? `sessionId` ?? `AIC_CONVERSATION_ID` ?? `"default"`                                     | `session_id` ?? `input.session_id` ?? `input.input?.session_id` ?? `"default"` |
| Key sanitization      | `/[^a-zA-Z0-9_-]/g` → `_`                                                                                                                        | `/[^a-zA-Z0-9*-]/g` → `_` (includes `*`)                                       |
| Path extraction       | Multiple fields: `files`, `paths`, `editedFiles`, `edited_paths` (arrays), `file`, `path`, `filePath` (single), `edit`/`edits` (object or array) | Single path: `tool_input.path` (or `input.input?.tool_input?.path`)            |
| Stop output (success) | `{}`                                                                                                                                             | `""` (empty stdout)                                                            |
| Stop output (failure) | `{ "followup_message": "Fix lint and typecheck errors..." }`                                                                                     | `{ "decision": "block", "reason": "..." }`                                     |
| Stop path filter      | `existsSync` only                                                                                                                                | `existsSync` and `.ts`/`.js` extension                                         |
| Cleanup in sessionEnd | Does not delete edited-files temp files                                                                                                          | Deletes temp file via `unlinkSync`                                             |

## Cursor flow

1. **afterFileEdit** — `AIC-after-file-edit-tracker.cjs` reads JSON from stdin, derives the key from input or `AIC_CONVERSATION_ID`, extracts paths via `extractPaths(input)` (see Payload shapes), reads the existing temp file (or `[]`), merges and deduplicates, writes `JSON.stringify(merged)` to `os.tmpdir()/aic-edited-files-<sanitized_key>.json`. Stdout: `{}`.
2. **stop** — `AIC-stop-quality-check.cjs` reads stdin, derives the same key, reads the temp file, filters to paths that exist, runs `npx eslint --max-warnings 0 -- <paths>` and `npx tsc --noEmit`. On failure, stdout: `{ "followup_message": "<message>" }`; on success: `{}`.
3. **sessionEnd** — `AIC-session-end.cjs` cleans only temp files whose names start with `aic-gate-`, `aic-deny-`, or `aic-prompt-`. It does **not** delete `aic-edited-files-*` files, so those accumulate in `os.tmpdir()` until the process exits or the system clears temp. A follow-up change will add cleanup so Cursor matches Claude Code behavior.

## Claude Code flow

Claude Code has two deployment paths (hooks and plugin); each has its own copy of the three scripts. Behavior is the same.

1. **PostToolUse (Edit|Write)** — `aic-after-file-edit-tracker.cjs` reads stdin, gets `session_id` and `tool_input.path`, sanitizes the key, reads existing temp array (or `[]`), appends the resolved path, deduplicates, writes to `os.tmpdir()/aic-cc-edited-<sanitized>.json`. Stdout: `{}`.
2. **Stop** — `aic-stop-quality-check.cjs` reads stdin, gets `session_id` and project root (`cwd` or `CLAUDE_PROJECT_DIR`), reads the temp file, filters to existing paths with `.ts` or `.js` extension, runs eslint and tsc. On failure, stdout: `{ "decision": "block", "reason": "..." }`; on success: empty string.
3. **SessionEnd** — `aic-session-end.cjs` (hooks and plugin) builds the same temp path from `session_id` and calls `fs.unlinkSync(tempPath)` so the edited-files temp file is removed. Hooks version also deletes `.aic/.session-start-lock`; plugin version deletes `.aic/.current-conversation-id`.

## File inventory

| File                                                                 | Editor      | Role       | Key source   | Notes                       |
| -------------------------------------------------------------------- | ----------- | ---------- | ------------ | --------------------------- |
| `integrations/cursor/hooks/AIC-after-file-edit-tracker.cjs`          | Cursor      | Tracker    | input or env | Writes temp file            |
| `integrations/cursor/hooks/AIC-stop-quality-check.cjs`               | Cursor      | Stop       | same key     | Reads temp, runs eslint/tsc |
| `integrations/claude/hooks/aic-after-file-edit-tracker.cjs`          | Claude Code | Tracker    | session_id   | Hooks deployment            |
| `integrations/claude/hooks/aic-stop-quality-check.cjs`               | Claude Code | Stop       | session_id   | Hooks deployment            |
| `integrations/claude/hooks/aic-session-end.cjs`                      | Claude Code | SessionEnd | session_id   | Deletes temp file           |
| `integrations/claude/plugin/scripts/aic-after-file-edit-tracker.cjs` | Claude Code | Tracker    | session_id   | Plugin deployment           |
| `integrations/claude/plugin/scripts/aic-stop-quality-check.cjs`      | Claude Code | Stop       | session_id   | Plugin deployment           |
| `integrations/claude/plugin/scripts/aic-session-end.cjs`             | Claude Code | SessionEnd | session_id   | Deletes temp file           |

Cursor's sessionEnd script (`AIC-session-end.cjs`) does not touch the edited-files temp file; the 8 files above are the ones that implement the edited-files flow (read/write/cleanup of the temp file).

## Payload shapes

**Cursor tracker** — Input is JSON on stdin. Key from `input.conversation_id`, `input.conversationId`, `input.session_id`, `input.sessionId`, `process.env.AIC_CONVERSATION_ID`, or `"default"`. Paths from:

- Arrays: `input.files`, `input.paths`, `input.editedFiles`, `input.edited_paths` (each element resolved with `path.resolve`).
- Single: `input.file`, `input.path`, `input.filePath`.
- Nested: `input.edit` or `input.edits` — if object, use `edit.file` / `edit.path` / `edit.filePath`; if array, each element's `file`/`path`/`filePath`.

**Claude Code tracker** — Input is JSON on stdin. Key from `input.session_id` or `input.input?.session_id` or `"default"`. Single path from `input.tool_input?.path` or `input.input?.tool_input?.path`; resolved with `path.resolve`.

## Output formats

| Hook    | Editor      | Success | Failure                                                                     |
| ------- | ----------- | ------- | --------------------------------------------------------------------------- |
| Tracker | Both        | `{}`    | (same; errors swallowed)                                                    |
| Stop    | Cursor      | `{}`    | `{ "followup_message": "Fix lint and typecheck errors..." }`                |
| Stop    | Claude Code | `""`    | `{ "decision": "block", "reason": "Fix lint/typecheck errors:\n<stderr>" }` |

Stop output format is defined by each editor's hook protocol and differs between Cursor and Claude Code.

## Cleanup and Cursor temp file leak

**Claude Code:** SessionEnd (hooks and plugin) deletes the edited-files temp file for the current `session_id` via `unlinkSync(tempPath)`.

**Cursor:** SessionEnd does not delete `aic-edited-files-*` (see Comparison). Those files therefore accumulate in `os.tmpdir()` until process exit or the OS clears temp. A follow-up change will add cleanup so Cursor matches Claude Code behavior.

## Temp file schema and merge semantics

- **Content:** JSON array of strings (absolute file paths). Example: `["/path/to/a.ts","/path/to/b.ts"]`.
- **Read:** Parse JSON; if not an array, treat as `[]`. Filter to elements that are non-empty strings.
- **Write:** Read existing array (or `[]` if file missing or invalid). Merge new paths: `merged = [...new Set([...existing, ...newPaths])]`. Filter to `typeof p === "string" && p.length > 0`. Write `JSON.stringify(merged)` to the temp file. No duplicates; order is not specified.

## Stdin and shared helpers

All hooks receive JSON on stdin. The implementation currently uses a local 10-line buffer-loop helper to read stdin synchronously. A shared `readStdinSync()` helper will be used by all tracker, stop, and sessionEnd scripts (and by other hooks that read stdin) so there is a single implementation.
