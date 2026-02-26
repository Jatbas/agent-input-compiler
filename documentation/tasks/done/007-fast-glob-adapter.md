# Task 007: FastGlobAdapter

> **Status:** Done
> **Phase:** D (Adapters)
> **Layer:** adapter (core interface + adapter)
> **Depends on:** Phase A, B, C (Done)

## Goal

Provide a single adapter for the fast-glob library behind a core GlobProvider interface so file discovery is abstracted and no other code imports fast-glob.

## Architecture Notes

- One adapter per external library; interface in `core/interfaces/`, implementation in `shared/src/adapters/`. Add fast-glob to ESLint restricted imports except for the adapter file.
- Use branded types `AbsolutePath` and `RelativePath` from `shared/src/core/types/paths.js`. GlobProvider returns paths matching patterns only; ignore filtering is separate (IgnoreAdapter). ADR-007/008 do not apply (no IDs or timestamps).
- Adapter receives no Clock; no date usage. Node `path` is allowed inside this adapter (I/O boundary).

## Files

| Action | Path                                                                         |
| ------ | ---------------------------------------------------------------------------- |
| Create | `shared/src/core/interfaces/glob-provider.interface.ts`                      |
| Create | `shared/src/adapters/fast-glob-adapter.ts`                                   |
| Create | `shared/src/adapters/__tests__/fast-glob-adapter.test.ts`                    |
| Modify | `eslint.config.mjs` (restrict fast-glob import to fast-glob-adapter.ts only) |

## Interface / Signature

```typescript
// shared/src/core/interfaces/glob-provider.interface.ts
import type { AbsolutePath } from "#core/types/paths.js";
import type { RelativePath } from "#core/types/paths.js";

export interface GlobProvider {
  find(patterns: readonly string[], cwd: AbsolutePath): readonly RelativePath[];
}
```

```typescript
// shared/src/adapters/fast-glob-adapter.ts
import type { GlobProvider } from "#core/interfaces/glob-provider.interface.js";
import type { AbsolutePath, RelativePath } from "#core/types/paths.js";

export class FastGlobAdapter implements GlobProvider {
  constructor() {}
  find(patterns: readonly string[], cwd: AbsolutePath): readonly RelativePath[] { ... }
}
```

Implement using fast-glob sync API: call `sync(patterns, { cwd })`, then convert each result to relative path with `path.relative(cwd, p)` and `toRelativePath(...)`.

## Dependent Types

None — only primitive branded types used (`AbsolutePath`, `RelativePath`). Use `toRelativePath` from `#core/types/paths.js` for conversion.

## Config Changes

- **package.json:** fast-glob already at 3.3.3; no change.
- **eslint.config.mjs:** Add the following block after the adapter boundary block and before the system-clock exemption. In flat config a later block that matches the same files replaces the rule, so this block must repeat all adapter-boundary paths and patterns and add fast-glob (so other adapter files keep full restrictions).

```javascript
{
  files: ["shared/src/adapters/**/*.ts"],
  ignores: ["shared/src/adapters/fast-glob-adapter.ts"],
  rules: {
    "no-restricted-imports": ["error", {
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
          name: "fast-glob",
          message: "Only fast-glob-adapter.ts may import fast-glob.",
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
    }],
  },
},
```

## Steps

### Step 1: Add GlobProvider interface

Create `shared/src/core/interfaces/glob-provider.interface.ts` with the interface in the Interface / Signature section. There is no barrel file in `shared/src/core/interfaces`; do not add one.

**Verify:** `pnpm typecheck` passes.

### Step 2: Add ESLint restriction for fast-glob

In `eslint.config.mjs`, add the block from Config Changes so that only `shared/src/adapters/fast-glob-adapter.ts` may import from `fast-glob`. Insert it after the adapter boundary block and before the system-clock exemption.

**Verify:** Run `pnpm lint` — passes with zero errors.

### Step 3: Implement FastGlobAdapter

Create `shared/src/adapters/fast-glob-adapter.ts`. Implement `GlobProvider.find`: the interface returns `readonly RelativePath[]` (sync), so use fast-glob sync API only. Call `sync(patterns, { cwd })` from `fast-glob` (default import). Convert each returned path to relative with `path.relative(cwd, absolutePath)` and `toRelativePath(...)`; return as `readonly RelativePath[]`. Use Node `path` only inside this adapter.

**Verify:** `pnpm typecheck` passes.

### Step 4: Unit tests

Create `shared/src/adapters/__tests__/fast-glob-adapter.test.ts`. Add test cases: find with empty patterns returns []; find with matching pattern returns relative paths under cwd; find with negation pattern excludes matching files; find returns deterministic order (same input gives the same output order across calls); find with non-existent cwd propagates (sync throws; assert error is not swallowed). Use a temp directory and fixture files for deterministic paths.

**Verify:** `pnpm test -- shared/src/adapters/__tests__/fast-glob-adapter.test.ts` passes.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass, zero warnings.

## Tests

| Test case             | Description                                                      |
| --------------------- | ---------------------------------------------------------------- |
| find empty patterns   | Returns []                                                       |
| find matching pattern | Returns relative paths under cwd                                 |
| find with negation    | Excluded paths not in result                                     |
| find deterministic    | Same input gives same output order across calls                  |
| find non-existent cwd | Error propagates when sync throws; assert error is not swallowed |

## Acceptance Criteria

- [ ] GlobProvider interface in core, FastGlobAdapter in adapters
- [ ] fast-glob only imported in fast-glob-adapter.ts
- [ ] All test cases pass
- [ ] `pnpm lint` and `pnpm typecheck` clean
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected, append `## Blocked` with what you tried, what went wrong, and what decision you need. Stop and report.
