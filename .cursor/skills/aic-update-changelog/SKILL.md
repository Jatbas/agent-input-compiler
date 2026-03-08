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

### Release cut (promote `[Unreleased]` to a version)

When the user says "cut release x.y.z" or similar:

1. **Rename** `[Unreleased]` to `[x.y.z] - YYYY-MM-DD` using today's date.
2. **Create a fresh empty `[Unreleased]`** section above the new version entry.
3. **Update comparison links** at the bottom of the file if they exist.

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
