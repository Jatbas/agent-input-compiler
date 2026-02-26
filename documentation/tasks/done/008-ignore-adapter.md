# Task 008: IgnoreAdapter

> **Status:** Done
> **Phase:** D (Adapters)
> **Layer:** adapter (core interface + adapter)
> **Depends on:** Phase A, B, C (Done)

## Goal

Provide a single adapter for the ignore library behind a core IgnoreProvider interface so .gitignore-style filtering is abstracted and no other code imports ignore.

## Architecture Notes

- One adapter per external library; interface in `core/interfaces/`, implementation in `shared/src/adapters/`. Restrict `ignore` in the adapter boundary so only ignore-adapter.ts may import it.
- Project plan: `.gitignore`, `.dockerignore`, `.eslintignore` handled by `ignore` package. For this task load only `.gitignore` from root; .eslintignore is out of scope.
- Adapter receives no Clock; no date usage. Node `fs` and `path` are allowed inside this adapter (I/O boundary).
- Error paths (e.g. unreadable root or .gitignore) are out of scope; only the three test cases in the Tests table are required.

## Files

| Action | Path                                                                   |
| ------ | ---------------------------------------------------------------------- |
| Create | `shared/src/core/interfaces/ignore-provider.interface.ts`              |
| Create | `shared/src/adapters/ignore-adapter.ts`                                |
| Create | `shared/src/adapters/__tests__/ignore-adapter.test.ts`                 |
| Modify | `eslint.config.mjs` (restrict ignore import to ignore-adapter.ts only) |

## Interface / Signature

```typescript
// shared/src/core/interfaces/ignore-provider.interface.ts
import type { AbsolutePath, RelativePath } from "#core/types/paths.js";

export interface IgnoreProvider {
  accepts(relativePath: RelativePath, root: AbsolutePath): boolean;
}
```

`accepts(relativePath, root)` returns true if the path is not ignored (should be included in context). The adapter loads .gitignore from root and uses the ignore package; the library expects a pathname relative to the gitignore directory, so pass the RelativePath value to `.ignores()`.

```typescript
// shared/src/adapters/ignore-adapter.ts
import type { IgnoreProvider } from "#core/interfaces/ignore-provider.interface.js";
import type { AbsolutePath, RelativePath } from "#core/types/paths.js";

export class IgnoreAdapter implements IgnoreProvider {
  constructor() {}
  accepts(relativePath: RelativePath, root: AbsolutePath): boolean { ... }
}
```

## Dependent Types

None — only primitive branded types used (`AbsolutePath`, `RelativePath` from `#core/types/paths.js`).

## Config Changes

- **package.json:** ignore already at 7.0.4; no change.
- **eslint.config.mjs:** Add the following block after the adapter boundary block and before the system-clock exemption:

```javascript
{
  files: ["shared/src/adapters/**/*.ts"],
  ignores: ["shared/src/adapters/ignore-adapter.ts"],
  rules: {
    "no-restricted-imports": ["error", {
      paths: [{
        name: "ignore",
        message: "Only ignore-adapter.ts may import ignore."
      }]
    }]
  }
},
```

## Steps

### Step 1: Add IgnoreProvider interface

Create `shared/src/core/interfaces/ignore-provider.interface.ts` with the interface in the Interface / Signature section. There is no barrel file in `shared/src/core/interfaces`; do not add one.

**Verify:** `pnpm typecheck` passes.

### Step 2: Add ESLint restriction for ignore

In `eslint.config.mjs`, add the block from Config Changes after the adapter boundary block and before the system-clock exemption. That block restricts `ignore` for all adapter files except `ignore-adapter.ts`.

**Verify:** `pnpm lint` passes with zero errors.

### Step 3: Implement IgnoreAdapter

Create `shared/src/adapters/ignore-adapter.ts`. Implement `IgnoreProvider`. The interface returns `boolean` (sync); use the ignore package's sync API only. In `accepts(relativePath, root)`: if `.gitignore` exists at root, read it with `fs.readFileSync(path.join(root, '.gitignore'), 'utf8')`; if the file is missing, use empty string. Create the filter with `ignore().add(content)`. Return `!ig.ignores(relativePath)` — the library expects a pathname relative to the gitignore directory, so pass the RelativePath value. Use Node `fs` and `path` only inside this adapter.

**Verify:** `pnpm typecheck` passes.

### Step 4: Unit tests

Create `shared/src/adapters/__tests__/ignore-adapter.test.ts`. Add test cases: accepts when not ignored (path not in .gitignore returns true); accepts when ignored (path matching .gitignore returns false); missing .gitignore (all paths accepted). Use a temp directory with a .gitignore fixture.

**Verify:** `pnpm test -- shared/src/adapters/__tests__/ignore-adapter.test.ts` passes.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass, zero warnings.

## Tests

| Test case                | Description                            |
| ------------------------ | -------------------------------------- |
| accepts when not ignored | Path not in .gitignore returns true    |
| accepts when ignored     | Path matching .gitignore returns false |
| missing .gitignore       | All paths accepted                     |

## Acceptance Criteria

- [ ] IgnoreProvider interface in core, IgnoreAdapter in adapters
- [ ] ignore only imported in ignore-adapter.ts
- [ ] All test cases pass
- [ ] `pnpm lint` and `pnpm typecheck` clean
- [ ] Single-line comments only

## Blocked?

If during execution you encounter something unexpected, append `## Blocked` and stop.
