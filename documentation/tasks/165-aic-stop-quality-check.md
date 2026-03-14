# Task 165: aic-stop-quality-check.cjs (Stop)

> **Status:** Pending
> **Phase:** T — Claude Code Hook-Based Delivery
> **Layer:** integrations/claude
> **Depends on:** T06 (aic-after-file-edit-tracker.cjs)

## Goal

Create the Stop hook for Claude Code that runs ESLint and typecheck on edited files from the T06 tracker temp file; block stop with `decision: "block"` when lint or typecheck fails.

## Architecture Notes

- Port logic from `integrations/cursor/hooks/AIC-stop-quality-check.cjs`; same lint/typecheck pattern, different input (CC top-level `parsed.session_id`, `parsed.cwd`) and output (CC `decision: "block"`, `reason` per §6.5).
- Temp file path must match T06: `os.tmpdir()/aic-cc-edited-<sanitized>.json` with sanitize `String(sessionId).replace(/[^a-zA-Z0-9*-]/g, "_")`.
- Node built-ins only (fs, path, os, child_process). No npm packages at runtime.
- Export `run(stdinStr)` for testability; main block reads stdin, writes run(raw), exit(0).

## Files

| Action | Path |
| ------ | ---- |
| Create | `integrations/claude/hooks/aic-stop-quality-check.cjs` |
| Create | `integrations/claude/__tests__/aic-stop-quality-check.test.cjs` |

## Interface / Signature

Standalone CommonJS script; no core interface. Exported function for tests:

```javascript
// Returns: "" (no block) or JSON.stringify({ decision: "block", reason: string })
function run(stdinStr) { ... }
```

Main entry (when invoked by Claude Code):

```javascript
if (require.main === module) {
  const raw = readStdinSync();
  process.stdout.write(run(raw));
  process.exit(0);
}
module.exports = { run };
```

Input (stdin JSON): top-level `parsed.session_id`, `parsed.cwd`; fallback `parsed.input?.session_id`, `parsed.input?.cwd`. projectRoot = (parsed.cwd ?? parsed.input?.cwd ?? "").trim() || process.env.CLAUDE_PROJECT_DIR || process.cwd().

## Dependent Types

Not applicable — script consumes and produces plain JSON and strings; no shared/core types.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create the Stop hook script

Create `integrations/claude/hooks/aic-stop-quality-check.cjs`.

- Use SPDX and Copyright header matching sibling hooks (Apache-2.0, 2025 AIC Contributors). Comment: Stop hook — runs eslint and tsc on edited files from T06 temp file; outputs decision: "block" on failure (CC §6.5).
- Require: `fs`, `path`, `os`, `child_process` (destructure `execSync`).
- Implement `readStdinSync()`: 64KB buffer loop with `fs.readSync(0, buf, 0, buf.length, null)`, `Buffer.concat(chunks, size).toString("utf8")`. Same pattern as Cursor AIC-stop-quality-check.cjs.
- Implement `getTempPath(sessionId)`: `path.join(os.tmpdir(), "aic-cc-edited-" + String(sessionId).replace(/[^a-zA-Z0-9*-]/g, "_") + ".json")`.
- Implement `runEslint(paths, cwd)`: if paths.length === 0 return `{ exitCode: 0, stderr: "" }`. Try `execSync("npx", ["eslint", "--max-warnings", "0", "--", ...paths], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], cwd })`; on catch return `{ exitCode: err.status ?? 1, stderr: (err.stderr ?? err.message ?? "").toString() }`.
- Implement `runTsc(cwd)`: if `!fs.existsSync(path.join(cwd, "tsconfig.json"))` return `{ exitCode: 0, stderr: "" }`. Try `execSync("npx", ["tsc", "--noEmit"], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], cwd })`; on catch return `{ exitCode: err.status ?? 1, stderr: (err.stderr ?? err.message ?? "").toString() }`.
- Implement `run(stdinStr)`: Parse stdin with try/catch (empty/malformed → `{}`). sessionId = `parsed.session_id ?? parsed.input?.session_id ?? "default"`. cwdRaw = `parsed.cwd ?? parsed.input?.cwd ?? ""`. projectRoot = cwdRaw.trim() ? cwdRaw.trim() : (process.env.CLAUDE_PROJECT_DIR || process.cwd()). tmpPath = getTempPath(sessionId). If `!fs.existsSync(tmpPath)` return `""`. Read and parse temp file (JSON array); on parse error return `""`. paths = parsed array filtered to strings where `fs.existsSync(p)` and (p.endsWith(".ts") || p.endsWith(".js")). If paths.length === 0 return `""`. eslintResult = runEslint(paths, projectRoot). tscResult = runTsc(projectRoot). If eslintResult.exitCode !== 0 or tscResult.exitCode !== 0: build reason string listing which failed ("lint", "typecheck"), prepend "Fix lint/typecheck errors:\n", append eslintResult.stderr and tscResult.stderr; return `JSON.stringify({ decision: "block", reason })`. Else return `""`.
- Main block: `if (require.main === module) { const raw = readStdinSync(); process.stdout.write(run(raw)); process.exit(0); }`. `module.exports = { run };`.
- Wrap the entire run path in try/catch; on any throw return `""` so the hook never crashes the editor.

**Verify:** File exists; `node -e "const {run}=require('./integrations/claude/hooks/aic-stop-quality-check.cjs'); console.log(run('{}')==='')"` prints true from repo root.

### Step 2: Create tests

Create `integrations/claude/__tests__/aic-stop-quality-check.test.cjs`.

- SPDX and Copyright header. Require hook via `path.join(__dirname, "..", "hooks", "aic-stop-quality-check.cjs")` and destructure `run`. Define `tempPath(sessionId)` same formula as hook: `path.join(os.tmpdir(), "aic-cc-edited-" + String(sessionId).replace(/[^a-zA-Z0-9*-]/g, "_") + ".json")`. Define `cleanupTemp(sessionId)`: try `fs.unlinkSync(tempPath(sessionId))`, catch ignore.
- Test `temp_missing_exit_0`: cleanupTemp("s1"); out = run(JSON.stringify({ session_id: "s1", cwd: process.cwd() })); assert out === "".
- Test `no_ts_js_files_exit_0`: cleanupTemp("s2"); write temp file with empty array or paths that are not .ts/.js; out = run(JSON.stringify({ session_id: "s2", cwd: process.cwd() })); assert out === ""; cleanupTemp("s2").
- Test `block_on_lint_failure`: use a temp directory; write a .ts file that fails eslint by containing an unused variable; write temp edited-files list with that path; run with session_id and cwd pointing to temp dir; assert output includes `decision` and `"block"` and reason contains error text; cleanup temp dir and temp file.
- Test `pass_when_clean`: cleanupTemp("s4"); write temp file with single path to an existing .ts or .js in the project that passes lint; run with session_id and cwd = project root; assert out === ""; cleanupTemp("s4"). (If project has tsconfig.json, tsc must pass for the chosen file.)
- Run all test functions; console.log each test name + " pass"; end with "All tests passed."

**Verify:** `node integrations/claude/__tests__/aic-stop-quality-check.test.cjs` exits 0 and prints all pass lines.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| temp_missing_exit_0 | No temp file for session → run() returns "" |
| no_ts_js_files_exit_0 | Temp file empty or no .ts/.js paths → return "" |
| block_on_lint_failure | Lint or typecheck failure → output has decision: "block" and reason with error text |
| pass_when_clean | Edited files pass lint (and tsc if tsconfig) → return "" |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] run() implements input/output per CC §6.5, §7.6; temp path matches T06
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports from shared/src or mcp/src; Node built-ins only
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
