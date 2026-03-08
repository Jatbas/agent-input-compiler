# Task 117: npm publish pipeline (@aic/mcp)

> **Status:** Pending
> **Phase:** V — OSS Release Prep
> **Layer:** release automation
> **Depends on:** Phase N–U (MCP and pipeline complete)

## Goal

Make the MCP package publishable to npm and add a GitHub Actions workflow that publishes @aic/shared and @aic/mcp on tag push. Consumers get runnable `npx @aic/mcp` and correct entry points from built output.

## Architecture Notes

- Use `files` whitelist in package.json for both packages — only `["dist"]` is included in the tarball. Do not use `.npmignore`.
- Publish order: @aic/shared first, then @aic/mcp (mcp depends on `@aic/shared` with `workspace:*`; pnpm replaces it at publish time).
- NPM_TOKEN must be set in the repository (or organization) secrets. The workflow uses it for registry auth. Never hardcode the token.
- Project Plan §21 (Licensing & Contribution) and Phase V in mvp-progress.md; no SBOM or provenance in this task scope.

## Files

| Action | Path                                                                                                        |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| Modify | `shared/package.json` (entry points to dist, files, publishConfig, remove private)                          |
| Create | `mcp/scripts/prepend-shebang.cjs` (prepends `#!/usr/bin/env node` to dist/server.js)                        |
| Modify | `mcp/package.json` (entry points to dist, files, publishConfig, remove private, build runs prepend-shebang) |
| Create | `.github/workflows/publish.yml` (trigger on push tags v\*, build then publish shared then mcp)              |

## Publish specification

**Packages to publish (order):** @aic/shared, then @aic/mcp.

**Entry points**

- **@aic/shared:** `main`: `dist/index.js`, `types`: `dist/index.d.ts`, `exports`: `{ "./*": "./dist/*" }`, `files`: `["dist"]`. No bin.
- **@aic/mcp:** `main`: `dist/server.js`, `types`: `dist/server.d.ts`, `bin`: `dist/server.js`. The bin target file must start with `#!/usr/bin/env node`. Shebang is added by post-build script `mcp/scripts/prepend-shebang.cjs` (TypeScript does not emit shebangs). `files`: `["dist"]`.

**Build:** Root `pnpm build` runs `tsc -b`, producing `shared/dist/` and `mcp/dist/`. MCP build script must also run `node scripts/prepend-shebang.cjs` after `tsc -b` so `mcp/dist/server.js` gets the shebang. The publish workflow runs `pnpm install --frozen-lockfile` and `pnpm build` in the same job before publishing.

**Trigger:** Workflow runs on `push` to tags matching `v*`. Also include `workflow_dispatch` so the workflow can be run manually from Actions for verification.

**Secrets / auth:** Workflow uses `NPM_TOKEN` from the repository secrets for npm registry authentication. Configure the secret in GitHub: Settings → Secrets and variables → Actions → New repository secret named `NPM_TOKEN`.

## Dependent Types

Not applicable — release pipeline; no core types consumed.

## Config Changes

- **shared/package.json:** Remove `private`. Set `main` to `dist/index.js`, `types` to `dist/index.d.ts`, `exports` to `{ "./*": "./dist/*" }`, `files` to `["dist"]`. Add `publishConfig`: `{ "access": "public", "registry": "https://registry.npmjs.org/" }`.
- **mcp/package.json:** Remove `private`. Set `main` to `dist/server.js`, `types` to `dist/server.d.ts`, `bin` to `dist/server.js`, `files` to `["dist"]`. Add `publishConfig`: `{ "access": "public", "registry": "https://registry.npmjs.org/" }`. Set `scripts.build` to `tsc -b && node scripts/prepend-shebang.cjs`.
- **eslint.config.mjs:** None.

## Steps

### Step 1: shared/package.json — publishable metadata

In `shared/package.json`: remove the `private` field; set `main` to `"dist/index.js"`, `types` to `"dist/index.d.ts"`, `exports` to `{ "./*": "./dist/*" }`; add `"files": ["dist"]` and `"publishConfig": { "access": "public", "registry": "https://registry.npmjs.org/" }`. Leave `imports`, `scripts`, and `dependencies` unchanged.

**Verify:** `shared/package.json` contains no `private`, has `main`/`types`/`exports` pointing at `dist/`, has `files` and `publishConfig`.

### Step 2: mcp/scripts/prepend-shebang.cjs

Create `mcp/scripts/prepend-shebang.cjs`. The script must read `dist/server.js` relative to the script (resolve with `path.join(__dirname, '..', 'dist', 'server.js')`), prepend the line `#!/usr/bin/env node\n` to its contents, and write the result back to the same file. Use Node.js built-in `fs.readFileSync` and `fs.writeFileSync` (CommonJS so it runs without ESM config).

**Verify:** Running `node mcp/scripts/prepend-shebang.cjs` from the repo root after `pnpm build` causes `mcp/dist/server.js` to start with `#!/usr/bin/env node`.

### Step 3: mcp/package.json — publishable metadata and build

In `mcp/package.json`: remove the `private` field; set `main` to `"dist/server.js"`, `types` to `"dist/server.d.ts"`, `bin` to `"dist/server.js"`; add `"files": ["dist"]` and `"publishConfig": { "access": "public", "registry": "https://registry.npmjs.org/" }`. Set `scripts.build` to `"tsc -b && node scripts/prepend-shebang.cjs"`. Leave `imports` and `dependencies` unchanged.

**Verify:** `mcp/package.json` has no `private`, entry points point at `dist/`, `files` and `publishConfig` present, and `build` runs prepend-shebang after tsc.

### Step 4: .github/workflows/publish.yml

Create `.github/workflows/publish.yml` with one job that:

- Triggers on: `push` with `tags: ['v*']`, and `workflow_dispatch` (manual run from Actions).
- Checks out the repo, sets up pnpm and Node.js (use the same setup as `.github/workflows/ci.yml`: pnpm/action-setup@v4, setup-node@v4 with node-version 22 and cache pnpm).
- Runs `pnpm install --frozen-lockfile`, then `pnpm build`.
- Publishes to npm: set `NPM_TOKEN` in the job env from `secrets.NPM_TOKEN`. Run `pnpm publish --no-git-checks` from the `shared` directory, then run `pnpm publish --no-git-checks` from the `mcp` directory. pnpm uses `NPM_TOKEN` from the environment for registry auth when set. Ensure the publish step is not a dry-run so that tagged runs actually publish.
- Set workflow `name` to `Publish` and the job `name` to `publish-npm`.

**Verify:** The file exists; trigger is `push: tags: ['v*']`; job runs install, build, then publish for shared then mcp; NPM_TOKEN comes from secrets.

### Step 5: Final verification

Run from the repo root: `pnpm build`, then `cd shared && npm pack` and `cd mcp && npm pack`. Unpack the tarballs with `tar -tf shared/*.tgz` and `tar -tf mcp/*.tgz` and confirm they contain only `package/` with `dist/` inside and that `package.json` in each tarball has `main`/`types`/`bin` pointing at `dist/` paths. Confirm the mcp tarball's `dist/server.js` starts with `#!/usr/bin/env node`. Run `pnpm lint && pnpm typecheck && pnpm test`. Trigger the publish workflow once via Actions → Publish → Run workflow to validate the job runs without error.

**Verify:** All commands pass; tarball contents and shebang are correct.

## Tests

| Test case                   | Description                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Publish dry-run and tarball | Workflow runs without error; npm pack tarballs contain only dist and correct entry points; mcp dist/server.js has shebang |

## Acceptance Criteria

- [ ] shared/package.json and mcp/package.json updated per Files and Config Changes
- [ ] mcp/scripts/prepend-shebang.cjs created and run from mcp build
- [ ] .github/workflows/publish.yml created with trigger, build, and publish steps
- [ ] `pnpm build` succeeds and mcp/dist/server.js starts with `#!/usr/bin/env node`
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all pass
- [ ] npm pack for shared and mcp produces tarballs with only dist and correct main/types/bin

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
