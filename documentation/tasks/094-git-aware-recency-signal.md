# Task 094: Git-aware recency signal

> **Status:** Pending
> **Phase:** P (Context Quality & Token Efficiency)
> **Layer:** adapter
> **Depends on:** —

## Goal

Provide last-modified timestamps from git log instead of filesystem mtime when building the repo map, so recency scoring in HeuristicSelector reflects commit time and is not skewed by formatters or installs.

## Architecture Notes

- ADR-008: timestamps as ISOTimestamp (YYYY-MM-DDTHH:mm:ss.sssZ). RecencyProvider returns ISOTimestamp | null.
- Hexagonal: core interface RecencyProvider; only git-recency-adapter.ts imports node:child_process (ESLint).
- DIP: FileSystemRepoMapSupplier receives optional RecencyProvider from composition root; fallback to stat.mtime when provider is absent or returns null.
- Use spawnSync with argument array so relativePath is not interpreted by a shell (no injection).

## Files

| Action | Path                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/core/interfaces/recency-provider.interface.ts`                                                                |
| Create | `shared/src/adapters/git-recency-adapter.ts`                                                                              |
| Create | `shared/src/adapters/__tests__/git-recency-adapter.test.ts`                                                               |
| Modify | `shared/src/adapters/file-system-repo-map-supplier.ts` (optional recencyProvider, tryBuildEntry uses it for lastModified) |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (wire GitRecencyAdapter into FileSystemRepoMapSupplier)                    |
| Modify | `eslint.config.mjs` (only git-recency-adapter.ts may import node:child_process)                                           |
| Modify | `shared/src/adapters/__tests__/file-system-repo-map-supplier.test.ts` (tests for recencyProvider usage and fallback)      |

## Interface / Signature

```typescript
// Interface — shared/src/core/interfaces/recency-provider.interface.ts
import type { AbsolutePath, RelativePath } from "#core/types/paths.js";
import type { ISOTimestamp } from "#core/types/identifiers.js";

export interface RecencyProvider {
  getLastModified(
    projectRoot: AbsolutePath,
    relativePath: RelativePath,
  ): ISOTimestamp | null;
}
```

```typescript
// Class — shared/src/adapters/git-recency-adapter.ts
import type { RecencyProvider } from "#core/interfaces/recency-provider.interface.js";
import type { AbsolutePath, RelativePath } from "#core/types/paths.js";
import type { ISOTimestamp } from "#core/types/identifiers.js";
import { toISOTimestamp } from "#core/types/identifiers.js";
import { spawnSync } from "node:child_process";

export class GitRecencyAdapter implements RecencyProvider {
  constructor() {}

  getLastModified(
    projectRoot: AbsolutePath,
    relativePath: RelativePath,
  ): ISOTimestamp | null {
    // spawnSync("git", ["-C", projectRoot, "log", "-1", "--format=%cI", "--", relativePath], { encoding: "utf8", maxBuffer: 1024 })
    // if result.status === 0 and result.stdout, return toISOTimestamp(result.stdout.trim()); else return null. try/catch return null.
  }
}
```

## Dependent Types

### Tier 0 — verbatim

Not required — interface and adapter use only Tier 2 types (AbsolutePath, RelativePath, ISOTimestamp) with standard factories.

### Tier 2 — path-only

| Type           | Path                                   | Factory               |
| -------------- | -------------------------------------- | --------------------- |
| `AbsolutePath` | `shared/src/core/types/paths.js`       | `toAbsolutePath(raw)` |
| `RelativePath` | `shared/src/core/types/paths.js`       | `toRelativePath(raw)` |
| `ISOTimestamp` | `shared/src/core/types/identifiers.js` | `toISOTimestamp(raw)` |

## Config Changes

- **shared/package.json:** No change. No new dependency; uses Node built-in node:child_process.
- **eslint.config.mjs:** Add a block after the ignore-adapter block so only git-recency-adapter.ts may import node:child_process. Same structure as the ignore-adapter block: `files: ["shared/src/adapters/**/*.ts"]`, `ignores: ["shared/src/adapters/git-recency-adapter.ts"]`, `paths`: all existing adapter-boundary paths (better-sqlite3, zod) plus `{ name: "node:child_process", message: "Only git-recency-adapter.ts may import node:child_process." }`, `patterns`: BAN_RELATIVE_PARENT, cli, mcp, storage, pipeline.

## Steps

### Step 1: Create RecencyProvider interface

Create `shared/src/core/interfaces/recency-provider.interface.ts` with the interface block from Interface / Signature above (RecencyProvider with getLastModified(projectRoot, relativePath) returning ISOTimestamp | null). Use named imports from #core/types/paths.js and #core/types/identifiers.js.

**Verify:** `pnpm typecheck` passes; file exists and exports RecencyProvider.

### Step 2: Create GitRecencyAdapter

Create `shared/src/adapters/git-recency-adapter.ts`. Implement RecencyProvider. Constructor takes no parameters. getLastModified: call spawnSync from node:child_process with `spawnSync("git", ["-C", projectRoot, "log", "-1", "--format=%cI", "--", relativePath], { encoding: "utf8", maxBuffer: 1024 })`. If result.status === 0 and result.stdout is non-empty, return toISOTimestamp(result.stdout.trim()); otherwise return null. Wrap in try/catch and return null on throw. Use spawnSync (not execSync) so the path is not passed through a shell.

**Verify:** `pnpm typecheck` passes; adapter implements RecencyProvider.

### Step 3: FileSystemRepoMapSupplier optional RecencyProvider

In `shared/src/adapters/file-system-repo-map-supplier.ts`: add optional third constructor parameter `recencyProvider?: RecencyProvider`. Change tryBuildEntry to accept `projectRoot: AbsolutePath` and `recencyProvider?: RecencyProvider` (add after relativePath). When building lastModified: if recencyProvider is defined, call `recencyProvider.getLastModified(projectRoot, relativePath)`; if that returns non-null use it, else use `toISOTimestamp(stat.mtime.toISOString())`; when recencyProvider is undefined use `toISOTimestamp(stat.mtime.toISOString())`. Update the reduce in getRepoMap to pass projectRoot and this.recencyProvider into tryBuildEntry.

**Verify:** Existing FileSystemRepoMapSupplier tests still pass (two-arg constructor, fallback to stat).

### Step 4: Wire GitRecencyAdapter in createFullPipelineDeps

In `shared/src/bootstrap/create-pipeline-deps.ts`: import GitRecencyAdapter from #adapters/git-recency-adapter.js. Where FileSystemRepoMapSupplier is constructed, pass a third argument: `new GitRecencyAdapter()`. So the call becomes `new FileSystemRepoMapSupplier(new FastGlobAdapter(), new IgnoreAdapter(), new GitRecencyAdapter())`.

**Verify:** `pnpm typecheck` passes; createFullPipelineDeps still returns PipelineStepsDeps with repoMapSupplier.

### Step 5: ESLint — only git-recency-adapter may import node:child_process

In `eslint.config.mjs`, add a new block immediately after the ignore-adapter block (the one with ignores: ignore-adapter, fast-glob-adapter, tiktoken-adapter). New block: `files: ["shared/src/adapters/**/*.ts"]`, `ignores: ["shared/src/adapters/git-recency-adapter.ts"]`, rules no-restricted-imports with paths array containing better-sqlite3, zod, and `{ name: "node:child_process", message: "Only git-recency-adapter.ts may import node:child_process." }`, and the same patterns array as the ignore-adapter block (BAN_RELATIVE_PARENT, cli, mcp, storage, pipeline). This restricts node:child_process to git-recency-adapter.ts only.

**Verify:** `pnpm lint` passes; no other adapter imports node:child_process.

### Step 6: GitRecencyAdapter tests

Create `shared/src/adapters/__tests__/git-recency-adapter.test.ts`. Implement: (1) git_returns_iso_timestamp_for_tracked_file: create temp dir, run git init, write a file, git add and commit, instantiate GitRecencyAdapter, call getLastModified(projectRoot, relativePath), assert result is non-null and matches ISO 8601 format: /^\d{4}-\d{2}-\d{2}T/. (2) git_returns_null_for_untracked_file: temp dir with git init, write file but do not add, call getLastModified, assert result is null. (3) git_returns_null_when_not_a_repo: temp dir without .git, write file, call getLastModified, assert result is null. Use node:fs and node:path only in test file; use toAbsolutePath and toRelativePath for branded types.

**Verify:** `pnpm test shared/src/adapters/__tests__/git-recency-adapter.test.ts` passes.

### Step 7: FileSystemRepoMapSupplier recency tests

In `shared/src/adapters/__tests__/file-system-repo-map-supplier.test.ts`: add test supplier_uses_recency_provider_when_provided: create temp dir and a file, mock GlobProvider and IgnoreProvider, mock RecencyProvider with getLastModified returning a fixed ISOTimestamp: toISOTimestamp("2020-01-01T00:00:00.000Z"), construct FileSystemRepoMapSupplier with those mocks and the mock RecencyProvider as third argument, call getRepoMap(projectRoot), assert the single entry's lastModified equals the fixed timestamp. Add test supplier_falls_back_to_stat_when_provider_returns_null: same setup but RecencyProvider.getLastModified returns null, assert entry.lastModified is a non-empty string (from stat).

**Verify:** `pnpm test shared/src/adapters/__tests__/file-system-repo-map-supplier.test.ts` passes.

### Step 8: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                              | Description                                                                                   |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| git_returns_iso_timestamp_for_tracked_file             | Git repo with committed file; getLastModified returns ISO timestamp                           |
| git_returns_null_for_untracked_file                    | Git repo, file not added; getLastModified returns null                                        |
| git_returns_null_when_not_a_repo                       | Dir without .git; getLastModified returns null                                                |
| supplier_uses_recency_provider_when_provided           | FileSystemRepoMapSupplier with mock RecencyProvider; entry.lastModified equals provider value |
| supplier_falls_back_to_stat_when_provider_returns_null | Mock RecencyProvider returns null; entry.lastModified from stat                               |

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
