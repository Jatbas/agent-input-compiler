# Task 153: Update toolchain references (CL07)

> **Status:** Pending
> **Phase:** Phase CL — Cursor Clean-Layer Separation
> **Layer:** cross-layer (root config, scripts, mcp)
> **Depends on:** CL01 (Move hook sources to integrations/cursor/hooks/)

## Goal

Update all toolchain config and script references from `mcp/hooks/` to `integrations/cursor/hooks/` so that after CL01 the toolchain (knip, eslint, prettier, license scripts, npm package files) points at the new hook location and the MCP package no longer ships hooks.

## Architecture Notes

- Phase CL: hook sources live in `integrations/cursor/hooks/`; toolchain must not reference `mcp/hooks/`.
- No new code — only string/path replacements in existing config and scripts.
- mcp/package.json `files` must not include hooks (they are not part of the npm package).

## Files

| Action | Path |
| ------ | ---- |
| Modify | `knip.json` |
| Modify | `.eslintignore` (only if file exists at repo root) |
| Modify | `.prettierignore` |
| Modify | `scripts/check-license-headers.cjs` |
| Modify | `scripts/add-license-headers.cjs` |
| Modify | `mcp/package.json` |

## Interface / Signature

Not applicable — no new interfaces or classes. Task only edits existing config and script content.

## Dependent Types

Not applicable — no domain types consumed or produced.

## Config Changes

- **package.json:** No change to shared/package.json or root package.json. Only mcp/package.json is modified (remove `"hooks"` from `files` array).
- **eslint.config.mjs:** No change.

## Steps

### Step 1: knip.json

In `knip.json`, in the `ignore` array, replace any entry that is exactly `mcp/hooks/` or `mcp/hooks/**` with `integrations/cursor/hooks/` or `integrations/cursor/hooks/**` respectively. If the array already contains `integrations/cursor/hooks/` or `integrations/cursor/hooks/**` and has no `mcp/hooks/` entry, leave the file unchanged.

**Verify:** Grep `knip.json` for `mcp/hooks` — 0 matches.

### Step 2: .eslintignore

If a file named `.eslintignore` exists at the repository root, open it and replace every occurrence of the string `mcp/hooks/` with `integrations/cursor/hooks/`. If `.eslintignore` does not exist at the repository root, do nothing for this step. Do not create `.eslintignore` if it is missing.

**Verify:** If .eslintignore exists, grep it for `mcp/hooks` — 0 matches.

### Step 3: .prettierignore

In `.prettierignore`, replace every occurrence of `mcp/hooks/` with `integrations/cursor/hooks/`. If the file does not contain `mcp/hooks/`, leave it unchanged.

**Verify:** Grep `.prettierignore` for `mcp/hooks` — 0 matches.

### Step 4: scripts/check-license-headers.cjs

In `scripts/check-license-headers.cjs`, in the `collectFiles` function, change the line that passes the hooks directory to `walkDir`. Replace:

`walkDir(path.join(ROOT, "mcp", "hooks"), /\.cjs$/, out);`

with:

`walkDir(path.join(ROOT, "integrations", "cursor", "hooks"), /\.cjs$/, out);`

**Verify:** Grep `scripts/check-license-headers.cjs` for `mcp.*hooks` — 0 matches. Run `node scripts/check-license-headers.cjs` from repo root — exits 0.

### Step 5: scripts/add-license-headers.cjs

In `scripts/add-license-headers.cjs`, in the `collectFiles` function, change the line that passes the hooks directory to `walkDir`. Replace:

`walkDir(path.join(ROOT, "mcp", "hooks"), /\.cjs$/, out);`

with:

`walkDir(path.join(ROOT, "integrations", "cursor", "hooks"), /\.cjs$/, out);`

**Verify:** Grep `scripts/add-license-headers.cjs` for `mcp.*hooks` — 0 matches.

### Step 6: mcp/package.json

In `mcp/package.json`, in the `files` array, remove the entry `"hooks"`. After the edit, `files` must be `["dist"]` only.

**Verify:** The `files` array in mcp/package.json contains only `"dist"`. No `"hooks"` entry.

### Step 7: Final verification

Run: `pnpm lint && pnpm knip`

Expected: both pass, zero errors, zero warnings, no new knip findings.

**Verify:** Exit code 0 from both commands. Grep the repository (excluding .git and documentation that describes history) for `mcp/hooks` in config/script files — 0 matches in knip.json, .eslintignore, .prettierignore, scripts/*.cjs, mcp/package.json.

## Tests

| Test case | Description |
| --------- | ----------- |
| lint_knip_pass | pnpm lint and pnpm knip pass with 0 new findings |
| no_mcp_hooks_remaining | No remaining mcp/hooks references in modified toolchain files |
| license_script_exits_zero | node scripts/check-license-headers.cjs exits 0 from repo root |

## Acceptance Criteria

- [ ] knip.json ignore array uses integrations/cursor/hooks/, not mcp/hooks/
- [ ] .eslintignore (if present) and .prettierignore have no mcp/hooks/
- [ ] scripts/check-license-headers.cjs and scripts/add-license-headers.cjs point at integrations/cursor/hooks
- [ ] mcp/package.json files array is ["dist"] only
- [ ] pnpm lint — zero errors, zero warnings
- [ ] pnpm knip — no new unused files, exports, or dependencies
- [ ] No mcp/hooks/ references left in the modified files

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (path hacks, extra globs, output patching), stop. List the adaptations, report to the user, and re-evaluate before continuing.
