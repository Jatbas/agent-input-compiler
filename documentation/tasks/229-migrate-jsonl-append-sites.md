# Task 229: Migrate all JSONL append sites

> **Status:** Pending
> **Phase:** AJ — Integration Shared Utilities Extraction
> **Layer:** integrations/shared
> **Depends on:** AJ03 (aic-dir.cjs)

## Goal

Replace inline `fs.mkdirSync` + `fs.appendFileSync` for JSONL writes in the three shared modules that still contain the pattern with `require("./aic-dir.cjs").appendJsonl(projectRoot, filename, entry)` so all .aic JSONL appends go through the single implementation from AJ03.

## Architecture Notes

- Phase AJ: one implementation for JSONL append (aic-dir.appendJsonl); AG/AH already migrated hook call sites to appendPromptLog/appendSessionLog — the remaining sites are the shared modules that implement those APIs and session-model-cache.
- Blast radius: exactly 3 production files (prompt-log.cjs, session-log.cjs, session-model-cache.cjs). No hook files need changes; no new files.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `integrations/shared/prompt-log.cjs` (replace inline mkdir+append with appendJsonl) |
| Modify | `integrations/shared/session-log.cjs` (replace inline mkdir+append with appendJsonl) |
| Modify | `integrations/shared/session-model-cache.cjs` (replace inline mkdir+append with appendJsonl) |

## Interface / Signature

The task does not define a new interface; it migrates call sites to the existing API:

```javascript
// From integrations/shared/aic-dir.cjs (existing)
function appendJsonl(projectRoot, filename, entry) {
  try {
    ensureAicDir(projectRoot);
    const filePath = path.join(projectRoot, ".aic", filename);
    fs.appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // non-fatal, do not throw
  }
}
```

Call shape: `appendJsonl(projectRoot, filename, entry)` where `entry` is a plain object (aic-dir stringifies it).

## Dependent Types

None — CommonJS; projectRoot and filename are strings, entry is a JSON-serializable object.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Migrate prompt-log.cjs

In `integrations/shared/prompt-log.cjs`: add `const { appendJsonl } = require("./aic-dir.cjs");` at the top (with other requires). In `appendPromptLog`, after all validation, replace the block that sets `logPath`, calls `fs.mkdirSync(path.dirname(logPath), { recursive: true, mode: 0o700 })`, and `fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8")` inside try/catch with a single call: `appendJsonl(projectRoot, "prompt-log.jsonl", entry);`. Remove the `logPath` variable and the try/catch block used only for the append. Remove `fs` and `path` from the top-level requires; they are unused after the replacement.

**Verify:** `appendPromptLog` writes one JSON line to `projectRoot/.aic/prompt-log.jsonl`; no direct `fs.appendFileSync` or `fs.mkdirSync` for that path in this file.

### Step 2: Migrate session-log.cjs

In `integrations/shared/session-log.cjs`: add `const { appendJsonl } = require("./aic-dir.cjs");` at the top. In `appendSessionLog`, after all validation, replace the block that sets `logPath`, calls `fs.mkdirSync(path.dirname(logPath), { recursive: true, mode: 0o700 })`, and `fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8")` inside try/catch with a single call: `appendJsonl(projectRoot, "session-log.jsonl", entry);`. Remove the `logPath` variable and the try/catch used only for the append. Remove `fs` and `path` from the top-level requires; they are unused after the replacement.

**Verify:** `appendSessionLog` writes one JSON line to `projectRoot/.aic/session-log.jsonl`; no direct `fs.appendFileSync` or `fs.mkdirSync` for that path in this file.

### Step 3: Migrate session-model-cache.cjs

In `integrations/shared/session-model-cache.cjs`: add `const { appendJsonl } = require("./aic-dir.cjs");` at the top. In `writeSessionModelCache`, replace the block that sets `filePath`, calls `fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })`, builds `entry` as `JSON.stringify({ c, m, e, timestamp: ts })`, and `fs.appendFileSync(filePath, entry + "\n", "utf8")` inside try/catch with: build an object `const entryObj = { c: typeof conversationId === "string" ? conversationId.trim() : "", m: modelId, e: editorId, timestamp: ts };` (reuse existing `ts` logic), then call `appendJsonl(projectRoot, "session-models.jsonl", entryObj);`. Remove the `filePath` variable and the try/catch used only for the append. Keep `path` and `fs` for `readSessionModelCache` (path.join and fs.readFileSync); do not remove them.

**Verify:** `writeSessionModelCache` writes one JSON line to `projectRoot/.aic/session-models.jsonl` via `appendJsonl`; no direct `fs.appendFileSync` or `fs.mkdirSync` for that path in this file.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

**Verify:** No test failures; integrations/shared/__tests__/prompt-log.test.cjs, session-log.test.cjs, session-model-cache.test.cjs and any integration tests that use these modules pass.

## Tests

| Test case | Description |
| --------- | ----------- |
| Existing prompt-log tests | prompt-log.test.cjs — appendPromptLog writes valid JSONL; unchanged behavior |
| Existing session-log tests | session-log.test.cjs — appendSessionLog writes valid JSONL; unchanged behavior |
| Existing session-model-cache tests | session-model-cache.test.cjs — writeSessionModelCache writes valid JSONL; unchanged behavior |
| Existing aic-dir tests | aic-dir.test.cjs — appendJsonl behavior unchanged |

No new test file or test cases; regression is covered by existing tests.

## Acceptance Criteria

- [ ] All three files modified per Files table
- [ ] Each file uses `appendJsonl(projectRoot, "<filename>.jsonl", entry)` for the write; no inline `fs.mkdirSync` or `fs.appendFileSync` for .aic/*.jsonl in those files
- [ ] Unused `fs`/`path` requires removed from each file
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all pass (including integrations/shared/__tests__/ and integrations/claude/__tests__/, integrations/cursor/__tests__/ as relevant)
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
