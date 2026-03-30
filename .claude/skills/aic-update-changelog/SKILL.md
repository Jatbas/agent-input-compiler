---
name: aic-update-changelog
description: Maintains root CHANGELOG.md (Keep a Changelog) with curated user-facing release notes from completed work.
---

> **Audience: Internal — developer workflow only. Do not invoke via agent delegation.**

# Update Changelog

## Purpose

Maintain a curated, user-facing `CHANGELOG.md` at the project root. The changelog tracks notable public-facing changes grouped by release version, following [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/).

## Editors

- In Cursor, attach the skill with `@` or invoke via `/`; where the skill names the Task tool with `subagent_type` or subagents, use those Cursor mechanisms.
- In Claude Code, invoke with `/` plus the skill `name`; where the skill references multi-agent work, follow Claude Code subagent or parallel-session patterns.

## When to Use

- When the user says "update changelog"
- Before cutting a release (to finalize the `[Unreleased]` section into a versioned entry)
- After completing a phase or significant user-facing milestone
- When suggested by the `aic-update-progress` skill
- When the user says "show releases" — to list all versions and their status
- When the user says "deprecate x.y.z" — to deprecate a release on npm, GitHub, and in the changelog

Do **not** run after every small internal task — that is the progress-update skill's job.

## Inputs

1. **`CHANGELOG.md`** (project root) — the current changelog, or absent if bootstrapping.
2. **`documentation/tasks/progress/aic-progress.md`** — source of truth for what has been implemented (main workspace only — gitignored). Read this to understand recent completions.
3. **The user's message** — may specify which changes to add, or request a release cut.

## Steps

### Normal update (add to `[Unreleased]`)

0. **Backup** — before touching any file, run `mkdir -p documentation/bck && cp CHANGELOG.md "documentation/bck/CHANGELOG.bck.$(date +%Y%m%d-%H%M%S).md"`. If `CHANGELOG.md` does not exist yet (bootstrapping), skip this step.

1. **Read** `CHANGELOG.md`. If it does not exist, bootstrap it with the file header (see Format below) and an empty `[Unreleased]` section. If the file exists but has no `[Unreleased]` section, insert one immediately after the file header and before the first versioned section.

2. **Read** `documentation/tasks/progress/aic-progress.md` from the **main workspace** (this file is gitignored and does not exist in worktrees). Look for components with `Done` in the Status column of Phase tables, and completed entries under `### YYYY-MM-DD` daily log headings. If the most recent daily log entry is older than the most recent git commit, warn the user that the progress file may be stale before proceeding. If aic-progress.md does not exist or is empty (e.g., running in a worktree or after ad-hoc work), fall back to `git log <last-tag>..HEAD --oneline` and use that as the raw input for curation.

3. **Curate entries for `[Unreleased]`:**
   - Collapse internal implementation detail into user-facing descriptions. Multiple related components become one line (e.g., three scan optimizations become "Compilation scan performance improvements").
   - Categorize each entry under the correct heading: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.
   - Only include headings that have entries — omit empty category headings.
   - Write from the user's perspective, not the developer's. Translate developer language (phase names, component names, task IDs) into user-facing prose.

3a. **Git log cross-check** — run `git log $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD --oneline`. Scan each commit for user-visible work — ignore `chore(deps):`, `style:`, `refactor:`, `test:`, `docs:`, and fixup commits that are already absorbed by a feature entry. For every significant `feat:`, `fix:`, or `security:` commit not yet represented in the curated entries, add a changelog entry or flag the gap to the user. Zero uncovered user-visible changes is the goal.

3b. **Spawn a critic agent** — before writing to the file, spawn a separate agent with the proposed `[Unreleased]` entries and these instructions: (a) verify every entry follows the Curation Rules (no task IDs, no phase letters, no internal jargon, imperative fragments, no prohibited language patterns); (b) identify entries that should be merged; (c) verify each entry would be meaningful and self-contained to a user who did not build the feature. Incorporate the critic's feedback before proceeding to step 4.

4. **Rewrite the full `[Unreleased]` section** with the curated and critic-reviewed entries. The skill may freely reorganize, reword, merge, or remove items within `[Unreleased]` to keep it clean and readable.

4a. **Format verification** — after writing, verify the `[Unreleased]` section: (a) only headings `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security` are present; (b) each is a `###` heading; (c) every entry is a single bullet with an imperative fragment; (d) no empty category headings exist; (e) no sub-bullets. A malformed section will break the release skill's parser. If all checks pass, remove the backup created in step 0 (it is named with the timestamp from that step). If any check fails, keep the backup and report the issue before proceeding.

5. **Never modify released sections** (`[x.y.z] - date`) unless the user explicitly asks to reword them.

6. **No placeholder or future released versions.** Never add or leave a section like `## [x.y.z] - YYYY-MM-DD` where the date is a placeholder (e.g. `YYYY-MM-DD`) or where the version does not match the current version in `shared/package.json`. Released sections must only exist for versions that have actually been cut (with a real date). Work that is not yet released belongs under `[Unreleased]` only. If you find an existing released section with a placeholder date or a version ahead of the package, move its content into `[Unreleased]` and remove that section.

7. **Suggest a release if warranted.** After writing `[Unreleased]`, evaluate whether a new release makes sense:

   a. **Read** `shared/package.json` to get the current published version (e.g. `0.2.1`).

   b. **Classify** the unreleased entries by semver impact:
   - `Added` entries → **minor** bump candidate
   - `Security` entries → **patch** bump candidate (a security fix is a patch; if it also appears under `Added`, the `Added` entry already drives minor)
   - `Changed`, `Fixed`, `Deprecated`, `Removed` entries only → **patch** bump candidate
   - Any entry explicitly described as a breaking change → **major** bump candidate
   - The highest-impact category wins (major > minor > patch).

   c. **Compute the suggested version** by applying the highest-impact bump to the current version.

   d. **Skip the suggestion** (say nothing) if `[Unreleased]` is empty or has no new entries compared to what was already there before this run.

   e. **Ask the user:**

   > The `[Unreleased]` section has N entries (categories: X, Y). Based on semver, the next version would be **A.B.C**.
   >
   > Want me to cut release A.B.C? (yes / different version / not now)

   f. **Never auto-release.** Always wait for the user's explicit answer before proceeding.

### Release cut (promote `[Unreleased]` to a version)

When the user approves a release suggestion above, or says "cut release x.y.z" directly:

0. **Pre-flight checks** — run these before touching any file:

   a. **Branch:** Run `git branch --show-current`. If the result is not `main`, stop and tell the user to switch to `main` before cutting a release.

   b. **Clean tree:** Run `git status --porcelain`. If any files are staged or modified beyond the files that will be committed (`CHANGELOG.md`, `README.md`, `package.json`, `shared/package.json`, `mcp/package.json`), surface a warning listing the unexpected changes and ask the user to stash or commit them first.

1. **Rename** `[Unreleased]` to `[x.y.z] - YYYY-MM-DD` using today's date.
2. **Create a fresh empty `[Unreleased]`** section above the new version entry.
3. **Update comparison links** at the bottom of the file if they exist.
4. **Bump versions** in `package.json` (root), `shared/package.json`, and `mcp/package.json` to `x.y.z`. All three must have the same version — verify before proceeding. Then run `pnpm install` to update `pnpm-lock.yaml` to reflect the bumped workspace dependency resolution.
5. **Build gate:** Run `pnpm build && pnpm typecheck`. If either fails, stop and report the error. Do not proceed to commit or tag until the build is clean — a bad tag on the remote is difficult to retract and npm's immutability rule can permanently burn a version slot.
6. **Commit:** `git add CHANGELOG.md package.json shared/package.json mcp/package.json pnpm-lock.yaml && git commit -m "chore(release): x.y.z"`.
7. **Tag:** `git tag vx.y.z`.
8. **Push:** `git push origin main && git push origin vx.y.z`.
9. **Prune prior versions on GitHub:** Keep only the semver tag `vx.y.z` on `origin` — older `vMAJOR.MINOR.PATCH` tags and their GitHub releases are removed so the remote does not accumulate historical tags. (Published npm versions are unchanged and remain addressable by version number.)

   a. List remote semver tags: `git ls-remote --tags origin 'refs/tags/v*'`, take the second column, strip `refs/tags/`, keep names matching `^v[0-9]+\.[0-9]+\.[0-9]+$`.

   b. For each such tag `T` where `T` is not `vx.y.z`, run `gh release delete T --yes --cleanup-tag`. If it fails because no release exists for `T`, continue.

   c. Re-list remote tags. For each semver `T` still present other than `vx.y.z`, run `git push origin :refs/tags/T`.

   d. Run `git fetch origin --prune-tags` so local remote-tracking tags match.

10. **Wait for CI to publish to npm.** The GitHub Actions workflow (`.github/workflows/publish.yml`) triggers automatically on `v*` tag pushes and handles building and publishing both packages via OIDC trusted publishing. Do **not** attempt to publish locally.

a. **Poll CI status:** Run `gh run list --repo Jatbas/agent-input-compiler --workflow publish.yml --limit 5` and find the run whose triggering ref is `refs/tags/vx.y.z`. Poll up to 20 times (roughly 5–10 minutes at 15–30 second intervals). If the run has not completed after 20 polls, report the run URL to the user and ask them to monitor it manually before proceeding.

b. **If CI fails:** Report the failure to the user with `gh run view <run-id> --log-failed` output. Do not proceed to GitHub Release with a broken npm package.

11. **Verify npm publish:** Confirm both packages published successfully:

    a. Run `npm view @jatbas/aic dist-tags.latest` — it must equal `x.y.z`.

    b. Run `npm view @jatbas/aic-core@x.y.z version` — it must return `x.y.z`.

    If either check fails or the version is not yet visible, wait a few seconds and retry. If the version still does not appear after several retries, stop and report — do not create a GitHub Release for an unpublished version.

12. **Create GitHub Release:**

    a. **Extract** the `[x.y.z]` section from `CHANGELOG.md`: from the line `## [x.y.z] - YYYY-MM-DD` through the last line before the next `## ` heading. This is the release notes body.

    b. **Run** `gh release create vx.y.z --notes "<extracted content>"` (use a temp file or heredoc for the notes to avoid shell escaping issues). The tag must already exist on the remote.

    c. If `gh` is not installed, not authenticated, or the command fails: output the extracted notes in a markdown block and tell the user to create the release manually on GitHub (Releases → Create a new release → choose tag vx.y.z → paste the notes).

13. **Report summary** to the user: version, npm package links, GitHub Release URL, and any issues encountered (including how many prior tags/releases were pruned).

### Show releases

When the user says "show releases" (or similar):

1. **Collect GitHub tags:** Run `git tag -l "v*" --sort=-v:refname` to list tags in reverse version order.

2. **Collect GitHub Releases:** Run `gh release list --limit 50` to get releases and their status (Latest, Pre-release, Draft).

3. **Collect npm versions and deprecation status:** Run `npm view @jatbas/aic --json` and `npm view @jatbas/aic-core --json` (two calls total — each returns the full packument including all versions and their deprecation messages). Parse the `versions` object from each response to get version lists, and check each version's `deprecated` field for deprecation messages. If the two packages have different deprecation states for the same version, flag that as an inconsistency. Do **not** make per-version npm calls — the two packument fetches contain all the information needed.

4. **Collect changelog status:** Read `CHANGELOG.md` and check which versions are marked as `(Deprecated)`.

5. **Present a table** to the user:

   | Version | GitHub Release           | npm (`aic`) | npm (`aic-core`) | Changelog                           |
   | ------- | ------------------------ | ----------- | ---------------- | ----------------------------------- |
   | 0.4.3   | Latest                   | published   | published        | `[0.4.3] - 2026-03-10`              |
   | 0.4.2   | Pre-release (Deprecated) | deprecated  | deprecated       | `[0.4.2] - 2026-03-09 (Deprecated)` |
   | 0.4.1   | —                        | —           | —                | `[0.4.1] - 2026-03-09 (Deprecated)` |

   Use "—" for missing entries. Show at most 20 versions.

### Deprecate a release

When the user says "deprecate x.y.z" (or similar):

1. **Validate** that version x.y.z exists (check git tags and npm). If it does not exist on either, report what was found and ask the user how to proceed.

2. **Ask for confirmation:**

   > This will:
   >
   > - Deprecate @jatbas/aic@x.y.z and @jatbas/aic-core@x.y.z on npm (users see a warning on install; existing installs still work)
   > - Mark the GitHub Release vx.y.z as deprecated (pre-release + notes prefixed with "DEPRECATED")
   > - Annotate the changelog entry as (Deprecated)
   >
   > Proceed? (yes / no)

3. **Never auto-deprecate.** Always wait for the user's explicit answer before proceeding.

4. **Deprecate on npm** (both packages):

   a. `npm deprecate "@jatbas/aic-core@x.y.z" "Deprecated: use <latest> instead"`

   b. `npm deprecate "@jatbas/aic@x.y.z" "Deprecated: use <latest> instead"`

   Replace `<latest>` with the highest non-deprecated version from `npm view @jatbas/aic versions --json`. If the deprecation command fails (e.g., auth error, OTP required), stop and tell the user to run the command manually.

5. **Deprecate on GitHub:** Run `gh release edit vx.y.z --prerelease --notes "DEPRECATED: <original notes>"`. This marks the release as a pre-release (so it is no longer "Latest") and prepends "DEPRECATED" to the release notes. If `gh` fails, tell the user to edit the release manually.

6. **Update `CHANGELOG.md`:** Change `## [x.y.z] - YYYY-MM-DD` to `## [x.y.z] - YYYY-MM-DD (Deprecated)`. Do not remove the section or its entries — they remain for historical reference.

7. **Report** what was done and any steps that failed.

## Format

The file must always follow this structure:

```
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).
This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- ...

## [x.y.z] - YYYY-MM-DD

### Added
- ...
```

## Curation Rules

- **No task IDs.** Never reference task file names or internal tracking IDs.
- **No phase letters.** Never mention "Phase N", "Phase O", etc.
- **No daily logs.** The changelog is not a development diary.
- **No package paths** unless they matter to users (e.g., a public API path change).
- **No internal jargon.** Write for someone installing and using the tool, not developing it.
- **Keep it short.** Prefer one strong line over three weak ones. If two entries say nearly the same thing, merge them.
- **Use imperative fragments** for consistency (e.g., "Add session deduplication", not "Added session deduplication" or "Session deduplication was added").
- **No hedging language.** Never write: "if needed", "might", "possibly", "potentially", "perhaps", "e.g.", "for example", "such as", "something like", "or similar", "etc.", "and so on", "consider", "you could", "you might want", "should" (when implying optionality), "able to", "appropriate", "suitable", or "reasonable" without a specific qualifier. Each signals an unresolved decision — decide, then write the definitive entry. Exception: "may" is acceptable only in security or behavior-dependency statements where the condition is real ("requests may fail if the token is expired") — never to hedge scope.
- **No temporal references.** Never write "recently added", "just added", "new in this release" (redundant — it is in `[Unreleased]`), "now supports", "currently", "still", or "will be available". Describe capability, not transition: "Supports X" not "Now supports X". Entries are timeless — they describe what the software does, not when it changed.
- **User-visible effect, not implementation mechanism.** Translate every capability to its user-observable outcome: "Reduce token usage for large repositories" not "Implement LRU eviction in the file scorer".
- **Professional register.** Write for someone installing and running the tool. Use technical documentation language: "verify" not "make sure", "files under X/" not "stuff under X/", state the quantity rather than "a bunch of". Avoid casual constructions. See `aic-documentation-writer/SKILL-standards.md` §Professional register for the complete list.

## Conventions

- Category headings appear in this order when present: Added, Changed, Deprecated, Removed, Fixed, Security
- Dates use ISO 8601 format: `YYYY-MM-DD`
- Versions are newest first (reverse chronological)
- The `[Unreleased]` section is always present at the top, even if empty
- One bullet per notable change — no sub-bullets
