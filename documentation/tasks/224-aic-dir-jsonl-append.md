# Task 224: Extract shared aic-dir and JSONL append module

> **Status:** Pending
> **Phase:** AJ — Integration Shared Utilities Extraction
> **Layer:** integrations/shared
> **Depends on:** —

## Goal

Create `integrations/shared/aic-dir.cjs` with `getAicDir(projectRoot)`, `ensureAicDir(projectRoot)` (mkdir 0o700), and `appendJsonl(projectRoot, filename, entry)` so hook scripts have a single implementation for .aic path resolution and JSONL append; AJ06 will migrate call sites.

## Architecture Notes

- Phase AJ target: one shared module for .aic directory path and JSONL append; all shared modules in integrations/shared are CommonJS.
- `.aic/` must be created with mode 0o700 (security.md §.aic/ Directory Security). No .gitignore logic in this module (that is init-project concern in shared/src/storage/ensure-aic-dir.ts).
- shared/src/storage/ensure-aic-dir.ts is the TypeScript/MCP counterpart; integrations hooks use this CJS module. Same semantics for path and 0o700.

## Files

| Action | Path |
| ------ | ---- |
| Create | `integrations/shared/aic-dir.cjs` |
| Create | `integrations/shared/__tests__/aic-dir.test.cjs` |
| Modify | `package.json` (add aic-dir.test.cjs to test script) |

## Interface / Signature

```javascript
// Exports (CommonJS) — integrations/shared/aic-dir.cjs
function getAicDir(projectRoot)           // returns string: path.join(projectRoot, ".aic")
function ensureAicDir(projectRoot)       // mkdirSync with 0o700, idempotent; returns dir path string
function appendJsonl(projectRoot, filename, entry)  // ensure dir, append JSON line; try/catch non-fatal
```

```javascript
// Implementation shape — exact Node API usage
const path = require("path");
const fs = require("fs");

function getAicDir(projectRoot) {
  return path.join(projectRoot, ".aic");
}

function ensureAicDir(projectRoot) {
  const dir = path.join(projectRoot, ".aic");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function appendJsonl(projectRoot, filename, entry) {
  try {
    ensureAicDir(projectRoot);
    const filePath = path.join(projectRoot, ".aic", filename);
    fs.appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // non-fatal, do not throw
  }
}

module.exports = { getAicDir, ensureAicDir, appendJsonl };
```

## Dependent Types

None — CJS module; projectRoot and filename are plain strings. entry is any JSON-serializable value.

## Config Changes

- **package.json:** Add ` && node integrations/shared/__tests__/aic-dir.test.cjs` to the `scripts.test` string (after `session-markers.test.cjs`).
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create aic-dir.cjs

Create `integrations/shared/aic-dir.cjs` with SPDX and Copyright header, then require `path` and `fs`. Implement:

- `getAicDir(projectRoot)`: return `path.join(projectRoot, ".aic")`.
- `ensureAicDir(projectRoot)`: set `dir = path.join(projectRoot, ".aic")`, call `fs.mkdirSync(dir, { recursive: true, mode: 0o700 })`, return `dir`.
- `appendJsonl(projectRoot, filename, entry)`: inside try/catch, call `ensureAicDir(projectRoot)`, then `fs.appendFileSync(path.join(projectRoot, ".aic", filename), JSON.stringify(entry) + "\n", "utf8")`; in catch block do nothing (non-fatal).

Export all three via `module.exports = { getAicDir, ensureAicDir, appendJsonl };`.

**Verify:** File exists; running `node -e "const m = require('./integrations/shared/aic-dir.cjs'); console.log(m.getAicDir('/tmp/foo'))"` from repo root prints the path ending in `.aic`.

### Step 2: Create aic-dir.test.cjs

Create `integrations/shared/__tests__/aic-dir.test.cjs` with SPDX and Copyright header. Require `assert`, `fs`, `os`, `path`, and the module under test from `../aic-dir.cjs`. Use `fs.mkdtempSync(path.join(os.tmpdir(), "aic-dir-"))` for project roots. Implement:

- **getAicDir_returns_join:** Call `getAicDir(projectRoot)`, assert result equals `path.join(projectRoot, ".aic")`. Clean up temp dir.
- **ensureAicDir_creates_with_0o700:** Call `ensureAicDir(projectRoot)`, assert `fs.existsSync(path.join(projectRoot, ".aic"))`, assert `(fs.statSync(path.join(projectRoot, ".aic")).mode & 0o777) === 0o700`. Clean up.
- **ensureAicDir_idempotent:** Call `ensureAicDir(projectRoot)` twice, assert no throw and `.aic` exists. Clean up.
- **appendJsonl_appends_line:** Call `appendJsonl(projectRoot, "test.jsonl", { a: 1 })`, read file at `path.join(projectRoot, ".aic", "test.jsonl")`, assert content is `'{"a":1}\n'`. Call `appendJsonl(projectRoot, "test.jsonl", { b: 2 })`, assert file content is `'{"a":1}\n{"b":2}\n'`. Clean up.

Match the test runner pattern used in `integrations/shared/__tests__/session-markers.test.cjs`: array of test functions and a small runner loop that calls each, logs OK/FAIL, and `process.exit(failed > 0 ? 1 : 0)`.

**Verify:** Test file exists; running `node integrations/shared/__tests__/aic-dir.test.cjs` from repo root exits 0 and prints OK for each of the four test names.

### Step 3: Add aic-dir.test.cjs to test script

In root `package.json`, in the `scripts.test` value, add ` && node integrations/shared/__tests__/aic-dir.test.cjs` after the existing `session-markers.test.cjs` segment so the new test runs as part of `pnpm test`.

**Verify:** `pnpm test` includes and passes the aic-dir tests.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| getAicDir_returns_join | getAicDir(projectRoot) returns path.join(projectRoot, ".aic") |
| ensureAicDir_creates_with_0o700 | ensureAicDir creates .aic with mode 0o700 |
| ensureAicDir_idempotent | ensureAicDir called twice does not throw and dir exists |
| appendJsonl_appends_line | appendJsonl writes one JSON line; second call appends second line |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] getAicDir, ensureAicDir, appendJsonl match signatures and behavior above
- [ ] All four test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] .aic directory created with 0o700 when ensureAicDir or appendJsonl runs

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
