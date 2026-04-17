# Recipe: Release pipeline (npm publish, CI automation)

Full detail: `../SKILL-recipes.md` lines 346–416.

## Quick Card

- **When to use:** Make a package publishable, add/change a publish workflow, configure `publishConfig` / `files` / entry points, or document the release process.
- **Files:**
  - Modify: `<package>/package.json` (name, version, main/types/bin, files, publishConfig, private)
  - Create/Modify: `.github/workflows/<name>.yml`
  - Modify: root `package.json` (if release scripts)
  - Modify: `documentation/*` (only if explicitly in scope)
- **Template replaces Interface/Signature with "Publish Specification":**
  1. Package(s) to publish and exact npm names; publish order if multiple.
  2. Entry points: `main`, `types`, `bin`, `exports`, `files` — all pointing at built output (`dist/...`), never source.
  3. Build commands that produce publishable output.
  4. Trigger (`workflow_dispatch`, `push` tags `v*`, etc.).
  5. Secrets / auth (e.g. `NPM_TOKEN`).
- **Bin shebang — HARD:** `tsc` does not add shebangs. If a package has a `bin` field, source must start with `#!/usr/bin/env node` or a post-build step must prepend it.
- **`files` not `.npmignore`:** Whitelist only. Safer than blacklist.
- **Workspace deps — HARD:** If the published package depends on another workspace package (`"@jatbas/aic-core": "workspace:*"`), both must be published in the correct order. Use `pnpm publish`; pnpm replaces `workspace:*` with the resolved version at publish time.
- **Dependent Types:** Not applicable — write "Not applicable — release pipeline; no core types consumed."
- **Exploration specifics:**
  - Read each to-be-published `package.json` (name, version, private, main/types/bin, files, publishConfig).
  - Run the build; list resulting directories; confirm entry points can point inside `dist/`.
  - Read each published package's `tsconfig.json`; ensure `declaration: true`.
  - Inspect `.github/workflows/*.yml` for existing publish workflow.
- **Step granularity:** Step 1 package metadata (one package per step), Step 2 build verification, Step 3 publish workflow, Step 4 docs (only if in scope), final verification including `pnpm lint && pnpm typecheck && pnpm test` and a `--dry-run` workflow execution.
- **Tests:** Typically no new test files. Verification via `npm pack` inspection + CI workflow run.

## Mechanical checks applicability

A, D, E (Config changes), F (Create only for files that do not exist), G (self-contained), M (simplicity). **Not applicable:** B, C, H, K, L (no interface / typed wiring).
