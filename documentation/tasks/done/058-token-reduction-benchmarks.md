# Task 058: Token reduction benchmarks

> **Status:** Done
> **Phase:** Phase K — Quality & Benchmarks
> **Layer:** shared (integration test)
> **Depends on:** Selection quality benchmarks (task 057), Real-project integration tests (task 056), createFullPipelineDeps, CompilationRunner, createProjectScope, initLanguageProviders

## Goal

Enrich the benchmark fixture repo with transformer-exercisable content, then add token reduction benchmarks: for canonical task 1, run the full pipeline (CompilationRunner) against the fixture repo and assert that compiled token count and duration stay within committed baseline bounds (no >5% token increase, no >2× duration). Establishes the token-baseline pattern for Phase K; future Phase L transformer tasks use this benchmark to measure improvement and catch regressions.

## Architecture Notes

- One-off task: no adapter/storage/pipeline/composition-root recipe; structure follows MVP spec §5 Benchmark Suite and Phase K.
- Test reuses the same wiring as real-project-integration and selection-quality (createProjectScope, createFullPipelineDeps, initLanguageProviders, LoadConfigFromFile, applyConfigResult, rulePackProvider) with projectRoot set to fixture repo 1; builds CompilationRunner.
- Baseline lives in test/benchmarks/baseline.json. Shape: `{ "1": { "token_count": number, "duration_ms": number } }`. If no entry for task "1", the test runs compilation once and writes the result as the new baseline (MVP: first run establishes baseline).
- Pass criteria (MVP §5): no >5% token increase vs. baseline (tokensCompiled <= baseline.token*count * 1.05), no >2× compilation time (durationMs <= baseline.duration*ms * 2).
- Only canonical task 1 is in scope (fixture repos/1 exists; repos 2–10 do not exist yet).

### Fixture enrichment rationale

The current fixture repo 1 contains only 2 tiny files (~5 lines total, ~104 tokens). Phase L transformers (LicenseHeaderStripper, CommentStripper, JsonCompactor, LockFileSkipper, WhitespaceNormalizer, Base64InlineDataStripper) need content to exercise. Without enrichment, every transformer would measure 0 token reduction and the benchmark would be meaningless.

The enriched fixture adds realistic content that transformers target: license headers, inline comments, a `package.json` with formatting whitespace, a lock file stub, CSS with comments, and a configuration JSON file. This makes the baseline meaningful — future transformer tasks will see measurable token reduction when they run this benchmark.

After enrichment, `test/benchmarks/expected-selection/1.json` must be updated because the selection-quality benchmark checks the exact set of selected file paths.

## Files

| Action | Path                                                                                     |
| ------ | ---------------------------------------------------------------------------------------- |
| Modify | `test/benchmarks/repos/1/src/auth/service.ts` (add license header, comments, docstrings) |
| Modify | `test/benchmarks/repos/1/src/index.ts` (add license header, comments)                    |
| Create | `test/benchmarks/repos/1/package.json` (formatted JSON for JsonCompactor)                |
| Create | `test/benchmarks/repos/1/package-lock.json` (lock file stub for LockFileSkipper)         |
| Create | `test/benchmarks/repos/1/src/auth/config.json` (nested JSON config)                      |
| Create | `test/benchmarks/repos/1/src/styles.css` (CSS with comments for CommentStripper)         |
| Modify | `test/benchmarks/expected-selection/1.json` (update selectedPaths for new files)         |
| Create | `test/benchmarks/baseline.json`                                                          |
| Create | `shared/src/integration/__tests__/token-reduction-benchmark.test.ts`                     |

## Interface / Signature

N/A — integration test. The test wires CompilationRunner and calls `run(request)`; it does not implement a new interface.

Relevant types (for reference only):

- `CompilationRequest`: intent, projectRoot, modelId, editorId, configPath — shared/src/core/types/compilation-types.ts
- `CompilationRunner.run(request): Promise<{ compiledPrompt: string; meta: CompilationMeta; compilationId: UUIDv7 }>` — shared/src/core/interfaces/compilation-runner.interface.ts
- `CompilationMeta.tokensCompiled`: TokenCount (runtime number), `CompilationMeta.durationMs`: Milliseconds (runtime number)

## Dependent Types

Test uses existing types only. Tier 2 (path-only): AbsolutePath (toAbsolutePath), EDITOR_ID (from #core/types/enums.js). Request: intent "refactor auth module to use middleware pattern", projectRoot fixtureRoot, modelId null, editorId EDITOR_ID.GENERIC, configPath null.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change (test files under **/**tests**/** already have restricted rules relaxed; test/benchmarks/ already ignored).

## Steps

### Step 1: Enrich fixture repo with transformer-exercisable content

Modify and create files in `test/benchmarks/repos/1/` to provide content that Phase L transformers can act on. The intent is "refactor auth module to use middleware pattern" so files should relate to an auth module in a small TypeScript project.

**1a. Modify `test/benchmarks/repos/1/src/auth/service.ts`** — add a license header (for LicenseHeaderStripper), inline comments (for CommentStripper), a multi-line JSDoc block, and expand the auth logic to ~40 lines:

```typescript
// MIT License
// Copyright (c) 2024 Acme Corp
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction.

// Authentication service — handles token validation and middleware setup

/**
 * Validates a JWT token and returns the decoded payload.
 * @param token - The JWT string to validate
 * @returns The decoded user payload or null if invalid
 */
export function validateToken(token: string): { userId: string; role: string } | null {
  // Check token format before processing
  if (!token.startsWith("Bearer ")) {
    return null;
  }

  // Extract the actual token value
  const raw = token.slice(7);

  // Simple validation — in production this would verify signature
  if (raw.length < 10) {
    return null;
  }

  return { userId: "user-123", role: "admin" };
}

/**
 * Creates an authentication middleware function.
 * @param requiredRole - The minimum role required for access
 * @returns A middleware function that checks authorization
 */
export function createAuthMiddleware(requiredRole: string) {
  // Return a middleware closure that validates incoming requests
  return (req: { headers: { authorization?: string } }) => {
    const authHeader = req.headers.authorization;

    // No auth header means unauthorized
    if (!authHeader) {
      return { authorized: false, error: "Missing authorization header" };
    }

    // Validate the token
    const payload = validateToken(authHeader);

    // Check if token is valid and role matches
    if (!payload || payload.role !== requiredRole) {
      return { authorized: false, error: "Insufficient permissions" };
    }

    return { authorized: true, userId: payload.userId };
  };
}
```

**1b. Modify `test/benchmarks/repos/1/src/index.ts`** — add license header and comments:

```typescript
// MIT License
// Copyright (c) 2024 Acme Corp

// Main entry point — re-exports auth module for external consumption

import { validateToken, createAuthMiddleware } from "./auth/service";

// Public API
export { validateToken, createAuthMiddleware };

// Default middleware for admin routes
export const adminMiddleware = createAuthMiddleware("admin");
```

**1c. Create `test/benchmarks/repos/1/package.json`** — formatted JSON (for JsonCompactor):

```json
{
  "name": "benchmark-fixture-1",
  "version": "1.0.0",
  "description": "Fixture project for AIC benchmark suite — auth middleware refactoring",
  "main": "src/index.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest",
    "lint": "eslint src/"
  },
  "dependencies": {
    "express": "4.18.2"
  },
  "devDependencies": {
    "typescript": "5.4.5",
    "vitest": "1.6.0",
    "eslint": "9.0.0"
  },
  "keywords": ["auth", "middleware", "jwt"]
}
```

**1d. Create `test/benchmarks/repos/1/package-lock.json`** — lock file stub (for LockFileSkipper; ~20 lines is enough to trigger the transformer):

```json
{
  "name": "benchmark-fixture-1",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "benchmark-fixture-1",
      "version": "1.0.0",
      "dependencies": {
        "express": "4.18.2"
      }
    },
    "node_modules/express": {
      "version": "4.18.2",
      "resolved": "https://registry.npmjs.org/express/-/express-4.18.2.tgz",
      "integrity": "sha512-abc123def456",
      "dependencies": {
        "accepts": "~1.3.8",
        "body-parser": "1.20.1"
      }
    }
  }
}
```

**1e. Create `test/benchmarks/repos/1/src/auth/config.json`** — nested JSON configuration:

```json
{
  "auth": {
    "jwt": {
      "secret_env": "JWT_SECRET",
      "expiry": "24h",
      "algorithm": "HS256",
      "issuer": "acme-corp"
    },
    "roles": ["admin", "editor", "viewer"],
    "session": {
      "timeout_minutes": 30,
      "refresh_enabled": true
    }
  }
}
```

**1f. Create `test/benchmarks/repos/1/src/styles.css`** — CSS with comments (for CommentStripper):

```css
/* Main application styles */
/* Auth module UI components */

.auth-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  /* Center the login form vertically */
  justify-content: center;
  min-height: 100vh;
  background-color: #f5f5f5;
}

/* Login form styling */
.login-form {
  padding: 2rem;
  border-radius: 8px;
  background: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  /* Responsive width */
  width: min(400px, 90vw);
}

/* Error message display */
.auth-error {
  color: #dc3545;
  font-size: 0.875rem;
  margin-top: 0.5rem;
}
```

**Verify:** `ls -R test/benchmarks/repos/1/` shows all files. The fixture now has ~200+ lines of content exercising license headers, comments, JSON, CSS, and a lock file.

### Step 2: Update expected-selection baseline

The selection-quality benchmark (`shared/src/integration/__tests__/selection-quality-benchmark.test.ts`) checks that the exact set of selected paths matches `test/benchmarks/expected-selection/1.json`. After fixture enrichment, new files may be selected.

Run the selection-quality benchmark once to see which paths are selected. Update `test/benchmarks/expected-selection/1.json` with the actual selected paths. The `selectedPaths` array must include all files the pipeline selects from the enriched fixture.

**Approach:** Temporarily add a `console.log(trace.selectedFiles.map(f => f.path))` to the selection-quality test, run it, capture the output, then update `expected-selection/1.json` with those paths and remove the console.log. Alternatively, use InspectRunner directly to determine the selection.

**Verify:** Run `pnpm test shared/src/integration/__tests__/selection-quality-benchmark.test.ts`; it passes with the updated paths.

### Step 3: Create token baseline file for canonical task 1

Create file `test/benchmarks/baseline.json` with content:

```json
{}
```

Empty object allows the test to add entry "1" on first run. Baseline shape per task: `{ "token_count": number, "duration_ms": number }`.

**Verify:** File exists at test/benchmarks/baseline.json.

### Step 4: Implement token reduction benchmark test

Create `shared/src/integration/__tests__/token-reduction-benchmark.test.ts`.

- Fixture root: `const fixtureRoot = toAbsolutePath(path.join(process.cwd(), "test", "benchmarks", "repos", "1"));` (use path from node:path).
- beforeAll: `providers = await initLanguageProviders(fixtureRoot as string);`
- Baseline path: `const baselinePath = path.join(process.cwd(), "test", "benchmarks", "baseline.json");`
- In the test: createProjectScope(fixtureRoot), new Sha256Adapter(), LoadConfigFromFile().load(fixtureRoot, null), applyConfigResult(configResult, scope.configStore, sha256Adapter) to get budgetConfig and heuristicConfig, createCachingFileContentReader(fixtureRoot as string), rulePackProvider with getBuiltInPack() returning { constraints: [], includePatterns: [], excludePatterns: [] } and getProjectPack(projectRootArg, taskClass) returning loadRulePackFromPath(createProjectFileReader(projectRootArg as string), taskClass), createFullPipelineDeps(fileContentReader, rulePackProvider, budgetConfig, providers, heuristicConfig), new CompilationRunner(deps, scope.clock, scope.cacheStore, scope.configStore, sha256Adapter, scope.guardStore, scope.compilationLogStore, scope.idGenerator).
- Build CompilationRequest: intent "refactor auth module to use middleware pattern", projectRoot fixtureRoot, modelId null, editorId EDITOR_ID.GENERIC, configPath null.
- Read baseline: `let baseline: Record<string, { token_count: number; duration_ms: number }> = {};` then try `baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"))` and catch to keep {} if file is missing or invalid.
- Run result = await runner.run(request). Read tokenCount = result.meta.tokensCompiled (numeric value), durationMs = result.meta.durationMs (numeric value).
- If baseline["1"] is undefined: set baseline["1"] = { token_count: tokenCount, duration_ms: durationMs }; fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2)); expect(true).toBe(true). (Establish baseline and pass.)
- If baseline["1"] is defined: expect(tokenCount).toBeLessThanOrEqual(baseline["1"].token*count * 1.05); expect(durationMs).toBeLessThanOrEqual(baseline["1"].duration*ms * 2).
- Test name: token_reduction_task1_matches_or_establishes_baseline. Use it(..., 30_000) for timeout.
- Import only from shared (path aliases #core, #pipeline, #adapters, #storage and relative paths for config and bootstrap) and node:path, node:fs; do not import from mcp or cli. Use toAbsolutePath from #core/types/paths.js, EDITOR_ID from #core/types/enums.js, type TaskClass from #core/types/enums.js, createProjectScope from #storage/create-project-scope.js, createCachingFileContentReader from #adapters/caching-file-content-reader.js, createFullPipelineDeps from ../../bootstrap/create-pipeline-deps.js, CompilationRunner from #pipeline/compilation-runner.js, initLanguageProviders from #adapters/init-language-providers.js, LoadConfigFromFile and applyConfigResult from ../../config/load-config-from-file.js, loadRulePackFromPath from #core/load-rule-pack.js, createProjectFileReader from #adapters/project-file-reader-adapter.js, Sha256Adapter from #adapters/sha256-adapter.js. RulePackProvider type from #core/interfaces/rule-pack-provider.interface.js, type RulePack from #core/types/rule-pack.js.

**Verify:** Run `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts`; the test token_reduction_task1_matches_or_establishes_baseline passes. After first run, test/benchmarks/baseline.json contains entry "1" with token_count and duration_ms.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                             | Description                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| token_reduction_task1_matches_or_establishes_baseline | CompilationRunner.run for task 1; if no baseline["1"], write result and pass; else assert token and duration within MVP bounds |

## Acceptance Criteria

- [ ] Fixture repo enriched: test/benchmarks/repos/1/ contains auth/service.ts (~40 lines with license header, comments), index.ts (with header), package.json, package-lock.json, src/auth/config.json, src/styles.css
- [ ] test/benchmarks/expected-selection/1.json updated with correct selectedPaths from enriched fixture
- [ ] Selection quality benchmark passes with updated expected-selection
- [ ] test/benchmarks/baseline.json exists (initial content {})
- [ ] shared/src/integration/**tests**/token-reduction-benchmark.test.ts exists
- [ ] Test wires real createProjectScope, createFullPipelineDeps, initLanguageProviders, LoadConfigFromFile, applyConfigResult; builds CompilationRunner with fixture root test/benchmarks/repos/1
- [ ] token_reduction_task1_matches_or_establishes_baseline passes
- [ ] First run writes baseline["1"] with token*count and duration_ms; subsequent runs assert tokensCompiled <= baseline["1"].token_count * 1.05 and durationMs <= baseline["1"].duration*ms * 2
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all pass including token-reduction-benchmark and selection-quality-benchmark
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports from mcp/ or cli/ in the test file

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
