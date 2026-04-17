---
name: aic-release
description: Orchestrates the complete release sequence — validation, documentation audit, changelog, and publish.
editors: all
---

# Release (SKILL.md)

## QUICK CARD

- **Purpose:** Cut a release end-to-end. Single entry point.
- **Inputs:** Target version (derived from changelog, or specified by user).
- **Outputs:** Published npm package(s), git tag, GitHub release, updated docs.
- **Non-skippable steps:** Validate → Doc audit → Changelog finalise → Publish → Tag → Deprecate old versions.
- **Mechanical gates:**
  `pnpm typecheck && pnpm lint && pnpm test && pnpm knip` — must all pass before publish.
  `bash .claude/skills/shared/scripts/changelog-format-check.sh CHANGELOG.md`
  `node integrations/__tests__/pack-install-smoke.test.cjs`
- **Checkpoint lines:** Emit at each phase; call `checkpoint-log.sh`.
- **Degraded mode:** Each phase is an independent hard gate. Never proceed past a failed gate. If the CLI cannot publish (network, auth), stop and report — do not skip and catch up later.

## Severity vocabulary (only two tiers)

- **HARD RULE** — blocks the release; no exceptions.
- **GUIDANCE** — best practice.

## HARD RULES

1. **No release with a failing gate.** If any of typecheck / lint / test / knip / changelog-format / smoke-test fails, stop and fix.
2. **Never skip the doc audit.** Dispatch `aic-documentation-writer` in audit mode before finalising the changelog.
3. **Never publish with uncommitted changes.** Working tree must be clean.
4. **Never publish to `latest` when releasing a prerelease.** Use `--tag alpha` / `--tag beta` / `--tag rc`.
5. **Tag format:** `vMAJOR.MINOR.PATCH` exactly, matching the version in the published package.
6. **Never `--force` push to `main`.** The release-tagging push uses standard push; if it is rejected, investigate — do not force.
7. **Deprecate prior versions after publishing.** If the release fixes a known bug, `npm deprecate` the affected prior versions with a one-line message pointing at the fixed version.

## GUIDANCE

- Prefer `pnpm publish` over `npm publish` for workspace protocol resolution.
- Announce the release in the repo (GitHub release notes) with a one-line summary plus the changelog section.

## Autonomous execution

Run continuously from validate through tag. Stop only on:

- A failing gate.
- An auth error (token expired, registry unreachable).
- A mismatch between `CHANGELOG.md` version and `package.json` version.

## When to use

- The user says "cut a release" / "publish" / "release X.Y.Z".
- Every published package needs a release.

## When NOT to use

- Adding a new feature (use `aic-task-planner` + `aic-task-executor`).
- Updating docs only (use `aic-documentation-writer`).

## Inputs

- Target version (from user, or latest `[Unreleased]` section in `CHANGELOG.md` once promoted).
- `package.json` files of every published package.

## Process overview (inline phases)

Each phase is a hard gate. Never proceed past a failure.

1. **Validate** — run `pnpm typecheck && pnpm lint && pnpm test && pnpm knip`. Run `node integrations/__tests__/pack-install-smoke.test.cjs`. Run `bash .claude/skills/shared/scripts/changelog-format-check.sh CHANGELOG.md`. All must pass. Working tree must be clean (`git status --porcelain` empty). Checkpoint: `validated`.
2. **Doc audit** — dispatch `aic-documentation-writer` in audit mode on `README.md`, `documentation/`, `.claude/CLAUDE.md`, `.cursor/rules/aic-architect.mdc`. Apply HARD findings. Checkpoint: `doc-audit-complete`.
3. **Changelog finalise** — promote `[Unreleased]` to `## [X.Y.Z] - <today ISO>`. Re-add an empty `[Unreleased]` section at top. Bump every `package.json` to `X.Y.Z`. Commit as `release(vX.Y.Z): finalise changelog`. Checkpoint: `changelog-finalised`.
4. **Publish** — `pnpm publish -r --tag <channel>` (channel = `latest` for stable, `alpha` / `beta` / `rc` for prereleases). Verify the published tarball with `npm view <package>@<version>`. Checkpoint: `published`.
5. **Tag + GitHub release** — `git tag vX.Y.Z && git push origin vX.Y.Z`. Create the GitHub release with `gh release create vX.Y.Z --notes-from-tag` (or paste the changelog section as notes). Checkpoint: `tagged`.
6. **Deprecate prior versions** — if this release fixes a known bug present in a prior version, run `npm deprecate <package>@"<range>" "<one-line message referencing vX.Y.Z>"`. Checkpoint: `deprecations-applied`.

## Subagent dispatch

This skill does not dispatch its own subagents; it delegates the doc audit to `aic-documentation-writer` in audit mode, which dispatches its own.

## Failure patterns

- Publishing, then realising the changelog still says `[Unreleased]`.
- Tagging before the package is actually visible on the registry.
- Skipping smoke tests.
- Forgetting to deprecate a known-broken prior version.

## Output checklist

- [ ] Every gate passed (typecheck, lint, test, knip, changelog-format, smoke test).
- [ ] Release section in `CHANGELOG.md` dated ISO `YYYY-MM-DD`.
- [ ] Git tag `vX.Y.Z` pushed.
- [ ] GitHub release created.
- [ ] Prior deprecations applied.
- [ ] Six checkpoint lines in `.aic/skill-log.jsonl`.
