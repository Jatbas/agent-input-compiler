# Task 199: Strict field validation on cache reads

> **Status:** Pending
> **Phase:** AE (cache security)
> **Layer:** cross-layer (integrations, mcp, shared/maintenance)
> **Depends on:** AE01

## Goal

Add per-field validation at every cache read site for session-models.jsonl and for timestamp in prune: type check (typeof === "string"), max length (256 modelId, 128 conversationId, 20 editorId, 32 timestamp), printable-ASCII regex; silently skip bad rows so malicious or malformed cache lines cannot reach pipeline or tool responses.

## Architecture Notes

- ADR-009: Validation at boundary; cache reads are a trust boundary — validate before use. Hooks are CommonJS so validation is plain JS (no Zod); server and prune use shared TS validators.
- Two validator modules: shared/src/maintenance/cache-field-validators.ts (server + prune) and integrations/shared/cache-field-validators.cjs (hooks). CJS is a copy; comment in CJS: "Keep in sync with shared/src/maintenance/cache-field-validators.ts".
- Silently skip bad rows: no throw; continue loop or return null so invalid lines are never used.

## Files

| Action | Path |
| ------ | ---- |
| Create | `shared/src/maintenance/cache-field-validators.ts` |
| Create | `shared/src/maintenance/__tests__/cache-field-validators.test.ts` |
| Create | `integrations/shared/cache-field-validators.cjs` |
| Modify | `mcp/src/handlers/compile-handler.ts` (use shared validators, validate c/e in readSessionModelCache; skip row if invalid) |
| Modify | `shared/src/maintenance/prune-jsonl-by-timestamp.ts` (use isValidTimestamp in parseTimestamp) |
| Modify | `integrations/claude/hooks/aic-compile-helper.cjs` (require validators, validate c/e in read loop) |
| Modify | `integrations/claude/plugin/scripts/aic-compile-helper.cjs` (require validators, validate c/e in read loop) |
| Modify | `integrations/claude/hooks/aic-inject-conversation-id.cjs` (require validators, validate c/e in read loop) |
| Modify | `integrations/cursor/hooks/AIC-subagent-compile.cjs` (require validators, validate c/e in read loop) |

## Interface / Signature

Standalone exported functions (no interface; no class):

```typescript
// shared/src/maintenance/cache-field-validators.ts

export function isValidModelId(s: string): boolean;

export function isValidConversationId(s: string): boolean;

export function isValidEditorId(s: string): boolean;

export function isValidTimestamp(s: string): boolean;
```

Behavior (each returns true only when):
- **isValidModelId:** `typeof s === "string"`, trimmed length >= 1 and <= 256, `/^[\x20-\x7E]+$/.test(trimmed)`.
- **isValidConversationId:** `typeof s === "string"`, trimmed length >= 0 and <= 128, `/^[\x20-\x7E]+$/.test(trimmed)` (empty allowed).
- **isValidEditorId:** `typeof s === "string"`, trimmed length >= 1 and <= 20, `/^[\x20-\x7E]+$/.test(trimmed)`.
- **isValidTimestamp:** `typeof s === "string"`, length >= 1 and <= 32, `/^[\x20-\x7E]+$/.test(s)`.

## Dependent Types

Validators take `string` and return `boolean`. No domain types consumed. Not applicable for Tier 0/1/2 tables.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create shared cache-field-validators.ts

In `shared/src/maintenance/cache-field-validators.ts`, implement and export the four functions with the exact behavior above. Use a single regex constant `const PRINTABLE_ASCII = /^[\x20-\x7E]+$/`. For length checks use trimmed string for modelId, conversationId, editorId; use untrimmed for timestamp.

**Verify:** File exists; `pnpm typecheck` passes.

### Step 2: Create cache-field-validators.test.ts

In `shared/src/maintenance/__tests__/cache-field-validators.test.ts`, add tests: isValidModelId (valid 1–256 chars passes; empty fails; 257 fails; control char fails; non-string fails); isValidConversationId (0–128 passes; 129 fails); isValidEditorId (1–20 passes; 21 fails; empty fails); isValidTimestamp (1–32 passes; 33 fails; non-string fails).

**Verify:** `pnpm test shared/src/maintenance/__tests__/cache-field-validators.test.ts` passes.

### Step 3: Create integrations/shared/cache-field-validators.cjs

Create directory `integrations/shared/` if it does not exist. In `integrations/shared/cache-field-validators.cjs`, implement the same four functions in CommonJS (module.exports). Add at top: "Keep in sync with shared/src/maintenance/cache-field-validators.ts". Use same regex and length bounds.

**Verify:** File exists; no syntax errors (node -c integrations/shared/cache-field-validators.cjs).

### Step 4: Modify compile-handler.ts

In `mcp/src/handlers/compile-handler.ts`: import isValidModelId, isValidConversationId, isValidEditorId from `@jatbas/aic-core/maintenance/cache-field-validators.js`. Remove the local isValidModelId function. In readSessionModelCache, for each parsed entry validate: typeof entry.m === "string" && isValidModelId(entry.m), typeof entry.c === "string" && isValidConversationId(entry.c), typeof entry.e === "string" && isValidEditorId(entry.e). If any check fails, skip the row (continue). Keep existing logic that uses lastMatch/lastAny and returns lastMatch ?? lastAny.

**Verify:** `pnpm typecheck` passes; existing compile-handler tests pass.

### Step 5: Modify prune-jsonl-by-timestamp.ts

In `shared/src/maintenance/prune-jsonl-by-timestamp.ts`: import isValidTimestamp from `./cache-field-validators.js`. In parseTimestamp, after checking typeof obj.timestamp === "string", add: if (!isValidTimestamp(obj.timestamp)) return null. Return null on catch unchanged.

**Verify:** `pnpm typecheck` passes; existing prune tests pass.

### Step 6: Modify integrations/claude/hooks/aic-compile-helper.cjs

At top add: `const { isValidModelId, isValidConversationId, isValidEditorId } = require("../../shared/cache-field-validators.cjs");` Remove the local isValidModelId function. In readSessionModelCache, for each entry add validation: typeof entry.c === "string" && isValidConversationId(entry.c), typeof entry.e === "string" && isValidEditorId(entry.e). If any of m, c, e validation fails, skip the row.

**Verify:** Existing tests that exercise this hook pass; no require resolution errors.

### Step 7: Modify integrations/claude/plugin/scripts/aic-compile-helper.cjs

Add require for validators: from integrations/claude/plugin/scripts/ use `require("../../../shared/cache-field-validators.cjs")` (up to integrations, then shared). Remove local isValidModelId. In readSessionModelCache add same c/e validation; skip row if invalid.

**Verify:** No require resolution errors; manual smoke or existing tests pass.

### Step 8: Modify integrations/claude/hooks/aic-inject-conversation-id.cjs

Add require for validators (path from integrations/claude/hooks/: `../../shared/cache-field-validators.cjs`). Remove local isValidModelId. In readSessionModelCache add c/e validation; skip row if invalid.

**Verify:** No require resolution errors.

### Step 9: Modify integrations/cursor/hooks/AIC-subagent-compile.cjs

Add require for validators. Path from integrations/cursor/hooks/: `../../shared/cache-field-validators.cjs`. Remove local isValidModelId. In readSessionModelCache add c/e validation (this file compares entry.e === "cursor"); validate typeof entry.e === "string" && isValidEditorId(entry.e) and isValidConversationId(entry.c) before using; skip row if invalid.

**Verify:** No require resolution errors.

### Step 10: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| cache_field_validators | isValidModelId, isValidConversationId, isValidEditorId, isValidTimestamp: bounds and printable-ASCII; empty/overlong/control-char/non-string fail |
| regression_compile_handler | Existing compile-handler tests pass |
| regression_prune | Existing prune tests pass |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] Four validator functions match specified behavior
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] Invalid cache rows are skipped at every read site (no throw)
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
