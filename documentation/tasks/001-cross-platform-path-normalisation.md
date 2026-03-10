# Task 001: Cross-platform path normalisation (W01)

> **Status:** Pending
> **Phase:** W — Global Server & Per-Project Isolation
> **Layer:** core (interface) + adapter (implementation)
> **Depends on:** —

## Goal

Add a single abstraction for normalising project root paths so that DB writes and Map keys use a consistent form across platforms (trailing slash stripped, Windows drive letter lowercased). Delivered as a core interface and a node:path adapter; no callers yet (pure addition per impl-spec §W1).

## Architecture Notes

- ADR-010: branded type `AbsolutePath` for return; use `toAbsolutePath()` from core/types/paths.js.
- Hexagonal: core cannot use node:path (ESLint); interface in core, implementation in adapter. Only node-path-adapter.ts may import node:path.
- Design: Interface `ProjectRootNormaliser` with one method `normalise(raw: string): AbsolutePath`. Adapter uses `path.resolve(raw)`, strips trailing separator except for root (`/` or `C:\`), lowercases Windows drive letter; does not resolve symlinks.

## Files

| Action | Path |
| ------ | ---- |
| Create | `shared/src/core/interfaces/project-root-normaliser.interface.ts` |
| Create | `shared/src/adapters/node-path-adapter.ts` |
| Create | `shared/src/adapters/__tests__/node-path-adapter.test.ts` |
| Modify | `eslint.config.mjs` (add node:path restriction to adapters) |

## Interface / Signature

```typescript
// Interface — shared/src/core/interfaces/project-root-normaliser.interface.ts
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";

export interface ProjectRootNormaliser {
  normalise(raw: string): AbsolutePath;
}
```

```typescript
// Class — shared/src/adapters/node-path-adapter.ts
import path from "node:path";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { ProjectRootNormaliser } from "@jatbas/aic-core/core/interfaces/project-root-normaliser.interface.js";

export class NodePathAdapter implements ProjectRootNormaliser {
  constructor() {}

  normalise(raw: string): AbsolutePath {
    const resolved = path.resolve(raw);
    const isRoot =
      resolved === "/" ||
      (path.sep === "\\" && /^[A-Za-z]:\\$/.test(resolved));
    const withoutTrailing =
      isRoot || !resolved.endsWith(path.sep)
        ? resolved
        : resolved.slice(0, -path.sep.length);
    const driveLowered =
      path.sep === "\\" && /^[A-Z]:/.test(withoutTrailing)
        ? withoutTrailing.slice(0, 2).toLowerCase() + withoutTrailing.slice(2)
        : withoutTrailing;
    return toAbsolutePath(driveLowered);
  }
}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// AbsolutePath — shared/src/core/types/paths.ts (return type; adapter uses toAbsolutePath)
import type { Brand } from "./brand.js";
export type AbsolutePath = Brand<string, "AbsolutePath">;
export function toAbsolutePath(value: string): AbsolutePath;
```

### Tier 1 — signature + path

None.

### Tier 2 — path-only

| Type | Path | Factory |
| ---- | ---- | ------- |
| `AbsolutePath` | `shared/src/core/types/paths.ts` | `toAbsolutePath(raw)` |

## Config Changes

- **shared/package.json:** No change (node:path is Node built-in).
- **eslint.config.mjs:** Add a block after the adapter boundary block (before the tiktoken block): `files: ["shared/src/adapters/**/*.ts"]`, `ignores: ["shared/src/adapters/node-path-adapter.ts"]`, `no-restricted-imports` with paths array containing the same entries as the adapter boundary (better-sqlite3, zod) plus `{ name: "node:path", message: "Only node-path-adapter.ts may import node:path." }`, and the same patterns array as the adapter boundary (BAN_RELATIVE_PARENT, CLI/MCP/storage/pipeline groups).

## Steps

### Step 1: Create interface

Create `shared/src/core/interfaces/project-root-normaliser.interface.ts` with the Interface code block above (SPDX header, import of `AbsolutePath` from `@jatbas/aic-core/core/types/paths.js`, and the `ProjectRootNormaliser` interface with single method `normalise(raw: string): AbsolutePath`).

**Verify:** `pnpm typecheck` passes; the new file is included in the build.

### Step 2: Implement adapter

Create `shared/src/adapters/node-path-adapter.ts`. Import `path` from `node:path`, `toAbsolutePath` and type `AbsolutePath` from `@jatbas/aic-core/core/types/paths.js`, and type `ProjectRootNormaliser` from the new interface. Implement `NodePathAdapter` with no-arg constructor and `normalise(raw: string): AbsolutePath`. Use the sync API: call `path.resolve(raw)`. Then strip trailing path separator: if the result is exactly `/` (POSIX root) or matches `C:\` (Windows root with backslash), leave it; otherwise remove a trailing `path.sep`. On Windows (detect via `path.sep === "\\"`), if the resolved path matches `/^[A-Z]:/`, replace the first two characters with the lowercased drive letter so `C:` becomes `c:`. Return `toAbsolutePath(result)`. Do not call `path.realpathSync` or any symlink-resolving API.

**Verify:** `pnpm typecheck` passes.

### Step 3: ESLint node:path restriction

In `eslint.config.mjs`, insert a new config block after the adapter boundary block and before the "only tiktoken-adapter.ts may import tiktoken" block. Set `files: ["shared/src/adapters/**/*.ts"]`, `ignores: ["shared/src/adapters/node-path-adapter.ts"]`, and `rules["no-restricted-imports"]` to the same structure as the adapter boundary: paths array with the two existing entries (better-sqlite3, zod) plus `{ name: "node:path", message: "Only node-path-adapter.ts may import node:path." }`, and the same patterns array as the adapter boundary.

**Verify:** `pnpm lint` passes; `shared/src/adapters/node-path-adapter.ts` is the only adapter file that may import node:path.

### Step 4: Tests

Create `shared/src/adapters/__tests__/node-path-adapter.test.ts`. Instantiate `NodePathAdapter` and test: (1) **trailing_slash_stripped** — call `normalise` with a path ending in the platform separator (on POSIX use `/foo/bar/`), assert the result has no trailing separator. (2) **windows_drive_lowercased** — when `path.sep === "\\"`, call `normalise("C:\\project")` and assert the result starts with `c:\\`; when `path.sep !== "\\"`, wrap the windows_drive_lowercased test in `describe.skipIf(process.platform !== "win32")` so it runs only on Windows. (3) **already_normalised_unchanged** — call `normalise("/already/normal")` twice and assert both results are equal. (4) **root_path_not_stripped** — call `normalise("/")` and assert result is `"/"`; on Windows call `normalise("C:\\")` and assert result is `"c:\\"` with trailing backslash. (5) **posix_no_op** — on POSIX, call `normalise("/home/proj")` and assert the string is case-preserved (no lowercasing).

**Verify:** `pnpm test shared/src/adapters/__tests__/node-path-adapter.test.ts` passes.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ------------ |
| trailing_slash_stripped | Result has no trailing path separator |
| windows_drive_lowercased | On Windows, drive letter is lowercased |
| already_normalised_unchanged | Same input yields equal output |
| root_path_not_stripped | Root `/` or `C:\` is not stripped to empty |
| posix_no_op | POSIX path case preserved |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] Interface matches signature exactly
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` outside allowed files
- [ ] No `let` in production code (only `const`; control flags in imperative closures are the sole exception)
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
