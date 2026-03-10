# Task 124: ScopeRegistry class

> **Status:** Pending
> **Phase:** W — Global Server & Per-Project Isolation
> **Layer:** storage
> **Depends on:** W01 (Cross-platform path normalisation)

## Goal

Add a ScopeRegistry in storage that caches ProjectScope instances by normalised project root, with getOrCreate and close, so the server can later wire it (W07) to serve multiple projects from one process.

## Architecture Notes

- ADR-007: UUIDv7 not relevant (no new entity IDs). ADR-008: timestamps not relevant.
- ScopeRegistry lives in storage; it uses createProjectScope and closeDatabase from storage and injects ProjectRootNormaliser (W01) for key normalisation. No node:fs/node:path in scope-registry.ts.
- Design: inject ProjectRootNormaliser so Map key is consistent and tests can mock; close() calls closeDatabase for each scope then clears the Map.

## Files

| Action | Path |
| ------ | ---- |
| Create | `shared/src/storage/scope-registry.ts` |
| Create | `shared/src/storage/__tests__/scope-registry.test.ts` |

## Interface / Signature

```typescript
// Public API per impl-spec §W06 (no separate core interface file)
getOrCreate(projectRoot: AbsolutePath): ProjectScope;
close(): void;
```

```typescript
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { ProjectScope } from "@jatbas/aic-core/storage/create-project-scope.js";
import type { ProjectRootNormaliser } from "@jatbas/aic-core/core/interfaces/project-root-normaliser.interface.js";
import { createProjectScope } from "@jatbas/aic-core/storage/create-project-scope.js";
import { closeDatabase } from "@jatbas/aic-core/storage/open-database.js";

export class ScopeRegistry {
  constructor(private readonly normaliser: ProjectRootNormaliser) {}

  getOrCreate(projectRoot: AbsolutePath): ProjectScope {
    const key = this.normaliser.normalise(projectRoot);
    const existing = this.scopes.get(key);
    if (existing !== undefined) return existing;
    const scope = createProjectScope(projectRoot);
    this.scopes.set(key, scope);
    return scope;
  }

  close(): void {
    for (const scope of this.scopes.values()) {
      closeDatabase(scope.db);
    }
    this.scopes.clear();
  }

  private readonly scopes = new Map<string, ProjectScope>();
}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// ProjectScope — return type of getOrCreate; close() uses scope.db
export interface ProjectScope {
  readonly db: ExecutableDb;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly cacheStore: CacheStore;
  readonly telemetryStore: TelemetryStore;
  readonly configStore: ConfigStore;
  readonly guardStore: GuardStore;
  readonly compilationLogStore: CompilationLogStore;
  readonly sessionTracker: SessionTracker;
  readonly fileTransformStore: FileTransformStore;
  readonly projectRoot: AbsolutePath;
}
```

Source: `shared/src/storage/create-project-scope.ts`

### Tier 1 — signature + path

| Type | Path | Members | Purpose |
| ---- | ---- | ------- | ------- |
| `ProjectRootNormaliser` | `shared/src/core/interfaces/project-root-normaliser.interface.ts` | 1 | normalise(raw: string): AbsolutePath — derive map key |

### Tier 2 — path-only

| Type | Path | Factory |
| ---- | ---- | ------- |
| `AbsolutePath` | `shared/src/core/types/paths.js` | `toAbsolutePath(raw)` |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Implement ScopeRegistry

Create `shared/src/storage/scope-registry.ts`. Add a class ScopeRegistry with constructor `(normaliser: ProjectRootNormaliser)`. Store a private `Map<string, ProjectScope>` as `private readonly scopes = new Map<string, ProjectScope>()`. Implement getOrCreate: compute key with `this.normaliser.normalise(projectRoot)`; if key is in the map return cached scope; else call `createProjectScope(projectRoot)`, set map key to that scope, return it. Implement close: iterate `this.scopes.values()`, call `closeDatabase(scope.db)` for each, then call `this.scopes.clear()`. Use only named imports from core types, project-root-normaliser interface, create-project-scope, and open-database.

**Verify:** File exists; `pnpm typecheck` passes.

### Step 2: Add tests

Create `shared/src/storage/__tests__/scope-registry.test.ts`. Use a mock ProjectRootNormaliser that returns a deterministic AbsolutePath for a given string (strip trailing slash and lowercase Windows drive letter). Tests: (1) same_path_same_instance — getOrCreate(path) twice with same path, assert same reference. (2) different_paths_different_instances — getOrCreate(pathA) and getOrCreate(pathB) with different paths, assert different references. (3) normalisation_trailing_slash — with a normaliser that strips trailing slash, getOrCreate(toAbsolutePath("/a/b")) and getOrCreate(toAbsolutePath("/a/b/")), assert same instance. (4) normalisation_drive_letter — with a normaliser that lowercases the path string, call getOrCreate for two paths that differ only by drive letter case and assert same instance; on POSIX use a mock that maps both inputs to the same key so the test runs. (5) close_releases_scopes — getOrCreate for two different paths, call close(), then getOrCreate for the first path again; assert the returned scope is a new object (different reference from the first) and that its db is usable: call scope.db.prepare("SELECT 1").get() and assert it returns a row. Use toAbsolutePath from core/types/paths for test paths. For tests that call createProjectScope, use a temp directory: mkdtempSync(join(tmpdir(), "aic-scope-registry-")) then toAbsolutePath(tmpDir).

**Verify:** `pnpm test shared/src/storage/__tests__/scope-registry.test.ts` passes.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| same_path_same_instance | Same path returns same scope reference |
| different_paths_different_instances | Different paths return different scope references |
| normalisation_trailing_slash | Trailing slash normalised to same key, same instance |
| normalisation_drive_letter | Drive letter case normalised to same key (Windows or mock) |
| close_releases_scopes | After close(), getOrCreate returns new scope and db is open |

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
