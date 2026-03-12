# Task 147: Comprehensive default ignore patterns

> **Status:** Pending
> **Phase:** AB — File Discovery & Bootstrap Hardening
> **Layer:** adapter
> **Depends on:** —

## Goal

Add a shared default ignore-pattern list covering all supported languages and popular frameworks, keep repo-map and extension-scan in sync, and ensure both flows always reject paths that are in .gitignore (repo map already does; extension scan gains IgnoreProvider filtering).

## Architecture Notes

- ADR-009: validation at MCP/config boundary only; core/adapters trust branded types.
- Adapters may import from other adapter files; no new external library.
- Repo map already filters by IgnoreProvider after glob; extension scan (initLanguageProviders) will filter glob results by IgnoreProvider so paths in .gitignore never trigger loading a language provider.
- Single source of truth: DEFAULT_NEGATIVE_PATTERNS in default-ignore-patterns.ts; file-system-repo-map-supplier and init-language-providers both import it.

## Files

| Action | Path |
| ------ | ---- |
| Create | `shared/src/adapters/default-ignore-patterns.ts` |
| Create | `shared/src/adapters/__tests__/default-ignore-patterns.test.ts` |
| Create | `shared/src/adapters/__tests__/init-language-providers.test.ts` |
| Modify | `shared/src/adapters/file-system-repo-map-supplier.ts` (import DEFAULT_NEGATIVE_PATTERNS, remove local constant) |
| Modify | `shared/src/adapters/init-language-providers.ts` (add ignoreProvider param, use shared patterns + filter by .gitignore) |
| Modify | `shared/src/adapters/__tests__/file-system-repo-map-supplier.test.ts` (add default_patterns_cover_ecosystems) |
| Modify | `shared/src/integration/__tests__/real-project-integration.test.ts` (pass IgnoreAdapter to initLanguageProviders) |
| Modify | `shared/src/integration/__tests__/selection-quality-benchmark.test.ts` (pass IgnoreAdapter to initLanguageProviders) |
| Modify | `shared/src/integration/__tests__/token-reduction-benchmark.test.ts` (pass IgnoreAdapter to initLanguageProviders) |

## Constant specification (default-ignore-patterns.ts)

Export a single constant:

```typescript
export const DEFAULT_NEGATIVE_PATTERNS: readonly string[] = [
  "!**/node_modules/**",
  "!.git/**",
  "!**/.aic/**",
  "!**/dist/**",
  "!**/build/**",
  "!**/coverage/**",
  "!**/*.tsbuildinfo",
  "!.next/**",
  "!.nuxt/**",
  "!**/.vite/**",
  "!**/.astro/**",
  "!**/.output/**",
  "!**/.svelte-kit/**",
  "!**/.vercel/**",
  "!**/.netlify/**",
  "!**/.turbo/**",
  "!**/.parcel-cache/**",
  "!**/.cache/**",
  "!**/.eslintcache/**",
  "!**/.stylelintcache/**",
  "!**/.yarn/**",
  "!**/.pnpm-store/**",
  "!**/.nx/cache/**",
  "!**/__pycache__/**",
  "!**/.venv/**",
  "!**/venv/**",
  "!**/.mypy_cache/**",
  "!**/.tox/**",
  "!**/.pytest_cache/**",
  "!**/.ruff_cache/**",
  "!**/.hypothesis/**",
  "!**/htmlcov/**",
  "!**/*.egg-info/**",
  "!**/.eggs/**",
  "!**/staticfiles/**",
  "!**/instance/**",
  "!**/target/**",
  "!**/.gradle/**",
  "!**/.m2/**",
  "!**/.idea/**",
  "!**/*.iml",
  "!**/vendor/**",
  "!**/.bundle/**",
  "!**/vendor/bundle/**",
  "!**/.gem/**",
  "!**/tmp/**",
  "!**/log/**",
  "!**/.phpunit.result.cache",
  "!**/Pods/**",
  "!**/.build/**",
  "!**/.swiftpm/**",
  "!**/DerivedData/**",
  "!**/.dart_tool/**",
  "!**/.pub-cache/**",
  "!**/out/**",
  "!**/.svn/**",
  "!**/.hg/**",
  "!**/bower_components/**",
  "!**/.terraform/**",
  "!**/.stack-work/**",
];
```

## Function signature (init-language-providers)

initLanguageProviders gains a second required parameter:

```typescript
import type { IgnoreProvider } from "@jatbas/aic-core/core/interfaces/ignore-provider.interface.js";

export async function initLanguageProviders(
  projectRoot: string,
  ignoreProvider: IgnoreProvider,
): Promise<readonly LanguageProvider[]>
```

Internal helper projectHasExtension(projectRoot, ext, ignoreProvider): after glob.find() returns paths, filter with `paths.filter((p) => ignoreProvider.accepts(p, toAbsolutePath(projectRoot)))`; return `filtered.length > 0`. Use shared DEFAULT_NEGATIVE_PATTERNS plus a local EXTENSION_SCAN_SYSTEM_DIRS constant containing: `!.Trash/**`, `!Library/**`, `!$Recycle.Bin/**`, `!AppData/**`, `!.local/**`, `!.cache/**`, `!snap/**` for the glob patterns passed to glob.find.

## Dependent Types

### Tier 1 — signature + path

| Type | Path | Members | Purpose |
| ---- | ---- | ------- | ------- |
| `IgnoreProvider` | `shared/src/core/interfaces/ignore-provider.interface.ts` | 1 | accepts(relativePath, root): boolean |

### Tier 2 — path-only

| Type | Path | Factory |
| ---- | ---- | ------- |
| `AbsolutePath` | `shared/src/core/types/paths.ts` | `toAbsolutePath(raw)` |
| `RelativePath` | `shared/src/core/types/paths.ts` | `toRelativePath(raw)` |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create shared constant

Create `shared/src/adapters/default-ignore-patterns.ts` exporting DEFAULT_NEGATIVE_PATTERNS as a readonly string array with the exact entries listed in the Constant specification section (glob negation format `!**/.../**` or `!**/...`, deduplicated, one pattern per line).

**Verify:** File exists; export is `readonly string[]`; no imports from node or external packages.

### Step 2: Modify file-system-repo-map-supplier

Remove the local DEFAULT_NEGATIVE_PATTERNS constant. Add: `import { DEFAULT_NEGATIVE_PATTERNS } from "./default-ignore-patterns.js";`. Leave getRepoMap unchanged (it already uses this.globProvider.findWithStats and this.ignoreProvider.accepts).

**Verify:** file-system-repo-map-supplier.ts has no local DEFAULT_NEGATIVE_PATTERNS; it imports from default-ignore-patterns.js.

### Step 3: Modify init-language-providers

Add parameter `ignoreProvider: IgnoreProvider` to initLanguageProviders. Import DEFAULT_NEGATIVE_PATTERNS from default-ignore-patterns.js and type IgnoreProvider from core. Define EXTENSION_SCAN_SYSTEM_DIRS with entries: `!.Trash/**`, `!Library/**`, `!$Recycle.Bin/**`, `!AppData/**`, `!.local/**`, `!.cache/**`, `!snap/**`. In projectHasExtension: build glob patterns as `[\`**/*${ext}\`, ...DEFAULT_NEGATIVE_PATTERNS, ...EXTENSION_SCAN_SYSTEM_DIRS]`; call glob.find(); then filter the returned paths with `paths.filter((p) => ignoreProvider.accepts(p, toAbsolutePath(projectRoot)))`; return `filtered.length > 0`. Pass ignoreProvider from initLanguageProviders into projectHasExtension for each extension check.

**Verify:** initLanguageProviders(projectRoot, ignoreProvider) compiles; projectHasExtension filters by ignoreProvider.accepts before returning.

### Step 4: Modify real-project-integration.test.ts

Update the call to initLanguageProviders to pass a second argument: `new IgnoreAdapter()`. Add import for IgnoreAdapter from the adapters package.

**Verify:** initLanguageProviders(projectRoot, new IgnoreAdapter()) is called; test file compiles.

### Step 5: Modify selection-quality-benchmark.test.ts

Update the call to initLanguageProviders to pass a second argument: `new IgnoreAdapter()`. Add import for IgnoreAdapter.

**Verify:** initLanguageProviders(fixtureRoot, new IgnoreAdapter()) is called; test file compiles.

### Step 6: Modify token-reduction-benchmark.test.ts

Update the call to initLanguageProviders to pass a second argument: `new IgnoreAdapter()`. Add import for IgnoreAdapter.

**Verify:** initLanguageProviders(fixtureRoot, new IgnoreAdapter()) is called; test file compiles.

### Step 7: Add test default_patterns_cover_ecosystems

In file-system-repo-map-supplier.test.ts, add a test that imports DEFAULT_NEGATIVE_PATTERNS from default-ignore-patterns.js and asserts at least 8 ecosystems are covered: Node (pattern containing node_modules), Python (at least one of __pycache__, .venv, .pytest_cache), Rust (target), Java/Kotlin (.gradle or .m2), Go/PHP (vendor), Ruby (.bundle), iOS (Pods), Dart (.dart_tool or .pub-cache). Assert each category has at least one matching pattern in the array.

**Verify:** Test default_patterns_cover_ecosystems exists and passes.

### Step 8: Create default-ignore-patterns.test.ts

Create `shared/src/adapters/__tests__/default-ignore-patterns.test.ts`. Test default_ignore_patterns_non_empty_and_contains_required: import DEFAULT_NEGATIVE_PATTERNS; assert array length > 0; assert at least one pattern includes "node_modules"; at least one includes ".git"; at least one includes ".aic"; at least one includes "__pycache__"; at least one includes "target"; at least one includes ".gradle" or ".m2"; at least one includes "vendor"; at least one includes "Pods"; at least one includes ".dart_tool" or ".pub-cache"; at least one includes ".venv" or "venv".

**Verify:** default-ignore-patterns.test.ts exists; test default_ignore_patterns_non_empty_and_contains_required passes.

### Step 9: Create init-language-providers.test.ts with extension_scan_respects_gitignore

Create `shared/src/adapters/__tests__/init-language-providers.test.ts`. Test extension_scan_respects_gitignore: create a temp directory; write .gitignore with content "venv/"; create venv/foo.py; call initLanguageProviders(projectRoot, new IgnoreAdapter()) with projectRoot the temp dir; assert the returned array does not contain a Python provider: import PythonProvider and assert result.filter((p) => p instanceof PythonProvider).length === 0. Use toAbsolutePath for projectRoot. Clean up temp dir in afterEach.

**Verify:** init-language-providers.test.ts exists; test extension_scan_respects_gitignore passes.

### Step 10: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| default_patterns_cover_ecosystems | DEFAULT_NEGATIVE_PATTERNS includes at least one pattern per ecosystem (Node, Python, Rust, Java/Kotlin, Go/PHP, Ruby, iOS, Dart) — 8 ecosystems |
| default_ignore_patterns_non_empty_and_contains_required | Exported array is non-empty and contains required entries for node_modules, .git, .aic, __pycache__, target, .gradle/.m2, vendor, Pods, .dart_tool/.pub-cache, .venv/venv |
| extension_scan_respects_gitignore | With only a .py file inside a gitignored path (venv/), initLanguageProviders with IgnoreAdapter returns no Python provider |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] DEFAULT_NEGATIVE_PATTERNS exported from default-ignore-patterns.ts; file-system-repo-map-supplier and init-language-providers use it
- [ ] initLanguageProviders(projectRoot, ignoreProvider); extension scan filters paths by ignoreProvider.accepts
- [ ] All three integration tests pass IgnoreAdapter to initLanguageProviders
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
