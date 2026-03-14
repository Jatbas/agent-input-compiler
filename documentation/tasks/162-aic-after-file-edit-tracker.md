# Task 162: aic-after-file-edit-tracker.cjs (PostToolUse)

> **Status:** Pending
> **Phase:** T — Claude Code Hook-Based Delivery
> **Layer:** integrations/claude
> **Depends on:** —

## Goal

Create the PostToolUse (Edit|Write) hook that records each edited file path to a session-keyed temp file so the Stop hook (T07) can run lint/typecheck on those files. Port logic from Cursor's AIC-after-file-edit-tracker.cjs with Claude Code input shape and temp file naming.

## Architecture Notes

- All Claude Code hook source lives in `integrations/claude/`; no changes to shared/ or mcp/src/. See `documentation/claude-code-integration-layer.md` §2, §7.5.
- Input: top-level `session_id` and `tool_input.path` (fallback `input.session_id`, `input.tool_input.path`). Single path per invocation.
- Temp file: `os.tmpdir()/aic-cc-edited-<sanitizedSessionId>.json` — sanitize session_id with `String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_')`. Fallback session_id `"default"` when missing.
- Only perform file I/O when `tool_input.path` is present and non-empty; otherwise return `"{}"` with no read/write.
- Export `run(stdinStr)` (sync, returns string) for tests; CLI entry reads stdin, calls run(), writes result to stdout, exit 0.

## Files

| Action | Path |
| ------ | ---- |
| Create | `integrations/claude/hooks/aic-after-file-edit-tracker.cjs` |
| Create | `integrations/claude/__tests__/aic-after-file-edit-tracker.test.cjs` |

## Interface / Signature

No TypeScript interface. Contract:

- **Input:** JSON string. Parsed object may have top-level `session_id` (string) and `tool_input` (object with `path` string). Legacy: `input.session_id`, `input.tool_input.path`.
- **Output:** Always the string `"{}"`.
- **Side effect:** When `tool_input.path` is present, append its absolute path to the JSON array in the temp file (create file with `[path]` if missing; otherwise read, merge, dedupe, write).

```javascript
// run(stdinStr) — sync, returns string to write to stdout
function run(stdinStr) {
  // parse stdinStr; extract session_id (default "default") and tool_input.path
  // if no path: return "{}"
  // sanitize sessionId: String(sessionId).replace(/[^a-zA-Z0-9_-]/g, "_")
  // tmpPath = path.join(os.tmpdir(), "aic-cc-edited-" + sanitizedSessionId + ".json")
  // existing = fs.existsSync(tmpPath) ? JSON.parse(fs.readFileSync(tmpPath, "utf8")) : []
  // merged = [...new Set([...existing, path.resolve(pathValue)])].filter(p => typeof p === "string" && p.length > 0)
  // fs.writeFileSync(tmpPath, JSON.stringify(merged), "utf8")
  return "{}";
}
module.exports = { run };
```

CLI entry (when run as script): read stdin via sync read, call `run(raw)`, `process.stdout.write(run(raw))`, `process.exit(0)`.

## Dependent Types

Not applicable — CommonJS script; no TypeScript types. Input shape is informal: parsed object with optional `session_id`, `tool_input.path`, and legacy `input.*`.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create aic-after-file-edit-tracker.cjs

In `integrations/claude/hooks/aic-after-file-edit-tracker.cjs`: implement PostToolUse file-edit tracker per CC §7.5. Use `const fs = require("fs")`, `const path = require("path")`, `const os = require("os")`. Implement `readStdinSync()` (same pattern as Cursor: `fs.readSync(0, buf, ...)`, `Buffer.concat`, `toString("utf8")`). Implement `run(stdinStr)`: parse JSON (empty input → `{}`); read `session_id` from top-level or `input.session_id`, default `"default"`; read `tool_input.path` from top-level `tool_input.path` or `input.tool_input.path`. If path is missing or empty string, return `"{}"` without any file I/O. Otherwise: sanitize session_id with `String(sessionId).replace(/[^a-zA-Z0-9_-]/g, "_")`; set `tmpPath = path.join(os.tmpdir(), "aic-cc-edited-" + sanitizedSessionId + ".json")`; load existing array from file (if exists and valid JSON array, else `[]`); resolve path with `path.resolve(pathValue)`; merge with `[...new Set([...existing, resolvedPath])].filter(p => typeof p === "string" && p.length > 0)`; write `fs.writeFileSync(tmpPath, JSON.stringify(merged), "utf8")`; return `"{}"`. Wrap logic in try/catch; on throw return `"{}"`. Export `module.exports = { run }`. At bottom, when run as script: call `const raw = readStdinSync(); process.stdout.write(run(raw)); process.exit(0);`.

**Verify:** File exists; `node -e "const {run}=require('./integrations/claude/hooks/aic-after-file-edit-tracker.cjs'); console.log(run(JSON.stringify({session_id:'t1',tool_input:{path:'/x/y.ts'}}))=== '{}')"` prints true.

### Step 2: Create aic-after-file-edit-tracker.test.cjs

In `integrations/claude/__tests__/aic-after-file-edit-tracker.test.cjs`: require the hook's `run` from the hooks directory. Use a dedicated session_id per test and assert on the temp file at `path.join(os.tmpdir(), "aic-cc-edited-" + sanitizedSessionId + ".json")`. Tests: (1) **temp_file_created_on_first_invocation** — call `run(JSON.stringify({ session_id: "s1", tool_input: { path: "/abs/foo.ts" } }))`, then read temp file at `path.join(os.tmpdir(), "aic-cc-edited-s1.json")`, assert content is a JSON array with one element equal to the absolute path (use `path.resolve("/abs/foo.ts")` for expected value). (2) **temp_file_appended_avoid_duplicate** — call run twice with same path and same session_id; assert array length 1; call run with a second path; assert array length 2. (3) **output_empty_json** — assert `run(JSON.stringify({ session_id: "s2", tool_input: { path: "/a/b.js" } })) === "{}"`. (4) **missing_path_no_op** — call `run(JSON.stringify({ session_id: "s3" }))`; assert return is `"{}"`; assert file at `path.join(os.tmpdir(), "aic-cc-edited-s3.json")` does not exist (use session_id "s3" only for this test so no prior test creates it). (5) **session_id_sanitized** — call `run(JSON.stringify({ session_id: "s4/with/slash", tool_input: { path: "/only.ts" } }))`; assert temp file exists at `path.join(os.tmpdir(), "aic-cc-edited-s4_with_slash.json")` and content is a JSON array with one element equal to `path.resolve("/only.ts")`. Clean up temp files created in tests (delete test session temp files) to avoid polluting os.tmpdir.

**Verify:** `node integrations/claude/__tests__/aic-after-file-edit-tracker.test.cjs` runs and all tests pass.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| temp_file_created_on_first_invocation | First run with session_id and path creates temp file with one-element array |
| temp_file_appended_avoid_duplicate | Second run with same path does not duplicate; run with second path adds it |
| output_empty_json | run() return value is exactly "{}" |
| missing_path_no_op | Input with no path returns "{}" and does not create temp file for that session |
| session_id_sanitized | session_id with path-unsafe chars is sanitized in temp filename |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] run(stdinStr) implements contract: parse, optional path, temp file read/merge/write, return "{}"
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] Temp file name: aic-cc-edited-<sanitizedSessionId>.json in os.tmpdir()
- [ ] No imports from shared/ or mcp/src/

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
