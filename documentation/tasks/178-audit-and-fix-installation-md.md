# Task 178: Audit and Fix installation.md

> **Status:** Pending
> **Phase:** Documentation
> **Layer:** documentation
> **Depends on:** None
> **Research:** documentation/research/2026-03-16-installation-md-audit.md

## Goal

Correct factual inaccuracies, resolve the stale uninstall marker, add Node version prerequisite and optional verify step in documentation/installation.md, and align documentation/project-plan.md, documentation/implementation-spec.md, and documentation/cursor-integration-layer.md with installation.md and the codebase where they contradict (package name, database location, trigger rule filename, Claude Code status, Cursor installer wording).

## Architecture Notes

- Documentation recipe: no code or test files; only .md edits. Every change has Current text, Required change, and Target text.
- Research document (2026-03-16-installation-md-audit.md) is the exploration source; findings were verified against code and cross-docs.
- installation.md is the user-facing source of truth for installation; other docs are updated to match it and the code.
- ToC: installation.md has a Table of Contents; no heading renames in this task, so no ToC change required unless a subsection is added (optional Cursor Troubleshooting would require ToC update).

## Files

| Action | Path |
| ------ | ---- |
| Modify | documentation/installation.md |
| Modify | documentation/cursor-integration-layer.md |
| Modify | documentation/project-plan.md |
| Modify | documentation/implementation-spec.md |

## Change Specification

### Change 1: First-Compile Bootstrap — when step 6 runs

**Current text:**

> On the first `aic_compile` call for a new project, `ensureProjectInit` runs:
>
> 1. Creates `.aic/` directory with `0700` permissions
> 2. Generates a stable UUIDv7 project ID in `.aic/project-id`
> 3. Writes `aic.config.json` with defaults (`contextBudget.maxTokens: 8000`)
> 4. Adds `.aic/` to `.gitignore`, `.eslintignore`, `.prettierignore`
> 5. Installs the trigger rule (editor-specific — e.g., `.cursor/rules/AIC.mdc` for Cursor, `.claude/CLAUDE.md` for Claude Code)
> 6. Installs per-project artifacts (editor-specific — see the [Cursor](#cursor) and [Claude Code](#claude-code) sections)
>
> Steps 5 and 6 are idempotent. If the trigger rule or artifacts already exist, they are merged (new entries added, existing entries preserved).

**Required change:** Clarify that step 6 runs when the server lists workspace roots (e.g. when Cursor connects), not only on the first aic_compile call, so the doc matches the code (runEditorBootstrapIfNeeded is invoked from listRoots).

**Target text:**

> On the first `aic_compile` call for a new project (or when the server first sees the project via workspace roots), `ensureProjectInit` runs:
>
> 1. Creates `.aic/` directory with `0700` permissions
> 2. Generates a stable UUIDv7 project ID in `.aic/project-id`
> 3. Writes `aic.config.json` with defaults (`contextBudget.maxTokens: 8000`)
> 4. Adds `.aic/` to `.gitignore`, `.eslintignore`, `.prettierignore`
> 5. Installs the trigger rule (editor-specific — e.g., `.cursor/rules/AIC.mdc` for Cursor, `.claude/CLAUDE.md` for Claude Code)
> 6. Installs per-project artifacts (editor-specific — see the [Cursor](#cursor) and [Claude Code](#claude-code) sections)
>
> Step 6 runs when the server lists workspace roots (e.g. when Cursor connects). For Cursor, roots are typically listed before the first message, so hooks are in place by then. Steps 5 and 6 are idempotent. If the trigger rule or artifacts already exist, they are merged (new entries added, existing entries preserved).

### Change 2: Trigger rule — overwrite when version differs

**Current text:**

> If `.cursor/rules/AIC.mdc` already exists, AIC does not overwrite it.

**Required change:** State that AIC can overwrite when the installed rule version differs from the current package version (code does this in install-trigger-rule.ts).

**Target text:**

> If `.cursor/rules/AIC.mdc` already exists, AIC does not overwrite it unless the installed rule version differs from the current package version (in which case the file is updated).

### Change 3: Prerequisite — package name and Node version

**Current text:**

> The AIC MCP server must be runnable as `npx @jatbas/aic-mcp` (or `npx @jatbas/aic-mcp@latest`; also exposed as `@jatbas/aic`). Ensure the package is available before relying on hooks or the compile flow. The plugin path uses this under the hood; the direct installer path assumes you are in the AIC repo or have the server on your path.

**Required change:** Use the canonical package name from the repo (mcp/package.json: @jatbas/aic) and add Node version (package.json engines: >=20.0.0).

**Target text:**

> The AIC MCP server must be runnable as `npx @jatbas/aic@latest` (Node 20+). Ensure the package is available before relying on hooks or the compile flow. The plugin path uses this under the hood; the direct installer path assumes you are in the AIC repo or have the server on your path.

### Change 4: Uninstall — remove "not yet documented"

**Current text:**

> Uninstall instructions are not yet documented. To stop using AIC in a project, remove the `aic` entry from your editor's global MCP config (e.g. `~/.cursor/mcp.json` for Cursor) and optionally delete the project's `.aic/` directory.

**Required change:** Remove the stale "not yet documented" phrase; keep the minimal guidance.

**Target text:**

> To stop using AIC in a project, remove the `aic` entry from your editor's global MCP config (e.g. `~/.cursor/mcp.json` for Cursor) and optionally delete the project's `.aic/` directory.

### Change 5: Verify installation (optional one-line)

**Current text:**

> No per-project install step is needed. The global server auto-bootstraps each new project.

**Required change:** Add a single sentence so users know how to confirm installation works.

**Target text:**

> No per-project install step is needed. The global server auto-bootstraps each new project. To verify: send a message in the project; the first compile will run and subsequent messages will receive compiled context (or use the `aic_status` tool if your editor exposes MCP tools).

### Change 6: cursor-integration-layer.md — "never wired" wording

**Current text (cursor-integration-layer.md):**

> - **No Cursor detection or installer in `mcp/src/`.** The installer (`integrations/cursor/install.cjs`) is a standalone script invokable via `npx @aic/mcp init` — never wired into the MCP server startup.

**Required change:** The server does run the installer when the client lists roots (runEditorBootstrapIfNeeded in server.ts). Fix the sentence so it does not imply the server never invokes the installer. Also remove or correct `npx @aic/mcp init` if that command is not the current install path (installation.md uses deeplink + auto-bootstrap).

**Target text:**

> - **No Cursor detection or installer in `mcp/src/`.** The installer (`integrations/cursor/install.cjs`) is a standalone script. The MCP server does not run it at process startup; it runs the installer when the client lists workspace roots (e.g. when Cursor connects), so hooks are bootstrapped per project without user action.

(If the document elsewhere says `npx @aic/mcp init`, update that to match installation.md: Cursor install is via deeplink and auto-bootstrap, not a manual init command.)

### Change 7: project-plan.md — package name, database location, trigger filename, Claude Code status

**Required change:** Align with installation.md and code: (1) Package name: use @jatbas/aic where MCP server package is referenced. (2) Database: global ~/.aic/aic.sqlite, not per-project .aic/aic.sqlite. (3) Trigger rule filename: AIC.mdc (capital AIC). (4) Claude Code integration: remove or update "not yet built" to reflect that plugin and direct installer exist.

**Target text / locations:** Executor must grep project-plan.md for: `@aic/mcp`, `.aic/aic.sqlite` or per-project database wording, `aic.mdc` (lowercase), and "Claude Code integration" or "not yet built" in the context of the integration layer. Replace with: package name @jatbas/aic (or "AIC MCP server package" with a link to installation), database "global at ~/.aic/aic.sqlite", trigger rule ".cursor/rules/AIC.mdc", and state that the Claude Code integration layer is implemented (plugin and direct installer).

### Change 8: implementation-spec.md — package name, database location, trigger filename

**Required change:** Same as project-plan: (1) Package name @jatbas/aic. (2) Database global ~/.aic/aic.sqlite. (3) Trigger rule filename AIC.mdc. Grep and replace inconsistent occurrences.

**Target text / locations:** Executor must grep implementation-spec.md for the same patterns and apply the same canonical values as in Change 7.

## Writing Standards

- **Tone:** Match existing document — mixed second/third person; technical but accessible.
- **Audience:** Users and contributors; installation.md is a user-facing guide with some architecture.
- **Terminology:** Use "AIC", "MCP server", "trigger rule", "bootstrap", "hooks" consistently. Package name: @jatbas/aic.
- **Formatting:** Preserve existing tables, code blocks, and heading hierarchy. No phase or task number references in body.
- **Temporal robustness:** No "will be added", "Phase X", or "future task"; use "Not yet available" or capability-based language if something is missing.

## Cross-Reference Map

| Document | References this doc | This doc references | Consistency |
| -------- | ------------------- | ------------------- | ----------- |
| cursor-integration-layer.md | Yes — installation.md link | installation.md | Update wording and package/install flow |
| claude-code-integration-layer.md | Yes | installation.md | No change in this task |
| project-plan.md | Yes (architecture) | ADRs, installation | Update package, DB, trigger, Claude status |
| implementation-spec.md | Yes (components) | installation, project-plan | Update package, DB, trigger |

## Config Changes

- None (documentation-only task).

## Steps

### Step 1: Apply installation.md changes

Apply Change 1 through Change 5 to documentation/installation.md. Use exact Target text from the Change Specification. Do not add or remove headings; no ToC update is required for these edits.

**Verify:** Grep installation.md for the key phrases from each change (e.g. "Step 6 runs when the server lists", "unless the installed rule version differs", "npx @jatbas/aic@latest", "Node 20+", "To stop using AIC", "To verify: send a message"). All should be present.

### Step 2: Apply cursor-integration-layer.md change

Apply Change 6 to documentation/cursor-integration-layer.md. If the document mentions `npx @aic/mcp init` elsewhere, replace with wording that matches installation.md (deeplink + auto-bootstrap). Preserve the rest of the document.

**Verify:** Grep for "when the client lists workspace roots" and ensure "never wired into the MCP server startup" is removed or rephrased.

### Step 3: Apply project-plan.md changes

Apply Change 7. Grep project-plan.md for: `@aic/mcp`, per-project database wording or `.aic/aic.sqlite`, lowercase `aic.mdc`, and Claude Code "not yet built" or equivalent. Replace with canonical package name, global database location, AIC.mdc, and current Claude Code integration status.

**Verify:** No remaining references to @aic/mcp for the MCP server package; database described as global; trigger rule AIC.mdc; Claude Code integration described as implemented.

### Step 4: Apply implementation-spec.md changes

Apply Change 8. Grep implementation-spec.md for the same patterns as in Step 3 and replace with the same canonical values.

**Verify:** Same as Step 3 for implementation-spec.md.

### Step 5: Final verification

- Open documentation/installation.md and confirm all five edits are present and read correctly.
- Cross-check: documentation/project-plan.md and documentation/implementation-spec.md use @jatbas/aic (or equivalent), global ~/.aic/aic.sqlite, and AIC.mdc where relevant.
- Run: `pnpm lint` (no changes to code; may skip if only .md were edited). No new errors.

## Tests

| Test case | Description |
| --------- | ----------- |
| installation_edits_applied | All five installation.md changes (bootstrap, trigger overwrite, prerequisite, uninstall, verify) are present in the file |
| cursor_integration_wording | cursor-integration-layer.md no longer says "never wired into the MCP server startup" in a way that implies the server never runs the installer; new wording mentions "when the client lists workspace roots" |
| project_plan_aligned | project-plan.md uses canonical package name, global database, AIC.mdc, and Claude Code integration as implemented |
| implementation_spec_aligned | implementation-spec.md uses same canonical values as project-plan |

## Acceptance Criteria

- [ ] All changes in the Change Specification applied to the correct files
- [ ] installation.md: bootstrap step 6 clarification, trigger overwrite exception, prerequisite (package + Node 20+), uninstall reword, verify sentence present
- [ ] cursor-integration-layer.md: installer wording updated; no misleading "never wired"
- [ ] project-plan.md and implementation-spec.md: package name, database location, trigger filename, and Claude Code status aligned with installation.md and code
- [ ] No new stale markers (no "not yet documented", no "will be added in Phase X")
- [ ] Cross-document terminology consistent for package name, database, and trigger rule

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations (e.g. inventing commands that don't exist, or changing scope without user approval), stop. List the adaptations, report to the user, and re-evaluate before continuing.
