# Task 159: aic-prompt-compile.cjs — UserPromptSubmit

> **Status:** Pending
> **Phase:** T (Claude Code Hook-Based Delivery)
> **Layer:** integrations/claude
> **Depends on:** T01 (aic-compile-helper.cjs)

## Goal

Create the Claude Code UserPromptSubmit hook that reads the user prompt from stdin, calls `callAicCompile()` from the helper, and writes plain-text compiled context to stdout (with dual-path fallback when SessionStart did not run).

## Architecture Notes

- Clean-layer: all Claude Code hook source lives in `integrations/claude/`; no core or mcp changes. See `documentation/claude-code-integration-layer.md` §2.
- Output must be plain text stdout only — not `hookSpecificOutput` JSON (bug #17550). See CC §6.1.
- Dual-path fallback for SessionStart miss (#10373): read marker `.aic/.session-context-injected`; if missing or content !== sessionId, prepend "Critical reminders" from `.cursor/rules/AIC-architect.mdc` before prompt-specific context.
- If `callAicCompile` returns null, exit 0 with no stdout. Never block the prompt.

## Files

| Action | Path |
| ------ | ---- |
| Create | `integrations/claude/hooks/aic-prompt-compile.cjs` |
| Create | `integrations/claude/__tests__/aic-prompt-compile.test.cjs` |

## Interface / Signature

Script contract (no TypeScript interface). Helper and stdin shape:

```javascript
// From aic-compile-helper.cjs — required and called by this hook
function callAicCompile(intent, projectRoot, sessionId, timeoutMs);
// Returns: string | null (compiled prompt text or null on error/timeout)
```

```text
Stdin: JSON with { "input": { "prompt", "session_id", "cwd" } }.
  input.prompt → intent (string, default "")
  input.session_id → conversationId (string | undefined)
  input.cwd → projectRoot fallback; else process.env.CLAUDE_PROJECT_DIR || process.cwd()
Stdout: plain text only. If dual-path: invariants block then "\n\n" then compiled prompt. Else: compiled prompt only. Never JSON.
Exit: 0 always. On callAicCompile null: no stdout.
```

## Dependent Types

Not applicable — CommonJS script; no TypeScript types. Stdin/out contract is in Interface / Signature above.

## Config Changes

- **package.json:** None.
- **eslint.config.mjs:** None.

## Steps

### Step 1: Create aic-prompt-compile.cjs

Create `integrations/claude/hooks/aic-prompt-compile.cjs` as a CommonJS script.

1. Require `fs`, `path`, and `const { callAicCompile } = require("./aic-compile-helper.cjs")`.
2. Read stdin: `const raw = fs.readFileSync(0, "utf8");` parse with `JSON.parse(raw)`; on throw use empty object. Extract `const input = (parsed && parsed.input) || {};` then `const intent = (input.prompt != null) ? String(input.prompt) : "";`, `const sessionId = (input.session_id != null) ? input.session_id : null;`, `const projectRoot = (input.cwd && input.cwd.trim()) ? input.cwd.trim() : (process.env.CLAUDE_PROJECT_DIR || process.cwd());`.
3. Dual-path: define `const INJECTED_MARKER = path.join(projectRoot, ".aic", ".session-context-injected");`. Set `const alreadyInjected = fs.existsSync(INJECTED_MARKER) && (sessionId != null) && (fs.readFileSync(INJECTED_MARKER, "utf8").trim() === sessionId);`.
4. If `!alreadyInjected`: build invariants. Rule file path: `const routerPath = path.join(projectRoot, ".cursor", "rules", "AIC-architect.mdc");`. If `fs.existsSync(routerPath)`: read content, find `content.indexOf("## Critical reminders")`, slice from there to next `"## "` (or end), filter lines that start with `"- **"`, join with newlines. Prepend line `AIC Architectural Invariants (auto-injected):` and if sessionId add `\nAIC_CONVERSATION_ID=${sessionId}`. Store result in a variable named `invariantsBlock`. If file missing or section missing, invariantsBlock is empty string.
5. Call `const promptContext = callAicCompile(intent, projectRoot, sessionId, 30000);`. If `promptContext == null`, `process.exit(0);` (no stdout).
6. Build output: if invariantsBlock is non-empty, `process.stdout.write(invariantsBlock + "\n\n" + promptContext);` else `process.stdout.write(promptContext);`. Use plain text only — no JSON.
7. Add SPDX license and short comment at top (UserPromptSubmit hook, plain text stdout, dual-path per CC §7.1, §7.2).

**Verify:** File exists; running `node integrations/claude/hooks/aic-prompt-compile.cjs` with stdin `{"input":{"prompt":"hello","cwd":"/tmp"}}` and mocked helper returns plain text on stdout.

### Step 2: Create aic-prompt-compile.test.cjs

Create `integrations/claude/__tests__/aic-prompt-compile.test.cjs`. Use the same test pattern as `aic-compile-helper.test.cjs`: require the hook’s dependency (helper), stub `callAicCompile` via require cache or by spawning the script with controlled stdin.

1. **plain_text_stdout_when_helper_returns_prompt:** Stub the helper module’s `callAicCompile` to return `"compiled text"`. Run the script (or invoke the logic that reads stdin and calls the helper) with stdin `JSON.stringify({ input: { prompt: "x", session_id: "s1", cwd: "/tmp" } })`. Capture stdout. Assert stdout is exactly `"compiled text"` (no JSON, no extra wrapper).
2. **exit_0_silent_when_helper_returns_null:** Stub `callAicCompile` to return `null`. Run the script with valid JSON stdin. Assert process exits with code 0 and stdout is empty.
3. **dual_path_prepends_invariants_when_marker_missing:** Create a temp directory. Under it create `.cursor/rules/AIC-architect.mdc` with content including `## Critical reminders\n\n- **foo:** bar`. Do not create `.aic/.session-context-injected` (or create it with wrong sessionId). Stub `callAicCompile` to return `"prompt part"`. Run the script with stdin that has `cwd` set to the temp dir and a session_id that does not match the marker. Assert stdout starts with the invariants line(s) ("AIC Architectural Invariants" and "- **foo:** bar) and contains `"prompt part"` after.

Run tests with `node integrations/claude/__tests__/aic-prompt-compile.test.cjs` (or via pnpm test if the repo’s test config includes this path).

**Verify:** All three test cases pass.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| plain_text_stdout_when_helper_returns_prompt | Stdout is plain text only; no JSON wrapper when helper returns a string |
| exit_0_silent_when_helper_returns_null | Exit code 0 and no stdout when callAicCompile returns null |
| dual_path_prepends_invariants_when_marker_missing | When marker missing or content !== sessionId, stdout starts with Critical reminders then prompt context |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] Hook reads JSON stdin, resolves projectRoot/sessionId/intent, calls callAicCompile, writes plain text stdout
- [ ] Dual-path: prepends invariants from .cursor/rules/AIC-architect.mdc when marker missing or wrong sessionId
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports from mcp/ or shared/ in the hook script (integration layer only)

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
