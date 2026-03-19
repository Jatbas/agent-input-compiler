# Task 209: Extract shared readStdinSync module

> **Status:** Pending
> **Phase:** AL (Integration refactoring)
> **Layer:** integrations
> **Depends on:** —

## Goal

Create a single CommonJS module `integrations/shared/read-stdin-sync.cjs` that exports `readStdinSync()`, replacing the identical 10-line buffer-loop currently duplicated in 8 hook files (Cursor and Claude afterFileEdit, stop-quality-check, block-no-verify). No consumer changes in this task; AI04, AI05, AI07 will migrate callers.

## Architecture Notes

- General-purpose recipe: shared utility extraction; no core interface, no pipeline/storage/adapter.
- Layer: integrations/shared/ (same directory as cache-field-validators.cjs, session-model-cache.cjs). CommonJS so hooks can require() without ESM.
- Single export, stateless, Node.js fs only; no package.json or ESLint changes.
- AI08 adds broader tests (e.g. merge behavior); this task adds one test that piped input is returned.

## Files

| Action | Path |
| ------ | ---- |
| Create | `integrations/shared/read-stdin-sync.cjs` |
| Create | `integrations/shared/__tests__/read-stdin-sync.test.cjs` |

## Interface / Signature

```javascript
// Export signature — no TypeScript interface; CommonJS module.
function readStdinSync(): string
```

Reads stdin (fd 0) synchronously in 64KB chunks until EOF; concatenates chunks and returns UTF-8 string. Uses `fs.readSync(0, buf, 0, buf.length, null)` in a loop, then `Buffer.concat(chunks, size).toString("utf8")`.

```javascript
// Implementation shape (exact logic to implement)
const fs = require("fs");

function readStdinSync() {
  const chunks = [];
  let size = 0;
  const buf = Buffer.alloc(64 * 1024);
  let n;
  while ((n = fs.readSync(0, buf, 0, buf.length, null)) > 0) {
    chunks.push(buf.slice(0, n));
    size += n;
  }
  return Buffer.concat(chunks, size).toString("utf8");
}

module.exports = { readStdinSync };
```

## Dependent Types

None — returns plain string; uses only Node.js `fs` and `Buffer`.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create read-stdin-sync.cjs

Create `integrations/shared/read-stdin-sync.cjs` with SPDX license and copyright header (same two-line format as `integrations/shared/cache-field-validators.cjs`). Implement `readStdinSync()`: allocate a 64KB buffer, loop calling `fs.readSync(0, buf, 0, buf.length, null)` until return value is 0, push `buf.slice(0, n)` into a chunks array and accumulate size; return `Buffer.concat(chunks, size).toString("utf8")`. Export via `module.exports = { readStdinSync }`.

**Verify:** File exists; `node -e "const {readStdinSync}=require('./integrations/shared/read-stdin-sync.cjs'); console.log(readStdinSync().length)" </dev/null` runs and prints `0`.

### Step 2: Create read-stdin-sync.test.cjs

Create `integrations/shared/__tests__/read-stdin-sync.test.cjs` with SPDX license and copyright header. Use `child_process.spawnSync` to run Node with `-e "const {readStdinSync}=require('...'); process.stdout.write(readStdinSync())"` with `stdio: ['pipe','pipe','pipe']`. Write the fixed string `{"test":true}\n` to the child's stdin, then close the write end. Read the child's stdout and assert it equals the written string. Exit with 0 on pass, 1 on fail; use the same runner pattern as `session-model-cache.test.cjs` (run cases, count failures, process.exit(failed > 0 ? 1 : 0)).

**Verify:** `node integrations/shared/__tests__/read-stdin-sync.test.cjs` exits 0 and prints OK for the test case.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Then run the new test explicitly: `node integrations/shared/__tests__/read-stdin-sync.test.cjs`

Expected: lint and typecheck pass; existing test suite passes; knip reports no new issues; read-stdin-sync test exits 0.

## Tests

| Test case | Description |
| --------- | ----------- |
| readStdinSync_returns_piped_input | Spawn Node that requires the module and calls readStdinSync(), pipe a string into stdin, assert stdout equals that string |

## Acceptance Criteria

- [ ] `integrations/shared/read-stdin-sync.cjs` exists and exports `readStdinSync`
- [ ] `integrations/shared/__tests__/read-stdin-sync.test.cjs` exists and passes
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all pass
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] Implementation matches the 10-line buffer-loop logic used in the 8 hook files (64KB buffer, fs.readSync(0, ...), Buffer.concat, toString("utf8"))

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
