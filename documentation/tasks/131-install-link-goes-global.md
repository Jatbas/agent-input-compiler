# Task 131: Install Link Goes Global (W09)

> **Status:** Pending
> **Phase:** W — Global Server & Per-Project Isolation
> **Layer:** N/A (install page + documentation)
> **Depends on:** W08 (Move DB to ~/.aic/)

## Goal

Update `install/cursor-install.html` and `README.md` so the install instructions reflect global installation. The Cursor deeplink already writes to the global `~/.cursor/mcp.json` (verified from Cursor docs); the copy in both files incorrectly describes workspace-scoped installation. Also correct the "local database" statement to reflect W08's global DB at `~/.aic/aic.sqlite`.

## Architecture Notes

- Cursor's MCP install deeplink (`cursor://anysphere.cursor-deeplink/mcp/install?name=aic&config=...`) writes to the global `~/.cursor/mcp.json`, not the workspace `.cursor/mcp.json`. Source: [Cursor MCP docs](https://cursor.com/help/customization/mcp). No URL change is needed.
- The base64 payload `eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqYXRiYXMvYWljIl19` decodes to `{"command":"npx","args":["-y","@jatbas/aic"]}` — correct and unchanged.
- AIC dev project keeps its workspace entry (`tsx mcp/src/server.ts`). This task does not touch the dev workspace config.
- W10 (duplicate prevention) handles the case where AIC appears in both global and workspace configs.

## Files

| Action | Path                           |
| ------ | ------------------------------ |
| Modify | `install/cursor-install.html`  |
| Modify | `README.md`                    |

## Specification

### install/cursor-install.html

Current page auto-redirects to the deeplink, then falls back to the GitHub repo. The `<title>` says "Install AIC MCP — Cursor" and the body says "Redirecting to Cursor…" with a fallback link.

After this task the page must:

1. Keep the same deeplink URL (no change to the `cursor://` URL or base64 config).
2. Update the `<title>` to "Install AIC — Cursor (global)".
3. Update the body text from "Redirecting to Cursor…" to "Redirecting to Cursor… This adds AIC to your global MCP config (~/.cursor/mcp.json) so it works in every project."
4. Keep the fallback link and pre block unchanged.

### README.md — Cursor install section (lines 91–117)

After this task the section must read (exact replacement for lines 103–117):

```markdown
Cursor will prompt to add the server to your global MCP config (`~/.cursor/mcp.json`); confirm and you're done. AIC is now available in every workspace — no per-project setup needed.

> **Need a project-specific install instead?** Add to `.cursor/mcp.json` in your project directory:
>
> ```json
> {
>   "mcpServers": {
>     "aic": { "command": "npx", "args": ["-y", "@jatbas/aic"] }
>   }
> }
> ```

**2. Start prompting** — approve the tools when prompted and start coding. AIC auto-initializes each project the first time it compiles (config, hooks, `.aic/`, ignore entries). All projects share a single database at `~/.aic/aic.sqlite` with per-project isolation; per-project files (config, cache, hooks) remain in each project directory. Nothing else to install or configure.
```

Changes from current text:

- Line 103: Add "to your global MCP config (`~/.cursor/mcp.json`)" and "AIC is now available in every workspace".
- Lines 105–115: Remove the "Important: This installs AIC for the current workspace" block. Replace with an inverted callout: "Need a project-specific install instead?" with the same JSON block (now the non-default option).
- Line 117: Replace "Each project gets its own local database, cache, and configuration" with the W08-correct statement about global DB + per-project files.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Update install/cursor-install.html

In `install/cursor-install.html`, apply these changes:

1. Replace `<title>Install AIC MCP — Cursor</title>` with `<title>Install AIC — Cursor (global)</title>`.
2. Replace the `<body>` content. Current:

```html
<p>Redirecting to Cursor…</p>
<p>
  If nothing happens,
  <a
    href="cursor://anysphere.cursor-deeplink/mcp/install?name=aic&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqYXRiYXMvYWljIl19"
    >click here</a
  >
  or paste this URL into your browser:
</p>
```

Replace with:

```html
<p>Redirecting to Cursor… This adds AIC to your global MCP config (<code>~/.cursor/mcp.json</code>) so it works in every project.</p>
<p>
  If nothing happens,
  <a
    href="cursor://anysphere.cursor-deeplink/mcp/install?name=aic&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqYXRiYXMvYWljIl19"
    >click here</a
  >
  or paste this URL into your browser:
</p>
```

Do not change the `<script>` block, the deeplink URL, the `<pre>` block, or the fallback link.

**Verify:** Open `install/cursor-install.html` in a browser. Confirm the title bar shows "Install AIC — Cursor (global)" and the body text mentions "global MCP config".

### Step 2: Update README.md install section

In `README.md`, replace lines 103–117 (from `Cursor will prompt to add the server; confirm and you're done.` through the end of the `**2. Start prompting**` paragraph) with the exact text from the Specification section above.

Do not change lines 91–102 (the heading, badge, GitHub Pages note, deeplink URL block). Do not change lines 119+ (Claude Code section onward).

**Verify:** Read `README.md` lines 91–120. Confirm: (1) the deeplink URL is unchanged; (2) "global MCP config (`~/.cursor/mcp.json`)" appears; (3) "current workspace" does not appear; (4) "~/.aic/aic.sqlite" appears in the start-prompting paragraph; (5) the project-specific callout shows `.cursor/mcp.json` (no tilde).

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test`

Expected: all pass, zero warnings, no regressions. (These files are not linted by ESLint or typechecked by TypeScript, but run the full suite to confirm no breakage.)

## Tests

| Test case                   | Description                                                                 |
| --------------------------- | --------------------------------------------------------------------------- |
| Manual: install page title  | Open `install/cursor-install.html` — title reads "Install AIC — Cursor (global)" |
| Manual: install page body   | Body text mentions "global MCP config (~/.cursor/mcp.json)"                 |
| Manual: README global       | README install section says "global MCP config" and "every workspace"       |
| Manual: README no workspace | README does not say "installs AIC for the current workspace"                |
| Manual: README W08 DB       | README says "~/.aic/aic.sqlite" with per-project isolation                  |
| Manual: deeplink unchanged  | Deeplink URL is identical in both files (base64 payload unchanged)          |

## Acceptance Criteria

- [ ] `install/cursor-install.html` title updated to include "(global)"
- [ ] `install/cursor-install.html` body text mentions global MCP config
- [ ] Deeplink URL unchanged in both files
- [ ] README install section describes global install as the default path
- [ ] README "per-project" install is the secondary callout (inverted from current)
- [ ] README line about database reflects W08 (global DB at `~/.aic/aic.sqlite`, per-project files remain local)
- [ ] No references to "installs AIC for the current workspace" remain
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all pass

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
