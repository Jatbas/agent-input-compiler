# Task 120: Fix package resolution for zero-install publishing

> **Status:** Pending
> **Phase:** 0.5 — Quality Release
> **Layer:** cross-cutting (shared, mcp, root config)
> **Depends on:** None

## Goal

Align all import specifiers with the actual npm package names (`@jatbas/aic-shared`, `@jatbas/aic-mcp`) so that the published packages resolve correctly at runtime. Eliminate `#hash` subpath imports that point to unpublished `src/` directories, include hook scripts in the published MCP package, and ensure the root build produces complete artifacts with shebang.

## Architecture Notes

- The codebase uses `@aic/shared` as an import alias via `tsconfig.base.json` paths, but the npm package is named `@jatbas/aic-shared`. TypeScript `paths` is compile-time only — emitted JS retains the alias, which does not resolve at runtime in published packages.
- The `#core/*`, `#adapters/*`, `#storage/*`, `#pipeline/*` subpath imports in `shared/package.json` point to `./src/*`, but only `dist/` is published. Same issue with `#mcp/*` in `mcp/package.json`.
- The fix uses Node.js **self-referencing**: a package can import itself by name, resolving through its own `exports` field. In dev, tsconfig `paths` intercepts and routes to source. In published packages, the `exports` field routes to `dist/`.
- All replacements are mechanical `sed` commands — no manual file-by-file editing.
- After this task, when the `@aic` npm scope is approved, a future rename from `@jatbas/aic-shared` to `@aic/shared` is a single `sed` pass.

## Files

| Action | Path                                  | What changes                                                                                                                                                                                             |
| ------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modify | `shared/src/**/*.ts` (~290 files)     | Replace `#core/*`, `#adapters/*`, `#storage/*`, `#pipeline/*` imports with `@jatbas/aic-shared/core/*`, `@jatbas/aic-shared/adapters/*`, `@jatbas/aic-shared/storage/*`, `@jatbas/aic-shared/pipeline/*` |
| Modify | `mcp/src/**/*.ts` (~24 files)         | Replace `@aic/shared/*` imports with `@jatbas/aic-shared/*`                                                                                                                                              |
| Modify | `mcp/src/handlers/compile-handler.ts` | Replace `#mcp/*` imports with relative imports                                                                                                                                                           |
| Modify | `mcp/src/handlers/inspect-handler.ts` | Replace `#mcp/*` imports with relative imports                                                                                                                                                           |
| Modify | `shared/package.json`                 | Remove `imports` field                                                                                                                                                                                   |
| Modify | `mcp/package.json`                    | Remove `imports` field, add `"hooks"` to `files` array                                                                                                                                                   |
| Modify | `package.json` (root)                 | Remove `@aic/shared` dependency, change build script to `pnpm -r run build`                                                                                                                              |
| Modify | `tsconfig.base.json`                  | Change path aliases from `@aic/shared/*` and `@aic/mcp/*` to `@jatbas/aic-shared/*` and `@jatbas/aic-mcp/*`                                                                                              |
| Modify | `eslint.config.mjs`                   | Replace all `@aic/mcp` references with `@jatbas/aic-mcp` and all `@aic/shared` references with `@jatbas/aic-shared`                                                                                      |
| Modify | `.cursor/rules/AIC-architect.mdc`     | Replace `@aic/shared` and `@aic/mcp` references with `@jatbas/aic-shared` and `@jatbas/aic-mcp`                                                                                                          |
| Modify | `.cursor/rules/AIC-mcp.mdc`           | Replace `@aic/shared` references with `@jatbas/aic-shared`                                                                                                                                               |
| Modify | `.cursor/rules/AIC-interfaces.mdc`    | Replace `@aic/shared` references with `@jatbas/aic-shared`                                                                                                                                               |
| Modify | `.cursor/rules/AIC-pipeline.mdc`      | Replace `@aic/shared` references with `@jatbas/aic-shared`                                                                                                                                               |
| Modify | `.cursor/rules/AIC-storage.mdc`       | Replace `@aic/shared` references with `@jatbas/aic-shared`                                                                                                                                               |
| Modify | `.cursor/rules/AIC-type-safety.mdc`   | Replace `@aic/shared` references with `@jatbas/aic-shared`                                                                                                                                               |

## Config Changes

- **`shared/package.json`:** Remove the entire `"imports"` field (lines containing `"#core/*"`, `"#adapters/*"`, `"#storage/*"`, `"#pipeline/*"` mappings).
- **`mcp/package.json`:** Remove the entire `"imports"` field (the `"#mcp/*"` mapping). Change `"files": ["dist"]` to `"files": ["dist", "hooks"]`.
- **`package.json` (root):** Remove `"dependencies": { "@aic/shared": "file:./shared" }` (workaround added during debugging). Change `"build": "tsc -b"` to `"build": "pnpm -r run build"`.
- **`tsconfig.base.json`:** Change `"@aic/shared/*": ["./shared/src/*"]` to `"@jatbas/aic-shared/*": ["./shared/src/*"]`. Change `"@aic/mcp/*": ["./mcp/src/*"]` to `"@jatbas/aic-mcp/*": ["./mcp/src/*"]`.
- **`eslint.config.mjs`:** Replace all occurrences of `@aic/mcp` with `@jatbas/aic-mcp` and all occurrences of `@aic/shared` with `@jatbas/aic-shared` (29 references total).
- **`knip.json`:** No change needed — already references `@jatbas/aic-shared`.

## Steps

### Step 1: Replace `#hash` imports in `shared/src/` with self-referencing package imports

Run the following `sed` commands from the repository root. Each command replaces one `#hash` prefix with the corresponding `@jatbas/aic-shared/` prefix across all `.ts` files in `shared/src/`.

```bash
find shared/src -name '*.ts' -exec sed -i '' 's|from "#core/|from "@jatbas/aic-shared/core/|g' {} +
find shared/src -name '*.ts' -exec sed -i '' 's|from "#adapters/|from "@jatbas/aic-shared/adapters/|g' {} +
find shared/src -name '*.ts' -exec sed -i '' 's|from "#storage/|from "@jatbas/aic-shared/storage/|g' {} +
find shared/src -name '*.ts' -exec sed -i '' 's|from "#pipeline/|from "@jatbas/aic-shared/pipeline/|g' {} +
```

**Verify:** Run `grep -r 'from "#' shared/src/ --include='*.ts' | wc -l` — result is 0. Run `grep -r 'from "@jatbas/aic-shared/' shared/src/ --include='*.ts' | wc -l` — result is approximately 1225.

### Step 2: Replace `@aic/shared` imports in `mcp/src/` with `@jatbas/aic-shared`

```bash
find mcp/src -name '*.ts' -exec sed -i '' 's|from "@aic/shared/|from "@jatbas/aic-shared/|g' {} +
```

**Verify:** Run `grep -r 'from "@aic/shared' mcp/src/ --include='*.ts' | wc -l` — result is 0. Run `grep -r 'from "@jatbas/aic-shared/' mcp/src/ --include='*.ts' | wc -l` — result is approximately 95.

### Step 3: Replace `#mcp/*` imports in `mcp/src/handlers/` with relative imports

In `mcp/src/handlers/compile-handler.ts`, make these replacements:

- `from "#mcp/record-tool-invocation.js"` → `from "../record-tool-invocation.js"`
- `from "#mcp/init-project.js"` → `from "../init-project.js"`
- `from "#mcp/validate-project-root.js"` → `from "../validate-project-root.js"`

In `mcp/src/handlers/inspect-handler.ts`, make these replacements:

- `from "#mcp/record-tool-invocation.js"` → `from "../record-tool-invocation.js"`
- `from "#mcp/validate-project-root.js"` → `from "../validate-project-root.js"`

**Verify:** Run `grep -r 'from "#mcp/' mcp/src/ --include='*.ts' | wc -l` — result is 0.

### Step 4: Update `shared/package.json`

Remove the entire `"imports"` field:

```json
  "imports": {
    "#core/*": "./src/core/*",
    "#adapters/*": "./src/adapters/*",
    "#storage/*": "./src/storage/*",
    "#pipeline/*": "./src/pipeline/*"
  },
```

**Verify:** Run `grep '#core' shared/package.json` — no output.

### Step 5: Update `mcp/package.json`

Remove the entire `"imports"` field:

```json
  "imports": {
    "#mcp/*": "./src/*"
  },
```

Change the `"files"` array from `["dist"]` to `["dist", "hooks"]`.

**Verify:** Run `grep '#mcp' mcp/package.json` — no output. Run `grep 'hooks' mcp/package.json` — shows `"hooks"` in the files array.

### Step 6: Update root `package.json`

Remove the `"dependencies"` field (the `"@aic/shared": "file:./shared"` workaround):

```json
  "dependencies": {
    "@aic/shared": "file:./shared"
  },
```

Change the `"build"` script from `"tsc -b"` to `"pnpm -r run build"`.

**Verify:** Run `grep 'file:./shared' package.json` — no output. Run `grep 'pnpm -r run build' package.json` — shows the updated build script.

### Step 7: Update `tsconfig.base.json`

Change the `paths` entries:

- `"@aic/shared/*": ["./shared/src/*"]` → `"@jatbas/aic-shared/*": ["./shared/src/*"]`
- `"@aic/mcp/*": ["./mcp/src/*"]` → `"@jatbas/aic-mcp/*": ["./mcp/src/*"]`

**Verify:** Run `grep '@aic/' tsconfig.base.json` — no output (only `@jatbas/` references remain).

### Step 8: Update `eslint.config.mjs`

Replace all occurrences of `@aic/mcp` with `@jatbas/aic-mcp` and all occurrences of `@aic/shared` with `@jatbas/aic-shared`:

```bash
sed -i '' 's|@aic/mcp|@jatbas/aic-mcp|g' eslint.config.mjs
sed -i '' 's|@aic/shared|@jatbas/aic-shared|g' eslint.config.mjs
```

**Verify:** Run `grep '@aic/' eslint.config.mjs | grep -v '@jatbas/' | wc -l` — result is 0.

### Step 9: Update `.cursor/rules/*.mdc` files

Replace all occurrences of `@aic/shared` with `@jatbas/aic-shared` and `@aic/mcp` with `@jatbas/aic-mcp` across all rule files:

```bash
find .cursor/rules -name '*.mdc' -exec sed -i '' 's|@aic/shared|@jatbas/aic-shared|g' {} +
find .cursor/rules -name '*.mdc' -exec sed -i '' 's|@aic/mcp|@jatbas/aic-mcp|g' {} +
```

**Verify:** Run `grep -r '@aic/' .cursor/rules/ --include='*.mdc' | grep -v '@jatbas/' | wc -l` — result is 0.

### Step 10: Reinstall dependencies

```bash
pnpm install
```

**Verify:** `pnpm install` completes without errors.

### Step 11: Build and verify shebang

```bash
pnpm run build
```

**Verify:** Run `head -1 mcp/dist/server.js` — output is `#!/usr/bin/env node`. Run `grep -r 'from "@aic/' mcp/dist/ | wc -l` — result is 0 (all dist imports use `@jatbas/aic-shared`). Run `grep -r 'from "#' shared/dist/ | grep -v '.d.ts' | wc -l` — result is 0 (no `#hash` imports in built JS). Run `grep -r 'from "#' mcp/dist/ | wc -l` — result is 0.

### Step 12: Validate published package contents

```bash
cd mcp && npm pack --dry-run 2>&1 | grep -E 'hooks/|server\.js'
cd ..
```

**Verify:** Output includes `dist/server.js` and at least 9 files under `hooks/` (the `.cjs` hook scripts).

### Step 13: Final verification

Run:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm knip
```

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                       | Description                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| All existing tests pass         | `pnpm test` — zero failures; the import changes are mechanical and do not alter behavior |
| Lint clean                      | `pnpm lint` — zero errors; the new import specifiers are valid named imports             |
| Type check clean                | `pnpm typecheck` — zero errors; tsconfig paths resolve `@jatbas/aic-shared/*` to source  |
| Knip clean                      | `pnpm knip` — no new unused files, exports, or dependencies                              |
| Built dist has correct imports  | `grep -r 'from "@aic/' mcp/dist/` returns zero matches                                   |
| Built dist has no #hash imports | `grep -r 'from "#' shared/dist/ mcp/dist/` on `.js` files returns zero matches           |
| Shebang present                 | `head -1 mcp/dist/server.js` returns `#!/usr/bin/env node`                               |
| Hooks published                 | `npm pack --dry-run` in `mcp/` includes `hooks/*.cjs` files                              |

## Acceptance Criteria

- [ ] Zero `from "#core/`, `from "#adapters/`, `from "#storage/`, `from "#pipeline/` imports remain in `shared/src/`
- [ ] Zero `from "#mcp/` imports remain in `mcp/src/`
- [ ] Zero `from "@aic/shared` imports remain in `mcp/src/`
- [ ] Zero `@aic/` references remain in `tsconfig.base.json`, `eslint.config.mjs`, or `.cursor/rules/`
- [ ] `shared/package.json` has no `imports` field
- [ ] `mcp/package.json` has no `imports` field and `files` includes `"hooks"`
- [ ] Root `package.json` has no `@aic/shared` dependency and build script is `pnpm -r run build`
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all tests pass
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] Built `mcp/dist/server.js` starts with `#!/usr/bin/env node`
- [ ] Built `mcp/dist/**/*.js` imports `@jatbas/aic-shared/*` (not `@aic/shared/*`)
- [ ] Built `shared/dist/**/*.js` imports `@jatbas/aic-shared/*` (not `#core/*` etc.)
- [ ] `npm pack --dry-run` in `mcp/` includes `hooks/*.cjs` files
- [ ] No `any`, `@ts-ignore`, `eslint-disable`, or `as unknown as` introduced

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
