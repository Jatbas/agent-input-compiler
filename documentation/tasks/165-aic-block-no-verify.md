# Task 165: aic-block-no-verify.cjs (PreToolUse)

> **Status:** Pending
> **Phase:** T — Claude Code Hook-Based Delivery
> **Layer:** integrations/claude
> **Depends on:** —

## Goal

Create the Claude Code PreToolUse (Bash) hook that blocks `git` commands containing `--no-verify` or `-n`, so agents cannot bypass pre-commit hooks. Port detection logic from Cursor's AIC-block-no-verify.cjs and emit Claude Code's `hookSpecificOutput` deny format per CC §6.4/§7.4.

## Architecture Notes

- Clean-layer: all code in `integrations/claude/hooks/`; no shared/ or mcp/src/ changes.
- Port from `integrations/cursor/hooks/AIC-block-no-verify.cjs` — identical detection (stripQuoted, `\bgit\b`, `--no-verify` or `\s-n\b`); only output format differs (Cursor `permission`/`user_message`/`agent_message` → Claude `hookSpecificOutput.permissionDecision`/`permissionDecisionReason`).
- Input: top-level `tool_input.command` with fallback to `input?.input?.tool_input?.command` (match aic-after-file-edit-tracker). On parse error or missing command, output `"{}"` (fail open).

## Files

| Action | Path |
| ------ | ---- |
| Create | `integrations/claude/hooks/aic-block-no-verify.cjs` |
| Create | `integrations/claude/__tests__/aic-block-no-verify.test.cjs` |

## Interface / Signature

Standalone CommonJS script; no TypeScript interface. Contract: `run(stdinStr: string): string` (sync). Exported for tests; when run as main, read stdin via sync read, write `run(raw)` to stdout, then `process.exit(0)`.

```javascript
// stripQuoted: remove double- and single-quoted substrings so --no-verify inside a commit message is not treated as a flag.
function stripQuoted(str) {
  return str.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
}

// run(stdinStr): parse JSON, read command from input.tool_input?.command ?? input?.input?.tool_input?.command ?? "", trim.
// cmdWithoutQuotes = stripQuoted(cmd). isGitCmd = /\bgit\b/.test(cmd). hasNoVerify = /--no-verify\b/.test(cmdWithoutQuotes) || /\s-n\b/.test(cmdWithoutQuotes).
// If isGitCmd && hasNoVerify: return JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "AIC project rules require pre-commit hooks. Remove --no-verify and fix any lint/format issues." } }).
// Else: return "{}". On throw (parse error): return "{}".
```

## Dependent Types

Not applicable — integration script; consumes and produces plain JSON strings; no core branded types.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create aic-block-no-verify.cjs

Create `integrations/claude/hooks/aic-block-no-verify.cjs`. Use the same structure as `integrations/claude/hooks/aic-after-file-edit-tracker.cjs`: SPDX header, `readStdinSync()` (fs.readSync(0, ...)), `run(stdinStr)` that parses JSON and returns a string, and `if (require.main === module)` that reads stdin, writes `run(raw)` to stdout, and calls `process.exit(0)`. Implement `stripQuoted(str)` exactly as in the Interface/Signature block. In `run`: parse stdinStr (on empty or invalid JSON use `{}`). Read command: `(input.tool_input?.command ?? input?.input?.tool_input?.command ?? "").trim()`. Set `cmdWithoutQuotes = stripQuoted(cmd)`. Set `isGitCmd = /\bgit\b/.test(cmd)` and `hasNoVerify = /--no-verify\b/.test(cmdWithoutQuotes) || /\s-n\b/.test(cmdWithoutQuotes)`. If `isGitCmd && hasNoVerify`, return `JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "AIC project rules require pre-commit hooks. Remove --no-verify and fix any lint/format issues." } })`. Otherwise return `"{}"`. Wrap logic in try/catch; on catch return `"{}"`. Export `{ run }`.

**Verify:** File exists; `node -e "const {run}=require('./integrations/claude/hooks/aic-block-no-verify.cjs'); console.log(run(JSON.stringify({tool_input:{command:'git commit --no-verify'}})))"` prints JSON with `hookSpecificOutput.permissionDecision === "deny"`.

### Step 2: Create aic-block-no-verify.test.cjs

Create `integrations/claude/__tests__/aic-block-no-verify.test.cjs`. Require `run` from `../hooks/aic-block-no-verify.cjs`. Implement six test functions and run them (same pattern as `aic-after-file-edit-tracker.test.cjs`): (1) `deny_git_no_verify`: `run(JSON.stringify({ tool_input: { command: "git commit --no-verify" } }))` — parse output JSON, assert `output.hookSpecificOutput.permissionDecision === "deny"` and `output.hookSpecificOutput.permissionDecisionReason` includes "pre-commit". (2) `deny_git_short_n`: `run(JSON.stringify({ tool_input: { command: "git commit -n" } }))` — assert permissionDecision === "deny". (3) `allow_git_without_flag`: `run(JSON.stringify({ tool_input: { command: "git commit -m 'fix'" } }))` — assert output === "{}". (4) `allow_non_git`: `run(JSON.stringify({ tool_input: { command: "npm run build" } }))` — assert output === "{}". (5) `allow_quoted_no_verify_in_message`: `run(JSON.stringify({ tool_input: { command: "git commit -m 'use --no-verify in docs'" } }))` — assert output === "{}". (6) `allow_empty_or_malformed`: `run("{}")` and `run("not json")` — assert output === "{}". Each test logs "pass" on success or throws. Invoke all six from the script body.

**Verify:** From repo root, `node integrations/claude/__tests__/aic-block-no-verify.test.cjs` runs and prints six "pass" lines.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| deny_git_no_verify | Output has hookSpecificOutput.permissionDecision "deny" for `git commit --no-verify` |
| deny_git_short_n | Output denies for `git commit -n` |
| allow_git_without_flag | Output "{}" for `git commit -m 'fix'` |
| allow_non_git | Output "{}" for `npm run build` |
| allow_quoted_no_verify_in_message | Output "{}" when --no-verify appears only inside quoted message |
| allow_empty_or_malformed | Output "{}" for {} or invalid JSON |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] run() implements stripQuoted, command extraction, and deny/allow logic as specified
- [ ] All six test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] Deny output matches CC §6.4 (hookSpecificOutput with hookEventName, permissionDecision, permissionDecisionReason)

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
