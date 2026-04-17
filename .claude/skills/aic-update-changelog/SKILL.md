---
name: aic-update-changelog
description: Maintains root CHANGELOG.md (Keep a Changelog) with curated user-facing release notes from completed work.
editors: all
---

# Update Changelog (SKILL.md)

## QUICK CARD

- **Purpose:** Keep `CHANGELOG.md` accurate and user-facing. Ordinary updates append to `[Unreleased]`; a release cut promotes `[Unreleased]` to a new version section.
- **Inputs:** Mode — one of `update`, `release`, `show`, `deprecate`. Optional version string for `release` / `deprecate`.
- **Outputs:** Updated `CHANGELOG.md` + (for release mode) updated `package.json` versions.
- **Non-skippable steps:**
  - update → append entries under `[Unreleased]`.
  - release → promote `[Unreleased]` → version-dated section; bump package versions.
  - show → print the latest `n` sections.
  - deprecate → add a banner to a past release section.
- **Mechanical gates:**
  `bash .claude/skills/shared/scripts/changelog-format-check.sh CHANGELOG.md` — must pass after every change.
- **Checkpoint lines:** emit per mode; `checkpoint-log.sh`.
- **Degraded mode:** Single-agent, sequential. No subagents involved.

## Severity vocabulary (only two tiers)

- **HARD RULE** — enforced by `changelog-format-check.sh`.
- **GUIDANCE** — style.

## HARD RULES

1. **Keep a Changelog structure.** Only these `###` categories: Added, Changed, Deprecated, Removed, Fixed, Security.
2. **No placeholder versions / dates.** Never commit `## [X.Y.Z] - YYYY-MM-DD`.
3. **No internal codes.** No `Task N`, `Phase L`, `AK01`.
4. **No temporal references.** Entries are timeless ("adds X" not "now supports X").
5. **No hedge words.** `changelog-format-check.sh` scans for `might`, `possibly`, `consider`, etc.
6. **Release sections are dated ISO** `YYYY-MM-DD`.
7. **Every release tag matches** the `package.json` version bumped in the same commit.

## GUIDANCE

- One bullet per user-visible change; start with a verb.
- Prefer declarative, imperative phrasing ("Add structured log output").
- Group related bullets under the right category; do not dump everything under "Changed".

## Autonomous execution

Run continuously. Stop only on a mechanical gate failure.

## When to use

- After a significant commit / feature lands.
- Before cutting a release.
- When the user asks "what's in the latest release".
- When a prior release needs a deprecation banner.

## When NOT to use

- Internal development notes (use task file or commit body).
- Per-commit diary entries (granularity is wrong).

## Process overview (inline phases per mode)

- **update mode** — append bullets under `[Unreleased]` using the correct `### Category` heading. Run `changelog-format-check.sh`. Checkpoint: `unreleased-updated`.
- **release mode** — promote `[Unreleased]` to `## [X.Y.Z] - <today ISO>`, recreate an empty `[Unreleased]`, bump every published `package.json` to `X.Y.Z`. Run `changelog-format-check.sh`. Checkpoint: `release-cut`.
- **show mode** — print the latest `n` version sections (default 1) back to the user as-is. Checkpoint: `show-delivered`.
- **deprecate mode** — add a `> **DEPRECATED** — <reason, one line, pointing at replacement version>` block under the target version heading. Run `changelog-format-check.sh`. Checkpoint: `deprecation-applied`.

## Failure patterns

- Promoting `[Unreleased]` before the last feature commits land.
- Leaving empty `### Category` headings (e.g. `### Added` with no bullets).
- Referring to task IDs or phase codes that mean nothing to users.

## Output checklist

- [ ] `changelog-format-check.sh` passes.
- [ ] `[Unreleased]` exists.
- [ ] For release mode: package.json version matches.
- [ ] For release mode: date is today's ISO date.
- [ ] Checkpoint line for the mode run.
