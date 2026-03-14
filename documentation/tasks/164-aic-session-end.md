# Task 164: aic-session-end.cjs — SessionEnd

> **Status:** Pending
> **Phase:** T (Claude Code Hook-Based Delivery)
> **Layer:** integrations/claude
> **Depends on:** —

## Goal

Create the Claude Code SessionEnd hook that appends one telemetry line to `.aic/prompt-log.jsonl`, deletes the dual-path marker and the temp edited-files list, and always exits 0 so session end is never blocked.

## Architecture Notes

- Integration layer: source lives in `integrations/claude/hooks/`; no core or MCP changes. See `documentation/claude-code-integration-layer.md` §7.8.
- Input: top-level `parsed.session_id`, `parsed.reason`, `parsed.cwd` with fallback `parsed.input?.*` (same pattern as aic-session-start.cjs). projectRoot = trimmed cwd or `CLAUDE_PROJECT_DIR` or `process.cwd()`.
- All I/O wrapped in try/catch; exit 0 always. No stdout. Export `run(stdinStr)` for T11 testability.

## Files

| Action | Path |
| ------ | ---- |
| Create | `integrations/claude/hooks/aic-session-end.cjs` |

## Interface / Signature

Contract: stdin is JSON. Fields read: `parsed.session_id`, `parsed.reason`, `parsed.cwd` (fallback `parsed.input?.session_id`, `parsed.input?.reason`, `parsed.input?.cwd`). projectRoot = `(parsed.cwd ?? parsed.input?.cwd ?? "").trim()` or `process.env.CLAUDE_PROJECT_DIR` or `process.cwd()`. Output: none. Exit: 0 always.

```javascript
// Exported for T11 tests. Sync.
function run(stdinStr) {
  // Parse; extract sessionId, reason, projectRoot with fallbacks.
  // (1) Ensure projectRoot/.aic exists (mkdirSync recursive, mode 0o700).
  //     Append one line to projectRoot/.aic/prompt-log.jsonl:
  //     JSON.stringify({ sessionId, reason, timestamp: new Date().toISOString() }) + "\n"
  // (2) fs.unlinkSync(projectRoot/.aic/.session-context-injected); catch ENOENT.
  // (3) fs.unlinkSync(path.join(os.tmpdir(), 'aic-cc-edited-' + sessionId + '.json')); catch ENOENT.
  // All steps in try/catch; never throw.
}
```

When run as main: read stdin with `fs.readFileSync(0, "utf8")`, call `run(raw)`, then `process.exit(0)`.

## Dependent Types

None — script uses plain JSON parse and string literals. No TypeScript types.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create SessionEnd hook

Create `integrations/claude/hooks/aic-session-end.cjs` (CommonJS). License header: SPDX-License-Identifier Apache-2.0, Copyright (c) 2025 AIC Contributors. Require: `fs`, `path`, `os`.

- Read stdin: `raw = fs.readFileSync(0, "utf8")`. Parse with `JSON.parse(raw)`; on throw use empty object.
- Extract: `sessionId = parsed.session_id ?? parsed.input?.session_id ?? ""`; `reason = parsed.reason ?? parsed.input?.reason ?? ""`; `cwdRaw = parsed.cwd ?? parsed.input?.cwd ?? ""`. `projectRoot = cwdRaw.trim() ? cwdRaw.trim() : (process.env.CLAUDE_PROJECT_DIR || process.cwd())`.
- (1) Append to prompt-log: `aicDir = path.join(projectRoot, ".aic")`; `logPath = path.join(aicDir, "prompt-log.jsonl")`. In try: `fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 })`; `line = JSON.stringify({ sessionId, reason, timestamp: new Date().toISOString() }) + "\n"`; `fs.appendFileSync(logPath, line, "utf8")`. Catch: ignore.
- (2) Delete marker: `markerPath = path.join(projectRoot, ".aic", ".session-context-injected")`. In try: `fs.unlinkSync(markerPath)`. Catch: ignore ENOENT and other errors.
- (3) Delete temp edited-files list: `tempPath = path.join(os.tmpdir(), "aic-cc-edited-" + sessionId + ".json")`. In try: `fs.unlinkSync(tempPath)`. Catch: ignore.
- If `require.main === module`: read stdin, call `run(raw)`, `process.exit(0)`. Export `module.exports = { run }`.

**Verify:** File exists; node -e "require('./integrations/claude/hooks/aic-session-end.cjs').run(JSON.stringify({session_id:'s1',reason:'end',cwd:process.cwd()}))" exits without throw; .aic/prompt-log.jsonl contains one line; marker and temp file unlink do not throw when missing.

### Step 2: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| session-end log and cleanup | T11 covers integration test (marker + temp file deleted, log line appended). For T09: run hook with fixture stdin; assert no throw, exit 0, prompt-log.jsonl has one line. |

## Acceptance Criteria

- [ ] File `integrations/claude/hooks/aic-session-end.cjs` created per Files table
- [ ] Script reads stdin (parsed.session_id, parsed.reason, parsed.cwd + fallbacks), appends one line to .aic/prompt-log.jsonl, unlinks .aic/.session-context-injected and os.tmpdir()/aic-cc-edited-<sessionId>.json (ignore ENOENT), exits 0
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] All I/O in try/catch; process.exit(0) always

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
