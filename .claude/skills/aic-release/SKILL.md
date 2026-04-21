---
name: aic-release
description: Orchestrates the complete release sequence — validation, documentation audit, changelog, and publish.
editors: all
---

# Release (SKILL.md)

## QUICK CARD

- **Purpose:** Cut a release end-to-end. Single entry point. Run unattended.
- **Inputs:** Target version (from user, or derived from `[Unreleased]` in `CHANGELOG.md`).
- **Outputs:** Published npm package(s) (via CI), git tag `vX.Y.Z`, GitHub release, updated docs, deprecations applied.
- **Non-skippable steps:** Validate → Doc audit → Changelog + version bump → Tag push (CI publishes) → Verify registry → GitHub release → Deprecate prior.
- **Mechanical gates:**
  `pnpm typecheck && pnpm lint && pnpm test && pnpm knip` — must all pass.
  `bash .claude/skills/shared/scripts/changelog-format-check.sh CHANGELOG.md`
  `node integrations/__tests__/pack-install-smoke.test.cjs`
- **Checkpoint lines:** Emit at each phase; call `checkpoint-log.sh`.
- **Degraded mode:** Each phase is an independent hard gate. Never proceed past a failed gate. If a publishing or tag step cannot be completed (network, auth), stop and report — do not skip and catch up later.

## Severity vocabulary (only two tiers)

- **HARD RULE** — blocks the release; no exceptions.
- **GUIDANCE** — best practice.

## HARD RULES

1. **No release with a failing gate.** If any of typecheck / lint / test / knip / changelog-format / smoke-test fails, stop and fix.
2. **Never skip the doc audit.** Dispatch `aic-documentation-writer` in audit mode before finalising the changelog.
3. **Every mechanical edit is committed AND pushed inside the phase that produced it.** No phase completes with local-only commits. The sequence in every phase that mutates files is: edit → run gate → `git add` → `git commit` → `git push`. Never leave uncommitted changes between phases. Never commit without pushing.
4. **Working tree must be clean before tagging.** `git status --porcelain` must be empty and the branch must be in sync with `origin/main` before `git tag` runs.
5. **Publishing is CI-driven via tag push.** This repo publishes through `.github/workflows/publish.yml`, triggered by pushing a `v*` tag. The agent MUST NOT run `pnpm publish` / `npm publish` locally. The agent's publish action is `git push origin vX.Y.Z`, followed by polling `npm view <package>@<version> version` until every published package is visible (max 15 minutes, 30-second interval). CI failure is a hard stop.
6. **Never publish to `latest` when releasing a prerelease.** For prereleases, the tag is still `vX.Y.Z-alpha.N` / `-beta.N` / `-rc.N`; the CI workflow must be configured for the channel before tagging. If not, stop.
7. **Tag format:** `vMAJOR.MINOR.PATCH` (or `vMAJOR.MINOR.PATCH-<pre>.<n>`) exactly, matching every `package.json` `version` field across the workspace. Tag must be annotated (`git tag -a -m`).
8. **Never `--force` push to `main`.** The release-tagging push uses standard push; if it is rejected, investigate — do not force.
9. **Deprecate prior versions after publishing.** Default policy: deprecate the immediately previous version of each published package unless `npm view <pkg>@<prev> deprecated` already returns a non-empty string. Skip versions that are already deprecated. Older releases that are already deprecated are left alone.

## GUIDANCE

- Announce the release in the repo (GitHub release notes) with a one-line summary plus the changelog section, via `gh release create --notes-from-tag`.
- When the doc audit surfaces only GUIDANCE findings (no HARD), note them in the GitHub release body under "Follow-ups" rather than blocking the release.

## Autonomous execution

Run continuously from validate through deprecate. Commit AND push after every mutating step without asking the user. The only stops are:

- **A failing mechanical gate** (typecheck, lint, test, knip, changelog-format, smoke test) that cannot be resolved by a local edit the agent can make and commit. Report the failure and stop.
- **Doc audit HARD finding that is a prescriptive-document contradiction** (see `aic-documentation-writer` §Autonomous execution, Cardinal Rule 7). Report and stop; never resolve silently.
- **Auth error.** `git push` rejected by remote (not fast-forward, missing credentials), `gh` not authenticated, npm registry unreachable, or `npm deprecate` returns `EOTP`. For `EOTP` specifically, see the OTP protocol in §Process overview step 7 — prompt the user exactly once for the OTP at the start of the deprecate phase, then run both `npm deprecate` commands non-interactively; any OTP error after that first prompt is a hard stop.
- **CI publish failure.** `npm view <pkg>@<version>` does not return the new version within 15 minutes of the tag push, or the GitHub Actions run for the `Publish` workflow concludes with a non-success status. Report the workflow URL and stop.
- **Version mismatch.** `CHANGELOG.md` target version does not match the version in any `package.json`, or the tag name does not match the package version.

Do NOT stop for any of the following — handle them autonomously:

- Uncommitted changes produced by the skill itself (audit fixes, changelog promote, version bump, smoke-test repair). Commit and push them.
- A branch behind `origin/main`. Run `git pull --ff-only` at the start of the phase.
- A smoke test that fails because of a filename heuristic that the version bump invalidated. Fix the heuristic, commit with `fix(test): ...`, push, rerun.
- Choosing between local publish and CI publish. It is always CI (see HARD RULE 5).

## When to use

- The user says "cut a release" / "publish" / "release X.Y.Z".
- Every published package needs a release.

## When NOT to use

- Adding a new feature (use `aic-task-planner` + `aic-task-executor`).
- Updating docs only (use `aic-documentation-writer`).

## Inputs

- Target version (from user, or the `[Unreleased]` section of `CHANGELOG.md` once promoted).
- `package.json` files of every published package (`package.json`, `mcp/package.json`, `shared/package.json`).
- Current branch must be `main` (or the designated release branch) and must be clean or contain only edits the skill itself will commit.

## Process overview (inline phases)

Each phase is a hard gate. Never proceed past a failure. Every phase that mutates files ends with `git add` → `git commit` → `git push` — no exceptions.

1. **Preflight + Validate.** Confirm current branch, run `git pull --ff-only`, verify `git status --porcelain` is empty or only contains files the skill will itself commit later. Run `pnpm typecheck && pnpm lint && pnpm test && pnpm knip`. Run `node integrations/__tests__/pack-install-smoke.test.cjs`. Run `bash .claude/skills/shared/scripts/changelog-format-check.sh CHANGELOG.md`. All must pass. Checkpoint: `validated`.
2. **Doc audit.** Dispatch `aic-documentation-writer` in audit mode on `README.md`, `documentation/`, `.claude/CLAUDE.md`, `.cursor/rules/aic-architect.mdc`. Apply HARD findings. If the audit changed files: `git add -A && git commit -m "docs(release): apply audit findings for vX.Y.Z" && git push`. If a prescriptive-document contradiction is reported, stop (see §Autonomous execution). Checkpoint: `doc-audit-complete`.
3. **Changelog finalise + version bump.** Promote `[Unreleased]` to `## [X.Y.Z] - <today ISO>`. Re-add an empty `[Unreleased]` section at top with the standard subsection placeholders. Bump every workspace `package.json` (`package.json`, `mcp/package.json`, `shared/package.json`, plus any other workspace package with a `version` field that must stay aligned) to `X.Y.Z`. Rerun `bash .claude/skills/shared/scripts/changelog-format-check.sh CHANGELOG.md`. Commit as `chore(release): finalise changelog for vX.Y.Z` and push. Checkpoint: `changelog-finalised`.
4. **Pre-tag gate.** Rerun the full gate suite (`pnpm typecheck && pnpm lint && pnpm test && pnpm knip && node integrations/__tests__/pack-install-smoke.test.cjs`). If the smoke test fails because the new version broke a filename heuristic, repair the heuristic, commit with `fix(test): <description>` (not `chore(release)`), push, and rerun. Repeat until clean or until the failure is architectural — if architectural, stop. Confirm `git status --porcelain` is empty. Checkpoint: `pre-tag-gate-green`.
5. **Tag + trigger CI publish.** Create an annotated tag: `git tag -a vX.Y.Z -m "Release X.Y.Z"`. Push the tag: `git push origin vX.Y.Z`. Pushing the tag triggers `.github/workflows/publish.yml`. Record the workflow run URL via `gh run list --workflow=publish.yml --limit 1 --json databaseId,url`. Checkpoint: `tag-pushed`.
6. **Verify CI publish.** Poll `gh run view <id> --json status,conclusion` every 30 seconds until `status=completed`, max 15 minutes. If `conclusion != success`, fetch logs via `gh run view <id> --log-failed` and stop. Once CI succeeds, confirm registry visibility: `npm view @jatbas/aic@X.Y.Z version` and `npm view @jatbas/aic-core@X.Y.Z version` must both return `X.Y.Z`. Then create the GitHub release: `gh release create vX.Y.Z --notes-from-tag --verify-tag`. Checkpoint: `published`.
7. **Deprecate prior versions.** For each published package (`@jatbas/aic`, `@jatbas/aic-core`):
   - Read the immediately previous version from `CHANGELOG.md` (the entry right below the new `## [X.Y.Z]`).
   - Run `npm view <pkg>@<prev> deprecated`. If it returns a non-empty string, skip (already deprecated). Log it in the checkpoint payload.
   - If empty, this version needs deprecation. The agent runs `npm deprecate <pkg>@<prev> "Superseded by <pkg>@X.Y.Z; upgrade to the stable release."` non-interactively with `--otp=$AIC_RELEASE_NPM_OTP` if the env var is set.
   - **OTP protocol.** Before the first `npm deprecate` call, if `AIC_RELEASE_NPM_OTP` is not set, prompt the user exactly once: `"npm deprecate requires a 2FA OTP. Paste current authenticator code:"`. Store it in `AIC_RELEASE_NPM_OTP` for the phase's subprocesses. Both packages reuse the same OTP (valid for 30 s — run them back-to-back). If a subsequent call returns `EOTP` anyway (OTP expired), this is a hard stop: report and let the user re-run the skill starting from phase 7.
   - After deprecation, verify: `npm view <pkg>@<prev> deprecated` must return the new message.
   - Checkpoint: `deprecations-applied` with payload listing each `{package, prev_version, action: deprecated|already-deprecated|skipped}`.

## Subagent dispatch

This skill does not dispatch its own subagents; it delegates the doc audit to `aic-documentation-writer` in audit mode, which dispatches its own.

## Failure patterns

- Pausing after an edit to "confirm with the user" instead of committing and pushing.
- Running `pnpm publish` locally despite CI-driven publishing.
- Tagging before the workspace `package.json` files are bumped.
- Tagging without pushing existing commits, so CI checks out an old SHA.
- Creating the GitHub release before registry visibility is confirmed, so release notes point at a version users cannot install yet.
- Deprecating every historical version instead of only the immediate predecessor.
- Asking the user for OTP on each `npm deprecate` call instead of prompting once and reusing within the 30-second validity window.

## Output checklist

- [ ] Every gate passed (typecheck, lint, test, knip, changelog-format, smoke test) — once before audit, once before tag.
- [ ] `CHANGELOG.md` entry dated `YYYY-MM-DD` and a fresh empty `[Unreleased]` section at top.
- [ ] All workspace `package.json` files bumped to `X.Y.Z`.
- [ ] All release-phase commits pushed to `origin` (no local-only commits).
- [ ] Annotated git tag `vX.Y.Z` pushed.
- [ ] CI `Publish` workflow concluded with `success`.
- [ ] `npm view` confirms `X.Y.Z` for every published package.
- [ ] GitHub release created with `--notes-from-tag --verify-tag`.
- [ ] Immediate-predecessor versions deprecated (or confirmed already-deprecated) for each package.
- [ ] Seven checkpoint lines in `.aic/skill-log.jsonl`: `validated`, `doc-audit-complete`, `changelog-finalised`, `pre-tag-gate-green`, `tag-pushed`, `published`, `deprecations-applied`.
