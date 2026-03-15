# Task 168: Hook-based delivery integration tests

> **Status:** Pending
> **Phase:** T (Claude Code Hook-Based Delivery)
> **Layer:** test (integrations/claude/__tests__)
> **Depends on:** T01–T10

## Goal

Complete T11 by adding the missing SessionEnd hook test file and aligning the prompt-compile test fixtures with the T11 requirement for top-level fields so all hook integration tests are in place and consistent.

## Architecture Notes

- T11 (mvp-progress.md): test fixtures must use top-level fields such as `{ session_id, cwd, prompt }`, not nested under `input`. Hooks that call `callAicCompile` are already mocked via `require.cache` in existing tests; SessionEnd has no helper call.
- Session-end hook (`aic-session-end.cjs`) exports `run(stdinStr)` (sync). It reads `session_id`, `reason`, `cwd` from parsed stdin (top-level or `parsed.input` fallback), appends one JSON line to `.aic/prompt-log.jsonl`, and deletes `.aic/.session-context-injected` and `os.tmpdir()/aic-cc-edited-<sanitized>.json`.
- Reuse the same structural pattern as `aic-stop-quality-check.test.cjs`: require hook, call `run(JSON.stringify({ ... }))` with top-level keys, assert file system side effects.

## Files

| Action | Path                                                                 | Notes |
| ------ | -------------------------------------------------------------------- | ----- |
| Create | `integrations/claude/__tests__/aic-session-end.test.cjs`            | New test file for SessionEnd hook |
| Modify | `integrations/claude/__tests__/aic-prompt-compile.test.cjs`         | Change fixtures to top-level `{ prompt, session_id, cwd }` |

## Interface / Signature

Test-only task. No production interface. Hooks under test:

- `integrations/claude/hooks/aic-prompt-compile.cjs`: `async function run(stdinStr)` — reads `prompt`, `session_id`, `cwd` from parsed JSON (top-level or `input` fallback), returns plain text string or null.
- `integrations/claude/hooks/aic-session-end.cjs`: `function run(stdinStr)` — reads `session_id`, `reason`, `cwd` from parsed JSON, side effects only (append log, unlink marker and temp file).

Fixture shape (T11 requirement):

- Before (prompt-compile): `{ input: { prompt, session_id, cwd } }`
- After (prompt-compile): `{ prompt, session_id, cwd }` (top-level only)
- Session-end: `{ session_id, reason, cwd }` (top-level). Temp file path uses same sanitization as hook: `path.join(os.tmpdir(), "aic-cc-edited-" + String(sessionId).replace(/[^a-zA-Z0-9*-]/g, "_") + ".json")`.

## Dependent Types

Not applicable — test files use plain JSON fixtures and Node built-ins (`fs`, `path`, `os`); no core branded types.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Use top-level fixtures in aic-prompt-compile.test.cjs

In `integrations/claude/__tests__/aic-prompt-compile.test.cjs`, change every fixture passed to `run(...)` from nested `input` to top-level keys.

- In `plain_text_stdout_when_helper_returns_prompt`: replace `JSON.stringify({ input: { prompt: "x", session_id: "s1", cwd: "/tmp" } })` with `JSON.stringify({ prompt: "x", session_id: "s1", cwd: "/tmp" })`.
- In `exit_0_silent_when_helper_returns_null`: replace `JSON.stringify({ input: { prompt: "x", cwd: "/tmp" } })` with `JSON.stringify({ prompt: "x", cwd: "/tmp" })`.
- In `dual_path_prepends_invariants_when_marker_missing`: replace `JSON.stringify({ input: { prompt: "x", session_id: "other-session", cwd: tmpDir } })` with `JSON.stringify({ prompt: "x", session_id: "other-session", cwd: tmpDir })`.

Do not change test names, mock logic, or assertions.

**Verify:** Run `node integrations/claude/__tests__/aic-prompt-compile.test.cjs` from project root; output ends with "All tests passed."

### Step 2: Add aic-session-end.test.cjs

Create `integrations/claude/__tests__/aic-session-end.test.cjs` (CommonJS, same license header and structure as `aic-stop-quality-check.test.cjs`).

- Require the hook: `const { run } = require(path.join(__dirname, "..", "hooks", "aic-session-end.cjs"));`
- Helper: `tempPath(sessionId)` returns `path.join(os.tmpdir(), "aic-cc-edited-" + String(sessionId).replace(/[^a-zA-Z0-9*-]/g, "_") + ".json")` (same sanitization as hook).
- Test `marker_and_temp_deleted_after_run`: Create a temp dir with `fs.mkdtempSync`. Create `.aic` in it and write a marker file at `.aic/.session-context-injected` with content `"sid-del"`. Write a temp edited file at `tempPath("sid-del")` with content `"[]"`. Call `run(JSON.stringify({ session_id: "sid-del", reason: "test", cwd: tmpDir }))`. Assert `!fs.existsSync(markerPath)` and `!fs.existsSync(tempPath("sid-del"))`. Clean up tmpDir.
- Test `prompt_log_jsonl_appended`: Create a temp dir. Call `run(JSON.stringify({ session_id: "s1", reason: "end", cwd: tmpDir }))`. Read `.aic/prompt-log.jsonl`; assert file exists and the last line parses as JSON with `sessionId === "s1"`, `reason === "end"`, and a `timestamp` string. Clean up tmpDir.
- Test `exit_0_always`: Call `run("{}")` and `run("not json")`; neither must throw (hook wraps I/O in try/catch).

Run the tests in sequence (sync); print "pass" per test and "All tests passed." at the end.

**Verify:** Run `node integrations/claude/__tests__/aic-session-end.test.cjs` from project root; output ends with "All tests passed."

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                         | Description                                                                 |
| --------------------------------- | --------------------------------------------------------------------------- |
| plain_text_stdout (prompt-compile)| After Step 1: fixture top-level; stdout equals mocked compiled text         |
| exit_0_silent (prompt-compile)    | After Step 1: fixture top-level; helper returns null, stdout null           |
| dual_path_prepends (prompt-compile)| After Step 1: fixture top-level; marker missing, invariants + prompt in stdout |
| marker_and_temp_deleted_after_run | Step 2: after run, marker and temp file no longer exist                    |
| prompt_log_jsonl_appended         | Step 2: prompt-log.jsonl has one line with sessionId, reason, timestamp    |
| exit_0_always                     | Step 2: run("{}") and run("not json") do not throw                          |

## Acceptance Criteria

- [ ] aic-session-end.test.cjs created with three test cases above
- [ ] aic-prompt-compile.test.cjs fixtures use top-level `{ prompt, session_id, cwd }` only
- [ ] All six test cases pass when run individually
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all pass
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
