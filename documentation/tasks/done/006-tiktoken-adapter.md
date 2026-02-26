# Task 006: TiktokenAdapter

> **Status:** Done
> **Phase:** D (Adapters)
> **Layer:** adapter (core interface + adapter)
> **Depends on:** Phase A, B, C (Done)

## Goal

Provide a single adapter for the tiktoken library behind a core TokenCounter interface so all token counts use cl100k_base (ADR-003) with a word-count fallback when tiktoken is unavailable.

## Architecture Notes

- ADR-003: tiktoken cl100k_base for all token counting; fallback word_count × 1.3.
- One adapter per external library; interface in `core/interfaces/`, implementation in `shared/src/adapters/`. Add tiktoken to ESLint restricted imports for every path except the adapter file.
- Adapter must not use `Date.now()` or `new Date()`; no Clock needed for this adapter.

## Files

| Action | Path                                                                       |
| ------ | -------------------------------------------------------------------------- |
| Create | `shared/src/core/interfaces/token-counter.interface.ts`                    |
| Create | `shared/src/adapters/tiktoken-adapter.ts`                                  |
| Create | `shared/src/adapters/__tests__/tiktoken-adapter.test.ts`                   |
| Modify | `eslint.config.mjs` (restrict tiktoken import to tiktoken-adapter.ts only) |

## Interface / Signature

REQUIRED. Two code blocks: (1) interface copied verbatim from core, (2) class with constructor and all method signatures. Return types must match interface exactly.

```typescript
// shared/src/core/interfaces/token-counter.interface.ts
import type { TokenCount } from "#core/types/units.js";

export interface TokenCounter {
  countTokens(text: string): TokenCount;
}
```

```typescript
// shared/src/adapters/tiktoken-adapter.ts
import type { TokenCounter } from "#core/interfaces/token-counter.interface.js";
import type { TokenCount } from "#core/types/units.js";

export class TiktokenAdapter implements TokenCounter {
  constructor() {}
  countTokens(text: string): TokenCount { ... }
}
```

- Use tiktoken's sync API: call `encoding_for_model("gpt-4")` to get the encoder (cl100k_base), then `encoder.encode(text).length` for the count.
- If tiktoken fails to load or encode: return `toTokenCount(Math.ceil((text.split(/\s+/).length) * 1.3))` as fallback.

## Dependent Types

The adapter returns `TokenCount` and must use `toTokenCount` for the fallback. Definitions from `shared/src/core/types/`:

```typescript
// shared/src/core/types/brand.ts
declare const __brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [__brand]: B };
```

```typescript
// shared/src/core/types/units.ts (excerpt)
import { type Brand } from "./brand.js";

export type TokenCount = Brand<number, "TokenCount">;

export function toTokenCount(value: number): TokenCount {
  return value as TokenCount;
}
```

## Config Changes

REQUIRED. State "None" or show exact diffs. Use exact versions and blocks; no conditional wording (e.g. "add when absent").

- **shared/package.json:** tiktoken already at 1.0.21; no change.
- **eslint.config.mjs:** Add the following block after the adapter boundary block and before the system-clock exemption. It preserves all adapter-boundary paths and patterns and adds the tiktoken restriction (flat config replaces the rule for matching files, so the block must repeat the full list). Use the existing `BAN_RELATIVE_PARENT` constant from the config file:

```javascript
{
  files: ["shared/src/adapters/**/*.ts"],
  ignores: ["shared/src/adapters/tiktoken-adapter.ts"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "better-sqlite3",
            message: "SQL lives in storage/ only. Adapters don't use SQLite.",
          },
          {
            name: "zod",
            message: "Zod validates at boundaries only (MCP/CLI/config). See ADR-009.",
          },
          {
            name: "tiktoken",
            message: "Only tiktoken-adapter.ts may import tiktoken.",
          },
        ],
        patterns: [
          BAN_RELATIVE_PARENT,
          {
            group: ["@aic/cli", "@aic/cli/*", "**/cli/**"],
            message: "Adapters must not import CLI code.",
          },
          {
            group: ["@aic/mcp", "@aic/mcp/*", "**/mcp/**"],
            message: "Adapters must not import MCP code.",
          },
          {
            group: ["**/storage/**"],
            message: "Adapters must not import storage code.",
          },
          {
            group: ["**/pipeline/**"],
            message: "Adapters must not import pipeline code.",
          },
        ],
      },
    ],
  },
},
```

## Steps

Each step is one small action (2–5 minutes). Max 2 methods per step.

### Step 1: Add TokenCounter interface

Create `shared/src/core/interfaces/token-counter.interface.ts` with the interface in the Interface / Signature section. There is no barrel file in `shared/src/core/interfaces`; do not add one.

**Verify:** `pnpm typecheck` passes.

### Step 2: Add ESLint restriction for tiktoken

In `eslint.config.mjs`, add the block from Config Changes so that only `shared/src/adapters/tiktoken-adapter.ts` may import from `tiktoken`. Insert it after the adapter boundary block and before the system-clock exemption.

**Verify:** Run `pnpm lint` — passes with zero errors.

### Step 3: Implement TiktokenAdapter

Create `shared/src/adapters/tiktoken-adapter.ts`. Implement `TokenCounter`: the interface returns `TokenCount` (sync), so use tiktoken's sync API only. Call `encoding_for_model("gpt-4")` to get the encoder, then `encoder.encode(text).length` for the count. On any throw from tiktoken (load or encode), use word-count × 1.3 fallback: `toTokenCount(Math.ceil((text.split(/\s+/).length) * 1.3))`. Do not use `Date.now()` or `new Date()`.

**Verify:** `pnpm typecheck` passes.

### Step 4: Unit tests

Create `shared/src/adapters/__tests__/tiktoken-adapter.test.ts`. Test: (1) countTokens returns a TokenCount; (2) countTokens empty: empty string returns 0; (3) countTokens non-empty: non-empty string returns positive TokenCount; (4) countTokens deterministic: call countTokens with the same non-empty string twice and assert the two results are equal; (5) fallback: mock the tiktoken module so that `encoding_for_model` or `encode` throws, then assert the result equals `toTokenCount(Math.ceil(wordCount * 1.3))` for the same input.

**Verify:** `pnpm test -- shared/src/adapters/__tests__/tiktoken-adapter.test.ts` passes.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass, zero warnings.

## Tests

| Test case                 | Description                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| countTokens empty         | Empty string returns 0                                                                                   |
| countTokens non-empty     | Returns positive TokenCount                                                                              |
| countTokens deterministic | Same input gives same output                                                                             |
| fallback                  | Mock tiktoken to throw; assert result is word_count × 1.3 via `toTokenCount(Math.ceil(wordCount * 1.3))` |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] Interface matches signature exactly
- [ ] TokenCounter interface in core, TiktokenAdapter in adapters
- [ ] tiktoken only imported in tiktoken-adapter.ts (ESLint enforced)
- [ ] cl100k_base used; fallback word_count × 1.3 on tiktoken failure
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] No imports violating layer boundaries
- [ ] No `new Date()` or `Date.now()` in adapter
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section to this file with:
   - What you tried
   - What went wrong
   - What decision you need from the user
3. Report to the user and wait for guidance
