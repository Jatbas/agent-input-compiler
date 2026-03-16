# Task 183: Claude installer parity with Cursor process

> **Status:** Pending
> **Phase:** U (Claude Code integration)
> **Layer:** integrations + documentation
> **Depends on:** U01 (integrations/claude/install.cjs exists)

## Goal

Align the Claude Code direct installer (`integrations/claude/install.cjs`) with the Cursor installer process: add stale script cleanup, idempotent script copy, idempotent settings write, and version-stamped trigger rule (CLAUDE.md), and document the steps in the integration layer doc.

## Architecture Notes

- Sibling pattern: `integrations/cursor/install.cjs` is the reference. Claude installer MUST follow the same step order and logic (stale cleanup, write-only-if-diff, version-stamped trigger rule). No new interfaces; script uses only Node.js built-ins (path, fs, os).
- ADR/docs: installation.md and claude-code-integration-layer.md describe the installer; §13 must list the five steps to match the Cursor doc.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `integrations/claude/install.cjs` (stale cleanup, idempotent copy, idempotent settings write, version-stamped CLAUDE.md) |
| Modify | `documentation/claude-code-integration-layer.md` (§13 installer steps) |

## Script behavior (after changes)

The installer runs top-level; it has no exports. Required behavior, aligned with Cursor:

1. Ensure `~/.claude/hooks/` exists.
2. For each name in `AIC_SCRIPT_NAMES`: read source from `integrations/claude/hooks/`, read dest from `~/.claude/hooks/` if present; write only if content differs or dest missing.
3. List `~/.claude/hooks/`; delete any file matching `/^aic-[a-z0-9-]+\.cjs$/` that is not in `AIC_SCRIPT_NAMES`.
4. Read `~/.claude/settings.json` if present; merge AIC hook entries (existing merge logic); write only if merged JSON string differs from existing raw.
5. Read version from root `package.json`; build CLAUDE.md content with version stamp; read existing `.claude/CLAUDE.md` if present; write only when version differs or file missing.

## Dependent Types

Not applicable — standalone .cjs script; no TypeScript types.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Idempotent script copy and stale cleanup in install.cjs

Replace the loop that uses `fs.copyFileSync` with the Cursor pattern: for each `name` in `AIC_SCRIPT_NAMES`, set `srcPath = path.join(hooksSourceDir, name)`, `destPath = path.join(globalHooksDir, name)`. Read `sourceContent = fs.readFileSync(srcPath, "utf8")`. Set `shouldWrite = true`. In a try block, read `existing = fs.readFileSync(destPath, "utf8")`; if `existing === sourceContent` set `shouldWrite = false`. Catch: leave `shouldWrite` true. If `shouldWrite`, call `fs.writeFileSync(destPath, sourceContent, "utf8")`.

Immediately after the script-copy loop, add stale cleanup: `const hookNames = fs.readdirSync(globalHooksDir)`. For each `name` in `hookNames`, if `/^aic-[a-z0-9-]+\.cjs$/.test(name)` and `!AIC_SCRIPT_NAMES.includes(name)`, call `fs.unlinkSync(path.join(globalHooksDir, name))`.

**Verify:** Script still runs without throwing; `~/.claude/hooks/` contains only the 8 manifest scripts after run; second run does not overwrite unchanged files.

### Step 2: Idempotent settings.json write in install.cjs

After building `merged` (from existing settings or template), set `mergedContent = JSON.stringify(merged, null, 2) + "\n"`. When `globalSettingsPath` existed, only call `fs.writeFileSync(globalSettingsPath, mergedContent, "utf8")` if `mergedContent !== existingRaw`. When the file did not exist (else branch), keep the existing write.

**Verify:** Run installer twice; second run must not rewrite `~/.claude/settings.json` when no template or AIC changes.

### Step 3: Version-stamped CLAUDE.md in install.cjs

Before the try block (or at top of script), read version: `let version = "0.0.0"`; try read `pkgPath = path.join(__dirname, "..", "..", "package.json")`, parse, set `version = pkg.version` if string; catch keep `"0.0.0"`.

Add at the very start of `CLAUDE_MD_TEMPLATE` (after the opening backtick) the line: `<!-- AIC rule version: {{VERSION}} -->\n` so the template contains the placeholder.

Before writing CLAUDE.md: build `triggerContent = CLAUDE_MD_TEMPLATE.replace("{{VERSION}}", version)`. Try read existing file at `claudeMdPath`; if content matches `/AIC rule version:\s*(\S+)/` and `match[1] === version`, set `skipTriggerWrite = true`. Catch: leave `skipTriggerWrite = false`. Only when `!skipTriggerWrite` run `fs.mkdirSync(projectClaudeDir, { recursive: true })` and `fs.writeFileSync(claudeMdPath, triggerContent, "utf8")`.

**Verify:** First run writes CLAUDE.md with current version; second run skips write when version unchanged.

### Step 4: Update claude-code-integration-layer.md §13

In the section "## 13. Direct installer path (zero-install)", replace the numbered list under "The installer:" with five steps that match the Cursor doc (§13):

1. Ensures `~/.claude/hooks/` directory exists (resolve `~/.claude` from home).
2. For each hook script in `AIC_SCRIPT_NAMES`: reads content from `integrations/claude/hooks/` and writes to `~/.claude/hooks/` only if content differs (idempotent).
3. Deletes any `aic-*.cjs` files in `~/.claude/hooks/` that are not in `AIC_SCRIPT_NAMES` (stale script cleanup).
4. Reads `~/.claude/settings.json` (if present) and merges AIC entries into existing config, preserving non-AIC entries; writes only if merged content differs.
5. Writes the trigger rule (`.claude/CLAUDE.md` in the current working directory when writable), version-stamped; overwrites only when the installed version differs from the current package version.

**Verify:** Doc §13 reads parallel to cursor-integration-layer.md §13 (same step count and semantics).

### Step 5: Final verification

Run: `node integrations/claude/install.cjs` from repo root (with `integrations/claude` as cwd or from root so __dirname resolves). Then run `pnpm lint`.

Expected: script exits 0; `pnpm lint` passes with zero errors and zero warnings.

## Tests

| Test case | Description |
| --------- | ----------- |
| Manual idempotent run | Run install.cjs twice; second run must not overwrite identical files (hooks, settings.json, CLAUDE.md when version unchanged). |
| Stale cleanup | Manually add a file `~/.claude/hooks/aic-removed-script.cjs` not in AIC_SCRIPT_NAMES; run install.cjs; file must be deleted. |

## Acceptance Criteria

- [ ] install.cjs: script copy is idempotent; stale cleanup removes only aic-*.cjs not in manifest; settings.json write is idempotent; CLAUDE.md is version-stamped and skipped when version matches.
- [ ] claude-code-integration-layer.md §13 lists the five installer steps matching Cursor.
- [ ] `pnpm lint` — zero errors, zero warnings.
- [ ] No new files; only the two modified files.

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
