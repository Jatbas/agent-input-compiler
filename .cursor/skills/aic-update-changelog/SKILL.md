# Update Changelog

## Purpose

Maintain a curated, user-facing `CHANGELOG.md` at the project root. The changelog tracks notable public-facing changes grouped by release version, following [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/).

## When to Use

- When the user says "update changelog"
- Before cutting a release (to finalize the `[Unreleased]` section into a versioned entry)
- After completing a phase or significant user-facing milestone
- When suggested by the `aic-update-mvp-progress` skill
- When the user says "show releases" — to list all versions and their status
- When the user says "deprecate x.y.z" — to deprecate a release on npm, GitHub, and in the changelog

Do **not** run after every small internal task — that is the mvp-progress skill's job.

## Inputs

1. **`CHANGELOG.md`** (project root) — the current changelog, or absent if bootstrapping.
2. **`documentation/mvp-progress.md`** — source of truth for what has been implemented. Read this to understand recent completions.
3. **The user's message** — may specify which changes to add, or request a release cut.

## Steps

### Normal update (add to `[Unreleased]`)

1. **Read** `CHANGELOG.md`. If it does not exist, bootstrap it with the file header (see Format below) and an empty `[Unreleased]` section.

2. **Read** `documentation/mvp-progress.md` to identify recently completed work that is not yet reflected in the changelog.

3. **Curate entries for `[Unreleased]`:**
   - Collapse internal implementation detail into user-facing descriptions. Multiple related components become one line (e.g., three scan optimizations become "Compilation scan performance improvements").
   - Categorize each entry under the correct heading: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.
   - Only include headings that have entries — omit empty category headings.
   - Write from the user's perspective, not the developer's.

4. **Rewrite the full `[Unreleased]` section** with the curated entries. The skill may freely reorganize, reword, merge, or remove items within `[Unreleased]` to keep it clean and readable.

5. **Never modify released sections** (`[x.y.z] - date`) unless the user explicitly asks to reword them.

5b. **No placeholder or future released versions.** Never add or leave a section like `## [x.y.z] - YYYY-MM-DD` where the date is a placeholder (e.g. `YYYY-MM-DD`) or where the version does not match the current version in `shared/package.json`. Released sections must only exist for versions that have actually been cut (with a real date). Work that is not yet released belongs under `[Unreleased]` only. If you find an existing released section with a placeholder date or a version ahead of the package, move its content into `[Unreleased]` and remove that section.

6. **Suggest a release if warranted.** After writing `[Unreleased]`, evaluate whether a new release makes sense:

   a. **Read** `shared/package.json` to get the current published version (e.g. `0.2.1`).

   b. **Classify** the unreleased entries by semver impact:
   - `Added` or `Security` entries → **minor** bump candidate
   - `Changed`, `Fixed`, `Deprecated`, `Removed` entries only → **patch** bump candidate
   - Any entry explicitly described as a breaking change → **major** bump candidate

   c. **Compute the suggested version** by applying the highest-impact bump to the current version.

   d. **Skip the suggestion** (say nothing) if:
   - `[Unreleased]` is empty or has no new entries compared to what was already there before this run
   - The current version already matches a released section in `CHANGELOG.md` with today's date (a release was already cut today)

   e. **Ask the user:**

   > The `[Unreleased]` section has N entries (categories: X, Y). Based on semver, the next version would be **A.B.C**.
   >
   > Want me to cut release A.B.C? (yes / different version / not now)

   f. **Never auto-release.** Always wait for the user's explicit answer before proceeding.

### Release cut (promote `[Unreleased]` to a version)

When the user approves a release suggestion above, or says "cut release x.y.z" directly:

1. **Rename** `[Unreleased]` to `[x.y.z] - YYYY-MM-DD` using today's date.
2. **Create a fresh empty `[Unreleased]`** section above the new version entry.
3. **Update comparison links** at the bottom of the file if they exist.
4. **Bump versions** in `package.json` (root), `shared/package.json`, and `mcp/package.json` to `x.y.z`.
5. **Commit:** `git add CHANGELOG.md package.json shared/package.json mcp/package.json && git commit -m "chore(release): x.y.z"`.
6. **Tag:** `git tag vx.y.z`.
7. **Push:** `git push && git push origin vx.y.z`.
8. **Wait for CI to publish to npm.** The GitHub Actions workflow (`.github/workflows/publish.yml`) triggers automatically on `v*` tag pushes and handles building and publishing both packages via OIDC trusted publishing. Do **not** attempt to publish locally.

   a. **Poll CI status:** Run `gh run list --repo Jatbas/agent-input-compiler --limit 3` to check if the Publish workflow for tag `vx.y.z` has completed. If it is still running, wait and poll again (sleep 15-30 seconds between checks).

   b. **If CI fails:** Report the failure to the user with `gh run view <run-id> --log-failed` output. Do not proceed to GitHub Release with a broken npm package.

9. **Verify npm publish:** Run `npm view @jatbas/aic@x.y.z dependencies --json` and confirm `@jatbas/aic-core` shows a real version number (not `workspace:*`). If the version is not yet visible on npm, wait a few seconds and retry. If it still shows `workspace:*`, the publish was incorrect — stop and report.

10. **Create GitHub Release:**

    a. **Extract** the `[x.y.z]` section from `CHANGELOG.md`: from the line `## [x.y.z] - YYYY-MM-DD` through the last line before the next `## ` heading. This is the release notes body.

    b. **Run** `gh release create vx.y.z --notes "<extracted content>"` (use a temp file or heredoc for the notes to avoid shell escaping issues). The tag must already exist on the remote.

    c. If `gh` is not installed, not authenticated, or the command fails: output the extracted notes in a markdown block and tell the user to create the release manually on GitHub (Releases → Create a new release → choose tag vx.y.z → paste the notes).

11. **Report summary** to the user: version, npm package links, GitHub Release URL, and any issues encountered.

### Show releases

When the user says "show releases" (or similar):

1. **Collect GitHub tags:** Run `git tag -l "v*" --sort=-v:refname` to list tags in reverse version order.

2. **Collect GitHub Releases:** Run `gh release list --limit 50` to get releases and their status (Latest, Pre-release, Draft).

3. **Collect npm versions:** Run `npm view @jatbas/aic versions --json` to get all published versions. Then for each version, check deprecation status with `npm view @jatbas/aic@x.y.z deprecated` (returns the deprecation message, or empty if not deprecated).

4. **Collect changelog status:** Read `CHANGELOG.md` and check which versions are marked as `(Deprecated)`.

5. **Present a table** to the user:

   | Version | GitHub Release           | npm        | Changelog                           |
   | ------- | ------------------------ | ---------- | ----------------------------------- |
   | 0.4.3   | Latest                   | published  | `[0.4.3] - 2026-03-10`              |
   | 0.4.2   | Pre-release (Deprecated) | deprecated | `[0.4.2] - 2026-03-09 (Deprecated)` |
   | 0.4.1   | —                        | —          | `[0.4.1] - 2026-03-09 (Deprecated)` |

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

## Conventions

- Category headings appear in this order when present: Added, Changed, Deprecated, Removed, Fixed, Security
- Dates use ISO 8601 format: `YYYY-MM-DD`
- Versions are newest first (reverse chronological)
- The `[Unreleased]` section is always present at the top, even if empty
- One bullet per notable change — no sub-bullets
