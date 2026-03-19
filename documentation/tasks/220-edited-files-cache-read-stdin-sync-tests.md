# Task 220: Tests for edited-files cache and readStdinSync

> **Status:** Pending
> **Phase:** AI (Edited-Files Temp Cache Simplification)
> **Layer:** integrations (test)
> **Depends on:** AI07 (Migrate readStdinSync in remaining files)

## Goal

Wire the existing unit tests for `integrations/shared/edited-files-cache.cjs` and `integrations/shared/read-stdin-sync.cjs` into the root test script, make edited-files-cache test keys deterministic, and add a getTempPath test for editorId `claude_code` so CI runs full coverage for AI08.

## Architecture Notes

- Tests already exist and cover the AI08 checklist (getTempPath, readEditedFiles round-trip, writeEditedFiles merge/no-duplicates, cleanupEditedFiles, readStdinSync piped input). This task adds CI wiring, determinism, and one extra editorId case.
- Project determinism: no Date.now() or Math.random() in production or test code; edited-files-cache.test.cjs currently uses both for unique keys — replace with a module-level counter.
- Sibling pattern: session-markers.test.cjs uses fs.mkdtempSync for unique paths; for edited-files-cache we need unique key strings, so use an incrementing counter per test that needs a unique key.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `package.json` (add edited-files-cache and read-stdin-sync test scripts to "test") |
| Modify | `integrations/shared/__tests__/edited-files-cache.test.cjs` (deterministic keys + getTempPath claude_code case) |

## Interface / Signature

APIs under test (no new code; CJS modules):

```javascript
// integrations/shared/edited-files-cache.cjs
function getTempPath(editorId, key)  // → path string
function readEditedFiles(editorId, key)  // → string[]
function writeEditedFiles(editorId, key, paths)  // → void
function cleanupEditedFiles(editorId, key)  // → void
```

```javascript
// integrations/shared/read-stdin-sync.cjs
function readStdinSync()  // → string
```

## Dependent Types

None — CJS modules, no TypeScript types.

## Config Changes

- **package.json:** Add two node commands to the existing "test" script. No dependency or version changes.
- **eslint.config.mjs:** No change (integrations *.cjs are already ignored).

## Steps

### Step 1: Wire test scripts in package.json

In the root `package.json`, in the `"test"` script value, append after `node integrations/shared/__tests__/prompt-log.test.cjs`:

` && node integrations/shared/__tests__/edited-files-cache.test.cjs && node integrations/shared/__tests__/read-stdin-sync.test.cjs`

So the script ends with: `... prompt-log.test.cjs && node integrations/shared/__tests__/edited-files-cache.test.cjs && node integrations/shared/__tests__/read-stdin-sync.test.cjs`

**Verify:** Run `pnpm test` from repo root; both new scripts run and exit 0.

### Step 2: Deterministic keys and getTempPath(claude_code) in edited-files-cache.test.cjs

In `integrations/shared/__tests__/edited-files-cache.test.cjs`:

1. **Deterministic keys:** At the top of the file, after the require block, add a module-level counter: `let keyCounter = 0;`. In every test that currently uses `Date.now()` and `Math.random()` to build a unique key (`readEditedFiles_returns_parsed_array`, `readEditedFiles_returns_empty_on_invalid_json`, `writeEditedFiles_creates_file_and_merge`, `cleanupEditedFiles_removes_file`), replace the key with a deterministic value: use `"parsed-" + (++keyCounter)` for the first, `"invalid-" + (++keyCounter)` for the second, `"merge-" + (++keyCounter)` for the third, `"cleanup-" + (++keyCounter)` for the fourth. Remove all uses of `Date.now()` and `Math.random()` from the file.

2. **New test case:** Add a function `getTempPath_returns_path_for_claude_code_editorId` that: calls `getTempPath("claude_code", "k1")`, asserts the return value includes the substring `"aic-edited-claude_code-"`, includes `"k1"`, ends with `".json"`, and starts with `os.tmpdir()`. Insert this function in the `cases` array after `getTempPath_sanitizes_editorId_and_key`.

**Verify:** Run `node integrations/shared/__tests__/edited-files-cache.test.cjs`; all 8 cases pass. Run `pnpm test`; full test suite passes.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| getTempPath_returns_path_with_unified_prefix | Path includes aic-edited-cursor-, k1, .json, under os.tmpdir() |
| getTempPath_sanitizes_editorId_and_key | Key segment has no slash or space |
| getTempPath_returns_path_for_claude_code_editorId | Path includes aic-edited-claude_code-, k1, .json, under os.tmpdir() |
| readEditedFiles_returns_empty_when_missing | Returns [] for nonexistent key |
| readEditedFiles_returns_parsed_array | Write JSON array, readEditedFiles returns same paths |
| readEditedFiles_returns_empty_on_invalid_json | Invalid JSON file yields [] |
| writeEditedFiles_creates_file_and_merge | Merge and dedupe; duplicate path not added |
| cleanupEditedFiles_removes_file | After cleanup, readEditedFiles returns [] |
| readStdinSync_returns_piped_input | spawnSync pipe; stdout equals piped input (read-stdin-sync.test.cjs) |

## Acceptance Criteria

- [ ] package.json "test" script includes edited-files-cache.test.cjs and read-stdin-sync.test.cjs
- [ ] edited-files-cache.test.cjs uses no Date.now() or Math.random(); unique keys use keyCounter
- [ ] getTempPath_returns_path_for_claude_code_editorId added and in cases array
- [ ] All 8 edited-files-cache cases and 1 read-stdin-sync case pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
