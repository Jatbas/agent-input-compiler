# Task 118: License headers audit

> **Status:** Done
> **Phase:** 1.0 (OSS Release) — Phase V
> **Layer:** repo-wide (custom repo polish)
> **Depends on:** —

## Goal

Ensure every in-scope source file has a standard Apache 2.0 license header so the codebase is clearly licensed for OSS release. Add a check script so CI or pre-commit can enforce headers going forward.

## Architecture Notes

- Project plan §21: Apache 2.0, DCO. File-level headers use SPDX short identifier and Copyright line.
- No production code in core, pipeline, adapters, or storage is added or changed; only repo tooling (scripts) and in-file header text.
- Scripts use Node built-ins (node:fs, node:path) only; no new dependencies.

## Files

| Action | Path                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------ |
| Create | `scripts/add-license-headers.cjs`                                                                            |
| Create | `scripts/check-license-headers.cjs`                                                                          |
| Modify | `package.json` (add `check:headers` script)                                                                  |
| Modify | All in-scope `.ts` and `.cjs` files (see Header specification; modified by running the add script in Step 2) |

## Header specification

**Exact header text** (first two lines of each in-scope file; comment style `//`):

```
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
```

**Placement:** Line 1 and 2 of the file. Line 3 must be a blank line. Existing content (imports or code) starts at line 4.

**In-scope files:**

- `shared/src/**/*.ts`
- `mcp/src/**/*.ts`
- `.cursor/**/*.cjs`
- `.claude/**/*.cjs`
- `mcp/hooks/**/*.cjs`
- `mcp/scripts/*.cjs`
- `commitlint.config.cjs` (root)

**Excluded:** `node_modules`, any `**/dist/**`, `test/benchmarks/repos/**`, and all `*.md` / `*.mdc` (out of scope for this task).

## Config Changes

- **package.json:** Add script: `"check:headers": "node scripts/check-license-headers.cjs"`. No other changes.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create add-license-headers script

Create `scripts/add-license-headers.cjs`. The script must:

1. Use Node only (`require("fs")`, `require("path")`).
2. Define the exact set of directories and extensions: walk (sync recursion with fs.readdirSync) from repo root: shared/src (match _.ts), mcp/src (_.ts), .cursor (**/\*.cjs), .claude (**/_.cjs), mcp/hooks (_.cjs), mcp/scripts (\*.cjs), and include root file commitlint.config.cjs. Do not add a new dependency; use Node fs and path only.
3. For each resolved file: read the file with `fs.readFileSync(path, "utf8")`. If the first 5 lines (or first 512 characters) contain the substring `SPDX-License-Identifier: Apache-2.0`, skip the file. Otherwise prepend exactly these two lines plus a newline: `// SPDX-License-Identifier: Apache-2.0\n// Copyright (c) 2025 AIC Contributors\n\n`, then write the result back with `fs.writeFileSync(path, newContent, "utf8")`. The script takes no arguments and is run from repo root in Step 2.

**Verify:** Script exists and runs without throwing. After running, at least one previously header-less file contains the exact two-line header at the top.

### Step 2: Run add-license-headers

Run from repo root: `node scripts/add-license-headers.cjs`.

**Verify:** No errors. Grep for `SPDX-License-Identifier: Apache-2.0` in `shared/src` and `mcp/src`: every .ts file under those trees contains the string in the first 5 lines.

### Step 3: Create check-license-headers script

Create `scripts/check-license-headers.cjs`. The script must:

1. Use the same directory walk and extension rules as the add script to list in-scope files.
2. For each file, read the first 5 lines (or first 512 characters). If that text does not contain `SPDX-License-Identifier: Apache-2.0`, add the file path to a list of missing.
3. If the list of missing is non-empty, print each path to stdout (one per line) and call `process.exit(1)`. If the list is empty, call `process.exit(0)`.

**Verify:** Script exists. After Step 2, running `node scripts/check-license-headers.cjs` exits with code 0 and prints nothing.

### Step 4: Wire check:headers in package.json

In root `package.json`, add to the `scripts` object: `"check:headers": "node scripts/check-license-headers.cjs"`.

**Verify:** `pnpm run check:headers` runs and exits 0.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

**Verify:** All four commands succeed.

## Tests

| Test case            | Description                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| check_headers_passes | After adding headers and creating the check script, `pnpm run check:headers` exits 0 and reports no missing files. |

## Acceptance Criteria

- [ ] `scripts/add-license-headers.cjs` and `scripts/check-license-headers.cjs` exist
- [ ] Every in-scope `.ts` and `.cjs` file has the exact two-line header at the top (blank line after header)
- [ ] `pnpm run check:headers` exits 0
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all pass
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work, stop. List the adaptations, report to the user, and re-evaluate before continuing.
