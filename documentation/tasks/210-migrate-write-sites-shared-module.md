# Task 210: Migrate all write sites to shared module

> **Status:** Pending
> **Phase:** AG — Prompt Log Pipeline Simplification
> **Layer:** integrations
> **Depends on:** AG03 (Extract shared prompt-log append module)

## Goal

Replace inline prompt-log append logic in the three write-site files (Cursor beforeSubmitPrewarm, Claude SessionEnd hooks and plugin) with calls to `integrations/shared/prompt-log.cjs` so all writes use the unified schema and a single implementation.

## Architecture Notes

- Refactoring only: no new interfaces or types; callers use existing `appendPromptLog(projectRoot, entry)` from AG03.
- Unified entry shape: envelope `type`, `editorId`, `conversationId`, `timestamp` plus type-specific fields (`prompt` → generationId, title, model; `session_end` → reason). See `documentation/prompt-log-schema.md`.
- Relative require paths: Cursor hooks use `../../shared/prompt-log.cjs`; Claude hooks use `../../shared/prompt-log.cjs`; Claude plugin uses `../../../shared/prompt-log.cjs`.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `integrations/cursor/hooks/AIC-before-submit-prewarm.cjs` (use shared appendPromptLog; remove LOG_FILE and appendLog) |
| Modify | `integrations/claude/hooks/aic-session-end.cjs` (use shared appendPromptLog; remove local prompt-log mkdir+append block) |
| Modify | `integrations/claude/plugin/scripts/aic-session-end.cjs` (use shared appendPromptLog; remove local prompt-log mkdir+append block) |

## Interface / Signature

Shared module contract (callers use this; source: `integrations/shared/prompt-log.cjs`):

```javascript
function appendPromptLog(projectRoot, entry)
// projectRoot: string (workspace root path)
// entry: object with type "prompt" | "session_end", envelope + type-specific fields
// No return value; invalid entries are skipped; write errors are swallowed
```

Entry shape for `type === "prompt"` (Cursor):

- `type: "prompt"`, `editorId: "cursor"`, `conversationId`, `timestamp`, `generationId`, `title` (≤200 chars), `model`.

Entry shape for `type === "session_end"` (Claude):

- `type: "session_end"`, `editorId: "claude-code"`, `conversationId` (sessionId value), `timestamp`, `reason`.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Migrate Cursor hook (AIC-before-submit-prewarm.cjs)

Add at top (with existing requires): `const { appendPromptLog } = require("../../shared/prompt-log.cjs");`

In the stdin "end" handler, where the code currently calls `appendLog({ conversationId, generationId, title: prompt.slice(0, 200), model, timestamp: ts })`, replace with:

`appendPromptLog(projectRoot, { type: "prompt", editorId: "cursor", conversationId, generationId, title: prompt.slice(0, 200), model, timestamp: ts });`

Remove the constant `LOG_FILE` and the function `appendLog` entirely. Remove any `path` or `fs` usage that existed only for prompt-log (path is still used in `promptFile(generationId)`; fs is still used for `fs.writeFileSync(promptFile(generationId), prompt, "utf8")`).

**Verify:** File has no `LOG_FILE` or `appendLog`; one call to `appendPromptLog(projectRoot, { type: "prompt", ... })`.

### Step 2: Migrate Claude hooks aic-session-end.cjs

Add: `const { appendPromptLog } = require("../../shared/prompt-log.cjs");`

Replace the try block that does `fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });` and `fs.appendFileSync(logPath, JSON.stringify({ sessionId, reason, timestamp: new Date().toISOString() }) + "\n", "utf8");` with a single call:

`appendPromptLog(projectRoot, { type: "session_end", editorId: "claude-code", conversationId: sessionId, reason, timestamp: new Date().toISOString() });`

Remove the `logPath` constant (path.join(aicDir, "prompt-log.jsonl")). Keep all other logic: aicDir, markerPath, tempPath, and the try blocks that unlink marker, lock, and temp file.

**Verify:** No local append to prompt-log.jsonl; one call to `appendPromptLog` with type "session_end"; marker/lock/temp cleanup unchanged.

### Step 3: Migrate Claude plugin aic-session-end.cjs

Apply the same change as Step 2 but use `require("../../../shared/prompt-log.cjs")`. Replace the try block that mkdirs and appends the prompt-log line with `appendPromptLog(projectRoot, { type: "session_end", editorId: "claude-code", conversationId: sessionId, reason, timestamp: new Date().toISOString() });`. Remove `logPath`. Keep marker and temp cleanup (plugin deletes `.current-conversation-id`, not `.session-start-lock` — do not change that).

**Verify:** No local append to prompt-log.jsonl; one call to `appendPromptLog` with type "session_end"; other cleanup behavior unchanged.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| regression | Existing integrations/shared/__tests__/prompt-log.test.cjs and any hook/integration tests still pass; no new test file in this task (AG05 adds pipeline tests). |

## Acceptance Criteria

- [ ] All three files modified per Files table
- [ ] Each write site calls appendPromptLog with correct entry shape (prompt vs session_end)
- [ ] No remaining LOG_FILE, appendLog, or inline prompt-log path/append code in the three files
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] Cursor hook still writes prompt to promptFile(generationId) and session model cache when model valid; Claude hooks still unlink marker/lock/temp as before

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
