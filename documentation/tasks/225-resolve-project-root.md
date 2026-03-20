# Task 225: Extract shared resolveProjectRoot module

> **Status:** Pending
> **Phase:** AJ (Integration shared utilities)
> **Layer:** integrations (shared)
> **Depends on:** —

## Goal

Create `integrations/shared/resolve-project-root.cjs` exporting `resolveProjectRoot(parsed, options?)` so both Cursor and Claude hooks can resolve project root from editor-specific env/parsed input with a single shared implementation; returns trimmed absolute path.

## Architecture Notes

- Phase AJ target: one shared module for project-root resolution; each editor's fallback chain preserved exactly (mvp-progress.md).
- All shared modules in `integrations/shared/` are CommonJS; no new package.json or ESLint changes; Node built-ins (path, process) only.
- Editor detection: `parsed == null` or `options.env` provided → Cursor chain; else Claude chain. Cursor standard: `toolInputOverride` || `CURSOR_PROJECT_DIR` || (`useAicProjectRoot && AIC_PROJECT_ROOT`) || `process.cwd()`. Claude: `(toolInputOverride ?? cwdRaw).trim()` or `CLAUDE_PROJECT_DIR` || `process.cwd()`; `toolInputOverride` is opt-in for inject-conversation-id hooks.

## Files

| Action | Path                                                    |
| ------ | ------------------------------------------------------- |
| Create | `integrations/shared/resolve-project-root.cjs`          |
| Create | `integrations/shared/__tests__/resolve-project-root.test.cjs` |

## Interface / Signature

```javascript
// resolveProjectRoot(parsed, options?) → string
// parsed: null | { cwd?: string, input?: { cwd?: string } } — null for Cursor mode
// options: { toolInputOverride?: string, env?: object, useAicProjectRoot?: boolean }
// Returns: absolute path (path.resolve of first non-empty in editor-specific chain)
```

```javascript
const path = require("path");

function resolveProjectRoot(parsed, options) {
  const opts = options ?? {};
  const env = opts.env ?? process.env;
  const toolInputOverride =
    opts.toolInputOverride != null ? String(opts.toolInputOverride).trim() : "";
  const useAicProjectRoot = opts.useAicProjectRoot === true;

  const isCursor =
    parsed == null || Object.prototype.hasOwnProperty.call(opts, "env");
  if (isCursor) {
    const cursorDir =
      env.CURSOR_PROJECT_DIR != null && String(env.CURSOR_PROJECT_DIR).trim() !== ""
        ? String(env.CURSOR_PROJECT_DIR).trim()
        : "";
    const aicRoot =
      useAicProjectRoot &&
      env.AIC_PROJECT_ROOT != null &&
      String(env.AIC_PROJECT_ROOT).trim() !== ""
        ? String(env.AIC_PROJECT_ROOT).trim()
        : "";
    const raw =
      toolInputOverride ||
      cursorDir ||
      aicRoot ||
      process.cwd();
    return path.resolve(raw);
  }

  const cwdRaw = (parsed?.cwd ?? parsed?.input?.cwd ?? "").trim();
  const fromParsed = (toolInputOverride || cwdRaw).trim();
  const claudeDir =
    env.CLAUDE_PROJECT_DIR != null && String(env.CLAUDE_PROJECT_DIR).trim() !== ""
      ? String(env.CLAUDE_PROJECT_DIR).trim()
      : "";
  const raw = fromParsed || claudeDir || process.cwd();
  return path.resolve(raw);
}

module.exports = { resolveProjectRoot };
```

## Dependent Types

Not applicable — CJS utility; inputs and return are plain JavaScript (object, string). No TypeScript types.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create resolve-project-root.cjs

Create `integrations/shared/resolve-project-root.cjs` with SPDX and Copyright header, then implement `resolveProjectRoot(parsed, options)`:

- Require `path`. No other dependencies.
- Default: `const opts = options ?? {}`, `const env = opts.env ?? process.env`, `toolInputOverride = opts.toolInputOverride != null ? String(opts.toolInputOverride).trim() : ""`, `useAicProjectRoot = opts.useAicProjectRoot === true`.
- Cursor branch: `isCursor = parsed == null || Object.prototype.hasOwnProperty.call(opts, "env")`. When true: first non-empty of `toolInputOverride`, `env.CURSOR_PROJECT_DIR` (trimmed), `useAicProjectRoot && env.AIC_PROJECT_ROOT` (trimmed), `process.cwd()`; then `return path.resolve(raw)`.
- Claude branch: `cwdRaw = (parsed?.cwd ?? parsed?.input?.cwd ?? "").trim()`, `fromParsed = (toolInputOverride || cwdRaw).trim()`; first non-empty of `fromParsed`, `env.CLAUDE_PROJECT_DIR` (trimmed), `process.cwd()`; then `return path.resolve(raw)`.
- Export: `module.exports = { resolveProjectRoot };`

**Verify:** File exists; `node -e "const {resolveProjectRoot}=require('./integrations/shared/resolve-project-root.cjs'); console.log(resolveProjectRoot(null,{env:{}}).length>0)"` from repo root exits 0.

### Step 2: Add unit tests

Create `integrations/shared/__tests__/resolve-project-root.test.cjs` with assert and the same test runner pattern as `read-stdin-sync.test.cjs` (named functions, loop, exit code). Require `path` and the module under test. Test cases:

- **cursor_env:** `resolveProjectRoot(null, { env: { CURSOR_PROJECT_DIR: "/cursor/project" } })` equals `path.resolve("/cursor/project")`.
- **cursor_useAicProjectRoot:** `resolveProjectRoot(null, { env: { AIC_PROJECT_ROOT: "/aic/root" }, useAicProjectRoot: true })` equals `path.resolve("/aic/root")` (no CURSOR_PROJECT_DIR).
- **claude_cwd:** `resolveProjectRoot({ cwd: "/claude/cwd" })` equals `path.resolve("/claude/cwd")`.
- **claude_env_fallback:** Save `process.env.CLAUDE_PROJECT_DIR`; set `process.env.CLAUDE_PROJECT_DIR = "/claude/env"`; call `resolveProjectRoot({ cwd: "" })` (no options.env so Claude branch runs); assert result equals `path.resolve("/claude/env")`; restore `process.env.CLAUDE_PROJECT_DIR` in finally.
- **toolInput_override_cursor:** `resolveProjectRoot(null, { env: {}, toolInputOverride: "/override" })` equals `path.resolve("/override")`.
- **toolInput_override_claude:** `resolveProjectRoot({ cwd: "/cwd" }, { toolInputOverride: " /override " })` equals `path.resolve("/override")` (trimmed).
- **trim_cwd:** `resolveProjectRoot({ cwd: "  /trim/me  " })` equals `path.resolve("/trim/me")`.

Use `assert.strictEqual(actual, expected)` for each. Run tests with `node integrations/shared/__tests__/resolve-project-root.test.cjs` from repo root.

**Verify:** All test cases pass.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                  | Description                                                                 |
| -------------------------- | --------------------------------------------------------------------------- |
| cursor_env                 | Cursor: env.CURSOR_PROJECT_DIR used when parsed is null and env provided   |
| cursor_useAicProjectRoot   | Cursor: AIC_PROJECT_ROOT used when useAicProjectRoot true, no CURSOR_DIR    |
| claude_cwd                 | Claude: parsed.cwd used when non-empty                                      |
| claude_env_fallback        | Claude: CLAUDE_PROJECT_DIR from process.env used when cwd empty (no options.env) |
| toolInput_override_cursor  | Cursor: toolInputOverride wins over env                                     |
| toolInput_override_claude  | Claude: toolInputOverride wins and is trimmed                               |
| trim_cwd                   | Claude: cwd trimmed before path.resolve                                    |

## Acceptance Criteria

- [ ] Both files created per Files table
- [ ] resolveProjectRoot(parsed, options?) matches behavior above; returns string from path.resolve
- [ ] All seven test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports from adapters, storage, mcp, or external packages (path/process only)
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
