# Task 212: Extract shared edited-files-cache module

> **Status:** Pending
> **Phase:** AI (Edited-Files Temp Cache Simplification)
> **Layer:** integrations/shared
> **Depends on:** AI01 (Document edited-files flow per editor)

## Goal

Create a single CommonJS module in `integrations/shared/edited-files-cache.cjs` that exports `getTempPath`, `readEditedFiles`, `writeEditedFiles`, and `cleanupEditedFiles` so Cursor and Claude Code hooks can share temp-file path, read, merge-write, and cleanup logic with a unified prefix and one sanitization rule.

## Architecture Notes

- Temp files live in `os.tmpdir()`; prefix is `aic-edited-` + sanitized editorId + `-` + sanitized key + `.json`. Single sanitization regex `/[^a-zA-Z0-9*_-]/g` → `_` (union of Cursor and Claude allowlists).
- Integration layer: CommonJS only; no core/pipeline types; no new npm dependencies. Matches sibling `read-stdin-sync.cjs` style (module.exports with named functions).
- First of its kind for edited-files cache; AI04/AI05/AI06 will consume this module. No extraction from existing files in this task.

## Files

| Action | Path |
| ------ | ---- |
| Create | `integrations/shared/edited-files-cache.cjs` |
| Create | `integrations/shared/__tests__/edited-files-cache.test.cjs` |

## Interface / Signature

No TypeScript interface; four exported functions (CommonJS):

```javascript
// integrations/shared/edited-files-cache.cjs — public API
function getTempPath(editorId, key)       // returns string (absolute path)
function readEditedFiles(editorId, key) // returns string[] (paths or [])
function writeEditedFiles(editorId, key, paths) // returns void
function cleanupEditedFiles(editorId, key)     // returns void
```

Internal helper (not exported):

```javascript
function sanitize(str) // replaces /[^a-zA-Z0-9*_-]/g with "_"; used by getTempPath
```

Implementation contract:

- `getTempPath(editorId, key)`: Return `path.join(os.tmpdir(), "aic-edited-" + sanitize(editorId) + "-" + sanitize(key) + ".json")`.
- `readEditedFiles(editorId, key)`: Let `tmpPath = getTempPath(editorId, key)`. If `!fs.existsSync(tmpPath)` return `[]`. Read with `fs.readFileSync(tmpPath, "utf8")`, `JSON.parse`; if result is not an array or parse throws, return `[]`. Return array filtered to elements that are non-empty strings.
- `writeEditedFiles(editorId, key, paths)`: Let `existing = readEditedFiles(editorId, key)`. Let `merged = [...new Set([...existing, ...paths])].filter(p => typeof p === "string" && p.length > 0)`. Write `fs.writeFileSync(getTempPath(editorId, key), JSON.stringify(merged), "utf8")`.
- `cleanupEditedFiles(editorId, key)`: In try/catch, call `fs.unlinkSync(getTempPath(editorId, key))`; catch and ignore (ENOENT or other errors).

## Dependent Types

None — CommonJS module; editorId, key are strings; paths is string[]. No shared/src/core types.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Implement sanitize and getTempPath

Create `integrations/shared/edited-files-cache.cjs` with SPDX and Copyright header (Apache-2.0, 2025 AIC Contributors). Require `fs`, `path`, `os`.

Add internal function `sanitize(str)` that returns `String(str).replace(/[^a-zA-Z0-9*_-]/g, "_")`.

Add and export `getTempPath(editorId, key)` that returns `path.join(os.tmpdir(), "aic-edited-" + sanitize(editorId) + "-" + sanitize(key) + ".json")`.

Export via `module.exports = { getTempPath };` (other exports added in later steps).

**Verify:** File exists; `node -e "const m=require('./integrations/shared/edited-files-cache.cjs'); const p=m.getTempPath('cursor','k1'); console.log(p.includes('aic-edited-cursor-'), p.includes('k1'), p.endsWith('.json'))"` prints `true true true` from repo root.

### Step 2: Implement readEditedFiles and writeEditedFiles

In the same file, implement `readEditedFiles(editorId, key)`: get path via `getTempPath(editorId, key)`; if `!fs.existsSync(path)` return `[]`; try `JSON.parse(fs.readFileSync(path, "utf8"))`; if not Array, return `[]`; return array filtered to `typeof p === "string" && p.length > 0`. Implement `writeEditedFiles(editorId, key, paths)`: set `existing = readEditedFiles(editorId, key)`, `merged = [...new Set([...existing, ...paths])].filter(p => typeof p === "string" && p.length > 0)`, then `fs.writeFileSync(getTempPath(editorId, key), JSON.stringify(merged), "utf8")`. Add both to `module.exports`.

**Verify:** From repo root, run `node -e "const m=require('./integrations/shared/edited-files-cache.cjs'); m.writeEditedFiles('t','k',['/a']); m.writeEditedFiles('t','k',['/b']); const r=m.readEditedFiles('t','k'); console.log(r.length===2, r.includes('/a'), r.includes('/b'))"` and confirm output `true true true`.

### Step 3: Implement cleanupEditedFiles

In the same file, implement `cleanupEditedFiles(editorId, key)`: in try block call `fs.unlinkSync(getTempPath(editorId, key))`; catch block empty (ignore). Add to `module.exports`.

**Verify:** After Step 2 verify, run `m.cleanupEditedFiles('t','k'); console.log(m.readEditedFiles('t','k').length===0)` → `true`.

### Step 4: Add tests

Create `integrations/shared/__tests__/edited-files-cache.test.cjs` with SPDX and Copyright header. Use `assert` and `require` of the module under test. Use a unique key per test: set each test's key to a string that includes `Date.now()` or `Math.random()` so tests do not collide when run in parallel. Implement:

- **getTempPath_returns_path_with_unified_prefix:** Call `getTempPath("cursor", "k1")`; assert path includes `"aic-edited-cursor-"` and `"k1"` and ends with `".json"`; assert path starts with `os.tmpdir()`.
- **getTempPath_sanitizes_editorId_and_key:** Call `getTempPath("x", "a/b c")`; assert returned path includes `"aic-edited-x-"` and that the key segment has no slash or space (sanitized to underscore).
- **readEditedFiles_returns_empty_when_missing:** Call `readEditedFiles("editor", "nonexistent-key-12345")`; assert deepStrictEqual result `[]`.
- **readEditedFiles_returns_parsed_array:** Use a unique key; write a temp file at `getTempPath(editorId, key)` with content `["/p1","/p2"]`; call `readEditedFiles(editorId, key)`; assert deepStrictEqual to `["/p1","/p2"]`. Clean up with `cleanupEditedFiles(editorId, key)`.
- **readEditedFiles_returns_empty_on_invalid_json:** Use a unique key; write temp file with content `"not json"`; assert `readEditedFiles(editorId, key)` returns `[]`. Clean up.
- **writeEditedFiles_creates_file_and_merge:** Use a unique key; call `writeEditedFiles(editorId, key, ["/a"])` then `writeEditedFiles(editorId, key, ["/b"])`; assert `readEditedFiles(editorId, key)` has length 2 and includes `/a` and `/b`; call `writeEditedFiles(editorId, key, ["/a"])` again and assert no duplicate (length still 2). Clean up.
- **cleanupEditedFiles_removes_file:** Use a unique key; `writeEditedFiles(editorId, key, ["/x"])`; `cleanupEditedFiles(editorId, key)`; assert `readEditedFiles(editorId, key)` returns `[]`.

Run tests with `node integrations/shared/__tests__/edited-files-cache.test.cjs`.

**Verify:** All test cases pass.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| getTempPath_returns_path_with_unified_prefix | Path contains aic-edited-cursor-, key, .json and is under os.tmpdir() |
| getTempPath_sanitizes_editorId_and_key | Key with slash/space yields safe filename segment |
| readEditedFiles_returns_empty_when_missing | Missing file returns [] |
| readEditedFiles_returns_parsed_array | Valid JSON array file returns that array |
| readEditedFiles_returns_empty_on_invalid_json | Invalid JSON returns [] |
| writeEditedFiles_creates_file_and_merge | Merge and dedupe; two writes then read yields 2 paths; duplicate path not added |
| cleanupEditedFiles_removes_file | After cleanup, read returns [] |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] getTempPath, readEditedFiles, writeEditedFiles, cleanupEditedFiles match signatures and behaviors above
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] Temp path uses prefix `aic-edited-` and single sanitization regex `/[^a-zA-Z0-9*_-]/g`
- [ ] No `let` in production code (only `const`)

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
