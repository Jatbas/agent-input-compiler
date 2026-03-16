# Task 185: Claude installer legacy project-local cleanup

> **Status:** Pending
> **Phase:** U (Claude Code integration)
> **Layer:** integrations
> **Depends on:** U01 (install.cjs), Task 183 (global-only installation)

## Goal

When the Claude Code installer runs (manually or via MCP bootstrap), it removes legacy project-local artifacts: any `aic-*.cjs` in the project's `.claude/hooks/`, the hooks directory if empty, and `.claude/settings.local.json`. This runs only when the project directory is not the same as the global install directory (home), so existing tests that use `cwd=tmpDir` and `HOME=tmpDir` continue to pass.

## Architecture Notes

- Clean layer: install.cjs remains standalone (node:path, node:fs, node:os only); no mcp/src imports.
- Sibling parity: Cursor installer removes stale scripts in project `.cursor/hooks/`; Claude installer now removes legacy project-local `.claude/hooks/` and `settings.local.json` so projects that had pre–Task 183 local install get cleaned on next run.
- Skip cleanup when `path.resolve(projectRoot) === path.resolve(home)` to avoid deleting the global install when the test runs with cwd and HOME both set to the same temp dir.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `integrations/claude/install.cjs` (add legacy project-local cleanup block) |
| Modify | `integrations/claude/__tests__/install.test.cjs` (add legacy_project_local_cleanup test) |
| Modify | `documentation/claude-code-integration-layer.md` (§13 add step 5, renumber step 5→6) |

## Interface / Signature

N/A — install.cjs is a standalone CommonJS script; behavior specified in Steps.

## Dependent Types

N/A.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Legacy cleanup in install.cjs

After the block that sets `projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd()` and `projectClaudeDir = path.join(projectRoot, ".claude")`, and before the block that builds `triggerContent` and writes CLAUDE.md, add the following.

Compute `projectRootResolved = path.resolve(projectRoot)` and `homeResolved = path.resolve(home)`. If `projectRootResolved === homeResolved`, skip the cleanup (do nothing). Otherwise, in a try block: set `projectHooksDir = path.join(projectClaudeDir, "hooks")`. If `fs.existsSync(projectHooksDir)` is true, read the directory with `fs.readdirSync(projectHooksDir)`; for each `name` matching `/^aic-[a-z0-9-]+\.cjs$/`, call `fs.unlinkSync(path.join(projectHooksDir, name))`. Then if `fs.readdirSync(projectHooksDir).length === 0`, call `fs.rmdirSync(projectHooksDir)`. Then set `settingsLocalPath = path.join(projectClaudeDir, "settings.local.json")`; if `fs.existsSync(settingsLocalPath)` is true, call `fs.unlinkSync(settingsLocalPath)`. Catch: ignore (no throw; optional cleanup).

**Verify:** Run `node integrations/claude/install.cjs` from repo root; exit 0. Run `node integrations/claude/__tests__/install.test.cjs`; all three tests pass.

### Step 2: Add legacy_project_local_cleanup test

In `integrations/claude/__tests__/install.test.cjs`, add a function `legacy_project_local_cleanup`. Create a temp dir with `fs.mkdtempSync`; create a subdir `project` and set `projectDir = path.join(tmpDir, "project")`. Create `projectDir/.claude/hooks/` and write a file `projectDir/.claude/hooks/aic-session-start.cjs` with content `"// legacy"`. Create `projectDir/.claude/settings.local.json` with content `'{"hooks":{}}'`. Create `homeDir = path.join(tmpDir, "home")` and `fs.mkdirSync(homeDir, { recursive: true })`. Run `execFileSync("node", [installScript], { cwd: projectDir, env: { ...process.env, HOME: homeDir }, stdio: ["ignore", "pipe", "pipe"] })`. After the run: if `projectDir/.claude/hooks` exists, assert `fs.readdirSync(projectDir/.claude/hooks).length === 0`. Assert `!fs.existsSync(path.join(projectDir, ".claude", "settings.local.json"))`. Log "legacy_project_local_cleanup: pass". In the finally block, remove the temp dir. At the end of the file, call `legacy_project_local_cleanup()` after the two existing test calls.

**Verify:** Run `node integrations/claude/__tests__/install.test.cjs`; three tests pass.

### Step 3: Update claude-code-integration-layer.md §13

In the section "## 13. Direct installer path (zero-install)", in the numbered list under "The installer:", insert a new step 5: "Removes legacy project-local artifacts: in the current working directory (or `$CLAUDE_PROJECT_DIR`), when that directory is not the user's home directory, deletes any `aic-*.cjs` in `.claude/hooks/`, removes the hooks directory if empty, and deletes `.claude/settings.local.json` if present." Renumber the former step 5 (trigger rule CLAUDE.md) to step 6.

**Verify:** Grep the file for "Removes legacy"; one match. Step list has six steps.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| fresh_install_creates_global_settings | Unchanged; must still pass (project === home so no cleanup runs). |
| merge_preserves_non_aic_entries | Unchanged; must still pass. |
| legacy_project_local_cleanup | Project dir has .claude/hooks/aic-*.cjs and .claude/settings.local.json; HOME different; after install, project .claude/hooks empty or removed and settings.local.json removed. |

## Acceptance Criteria

- [ ] install.cjs removes legacy project-local .claude/hooks/ contents and .claude/settings.local.json when project root !== home.
- [ ] install.cjs does not remove anything when project root === home (existing tests pass).
- [ ] legacy_project_local_cleanup test passes.
- [ ] claude-code-integration-layer.md §13 lists six installer steps with new step 5.
- [ ] `pnpm lint` — zero errors, zero warnings.
- [ ] `pnpm typecheck` — clean.
- [ ] `pnpm knip` — no new unused files, exports, or dependencies.

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
