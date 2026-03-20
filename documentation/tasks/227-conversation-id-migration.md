# Task 227: Migrate all conversationId extraction sites (AJ05)

> **Status:** Pending
> **Phase:** AJ (Integration Shared Utilities Extraction)
> **Layer:** integrations
> **Depends on:** AJ02 (conversation-id.cjs)

## Goal

Replace the duplicated inline pattern that derives `conversationId` from `transcript_path` (in 9 Claude hook/plugin files) with a single call to `integrations/shared/conversation-id.cjs` so the behavior lives in one place and stays consistent.

## Architecture Notes

- **Root cause:** The same 2-line logic (read `transcript_path` from parsed, then `path.basename(..., ".jsonl")`) is inlined in 9 files. AJ02 already added `conversationIdFromTranscriptPath(parsed)` in `integrations/shared/conversation-id.cjs`.
- **Why this fix:** One implementation avoids drift and keeps trimming/edge-case handling (null, empty string) in one place. No behavior change — same inputs produce same conversationId.
- **Blast radius:** 9 files modified (5 under `integrations/claude/hooks/`, 4 under `integrations/claude/plugin/scripts/`). Zero test file content changes; existing tests assert conversationId from transcript_path and continue to pass. Fix-verification: assert no migrated file contains the inline pattern.

## Before/After Behavior

**Before (each of 9 files):**

```js
const transcriptPath = parsed.transcript_path ?? parsed.input?.transcript_path ?? null;
const conversationId = transcriptPath ? path.basename(transcriptPath, ".jsonl") : null;
```

(Variant in aic-inject-conversation-id.cjs: `top.transcript_path ?? input.transcript_path` — same logical shape; `parsed` has both top-level and `input`.)

**After:**

```js
const { conversationIdFromTranscriptPath } = require("../../shared/conversation-id.cjs"); // or ../../../shared for plugin
// ...
const conversationId = conversationIdFromTranscriptPath(parsed);
```

In files that use `path` only for this basename, remove the `path` require.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `integrations/claude/hooks/aic-session-start.cjs` (use shared conversationId; keep path) |
| Modify | `integrations/claude/hooks/aic-prompt-compile.cjs` (use shared conversationId; keep path) |
| Modify | `integrations/claude/hooks/aic-pre-compact.cjs` (use shared conversationId; remove path) |
| Modify | `integrations/claude/hooks/aic-subagent-inject.cjs` (use shared conversationId; remove path) |
| Modify | `integrations/claude/hooks/aic-inject-conversation-id.cjs` (use shared conversationId; remove path) |
| Modify | `integrations/claude/plugin/scripts/aic-session-start.cjs` (use shared conversationId; keep path) |
| Modify | `integrations/claude/plugin/scripts/aic-prompt-compile.cjs` (use shared conversationId; keep path) |
| Modify | `integrations/claude/plugin/scripts/aic-pre-compact.cjs` (use shared conversationId; remove path) |
| Modify | `integrations/claude/plugin/scripts/aic-subagent-inject.cjs` (use shared conversationId; remove path) |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Migrate hooks/aic-session-start.cjs

Add at top (with other requires): `const { conversationIdFromTranscriptPath } = require("../../shared/conversation-id.cjs");`  
Replace the two lines that set `transcriptPath` and `conversationId` with: `const conversationId = conversationIdFromTranscriptPath(parsed);`  
Keep the existing `path` require (used elsewhere in the file).

**Verify:** File contains `conversationIdFromTranscriptPath` and does not contain `path.basename(transcriptPath`.

### Step 2: Migrate hooks/aic-prompt-compile.cjs

Add: `const { conversationIdFromTranscriptPath } = require("../../shared/conversation-id.cjs");`  
Replace the two lines that set `transcriptPath` and `conversationId` with: `const conversationId = conversationIdFromTranscriptPath(parsed);`  
Keep the existing `path` require.

**Verify:** File contains `conversationIdFromTranscriptPath` and does not contain `path.basename(transcriptPath`.

### Step 3: Migrate hooks/aic-pre-compact.cjs

Add: `const { conversationIdFromTranscriptPath } = require("../../shared/conversation-id.cjs");`  
Replace the two lines that set `transcriptPath` and `conversationId` with: `const conversationId = conversationIdFromTranscriptPath(parsed);`  
Remove the `const path = require("path");` line (path is not used elsewhere).

**Verify:** File contains `conversationIdFromTranscriptPath`, no `path` require, no `path.basename(transcriptPath`.

### Step 4: Migrate hooks/aic-subagent-inject.cjs

Add: `const { conversationIdFromTranscriptPath } = require("../../shared/conversation-id.cjs");`  
Replace the two lines that set `transcriptPath` and `conversationId` with: `const conversationId = conversationIdFromTranscriptPath(parsed);`  
Remove the `const path = require("path");` line.

**Verify:** File contains `conversationIdFromTranscriptPath`, no `path` require, no `path.basename(transcriptPath`.

### Step 5: Migrate hooks/aic-inject-conversation-id.cjs

Add: `const { conversationIdFromTranscriptPath } = require("../../shared/conversation-id.cjs");`  
Replace the two lines that set `transcriptPath` and `conversationId` with: `const conversationId = conversationIdFromTranscriptPath(parsed);`  
Remove the `const path = require("path");` line.

**Verify:** File contains `conversationIdFromTranscriptPath`, no `path` require, no `path.basename(transcriptPath`.

### Step 6: Migrate plugin/scripts/aic-session-start.cjs

Add: `const { conversationIdFromTranscriptPath } = require("../../../shared/conversation-id.cjs");`  
Replace the two lines that set `transcriptPath` and `conversationId` with: `const conversationId = conversationIdFromTranscriptPath(parsed);`  
Keep the existing `path` require.

**Verify:** File contains `conversationIdFromTranscriptPath` and does not contain `path.basename(transcriptPath`.

### Step 7: Migrate plugin/scripts/aic-prompt-compile.cjs

Add: `const { conversationIdFromTranscriptPath } = require("../../../shared/conversation-id.cjs");`  
Replace the two lines that set `transcriptPath` and `conversationId` with: `const conversationId = conversationIdFromTranscriptPath(parsed);`  
Keep the existing `path` require.

**Verify:** File contains `conversationIdFromTranscriptPath` and does not contain `path.basename(transcriptPath`.

### Step 8: Migrate plugin/scripts/aic-pre-compact.cjs

Add: `const { conversationIdFromTranscriptPath } = require("../../../shared/conversation-id.cjs");`  
Replace the two lines that set `transcriptPath` and `conversationId` with: `const conversationId = conversationIdFromTranscriptPath(parsed);`  
Remove the `const path = require("path");` line.

**Verify:** File contains `conversationIdFromTranscriptPath`, no `path` require, no `path.basename(transcriptPath`.

### Step 9: Migrate plugin/scripts/aic-subagent-inject.cjs

Add: `const { conversationIdFromTranscriptPath } = require("../../../shared/conversation-id.cjs");`  
Replace the two lines that set `transcriptPath` and `conversationId` with: `const conversationId = conversationIdFromTranscriptPath(parsed);`  
Remove the `const path = require("path");` line.

**Verify:** File contains `conversationIdFromTranscriptPath`, no `path` require, no `path.basename(transcriptPath`.

### Step 10: Fix-verification and final checks

Run: `cd integrations/claude && node -e "
const fs = require('fs');
const path = require('path');
const files = [
  'hooks/aic-session-start.cjs','hooks/aic-prompt-compile.cjs','hooks/aic-pre-compact.cjs','hooks/aic-subagent-inject.cjs','hooks/aic-inject-conversation-id.cjs',
  'plugin/scripts/aic-session-start.cjs','plugin/scripts/aic-prompt-compile.cjs','plugin/scripts/aic-pre-compact.cjs','plugin/scripts/aic-subagent-inject.cjs'
];
let bad = 0;
for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  if (content.includes('path.basename(transcriptPath')) { console.error(f, 'still has inline pattern'); bad++; }
  if (!content.includes('conversationIdFromTranscriptPath')) { console.error(f, 'missing shared call'); bad++; }
}
process.exit(bad);
"`
Expected: exit 0.

Run existing tests: from repo root, `pnpm test -- integrations/claude/__tests__/aic-session-start.test.cjs integrations/claude/__tests__/aic-prompt-compile.test.cjs integrations/claude/__tests__/aic-pre-compact.test.cjs integrations/claude/__tests__/aic-subagent-inject.test.cjs` (or the project's test command for these files). Expected: all pass.

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| Existing session-start / prompt-compile / pre-compact / subagent-inject tests | Pass transcript_path in stdin; assert callAicCompile receives correct conversationId — unchanged; pass after migration |
| Fix-verification (Step 10) | No migrated file contains `path.basename(transcriptPath`; each file contains `conversationIdFromTranscriptPath` |

## Acceptance Criteria

- [ ] All 9 files modified per Files table
- [ ] Each file requires conversation-id.cjs and uses conversationIdFromTranscriptPath(parsed)
- [ ] No migrated file contains the inline pattern path.basename(transcriptPath
- [ ] path require removed in the 5 files that used path only for this basename
- [ ] Fix-verification script (Step 10) exits 0
- [ ] Existing integration tests for session-start, prompt-compile, pre-compact, subagent-inject pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work, stop. List the adaptations, report to the user, and re-evaluate before continuing.
