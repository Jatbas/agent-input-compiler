# Task 173: Strip ide_selection from intent in integration layer

> **Status:** Pending
> **Phase:** Integration (editor hooks)
> **Layer:** integration (integrations/claude, integrations/cursor)
> **Depends on:** —

## Goal

Strip editor-injected `<ide_selection>...</ide_selection>` markup from the intent string in the Claude Code and Cursor integration hooks so that compilation_log intent and classifier input stay clean and readable.

## Architecture Notes

- Project plan §2.2.1: Integration layer is editor-specific and calls aic_compile; normalizing editor markup here keeps MCP editor-agnostic.
- Strip at the boundary where editor prompt becomes intent (Claude: before callAicCompile; Cursor: before building the deny-message intent suggestion).
- No new files: inline the same regex in both hooks.

## Files

| Action | Path                                                                 |
| ------ | -------------------------------------------------------------------- |
| Modify | `integrations/claude/hooks/aic-prompt-compile.cjs` (strip intent)   |
| Modify | `integrations/cursor/hooks/AIC-require-aic-compile.cjs` (strip intentArg) |
| Modify | `integrations/claude/__tests__/aic-prompt-compile.test.cjs` (add test)   |
| Create | `integrations/cursor/__tests__/AIC-require-aic-compile.test.cjs` (new test) |

## Strip specification

- **Pattern:** Remove entire `<ide_selection>...</ide_selection>` blocks (including inner content and newlines).
- **Regex:** `/<ide_selection>[\s\S]*?<\/ide_selection>/gi`
- **Replace with:** `""`

Apply in two places:
1. **aic-prompt-compile.cjs:** After `intent` is set from `top.prompt` / `input.prompt`, and before `callAicCompile(intent, ...)`.
2. **AIC-require-aic-compile.cjs:** To `savedPrompt` before building `intentArg` (before the existing `.replace(/"/g, '\\"')`).

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Strip intent in Claude Code hook

In `integrations/claude/hooks/aic-prompt-compile.cjs`, replace the existing intent assignment (lines 19–24) with a raw value then strip ide_selection:

```javascript
const rawIntent =
  top.prompt != null
    ? String(top.prompt)
    : input.prompt != null
      ? String(input.prompt)
      : "";
const intent = rawIntent.replace(/<ide_selection>[\s\S]*?<\/ide_selection>/gi, "");
```

**Verify:** Grep the file for `ide_selection` and confirm the replace runs before `callAicCompile(intent, ...)`.

### Step 2: Strip intent in Cursor hook

In `integrations/cursor/hooks/AIC-require-aic-compile.cjs`, after `const savedPrompt = readSavedPrompt(generationId);`, strip ide_selection before building `intentArg`:

```javascript
const savedPrompt = readSavedPrompt(generationId);
const stripped = savedPrompt.replace(/<ide_selection>[\s\S]*?<\/ide_selection>/gi, "");
const intentArg =
  stripped.length > 0
    ? stripped.replace(/"/g, '\\"')
    : "<summarise the user message>";
```

**Verify:** Grep the file for `ide_selection`; `intentArg` must be derived from a string that has been stripped.

### Step 3: Add Claude Code test

In `integrations/claude/__tests__/aic-prompt-compile.test.cjs`, add a test that when the prompt contains `<ide_selection>...</ide_selection>`, the intent passed to `callAicCompile` does not contain the literal `ide_selection`. Mock `callAicCompile` so it captures the first argument (intent); pass stdin with `prompt: "fix bug <ide_selection>V8</ide_selection> end"`; after `run(stdin)`, assert the captured intent does not include `"ide_selection"` and includes the substrings "fix bug" and "end". Use the same mock pattern as existing tests (mockHelper that returns a function storing the first argument, then require the hook and run).

**Verify:** Run `node integrations/claude/__tests__/aic-prompt-compile.test.cjs`; all tests pass including the new one.

### Step 4: Add Cursor hook test

Create `integrations/cursor/__tests__/AIC-require-aic-compile.test.cjs`. The hook reads stdin (JSON with `generation_id`, `tool_name`, `tool_input`) and, when the tool is not aic_compile and the state file is missing, reads the saved prompt from `os.tmpdir()` + `aic-prompt-${generation_id}`. Write a temp file at that path with content `"hello <ide_selection>V8</ide_selection> world"`. Run the hook with stdin `{"generation_id": "<genId>", "tool_name": "other_tool", "tool_input": {}}` (use the same genId as the prompt file). Parse the stdout JSON; assert `permission === "deny"` and that `user_message` does not contain the substring `"<ide_selection>"` and contains the substrings "hello" and "world". Use a unique generation_id: `require("crypto").randomBytes(8).toString("hex")` so the state file does not exist. Do not set AIC_DEV_MODE so the hook runs normally.

**Verify:** Run `node integrations/cursor/__tests__/AIC-require-aic-compile.test.cjs`; the new test passes.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| intent_stripped_when_prompt_contains_ide_selection (Claude) | Prompt contains `<ide_selection>...</ide_selection>`; captured intent passed to callAicCompile has no "ide_selection" and preserves surrounding text. |
| deny_message_intent_stripped_when_saved_prompt_has_ide_selection (Cursor) | Saved prompt file contains ide_selection; hook deny message intent portion has no "<ide_selection>" and contains stripped text. |

## Acceptance Criteria

- [ ] Both hooks strip `<ide_selection>...</ide_selection>` from intent before use.
- [ ] Claude test: intent_stripped_when_prompt_contains_ide_selection passes.
- [ ] Cursor test: deny_message_intent_stripped_when_saved_prompt_has_ide_selection passes.
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all pass
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work, stop. List the adaptations, report to the user, and re-evaluate before continuing.
