# Task 162: aic-pre-compact.cjs (PreCompact)

> **Status:** Pending
> **Phase:** T — Claude Code Hook-Based Delivery
> **Layer:** integrations/claude
> **Depends on:** T01 (aic-compile-helper.cjs)

## Goal

Create the PreCompact hook script so Claude Code re-compiles and injects context before context-window compaction, preserving project context across the compaction boundary (CC §7.7).

## Architecture Notes

- Hook runs in `integrations/claude/hooks/`; deployment target is `~/.claude/hooks/` or `.claude/hooks/`. No core or MCP changes.
- Output: plain text stdout only (CC §6.1, §7.7) — same as UserPromptSubmit; no `hookSpecificOutput` JSON.
- Reuse input parsing and call pattern from `aic-session-start.cjs`; output handling from `aic-prompt-compile.cjs` (plain text, exit 0 silent when null).
- No marker file or `.aic` directory creation (SessionStart only).

## Files

| Action | Path |
| ------ | ---- |
| Create | `integrations/claude/hooks/aic-pre-compact.cjs` |
| Create | `integrations/claude/__tests__/aic-pre-compact.test.cjs` |

## Interface / Signature

Hook contract (no core interface — CommonJS module):

```js
// run(stdinStr: string) => Promise<string | null>
// stdinStr: JSON with top-level session_id, cwd (or input.session_id, input.cwd).
// Returns: compiled prompt text, or null when helper returns null or on error.
// Main block: if non-null, process.stdout.write(result); process.exit(0). If null, process.exit(0) with no stdout.
```

Helper used (from aic-compile-helper.cjs):

```js
callAicCompile(intent, projectRoot, sessionId, timeoutMs) // => Promise<string | null>
```

## Dependent Types

N/A — hook is CommonJS (.cjs); no TypeScript types. Input is JSON (top-level or `input` fallback); output is string or null.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create aic-pre-compact.cjs

In `integrations/claude/hooks/aic-pre-compact.cjs` implement the PreCompact hook.

- SPDX and Copyright header (same as aic-session-start.cjs).
- Require `fs` and `./aic-compile-helper.cjs` (callAicCompile). Do not require `path` — no path operations.
- Implement async `run(stdinStr)`:
  - Parse stdinStr with `JSON.parse` in try/catch; on throw use `parsed = {}`.
  - `sessionId = parsed.session_id != null ? parsed.session_id : (parsed.input?.session_id ?? null)`.
  - `cwdRaw = parsed.cwd ?? parsed.input?.cwd ?? ""`.
  - `projectRoot = cwdRaw.trim() ? cwdRaw.trim() : process.env.CLAUDE_PROJECT_DIR || process.cwd()`.
  - `text = await callAicCompile("understand project structure, architecture, and recent changes", projectRoot, sessionId, 30000)`.
  - Return `text` (string or null).
- When `require.main === module`: read stdin with `fs.readFileSync(0, "utf8")`, call `run(raw).then((out) => { if (out != null) process.stdout.write(out); process.exit(0); }).catch(() => process.exit(0))`.
- `module.exports = { run }`.

**Verify:** File exists; running `node integrations/claude/hooks/aic-pre-compact.cjs` with stdin `{}` exits 0 and produces no stdout when helper would return null (or run under test with mocked helper).

### Step 2: Create aic-pre-compact.test.cjs

In `integrations/claude/__tests__/aic-pre-compact.test.cjs` add tests that mock the helper via `require.cache` (same pattern as aic-session-start.test.cjs and aic-prompt-compile.test.cjs).

- Resolve helper with `require.resolve("./aic-compile-helper.cjs", { paths: [hooksDir] })` where `hooksDir = path.join(__dirname, "..", "hooks")`. Mock by setting `require.cache[resolvedHelper] = { exports: { callAicCompile: () => Promise.resolve(returnValue) }, loaded: true, id: resolvedHelper }`. After each test, delete `require.cache[resolvedHelper]` and `require.cache[require.resolve(hookPath)]`.
- Test `plain_text_stdout_when_helper_returns_prompt`: mock helper to resolve `"compiled text"`; clear hook from cache and `require(hookPath)`; call `run(JSON.stringify({ session_id: "s1", cwd: "/tmp" }))`; assert return value is `"compiled text"`.
- Test `exit_0_silent_when_helper_returns_null`: mock helper to resolve `null`; call `run(JSON.stringify({ session_id: "s1", cwd: "/tmp" }))`; assert return value is `null`.
- Run all tests in an IIFE `(async () => { await plain_text_stdout_when_helper_returns_prompt(); await exit_0_silent_when_helper_returns_null(); console.log("All tests passed."); })()`.

**Verify:** `node integrations/claude/__tests__/aic-pre-compact.test.cjs` prints "All tests passed."

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| plain_text_stdout_when_helper_returns_prompt | Mock callAicCompile to resolve a string; assert run() returns that string. |
| exit_0_silent_when_helper_returns_null | Mock callAicCompile to resolve null; assert run() returns null. |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] run() parses top-level session_id/cwd with input fallback and calls callAicCompile with fixed intent and 30000 ms timeout
- [ ] Main block writes plain text to stdout when run() returns non-null; exits 0 with no stdout when null
- [ ] Both test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
