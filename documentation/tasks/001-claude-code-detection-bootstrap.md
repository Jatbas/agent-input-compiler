# Task 001: Claude Code detection in bootstrap

> **Status:** Pending
> **Phase:** U — Claude Code Zero-Install
> **Layer:** mcp
> **Depends on:** —

## Goal

Extend `runEditorBootstrapIfNeeded` in `mcp/src/editor-integration-dispatch.ts` to detect Claude Code alongside Cursor so that bootstrap can run when only Claude Code context exists; U03 will wire the Claude installer dispatch using the new constant and variable.

## Architecture Notes

- All editor-specific strings and env names live in `editor-integration-dispatch.ts` so `server.ts` has zero editor references (cursor-integration-layer, claude-code-integration-layer).
- Detection is independent per editor: both `cursorDetected` and `claudeCodeDetected` can be true simultaneously.
- Early-return is changed to `if (!cursorDetected && !claudeCodeDetected) return;` so that when only Claude Code is present the function does not exit and U03 can run the Claude installer.
- No new file and no new interface per MVP progress U02.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `mcp/src/editor-integration-dispatch.ts` (add constant, variable, early-return change) |

## Interface / Signature

Existing function (unchanged signature):

```typescript
export function runEditorBootstrapIfNeeded(absRoot: AbsolutePath): void
```

Code to add and change:

```typescript
const REL_CC_INSTALL_SCRIPT = path.join("integrations", "claude", "install.cjs");

// Inside runEditorBootstrapIfNeeded, after cursorDetected:
const claudeCodeDetected =
  fs.existsSync(path.join(absRoot, ".claude")) ||
  (process.env["CLAUDE_PROJECT_DIR"] !== undefined &&
    process.env["CLAUDE_PROJECT_DIR"] !== "");
if (!cursorDetected && !claudeCodeDetected) return;
```

## Dependent Types

### Tier 2 — path-only

| Type | Path | Factory |
| ---- | ---- | ------- |
| `AbsolutePath` | `shared/src/core/types/paths.ts` | `toAbsolutePath(raw)` |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add Claude Code detection in runEditorBootstrapIfNeeded

In `mcp/src/editor-integration-dispatch.ts`:

1. After the existing `const REL_INSTALL_SCRIPT = path.join("integrations", "cursor", "install.cjs");` line, add:
   `const REL_CC_INSTALL_SCRIPT = path.join("integrations", "claude", "install.cjs");`
2. Inside `runEditorBootstrapIfNeeded`, immediately after the `cursorDetected` assignment (the block that ends with `process.env["CURSOR_PROJECT_DIR"] !== "");`), add the `claudeCodeDetected` assignment:
   `const claudeCodeDetected = fs.existsSync(path.join(absRoot, ".claude")) || (process.env["CLAUDE_PROJECT_DIR"] !== undefined && process.env["CLAUDE_PROJECT_DIR"] !== "");`
3. Change the next line from `if (!cursorDetected) return;` to `if (!cursorDetected && !claudeCodeDetected) return;`

**Verify:** File contains `REL_CC_INSTALL_SCRIPT`, `claudeCodeDetected`, and the early-return condition uses both variables.

### Step 2: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| Final verification | Step 2 runs full lint, typecheck, test, knip; no new test file per MVP spec |

## Acceptance Criteria

- [ ] `mcp/src/editor-integration-dispatch.ts` modified per Files table
- [ ] `REL_CC_INSTALL_SCRIPT` constant added
- [ ] `claudeCodeDetected` variable added; early-return uses `!cursorDetected && !claudeCodeDetected`
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
