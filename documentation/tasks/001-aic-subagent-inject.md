# Task 001: aic-subagent-inject.cjs (SubagentStart)

> **Status:** Pending
> **Phase:** T — Claude Code Hook-Based Delivery
> **Layer:** integrations/claude
> **Depends on:** T01 (aic-compile-helper.cjs)

## Goal

Create the SubagentStart hook so Claude Code injects compiled AIC context into Bash, Explore, and Plan subagents at spawn time.

## Architecture Notes

- Integration script in `integrations/claude/hooks/`; no changes to shared or mcp. Follows same pattern as aic-session-start.cjs (async run, callAicCompile, hookSpecificOutput JSON).
- Output format per CC §6.3: `hookSpecificOutput` JSON with `hookEventName: "SubagentStart"` and `additionalContext`. When callAicCompile returns null, stdout is `{}` and exit 0.
- No marker file or .aic directory creation; SubagentStart does not write project state.
- Reuse: require("./aic-compile-helper.cjs"), same stdin parse/fallback (top-level + parsed.input), same main .then/.catch pattern.

## Files

| Action | Path |
| ------ | ---- |
| Create | `integrations/claude/hooks/aic-subagent-inject.cjs` |
| Create | `integrations/claude/__tests__/aic-subagent-inject.test.cjs` |

## Interface / Signature

Contract: CommonJS module exporting `run(stdinStr)`. No TypeScript interface; hook is invoked by Claude Code with JSON on stdin.

```javascript
// run(stdinStr: string): Promise<object | null>
// Non-null: { hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: string } }
// Null: main block writes "{}" to stdout
async function run(stdinStr) {
  // Parse JSON; read agent_type, session_id, cwd (top-level then parsed.input).
  // projectRoot = cwd trim || CLAUDE_PROJECT_DIR || process.cwd()
  // agentType = parsed.agent_type ?? parsed.input?.agent_type ?? "unknown"
  // intent = "provide context for " + agentType + " subagent"
  // text = await callAicCompile(intent, projectRoot, sessionId, 30000)
  // if (text == null) return null
  // return { hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: text } }
}

if (require.main === module) {
  const raw = fs.readFileSync(0, "utf8");
  run(raw)
    .then((out) => {
      if (out != null) process.stdout.write(JSON.stringify(out));
      else process.stdout.write("{}");
      process.exit(0);
    })
    .catch(() => process.exit(0));
}

module.exports = { run };
```

## Dependent Types

None — script uses plain JSON parse and strings only.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create aic-subagent-inject.cjs

Create `integrations/claude/hooks/aic-subagent-inject.cjs`. SPDX and Copyright header as in aic-session-start.cjs. Require `./aic-compile-helper.cjs` for `callAicCompile`. Implement async `run(stdinStr)`: parse stdinStr as JSON (empty object on parse error). Read `agent_type` from `parsed.agent_type ?? parsed.input?.agent_type ?? "unknown"`, `session_id` from `parsed.session_id ?? parsed.input?.session_id ?? null`, `cwd` from `parsed.cwd ?? parsed.input?.cwd ?? ""`. Set `projectRoot` to trimmed cwd if non-empty, else `process.env.CLAUDE_PROJECT_DIR` or `process.cwd()`. Set `intent` to `"provide context for " + agentType + " subagent"`. Call `await callAicCompile(intent, projectRoot, sessionId, 30000)`. If result is null, return null. Else return `{ hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: text } }`. In `if (require.main === module)`: read stdin with `fs.readFileSync(0, "utf8")`, call `run(raw).then((out) => { if (out != null) process.stdout.write(JSON.stringify(out)); else process.stdout.write("{}"); process.exit(0); }).catch(() => process.exit(0))`. Export `{ run }`.

**Verify:** File exists; running `node integrations/claude/hooks/aic-subagent-inject.cjs` with stdin `{}` exits 0 and writes `{}` to stdout (with callAicCompile returning null when MCP not available).

### Step 2: Create aic-subagent-inject.test.cjs

Create `integrations/claude/__tests__/aic-subagent-inject.test.cjs`. Use same mock pattern as aic-session-start.test.cjs: resolve helper via `require.resolve("./aic-compile-helper.cjs", { paths: [hooksDir] })`, set `require.cache[resolvedHelper]` to `{ exports: { callAicCompile: () => Promise.resolve(value) }, loaded: true, id: resolvedHelper }`, delete `require.cache[hookPath]`, require hook, call `run(stdinJson)`, cleanup cache. Test `hookSpecificOutput_json_when_helper_returns_text`: mock helper to resolve `"compiled text"`, call `run(JSON.stringify({ agent_type: "Explore", session_id: "s1", cwd: "/tmp" }))`, assert `result.hookSpecificOutput.hookEventName === "SubagentStart"` and `result.hookSpecificOutput.additionalContext === "compiled text"`. Test `output_empty_object_when_helper_returns_null`: mock helper to resolve null, call `run(JSON.stringify({ session_id: "s1", cwd: "/tmp" }))`, assert `result === null`. Run tests with `node integrations/claude/__tests__/aic-subagent-inject.test.cjs`.

**Verify:** Both test cases pass.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| hookSpecificOutput_json_when_helper_returns_text | Mock callAicCompile to resolve "compiled text"; assert result has hookEventName "SubagentStart" and additionalContext "compiled text". |
| output_empty_object_when_helper_returns_null | Mock callAicCompile to resolve null; assert run() returns null (main block writes "{}"). |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] run() signature and return shape match Interface / Signature
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports from shared or mcp; only Node built-ins and ./aic-compile-helper.cjs
- [ ] SubagentStart output format: hookSpecificOutput JSON when context present, "{}" when null

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
