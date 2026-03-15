# Task 171: Startup self-check covers Claude Code artifacts

> **Status:** Pending
> **Phase:** U — Claude Code Zero-Install
> **Layer:** mcp
> **Depends on:** U03 Wire Claude Code dispatch in bootstrap

## Goal

Extend the startup self-check so it validates Claude Code artifacts (settings with AIC hooks and CLAUDE.md) alongside Cursor artifacts, and reports Claude Code status in installationNotes without changing the consumer contract.

## Architecture Notes

- Follow the existing Cursor check pattern in `mcp/src/startup-self-check.ts` (lines 23–68): guard, read files, parse JSON, accumulate notes, same return shape.
- installationOk is true only when there are no failure notes: `notes.filter(n => n !== "Claude Code: OK").length === 0`. "Claude Code: OK" is informational and does not make installationOk false.
- No new interfaces or types; Claude settings parsed with inline type assertion. Optional fields in parsed hooks use optional chaining and fallbacks per OPTIONAL FIELD HAZARDS.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `mcp/src/startup-self-check.ts` (add Claude Code guarded block, update installationOk logic) |
| Modify | `mcp/src/__tests__/startup-self-check.test.ts` (add five Claude Code test cases) |

## Interface / Signature

Existing function — no interface change. Signature remains:

```typescript
export function runStartupSelfCheck(projectRoot: AbsolutePath): {
  installationOk: boolean;
  installationNotes: string;
}
```

Implementation extends the function body: after the existing Cursor notes array is built, add a guarded block that runs only when `fs.existsSync(path.join(projectRoot, ".claude"))` is true. In that block: (1) try to read `.claude/settings.local.json`, then if missing or invalid `.claude/settings.json`; (2) parse as object with `hooks` key where each value is an array of wrappers with `hooks` array of `{ command?: string }`; (3) settings pass if any command in any wrapper includes `"aic-"` (use optional chaining: `parsed.hooks ?? {}`, `wrappers ?? []`, `w.hooks ?? []`, `String(h?.command ?? "").includes("aic-")`); (4) CLAUDE.md exists at `path.join(projectRoot, ".claude", "CLAUDE.md")`; (5) push "Claude Code: settings missing AIC hooks" or "Claude Code: CLAUDE.md not found" on failure, or "Claude Code: OK" when both pass; (6) push into the same `notes` array used for Cursor; (7) set `installationOk = notes.filter(n => n !== "Claude Code: OK").length === 0` and `installationNotes = notes.join("; ")`.

## Dependent Types

### Tier 0 — verbatim

Return type and parameter:

```typescript
// projectRoot and return type — from mcp/src/startup-self-check.ts
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";

function runStartupSelfCheck(projectRoot: AbsolutePath): {
  installationOk: boolean;
  installationNotes: string;
}
```

### Tier 2 — path-only

| Type | Path | Factory |
| ---- | ---- | ------- |
| `AbsolutePath` | `shared/src/core/types/paths.js` | `toAbsolutePath(raw)` |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Extend runStartupSelfCheck with Claude Code block

In `mcp/src/startup-self-check.ts`, after the existing Cursor block that builds `notes` (before the line that sets `installationOk`), add the Claude Code block:

1. Guard: `const claudeDirExists = fs.existsSync(path.join(projectRoot, ".claude"));` If `!claudeDirExists`, do not add any Claude Code notes and do not change the existing `installationOk`/`installationNotes` logic beyond using the new installationOk rule below.
2. When `claudeDirExists`: define a type for parsed Claude settings: `type ClaudeSettingsParsed = { hooks?: Record<string, readonly { hooks?: readonly { command?: string }[] }[]> };`. Try `path.join(projectRoot, ".claude", "settings.local.json")` with `fs.existsSync` and `fs.readFileSync`; on missing file or JSON parse throw, try `path.join(projectRoot, ".claude", "settings.json")` the same way. If both fail, treat as settings missing.
3. Settings pass: from the parsed object, check that at least one hook command contains `"aic-"` by iterating `Object.values(parsed.hooks ?? {})`, then each wrapper's `hooks ?? []`, then `String(h?.command ?? "").includes("aic-")`.
4. CLAUDE.md: `fs.existsSync(path.join(projectRoot, ".claude", "CLAUDE.md"))`.
5. Push to `notes`: if settings do not pass push `"Claude Code: settings missing AIC hooks"`; else if CLAUDE.md missing push `"Claude Code: CLAUDE.md not found"`; else push `"Claude Code: OK"`.
6. Replace the existing `installationOk` assignment with: `const installationOk = notes.filter((n) => n !== "Claude Code: OK").length === 0;` Keep `installationNotes = notes.length > 0 ? notes.join("; ") : "";`

**Verify:** Run `pnpm typecheck` from repo root; no errors.

### Step 2: Add tests for Claude Code cases

In `mcp/src/__tests__/startup-self-check.test.ts`, add five test cases using the same tmpDir pattern as existing tests (mkdtempSync, toAbsolutePath, runStartupSelfCheck, afterEach cleanup):

1. **claude_dir_absent_skips_cc_checks** — Create full Cursor setup (trigger, hooks.json, hook scripts). Do not create `.claude/`. Call `runStartupSelfCheck(projectRoot)`. Assert `result.installationOk === true` and `result.installationNotes` does not include the substring `"Claude Code"`.
2. **claude_settings_and_claude_md_pass** — Create `.claude/` dir. Write `.claude/settings.local.json` with `{ "hooks": { "SessionStart": [{ "hooks": [{ "command": "node /some/path/aic-session-start.cjs" }] }] } }`. Write `.claude/CLAUDE.md` with any content. Do not create Cursor artifacts. Call `runStartupSelfCheck(projectRoot)`. Assert `result.installationNotes` includes `"Claude Code: OK"` and `result.installationOk === true`.
3. **claude_settings_missing_aic_hooks** — Create `.claude/` and `.claude/CLAUDE.md`. Write `.claude/settings.local.json` with `{ "hooks": {} }`. Call `runStartupSelfCheck(projectRoot)`. Assert `result.installationNotes` includes `"Claude Code: settings missing AIC hooks"` and `result.installationOk === false`.
4. **claude_claude_md_missing** — Create `.claude/` and `.claude/settings.local.json` with at least one hook command containing `"aic-"`. Do not create `.claude/CLAUDE.md`. Call `runStartupSelfCheck(projectRoot)`. Assert `result.installationNotes` includes `"Claude Code: CLAUDE.md not found"` and `result.installationOk === false`.
5. **claude_either_settings_file_satisfies** — Create `.claude/` and `.claude/CLAUDE.md`. Do not create `settings.local.json`. Write `.claude/settings.json` with one hook command containing `"aic-"` (same structure as in test 2). Call `runStartupSelfCheck(projectRoot)`. Assert `result.installationNotes` includes `"Claude Code: OK"` and no `"settings missing"` note; `result.installationOk === true`.

**Verify:** Run `pnpm test -- mcp/src/__tests__/startup-self-check.test.ts`; all tests pass.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| claude_dir_absent_skips_cc_checks | No .claude/; Cursor present; no "Claude Code" in notes; installationOk true |
| claude_settings_and_claude_md_pass | .claude/ with settings.local.json (aic- hook) and CLAUDE.md; notes include "Claude Code: OK"; installationOk true |
| claude_settings_missing_aic_hooks | .claude/ with empty hooks; notes include "Claude Code: settings missing AIC hooks"; installationOk false |
| claude_claude_md_missing | .claude/ with aic- hook in settings, no CLAUDE.md; notes include "Claude Code: CLAUDE.md not found"; installationOk false |
| claude_either_settings_file_satisfies | .claude/ with only settings.json (no settings.local.json) containing aic- hook and CLAUDE.md; "Claude Code: OK" in notes; installationOk true |

## Acceptance Criteria

- [ ] Both files modified per Files table
- [ ] runStartupSelfCheck signature unchanged; return type unchanged
- [ ] All five new test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] Claude Code checks run only when `.claude/` exists
- [ ] installationOk is false only when there is at least one failure note (not when the only note is "Claude Code: OK")

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
