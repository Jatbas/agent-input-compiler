# Task 143: Install link uses @latest tag

> **Status:** Pending
> **Phase:** AA — Reliable Version Updates (mvp-progress.md)
> **Layer:** install / docs
> **Depends on:** —

## Goal

Change the Cursor install deeplink and README so new installs register `npx -y @jatbas/aic@latest` instead of `npx -y @jatbas/aic`. The explicit `@latest` tag makes npx check the registry each run and pull the current version when the cache is stale.

## Architecture Notes

- Install and README only; no code or config changes. No new recipe — minimal task structure.
- Base64 config payload: `{"command":"npx","args":["-y","@jatbas/aic@latest"]}` encodes to `eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqYXRiYXMvYWljQGxhdGVzdCJdfQ==`.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `install/cursor-install.html` |
| Modify | `README.md` |

## Config Changes

None.

## Steps

### Step 1: Update install page deeplink config

In `install/cursor-install.html`, replace the existing base64 config value with the `@latest` payload in all three places:

- **Script (line 10):** Replace `config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqYXRiYXMvYWljIl19` with `config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqYXRiYXMvYWljQGxhdGVzdCJdfQ==`.
- **Link href (line 23):** Same replacement in the `<a href="...">` attribute.
- **Pre block (lines 28–29):** Same replacement in the `<pre>` content (the full URL).

The decoded config must be `{"command":"npx","args":["-y","@jatbas/aic@latest"]}`. No other edits in this file.

**Verify:** `grep -c '@jatbas/aic"' install/cursor-install.html` returns 0. `grep -c '@latest' install/cursor-install.html` returns 3.

### Step 2: Update README install instructions

In `README.md`:

- **Install URL (code block ~line 95–96):** Replace the URL in the fenced code block under "Or copy this URL into your browser" so the `config=` value is `eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqYXRiYXMvYWljQGxhdGVzdCJdfQ==`. The full URL is `cursor://anysphere.cursor-deeplink/mcp/install?name=aic&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqYXRiYXMvYWljQGxhdGVzdCJdfQ==`.
- **Other editors (sentence ~line 112):** Change the example from `"args": ["-y", "@jatbas/aic"]` to `"args": ["-y", "@jatbas/aic@latest"]`.

**Verify:** `grep -c '@jatbas/aic@latest' README.md` returns at least 2. No remaining `"@jatbas/aic"` without `@latest` in install or Other editors sections.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck`
Expected: both pass. No changes to TS/JS; lint may touch formatting only.

## Tests

| Test case | Description |
| --------- | ----------- |
| install_html_config | All three occurrences in cursor-install.html use the new base64 config; decoded payload is `@jatbas/aic@latest`. |
| readme_url | README install code block URL contains the new config. |
| readme_other_editors | README "Other editors" sentence shows `@jatbas/aic@latest`. |

## Acceptance Criteria

- [ ] `install/cursor-install.html` uses the new config in script, link, and pre (3 places).
- [ ] `README.md` install URL and Other editors example use `@jatbas/aic@latest`.
- [ ] `pnpm lint` and `pnpm typecheck` pass.
- [ ] No references to `@jatbas/aic` without `@latest` in install flow or README install/Other editors text.

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise.
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need.
3. Report to the user and wait for guidance.
