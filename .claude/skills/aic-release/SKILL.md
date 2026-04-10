---
name: aic-release
description: Orchestrates the complete release sequence — validation, documentation audit, changelog, and publish. The single entry point for cutting a release.
---

> **Audience: Internal — developer workflow only. Do not invoke via agent delegation.**

# Release

## Purpose

Run the full release sequence from a single invocation. Validates the codebase and repository state, audits documentation, checks for history noise, finalizes the changelog, publishes the new version, and deprecates prior npm versions. Each phase is a hard gate — failures stop the sequence and must be resolved before re-running.

## Editors

- **Claude Code:** Invoke with `/aic-release`. All phases run inline with explicit user approval at gates.
- **Cursor:** Attach the skill with `@` or invoke via `/`.

## Autonomous Execution

Run each phase continuously until a hard gate is reached. Do NOT pause between steps within a phase to report status or explain what you will do next. Completing one step means immediately starting the next.

**Legitimate user gates (the ONLY points where you stop and wait):**

- Phase 1 step 4: knip findings review (user decides)
- Phase 1 step 5: in-progress components warning (user confirms)
- Phase 2.5: documentation audit choice (full/quick/skip)
- Phase 3: noisy commits found (user decides yes/no)
- Phase 4: version confirmation (user approves version)
- Phase 6: deprecation commands (user runs manually)
- Any phase that produces blockers (hard stop — fix and re-run)

**Everything between gates runs without pausing.** Run all steps within Phase 1, report any blockers, then proceed to Phase 2. Run all Phase 2 checks in sequence. Do not send status messages between individual checks.

## When to Use

- When you are ready to publish a new version.
- After running `/aic-git-history-clean` (if history was noisy).

Do **not** run inside a worktree. Run from the main workspace root on branch `main` with a clean working tree.

## Steps

### Pre-flight

1. Run `git branch --show-current`. If the result is not `main`, stop: "Switch to `main` before running aic-release."
2. Run `git status --porcelain`. If output is non-empty, stop: "Working tree has uncommitted changes. Stash or commit them before running aic-release."

### Phase 0 — Model context window data

Run `node mcp/scripts/fetch-model-context-windows.cjs` from the repo root.

- If the script reports "NEW models detected", review the list in the output. These are models from Anthropic, OpenAI, or Google that were not in the previous data file. They are included automatically — no action required unless the reported context window looks wrong (in which case set `contextBudget.contextWindow` in the project's `aic.config.json` as a per-project override and proceed).
- If the script exits 0 and reports "unchanged" → proceed to Phase 1.
- If the script exits 0 and reports "updated" → the file `shared/src/data/model-context-windows.ts` has changed. Stage it and commit: `git add shared/src/data/model-context-windows.ts && git commit -m "chore(data): refresh model context windows"`. Then proceed to Phase 1.
- If the script exits non-zero → stop: "Phase 0 failed. Fix the fetch script before proceeding."

### Phase 1 — Codebase validation

Run each command in sequence. Stop on any failure and report the exact error output before asking the user how to proceed.

1. Run `pnpm build`. On failure: stop — "Build failed. Fix errors before proceeding."
2. Run `pnpm typecheck`. On failure: stop — "Typecheck failed. Fix type errors before proceeding."
3. Run `pnpm lint`. On failure: stop — "Lint failed. Fix lint errors before proceeding."
4. Run `pnpm knip`. Present findings to the user: "knip found N unused exports/files/dependencies. Review and remove or justify each." Wait for the user to confirm before proceeding. (knip findings are warnings, not hard stops — the user decides.)
5. Read `documentation/tasks/progress/aic-progress.md` (gitignored, main workspace only). Find all rows where Status is `In progress` or `Pending` in the phase tables for the current active phase. If any exist, show: "Warning: N components in the current phase are not Done: [list]. These will not be in this release. Proceed?" Wait for confirmation.

### Phase 2 — Repository state validation

1. **Gitignore leak check.** Run `git ls-files documentation/future/ documentation/tasks/ documentation/notes/ documentation/research/ 2>/dev/null`. If any files are listed, stop: "The following gitignored files are tracked in git and would be published: [list]. Run `git rm --cached [files]` and commit before proceeding."
2. **Internal language scan.** For each file in the public documentation set (all `.md` files in `documentation/` excluding gitignored subdirectories, plus `documentation/technical/*.md`), scan for these patterns:
   - `Phase (?:[A-Z]{1,2}|[0-9]+(?:\.[0-9]+)?)\b` (e.g. Phase AP, Phase O, Phase 0, Phase 1.5) — in non-code-block lines; same pattern as documentation-writer Dimension 9
   - `\bTask \d+\b` — in non-code-block lines
   - `\bT\d{2}:` — in non-code-block lines
   - `\| (Pending|In progress|Not started) \|` — in any line

   If any match is found, stop: "Internal language found in public docs: [file:line — match]. Fix before proceeding."

3. **Version consistency.** Read `package.json`, `shared/package.json`, `mcp/package.json`, and `integrations/claude/plugin/.claude-plugin/plugin.json`. Extract the `version` field from each. If all four do not match, stop: "Version mismatch: [root: X], [shared: Y], [mcp: Z], [plugin: W]. All four must match before release."
4. **Branch and tree.** Already confirmed in Pre-flight — no re-check needed.

If all Phase 2 checks pass: "Phase 2 passed."

### Phase 2.5 — Documentation audit

Ask: "Run documentation audit? (`full` / `quick` / `skip`)"

Wait for response:

**`full`:** Read `.claude/skills/aic-documentation-writer/SKILL.md`. Follow its Audit mode: invoke it on all public documentation files (all `.md` files in `documentation/` excluding gitignored subdirectories, plus `documentation/technical/*.md`). Present the resulting Structured Audit Report. Separate findings into:

- **Blockers** (must fix before release): factual inaccuracies, broken cross-references, prescriptive-doc / code contradictions, internal language missed by Phase 2 scan.
- **Warnings** (review and decide): gaps in coverage, stale content, canonical term violations, writing quality issues.

If any blockers exist, stop: "Documentation audit found N blockers. Fix them and re-run aic-release." If only warnings, show them and ask: "N warnings found. Proceed anyway? (yes / fix first)".

**`quick`:** Scan all public documentation files for:

- All patterns from Phase 2 internal language scan (re-run on any files not yet checked).
- Broken relative links: for every `[text](path)` in each file, check that the target path exists (Glob).

If any quick-scan issues found, show them and ask: "N quick-scan issues found. Fix and re-run, or proceed?" Wait for response.

**`skip`:** Proceed without doc audit. No documentation audit is run.

### Phase 3 — History noise check

1. Run `git ls-remote --tags origin "v*" | sed 's|.*refs/tags/||' | sort -V | tail -1` to get the latest version tag from the remote. If no tag exists (first release), run `git log --oneline` to list all commits. Otherwise run `git log <last-tag>..HEAD --oneline` to list commits since that tag.
2. Check each subject for noise patterns: length < 30 chars (excluding conventional prefix), contains `wip` (case-insensitive), starts with `fixup!` or `squash!`, duplicate scope as the immediately preceding commit, subject is blank or punctuation-only.
3. If any noise commits are found, show: "Found N noise commits since the last tag: [list]. Run `/aic-git-history-clean` to squash them before releasing? (yes to pause / no to continue)"
   - `yes` → stop: "Pausing. Run `/aic-git-history-clean` and then re-run `/aic-release`."
   - `no` → continue to Phase 4.
4. If no noise commits found: "Phase 3 passed — history is clean."

### Phase 4 — Changelog finalization

Read `.claude/skills/aic-update-changelog/SKILL.md`. Follow its **Normal update** steps to finalize the `[Unreleased]` section of `CHANGELOG.md`. Then follow its version suggestion logic to propose the next version.

Show the proposed version to the user: "Based on the unreleased entries, the next version would be **X.Y.Z**. Proceed with this version? (yes / different version / not now)"

- `not now` → stop: "Release paused at changelog. Re-run aic-release when ready."
- `different version` → ask: "Enter the version:" and use the provided version.
- `yes` → proceed to Phase 5 with the confirmed version.

### Phase 5 — Release cut

Read `.claude/skills/aic-update-changelog/SKILL.md` and follow its **Release cut** steps. Skip the branch check from step 0a (already confirmed in Pre-flight). Run step 0b explicitly before proceeding: run `git diff --cached --name-only` and verify no files other than `CHANGELOG.md`, `README.md`, `package.json`, `shared/package.json`, `mcp/package.json`, `integrations/claude/plugin/.claude-plugin/plugin.json`, and `pnpm-lock.yaml` are staged. If unexpected staged files are found, stop: "Unexpected staged files: [list]. Unstage them before proceeding." Use the version confirmed in Phase 4.

The release cut steps cover:

- Rename `[Unreleased]` to `[X.Y.Z] - YYYY-MM-DD`
- Bump version in `package.json`, `shared/package.json`, `mcp/package.json`, `integrations/claude/plugin/.claude-plugin/plugin.json`
- Run `pnpm install` to update `pnpm-lock.yaml`
- Run `pnpm build && pnpm typecheck` (build gate)
- Commit: `git add CHANGELOG.md README.md package.json shared/package.json mcp/package.json integrations/claude/plugin/.claude-plugin/plugin.json pnpm-lock.yaml && git commit -m "chore(release): X.Y.Z"`
- Push and tag remotely: `git push origin main && git push origin HEAD:refs/tags/vX.Y.Z` (no local tag — keeps the branch picker clean)
- **Prune prior versions on GitHub:** After the new tag is on `origin`, delete every other semver `v*` tag on the remote and its GitHub release so only `vX.Y.Z` remains — follow Release cut step 9 in `.claude/skills/aic-update-changelog/SKILL.md` (npm registry versions are not deleted).
- Poll CI: `gh run list --repo Jatbas/agent-input-compiler --workflow publish.yml --limit 5` — find the run triggered by `refs/tags/vX.Y.Z`, poll up to 20 times until complete
- Verify npm: `npm view @jatbas/aic dist-tags.latest` must equal `X.Y.Z`; `npm view @jatbas/aic-core@X.Y.Z version` must return `X.Y.Z`
- Create GitHub Release: `gh release create vX.Y.Z --notes "$(cat <<'EOF'\n[extracted changelog section]\nEOF\n)"`
- Report: version, npm links, GitHub Release URL, prune summary, any issues

### Phase 6 — Deprecate prior npm versions

After the Phase 5 report, deprecate all previously published npm versions so users who install an older version see a clear upgrade warning. This phase is non-blocking — a failure here does not invalidate the release.

1. **Collect published versions.** Run `npm view @jatbas/aic versions --json`. Parse the JSON array. If the only version is `X.Y.Z` (first release or no prior versions), skip this phase: "Phase 6 skipped — no prior versions to deprecate."

2. **Generate deprecation commands.** For each version V below `X.Y.Z`, build a per-version deprecation line. Do not use semver ranges (`@<X.Y.Z`) — they cause registry errors. Combine all versions into two shell loops:

   ```
   for v in 0.5.0 0.5.1 …; do npm deprecate "@jatbas/aic@$v" "Deprecated: upgrade to X.Y.Z"; done
   for v in 0.5.0 0.5.1 …; do npm deprecate "@jatbas/aic-core@$v" "Deprecated: upgrade to X.Y.Z"; done
   ```

3. **Present for manual execution.** CI publishes via OIDC which only covers `npm publish` — `npm deprecate` requires a local npm session. Present the two commands and ask the user to run them in a terminal where they are logged in (`npm login`). If 2FA blocks the commands, the user must temporarily disable the per-package "Require two-factor authentication for write actions" setting on npmjs.com for both packages, run the commands, then re-enable.

4. **After confirmation.** Once the user confirms deprecation succeeded, update CHANGELOG.md: for each deprecated version whose changelog heading does not already contain `(Deprecated)`, change `## [old] - YYYY-MM-DD` to `## [old] - YYYY-MM-DD (Deprecated)`. If any headings were updated, commit and push:

   `git add CHANGELOG.md && git commit -m "docs(changelog): mark prior versions as deprecated" && git push origin main`

   Report: "Phase 6 complete — N prior version(s) deprecated on npm. CHANGELOG.md updated."

## Conventions

- Phases run in order. A phase that produces blockers stops the skill — fix and re-run from the top.
- Re-running is safe and idempotent for phases 1–3 and 2.5. Phases 4 and 5 follow aic-update-changelog conventions which guard against double-release. Phase 6 is idempotent — `npm deprecate` updates the deprecation message without side effects, and the CHANGELOG.md edit is a no-op if `(Deprecated)` is already present.
- Never bump versions or push tags manually — always go through Phase 5.
- **Single remote tag:** GitHub should carry only the current `v*` semver tag after a release cut; older tags and matching releases are removed by the changelog skill's prune step. Prior npm versions remain published but are deprecated with an upgrade notice (Phase 6).
- Phase 2.5 `skip` is not recommended before first public release. Use `full` for major releases and `quick` for patch releases.
- The progress file is read in Phase 1 — if it does not exist (e.g., in a fresh clone), that step is skipped with a note.
