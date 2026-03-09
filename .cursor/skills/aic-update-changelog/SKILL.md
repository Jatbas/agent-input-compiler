# Update Changelog

## Purpose

Maintain a curated, user-facing `CHANGELOG.md` at the project root. The changelog tracks notable public-facing changes grouped by release version, following [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/).

## When to Use

- When the user says "update changelog"
- Before cutting a release (to finalize the `[Unreleased]` section into a versioned entry)
- After completing a phase or significant user-facing milestone
- When suggested by the `aic-update-mvp-progress` skill

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
4. **Bump versions** in `shared/package.json` and `mcp/package.json` to `x.y.z`.
5. **Commit:** `git add CHANGELOG.md shared/package.json mcp/package.json && git commit -m "chore(release): x.y.z"`.
6. **Tag:** `git tag vx.y.z`.
7. **Push:** `git push && git push origin vx.y.z`.
8. **Build both packages** from the repo root: `pnpm --filter @jatbas/aic-shared run build && pnpm --filter @jatbas/aic-mcp run build`. If either build fails, stop and report the error.
9. **Publish to npm** (order matters — shared first because mcp depends on it):

   a. `pnpm --filter @jatbas/aic-shared publish --no-git-checks --access public`

   b. `pnpm --filter @jatbas/aic-mcp publish --no-git-checks --access public`

   c. **Why `pnpm publish`:** pnpm automatically replaces `workspace:*` dependencies with the real version number in the published tarball. Using `npm publish` would publish the raw `workspace:*` string, breaking installs. Never use `npm publish` for this monorepo.

   d. If publish fails (e.g., version already exists, auth error), stop and report the error. Do not proceed to GitHub Release with a broken npm package.

10. **Verify npm publish:** Run `npm view @jatbas/aic-mcp@x.y.z dependencies --json` and confirm `@jatbas/aic-shared` shows a real version number (not `workspace:*`). If it still shows `workspace:*`, the publish was incorrect — stop and report.

11. **Create GitHub Release:**

    a. **Extract** the `[x.y.z]` section from `CHANGELOG.md`: from the line `## [x.y.z] - YYYY-MM-DD` through the last line before the next `## ` heading. This is the release notes body.

    b. **Run** `gh release create vx.y.z --notes "<extracted content>"` (use a temp file or heredoc for the notes to avoid shell escaping issues). The tag must already exist on the remote.

    c. If `gh` is not installed, not authenticated, or the command fails: output the extracted notes in a markdown block and tell the user to create the release manually on GitHub (Releases → Create a new release → choose tag vx.y.z → paste the notes).

12. **Report summary** to the user: version, npm package links, GitHub Release URL, and any issues encountered.

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
