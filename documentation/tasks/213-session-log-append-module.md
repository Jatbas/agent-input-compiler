# Task 213: Extract shared session-log append module

> **Status:** Pending
> **Phase:** AH — Session Lifecycle Markers Simplification
> **Layer:** integrations/shared
> **Depends on:** —

## Goal

Create `integrations/shared/session-log.cjs` exporting `appendSessionLog(projectRoot, entry)` so Cursor's session-end hook (AH05) can call it instead of inline append logic. Entry schema: `{ session_id, reason, duration_ms, timestamp }`. Single write site; no database.

## Architecture Notes

- General-purpose recipe: integration-layer CommonJS utility; no core interface. Same pattern as `prompt-log.cjs` — validate entry, mkdir 0o700, append one JSONL line, silent catch.
- Reuse `isValidTimestamp` and `isValidPromptLogReason` from `cache-field-validators.cjs`. Inline checks for `session_id` (string, length ≤128, printable ASCII) and `duration_ms` (number, finite, ≥0).
- Stateless function; caller supplies full entry (including timestamp). Never throw; must not block session-end hook.

## Files

| Action | Path |
| ------ | ---- |
| Create | `integrations/shared/session-log.cjs` |
| Create | `integrations/shared/__tests__/session-log.test.cjs` |

## Interface / Signature

```javascript
// Export: appendSessionLog(projectRoot, entry) → void
// Silent on validation failure or I/O error; never throws.
```

Entry shape (validated before append):

- `session_id`: string, length 0–128, printable ASCII
- `reason`: string, valid per `isValidPromptLogReason` (≤256 chars, printable ASCII)
- `duration_ms`: number, finite, ≥ 0
- `timestamp`: string, valid per `isValidTimestamp` (length 1–32, printable ASCII)

Implementation structure (same as prompt-log):

- Require `fs`, `path`, and `isValidTimestamp`, `isValidPromptLogReason` from `./cache-field-validators.cjs`.
- Define `const PRINTABLE_ASCII = /^[\x20-\x7E]+$/` for session_id check.
- Validate all four fields; if any fail, return.
- `const logPath = path.join(projectRoot, ".aic", "session-log.jsonl")`.
- `try { fs.mkdirSync(path.dirname(logPath), { recursive: true, mode: 0o700 }); fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8"); } catch { /* no throw */ }`.

## Dependent Types

Not applicable — CommonJS; no TypeScript types. Entry shape documented above.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create session-log.cjs

Create `integrations/shared/session-log.cjs` with SPDX and Copyright header. Require `fs`, `path`, and from `./cache-field-validators.cjs` require `isValidTimestamp` and `isValidPromptLogReason`. Define `PRINTABLE_ASCII = /^[\x20-\x7E]+$/`. Implement `appendSessionLog(projectRoot, entry)`:

- If `typeof entry.session_id !== "string"` or `entry.session_id.length > 128` or `!PRINTABLE_ASCII.test(entry.session_id)` → return.
- If `typeof entry.reason !== "string"` or `!isValidPromptLogReason(entry.reason)` → return.
- If `typeof entry.duration_ms !== "number"` or `!Number.isFinite(entry.duration_ms)` or `entry.duration_ms < 0` → return.
- If `typeof entry.timestamp !== "string"` or `!isValidTimestamp(entry.timestamp)` → return.
- `const logPath = path.join(projectRoot, ".aic", "session-log.jsonl")`.
- Inside try: `fs.mkdirSync(path.dirname(logPath), { recursive: true, mode: 0o700 })`; then `fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8")`. Catch: empty block (no throw).
- Export: `module.exports = { appendSessionLog };`

**Verify:** File exists; `node -e "const { appendSessionLog } = require('./integrations/shared/session-log.cjs'); appendSessionLog('/tmp/ah04-test', { session_id: 's1', reason: 'end', duration_ms: 0, timestamp: '2025-01-01T00:00:00.000Z' });"` runs without throw; `.aic/session-log.jsonl` under temp dir contains one line.

### Step 2: Create session-log.test.cjs

Create `integrations/shared/__tests__/session-log.test.cjs` with SPDX and Copyright. Use `assert`, `fs`, `os`, `path` and `require("../session-log.cjs")` for `appendSessionLog`. Run tests via Node (same pattern as `prompt-log.test.cjs`):

- **valid_entry_writes_one_line:** Create temp dir with `path.join(os.tmpdir(), 'aic-session-log-test-' + Date.now())`, call `appendSessionLog(dir, { session_id: "s1", reason: "user_ended", duration_ms: 100, timestamp: "2025-01-01T00:00:00.000Z" })`, read `path.join(dir, ".aic", "session-log.jsonl")`, assert one line, parse JSON and assert `session_id`, `reason`, `duration_ms`, `timestamp` match. Cleanup: remove `.aic/session-log.jsonl` and temp dir.
- **invalid_entry_skips:** Same temp dir; call with invalid entry: object with `session_id: 123` (number) or without `reason`. Assert file either does not exist or line count unchanged. Cleanup.
- **mkdir_0o700:** After a valid append, `fs.statSync(path.join(dir, ".aic"))` and assert mode is 0o700 (use `stat.mode & 0o777`). Cleanup.

**Verify:** From repo root, `node integrations/shared/__tests__/session-log.test.cjs` runs and all tests pass.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| valid_entry_writes_one_line | Valid entry appends one JSONL line with correct fields |
| invalid_entry_skips | Invalid or missing fields cause no write |
| mkdir_0o700 | .aic directory created with mode 0o700 |

## Acceptance Criteria

- [ ] `integrations/shared/session-log.cjs` created with `appendSessionLog` and validation as specified
- [ ] `integrations/shared/__tests__/session-log.test.cjs` created; all three test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all pass
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No throw from `appendSessionLog` on invalid input or I/O error

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
