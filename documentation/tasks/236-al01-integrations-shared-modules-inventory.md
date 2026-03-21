# Task 236: AL01 inventory integrations shared modules

> **Status:** Pending
> **Phase:** AL — Unified Cache Pipeline Review
> **Layer:** documentation
> **Depends on:** Phases AF through AK complete (per `documentation/tasks/progress/mvp-progress.md`)

## Goal

Add `documentation/integrations-shared-modules.md` as the single reference for every canonical `integrations/shared/*.cjs` module: exported names, behavior summary, `.aic/` and temp artifacts, shared-internal `require` edges, and non-test repository callers.

## Architecture Notes

- Canonical modules live only under `integrations/shared/*.cjs`; Cursor installs copies into `.cursor/hooks/` that use peer `./` requires.
- Claude Code `integrations/claude/plugin/scripts/*.cjs` files re-export `../../hooks/*.cjs` and do not import `integrations/shared/` directly.
- `session-markers.cjs` creates `.aic` with `fs.mkdirSync` mode `0o700` inline and does not import `aic-dir.cjs`.
- `cache-field-validators.cjs` stays aligned with `shared/src/maintenance/cache-field-validators.ts` (see file header comment in the CJS module).
- The new document body must not name roadmap phases or task identifiers; describe files and behavior only.

## Files

| Action | Path |
| ------ | ---- |
| Create | `documentation/integrations-shared-modules.md` |

## Change Specification

### Change 1: Create `documentation/integrations-shared-modules.md`

**Current text:** None — the file does not exist on `main`.

**Required change:** Create the file so its body matches the following markdown exactly (UTF-8, newline at end of file).

**Target text:**

```markdown
# Integrations shared modules reference

This document lists every canonical CommonJS module under `integrations/shared/`, its exported API, filesystem artifacts, which other shared modules it imports, and which hook or install scripts in the repository load it. It supports integration-layer reviews of JSONL caches, session markers, and related hook state.

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
- `session-model-cache.cjs`

`integrations/cursor/hooks/subagent-start-model-id.cjs` is a Cursor hook script (not duplicated from `integrations/shared/`). At runtime in `.cursor/hooks/` it imports `./session-model-cache.cjs`; in the repository tree it uses `require("../../shared/session-model-cache.cjs")` and calls `normalizeModelId` only.

## Claude plugin scripts

Every file in `integrations/claude/plugin/scripts/*.cjs` is a one-line re-export of `../../hooks/<same-base-name>.cjs`. They do not `require` `integrations/shared/` directly; shared modules are pulled in through the hook implementation.

## Module inventory

| File | Exported names | Behavior summary |
| ---- | -------------- | ---------------- |
| `aic-dir.cjs` | `getAicDir`, `ensureAicDir`, `appendJsonl` | Returns `.aic` path; creates directory with mode `0o700`; appends one JSON line per call to `.aic/<filename>`, errors swallowed. |
| `cache-field-validators.cjs` | `isValidModelId`, `isValidConversationId`, `isValidEditorId`, `isValidTimestamp`, `isValidPromptLogTitle`, `isValidPromptLogReason`, `isValidGenerationId` | Printable ASCII and length checks for cache and log fields; mirrors TypeScript in `shared/src/maintenance/cache-field-validators.ts`. |
| `conversation-id.cjs` | `conversationIdFromTranscriptPath` | Reads `transcript_path` from hook payload; returns basename without `.jsonl` or `null`. |
| `edited-files-cache.cjs` | `getTempPath`, `readEditedFiles`, `writeEditedFiles`, `cleanupEditedFiles` | Persists edited-file path arrays in `os.tmpdir()` as `aic-edited-<editor>-<key>.json` with sanitized segments. |
| `prompt-log.cjs` | `appendPromptLog` | Validates `prompt` or `session_end` entries, then appends to `.aic/prompt-log.jsonl`. |
| `read-stdin-sync.cjs` | `readStdinSync` | Reads entire stdin synchronously as UTF-8 string. |
| `resolve-project-root.cjs` | `resolveProjectRoot` | Resolves absolute project root from Cursor env, Claude `cwd` or env, plus `options.env`, `options.toolInputOverride`, and `options.useAicProjectRoot` when supplied, falling back to `process.cwd()`. |
| `session-log.cjs` | `appendSessionLog` | Validates session telemetry fields, appends to `.aic/session-log.jsonl`. |
| `session-markers.cjs` | `acquireSessionLock`, `releaseSessionLock`, `writeSessionMarker`, `readSessionMarker`, `clearSessionMarker`, `isSessionAlreadyInjected` | Manages `.aic/.session-start-lock` and `.aic/.session-context-injected`; creates `.aic` with mode `0o700` inline. |
| `session-model-cache.cjs` | `isValidModelId`, `normalizeModelId`, `readSessionModelCache`, `writeSessionModelCache` | Reads and appends `.aic/session-models.jsonl`; `isValidModelId` is re-exported from `cache-field-validators.cjs`; `normalizeModelId` maps `"default"` to `"auto"`. |

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
| `session-model-cache.cjs` | `./aic-dir.cjs`, `./cache-field-validators.cjs` |
| All other shared modules | — |

Hook scripts never import `aic-dir.cjs` or `cache-field-validators.cjs` directly from `integrations/shared/`; they import them indirectly through `prompt-log.cjs`, `session-log.cjs`, or `session-model-cache.cjs`, or through peer copies under `.cursor/hooks/`.

## Repository callers (non-test)

Each row lists files that `require("../shared/…")` or `require("../../shared/…")` from `integrations/cursor/` or `integrations/claude/`. Paths are repo-relative.

| Shared module | Callers |
| ------------- | ------- |
| `resolve-project-root.cjs` | `integrations/cursor/install.cjs`, `integrations/cursor/uninstall.cjs`, `integrations/claude/install.cjs`, `integrations/cursor/hooks/AIC-inject-conversation-id.cjs`, `integrations/cursor/hooks/AIC-session-init.cjs`, `integrations/cursor/hooks/AIC-require-aic-compile.cjs`, `integrations/cursor/hooks/AIC-before-submit-prewarm.cjs`, `integrations/cursor/hooks/AIC-compile-context.cjs`, `integrations/cursor/hooks/AIC-subagent-compile.cjs`, `integrations/cursor/hooks/AIC-session-end.cjs`, `integrations/claude/hooks/aic-prompt-compile.cjs`, `integrations/claude/hooks/aic-pre-compact.cjs`, `integrations/claude/hooks/aic-session-start.cjs`, `integrations/claude/hooks/aic-subagent-inject.cjs`, `integrations/claude/hooks/aic-inject-conversation-id.cjs`, `integrations/claude/hooks/aic-session-end.cjs`, `integrations/claude/hooks/aic-stop-quality-check.cjs` |
| `conversation-id.cjs` | `integrations/claude/hooks/aic-prompt-compile.cjs`, `integrations/claude/hooks/aic-inject-conversation-id.cjs`, `integrations/claude/hooks/aic-pre-compact.cjs`, `integrations/claude/hooks/aic-subagent-inject.cjs`, `integrations/claude/hooks/aic-session-start.cjs` |
| `session-markers.cjs` | `integrations/claude/hooks/aic-prompt-compile.cjs`, `integrations/claude/hooks/aic-session-start.cjs`, `integrations/claude/hooks/aic-session-end.cjs` |
| `prompt-log.cjs` | `integrations/cursor/hooks/AIC-before-submit-prewarm.cjs`, `integrations/claude/hooks/aic-session-end.cjs` |
| `session-log.cjs` | `integrations/cursor/hooks/AIC-session-end.cjs` |
| `session-model-cache.cjs` | `integrations/cursor/hooks/AIC-inject-conversation-id.cjs`, `integrations/cursor/hooks/AIC-before-submit-prewarm.cjs`, `integrations/cursor/hooks/AIC-compile-context.cjs`, `integrations/cursor/hooks/AIC-subagent-compile.cjs`, `integrations/cursor/hooks/subagent-start-model-id.cjs` (imports `normalizeModelId` only), `integrations/claude/hooks/aic-inject-conversation-id.cjs`, `integrations/claude/hooks/aic-compile-helper.cjs` |
| `read-stdin-sync.cjs` | `integrations/cursor/hooks/AIC-stop-quality-check.cjs`, `integrations/cursor/hooks/AIC-after-file-edit-tracker.cjs`, `integrations/claude/hooks/aic-stop-quality-check.cjs`, `integrations/claude/hooks/aic-after-file-edit-tracker.cjs`, `integrations/claude/hooks/aic-block-no-verify.cjs` |
| `edited-files-cache.cjs` | `integrations/cursor/hooks/AIC-stop-quality-check.cjs`, `integrations/cursor/hooks/AIC-after-file-edit-tracker.cjs`, `integrations/cursor/hooks/AIC-session-end.cjs`, `integrations/claude/hooks/aic-stop-quality-check.cjs`, `integrations/claude/hooks/aic-after-file-edit-tracker.cjs`, `integrations/claude/hooks/aic-session-end.cjs` |

## Related documentation

- [Cursor integration layer](cursor-integration-layer.md)
- [Claude Code integration layer](claude-code-integration-layer.md)

```

## Writing Standards

- **Tone:** Technical reference; short declarative sentences.
- **Audience:** Contributors maintaining `integrations/shared/` and editor hooks.
- **Terminology:** Use "canonical module" for `integrations/shared/*.cjs`; use "Cursor copy" for `.cursor/hooks/` peers.
- **Formatting:** `##` section headings; tables for inventories; paths in backticks.
- **Cross-reference format:** Link other docs with markdown links using repo-relative paths.
- **Temporal robustness:** Do not mention phase letters, phase numbers, or task numbers in the new document body.

## Cross-Reference Map

| Document | References this doc | This doc references | Consistency check |
| -------- | ------------------- | ------------------- | ----------------- |
| `documentation/cursor-integration-layer.md` | None until a follow-up edit adds a link | Cursor integration doc | No conflict — different scope |
| `documentation/claude-code-integration-layer.md` | None until a follow-up edit adds a link | Claude integration doc | File exists at repository path |

## Config Changes

- **shared/package.json:** no change
- **eslint.config.mjs:** no change

## Steps

### Step 1: Verify target path is absent

Run `test ! -f documentation/integrations-shared-modules.md` from the repository root.

**Verify:** Exit code `0`.

### Step 2: Write the reference document

Create `documentation/integrations-shared-modules.md` with the exact markdown body from **Change 1 — Target text** in this task (content inside the fenced `markdown` block only, not the fences themselves).

**Verify:** `test $(wc -l < documentation/integrations-shared-modules.md) -eq 95`

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

**Verify:** All commands exit `0` with zero warnings; no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| `verify_absence` | Step 1 confirms the file did not exist before creation. |
| `verify_commands` | Step 3 full project checks pass. |

## Acceptance Criteria

- [ ] `documentation/integrations-shared-modules.md` exists and matches Change 1 target text exactly
- [ ] Document body contains no phase names or task identifiers
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all pass
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Follow-up Items

- Add a one-line link to `documentation/integrations-shared-modules.md` from `documentation/cursor-integration-layer.md` in a separate documentation commit.

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
