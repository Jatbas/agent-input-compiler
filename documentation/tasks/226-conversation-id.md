# Task 226: Extract shared conversationId module

> **Status:** Pending
> **Phase:** AJ (Integration shared utilities)
> **Layer:** integrations/shared
> **Depends on:** —

## Goal

Create a single shared CJS module that extracts `conversationId` from Claude hook parsed stdin (`transcript_path` → `path.basename(transcriptPath, ".jsonl")` or null), so AJ05 can replace the duplicated 2-line pattern in 9 hook files.

## Architecture Notes

- Phase AJ (mvp-progress.md): extract shared utilities for projectRoot, conversationId, aic-dir, and JSONL append; all in `integrations/shared/` as CommonJS.
- Same structural pattern as `resolve-project-root.cjs`: SPDX header, `require("path")`, one exported function, `module.exports = { fn }`.
- Input shape: `parsed?.transcript_path ?? parsed?.input?.transcript_path ?? null` covers both standard hooks and inject-conversation-id (top/input). Falsy transcriptPath (null, undefined, "") → return null.
- No new npm dependency; Node built-in `path` only. knip ignore entries required for new CJS files (same as resolve-project-root).

## Files

| Action | Path |
| ------ | ---- |
| Create | `integrations/shared/conversation-id.cjs` |
| Create | `integrations/shared/__tests__/conversation-id.test.cjs` |
| Modify | `knip.json` (add ignore entries for the two new files) |

## Interface / Signature

No core interface. Single exported function:

```javascript
// integrations/shared/conversation-id.cjs
function conversationIdFromTranscriptPath(parsed) {
  const transcriptPath = parsed == null
    ? null
    : (parsed.transcript_path ?? parsed.input?.transcript_path ?? null);
  const trimmed = typeof transcriptPath === "string" ? transcriptPath.trim() : "";
  return trimmed.length > 0 ? path.basename(trimmed, ".jsonl") : null;
}
```

```javascript
module.exports = { conversationIdFromTranscriptPath };
```

## Dependent Types

Not applicable — CJS layer; `parsed` is JSON-parsed stdin (object with optional keys). No branded types.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.
- **knip.json:** Add to `ignore` array (after existing `integrations/shared/__tests__/resolve-project-root.test.cjs`): `"integrations/shared/conversation-id.cjs"`, `"integrations/shared/__tests__/conversation-id.test.cjs"`.

## Steps

### Step 1: Create conversation-id.cjs

In `integrations/shared/conversation-id.cjs`: SPDX header (Apache-2.0, Copyright AIC Contributors), `const path = require("path");`, then implement `conversationIdFromTranscriptPath(parsed)`:

- If `parsed == null`, return `null`.
- Else set `transcriptPath = parsed.transcript_path ?? parsed.input?.transcript_path ?? null`.
- If `transcriptPath` is not a string or is empty after trim, return `null`.
- Return `path.basename(transcriptPath.trim(), ".jsonl")`.

Export: `module.exports = { conversationIdFromTranscriptPath };`

**Verify:** File exists; `node -e "const m = require('./integrations/shared/conversation-id.cjs'); console.log(m.conversationIdFromTranscriptPath({ transcript_path: '/x/conv-123.jsonl' }) === 'conv-123')"` from repo root prints `true`.

### Step 2: Create __tests__/conversation-id.test.cjs

In `integrations/shared/__tests__/conversation-id.test.cjs`: use same CJS test style as `resolve-project-root.test.cjs` (assert, require the module, named test functions, run in loop). Test cases:

- `from_transcript_path_top_level`: `conversationIdFromTranscriptPath({ transcript_path: "/dir/conv-uuid.jsonl" })` → `"conv-uuid"`.
- `from_transcript_path_input`: `conversationIdFromTranscriptPath({ input: { transcript_path: "/dir/abc.jsonl" } })` → `"abc"`.
- `null_when_missing`: `conversationIdFromTranscriptPath({})` → `null`.
- `null_when_parsed_null`: `conversationIdFromTranscriptPath(null)` → `null`.
- `null_when_empty_string`: `conversationIdFromTranscriptPath({ transcript_path: "" })` → `null`.

**Verify:** Run `node integrations/shared/__tests__/conversation-id.test.cjs` from repo root; all cases pass.

### Step 3: Add knip ignore entries

In `knip.json`, inside the `ignore` array, add after the line containing `resolve-project-root.test.cjs`:

- `"integrations/shared/conversation-id.cjs"`
- `"integrations/shared/__tests__/conversation-id.test.cjs"`

**Verify:** `pnpm knip` runs without new findings for these paths.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| from_transcript_path_top_level | parsed.transcript_path set → returns basename without .jsonl |
| from_transcript_path_input | parsed.input.transcript_path set → returns basename without .jsonl |
| null_when_missing | no transcript_path → returns null |
| null_when_parsed_null | conversationIdFromTranscriptPath(null) → null |
| null_when_empty_string | transcript_path "" → returns null |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] conversationIdFromTranscriptPath matches signature and behavior above
- [ ] All five test cases pass
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

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work, stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
