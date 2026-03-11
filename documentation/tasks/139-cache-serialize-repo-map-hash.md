# Task 139: Cache serializeRepoMap hash per repo map instance

> **Status:** Pending
> **Phase:** Y (Object Allocation & Computation Reduction)
> **Layer:** pipeline
> **Depends on:** —

## Goal

Cache the file-tree hash per `RepoMap` instance in `CompilationRunner` using a `WeakMap<RepoMap, string>` so that repeat compilations with the same repo map reference (from `WatchingRepoMapSupplier` until it invalidates) skip repeated `serializeRepoMap` and `stringHasher.hash` work.

## Architecture Notes

- ADR/hexagonal: pipeline has no Node APIs; `WeakMap` is a JS built-in and is allowed.
- Single-file modification to existing class; no new interface. Public API of `CompilationRunner` unchanged.
- Cache is per runner instance so it does not outlive the runner; no cross-request leakage.
- Max 2 methods per class (pipeline rule): `run` + new private `getRepoMapHash`.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `shared/src/pipeline/compilation-runner.ts` |
| Modify | `shared/src/pipeline/__tests__/compilation-runner.test.ts` |

## Interface / Signature

```typescript
// Interface unchanged — shared/src/core/interfaces/compilation-runner.interface.ts
import type { CompilationRequest } from "@jatbas/aic-core/core/types/compilation-types.js";
import type { CompilationMeta } from "@jatbas/aic-core/core/types/compilation-types.js";
import type { UUIDv7 } from "@jatbas/aic-core/core/types/identifiers.js";

export interface CompilationRunner {
  run(request: CompilationRequest): Promise<{
    compiledPrompt: string;
    meta: CompilationMeta;
    compilationId: UUIDv7;
  }>;
}
```

```typescript
// Class: add private field and private method; run() uses getRepoMapHash
export class CompilationRunner implements ICompilationRunner {
  private readonly repoMapHashCache = new WeakMap<RepoMap, string>();

  constructor(
    private readonly deps: PipelineStepsDeps,
    private readonly clock: Clock,
    private readonly cacheStore: CacheStore,
    private readonly configStore: ConfigStore,
    private readonly stringHasher: StringHasher,
    private readonly guardStore: GuardStore,
    private readonly compilationLogStore: CompilationLogStore,
    private readonly idGenerator: IdGenerator,
    private readonly agenticSessionState: AgenticSessionState | null,
  ) {}

  private getRepoMapHash(repoMap: RepoMap): string {
    const cached = this.repoMapHashCache.get(repoMap);
    if (cached !== undefined) return cached;
    const serialized = serializeRepoMap(repoMap);
    const hash = this.stringHasher.hash(serialized);
    this.repoMapHashCache.set(repoMap, hash);
    return hash;
  }

  async run(
    request: CompilationRequest,
  ): Promise<{ compiledPrompt: string; meta: CompilationMeta; compilationId: UUIDv7 }> {
    const repoMap = await this.deps.repoMapSupplier.getRepoMap(request.projectRoot);
    const fileTreeHash = this.getRepoMapHash(repoMap);
    // ... rest unchanged
  }
}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// shared/src/core/types/repo-map.ts — used as WeakMap key and passed to serializeRepoMap
export interface RepoMap {
  readonly root: AbsolutePath;
  readonly files: readonly FileEntry[];
  readonly totalFiles: number;
  readonly totalTokens: TokenCount;
}
```

### Tier 1 — signature + path

| Type | Path | Members | Purpose |
| ------ | ----- | ------- | ------- |
| `StringHasher` | `shared/src/core/interfaces/string-hasher.interface.ts` | 1 | hash(input: string): string |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add repoMapHashCache, getRepoMapHash, and use in run()

In `shared/src/pipeline/compilation-runner.ts`:

1. Add private field: `private readonly repoMapHashCache = new WeakMap<RepoMap, string>();` on the class (after the constructor closing brace, before `async run`).
2. Add private method `getRepoMapHash(repoMap: RepoMap): string`: call `this.repoMapHashCache.get(repoMap)`; if result is not `undefined`, return it. Otherwise assign `serializeRepoMap(repoMap)` to a const, assign `this.stringHasher.hash(serialized)` to a const, call `this.repoMapHashCache.set(repoMap, hash)`, return hash.
3. In `run()`, replace the line `const fileTreeHash = this.stringHasher.hash(serializeRepoMap(repoMap));` with `const fileTreeHash = this.getRepoMapHash(repoMap);`.

**Verify:** `pnpm typecheck` passes. `pnpm lint` passes for `shared/src/pipeline/compilation-runner.ts`.

### Step 2: Add test cache_hit_same_repo_map_reference

In `shared/src/pipeline/__tests__/compilation-runner.test.ts`:

Add a test case named `cache_hit_same_repo_map_reference`. Build a minimal `RepoMap` and a `CompilationRunner` with: `repoMapSupplier.getRepoMap` mocked to resolve with that same `RepoMap` instance for two consecutive calls (same `projectRoot`); `stringHasher.hash` mocked to count invocations and return a fixed string. Call `runner.run(request)` twice with the same request shape. Assert that the mock for `stringHasher.hash` was called exactly once (second run uses the cached hash).

**Verify:** `pnpm test shared/src/pipeline/__tests__/compilation-runner.test.ts` passes including the new test.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| cache_hit_same_repo_map_reference | Same RepoMap reference used for two run() calls; stringHasher.hash invoked once (cache hit on second call) |

## Acceptance Criteria

- [ ] compilation-runner.ts has private field repoMapHashCache and private method getRepoMapHash; run() uses getRepoMapHash(repoMap) for fileTreeHash
- [ ] Test cache_hit_same_repo_map_reference exists and passes
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` in pipeline
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
