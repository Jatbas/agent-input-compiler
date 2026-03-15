# Task 177: Installation and integration docs symmetry

> **Status:** Pending
> **Phase:** Documentation
> **Layer:** documentation
> **Depends on:** None

## Goal

Fix parallel section symmetry in `documentation/installation.md` (Cursor vs Claude Code), align the mirror documents `documentation/cursor-integration-layer.md` and `documentation/claude-code-integration-layer.md` (same section numbering and heading names, same structural depth), and convert the Key terms block in installation.md into a proper Glossary table with its own heading and Table of Contents entry. Comprehensive scope.

## Architecture Notes

- Documentation recipe: no code changes; only `.md` files modified.
- Mirror document standard: both integration layer docs must have the same top-level section numbers (1–15, 17) and equivalent heading names for corresponding sections.
- ToC rule: any new or renamed heading requires an explicit ToC update in the Change Specification.
- Temporal robustness: avoid phase/task references in doc body; use capability or path references instead.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `documentation/installation.md` |
| Modify | `documentation/claude-code-integration-layer.md` |

## Change Specification

### Change 1: installation.md — Replace Key terms paragraph with Glossary section and add ToC entry

**Current text:**

```markdown
# Installation & Delivery

How AIC gets installed, what artifacts it creates, and how its components interact across editors and environments.

**Key terms:** **MCP** (Model Context Protocol) is how your editor talks to AIC — the editor runs an AIC server process and calls tools like `aic_compile`. **Hooks** are scripts the editor runs at specific events (e.g. session start, before a message is sent); AIC uses them to inject context and enforce that compilation runs. **Bootstrap** is the one-time setup that runs on first use in a project (creating `.aic/`, `aic.config.json`, and editor-specific trigger rule and hooks). **Trigger rule** is the file (e.g. `.cursor/rules/AIC.mdc` or `.claude/CLAUDE.md`) that tells the AI to call `aic_compile` as its first action on every message.

## Table of Contents

- [AIC Server](#aic-server)
```

**Required change:** Move key terms into a dedicated Glossary section with a table and add a Table of Contents entry for it.

**Target text:**

```markdown
# Installation & Delivery

How AIC gets installed, what artifacts it creates, and how its components interact across editors and environments.

## Table of Contents

- [Glossary](#glossary)
- [AIC Server](#aic-server)
```

(Leave the rest of the ToC unchanged. Then insert the following new section immediately after the closing `---` that follows the ToC and before `## AIC Server`.)

**Current text (location: after the first `---` and before `## AIC Server`):**

```markdown
---

## AIC Server
```

**Required change:** Insert the Glossary section and table between the horizontal rule and `## AIC Server`.

**Target text:**

```markdown
---

## Glossary

| Term | Definition |
| ---- | ---------- |
| **MCP** | Model Context Protocol — how your editor talks to AIC. The editor runs an AIC server process and calls tools such as `aic_compile`. |
| **Hooks** | Scripts the editor runs at specific events (e.g. session start, before a message is sent). AIC uses them to inject context and enforce that compilation runs. |
| **Bootstrap** | One-time setup on first use in a project: creates `.aic/`, `aic.config.json`, and editor-specific trigger rule and hooks. |
| **Trigger rule** | The file (e.g. `.cursor/rules/AIC.mdc` or `.claude/CLAUDE.md`) that instructs the AI to call `aic_compile` as its first action on every message. |

---

## AIC Server
```

### Change 2: claude-code-integration-layer.md — Insert section 12 (Plugin distribution) after section 11

**Current text:**

```markdown
This is a future optimization, not a blocker. Command hooks work correctly and the 30-second
timeout provides headroom.

---

## 13. Direct installer path (zero-install)
```

**Required change:** Add section 12 so numbering runs 11 → 12 → 13 and mirrors the Cursor doc structure.

**Target text:**

```markdown
This is a future optimization, not a blocker. Command hooks work correctly and the 30-second
timeout provides headroom.

---

## 12. Plugin distribution — available

Claude Code exposes a plugin system. AIC is packaged as a native Claude Code Plugin
(`integrations/claude/plugin/`) installable via the Plugin Marketplace. This provides
zero-friction install for end users. See §13 for the direct installer path when developing
from source.

---

## 13. Direct installer path (zero-install)
```

### Change 3: claude-code-integration-layer.md — Replace Phase U reference in §13 with path reference

**Current text:**

```markdown
For end-user distribution, AIC is also packaged as a native Claude Code Plugin
(`integrations/claude/plugin/`) installable via the Plugin Marketplace. See MVP Progress
Phase U (U05) for the plugin structure.
```

**Required change:** Remove temporal reference; use path reference for robustness.

**Target text:**

```markdown
For end-user distribution, AIC is also packaged as a native Claude Code Plugin
(`integrations/claude/plugin/`) installable via the Plugin Marketplace. See
`integrations/claude/plugin/` for the plugin structure.
```

### Change 4: claude-code-integration-layer.md — Add section 17 (Verification checklist) after section 15

**Current text:**

```markdown
| Plugin hook `hookSpecificOutput` drops concurrent user hook flat `additionalContext`           | [#31658](https://github.com/anthropics/claude-code/issues/31658) | **Open** Mar 2026                                              | Use consistent `hookSpecificOutput` format for events that require it; plain text for `UserPromptSubmit` |
```

**Required change:** Append section 17 at the end of the file so the doc mirrors the Cursor integration layer doc and includes a Verification checklist.

**Target text:** Keep the current text above, then append the following (no duplicate of the table row):

```markdown

---

## 17. Verification checklist

All of the following must be verified for the Claude Code integration to be complete:

Context delivery:

- [ ] `aic-prompt-compile.cjs` runs on UserPromptSubmit and passes `intent` and `conversationId` to `aic_compile` (§7.1)
- [ ] `aic-session-start.cjs` injects architectural invariants and project context via `hookSpecificOutput` (§7.2)
- [ ] `aic-subagent-inject.cjs` injects context into subagents (§7.3)

Quality gate (Claude Code–specific):

- [ ] `aic-after-file-edit-tracker.cjs` records edited files to temp file (§7.5)
- [ ] `aic-stop-quality-check.cjs` runs lint/typecheck, uses `decision: "block"` when needed (§7.6)
- [ ] `aic-block-no-verify.cjs` blocks `--no-verify` via PreToolUse (Bash) (§7.4)

Settings:

- [ ] `settings.json` (or plugin `hooks.json`) has all 8 hook registrations with correct matchers and options (§10)

Plugin and direct-install:

- [ ] Plugin path: plugin provides hooks and MCP registration; direct installer path: `install.cjs` writes `.claude/settings.local.json` and trigger rule (§12, §13)

Temp file and marker conventions:

- [ ] `aic-edited-files-<session_id>.json`: written by PostToolUse (Edit|Write), read by Stop, cleaned by SessionEnd
- [ ] `.aic/.session-context-injected`: written by SessionStart (dual-path workaround), read by UserPromptSubmit, deleted by SessionEnd (§7.2)
```

## Writing Standards

- **Tone:** Match existing documents — installation.md concise and task-oriented; integration layer docs technical and precise.
- **Audience:** installation.md — users and contributors; integration docs — developers maintaining hooks and installers.
- **Terminology:** Use MCP, Hooks, Bootstrap, Trigger rule consistently; Glossary in installation.md is the definitions source.
- **Formatting:** Tables for Glossary and for verification checklist categories; heading hierarchy preserved; same section numbering and heading style across mirror docs.
- **Temporal robustness:** No phase names or task identifiers in body text; use capability or path references (e.g. `integrations/claude/plugin/` instead of "Phase U (U05)").

## Config Changes

- None.

## Steps

### Step 1: Apply changes to documentation/installation.md

Apply Change 1: remove the Key terms sentence from the intro paragraph; add the Glossary section and table in the correct position; add the ToC entry `- [Glossary](#glossary)` as the first item under Table of Contents.

**Verify:** Grep `documentation/installation.md` for `## Glossary` and `[Glossary](#glossary)`; confirm the Glossary table has four rows (MCP, Hooks, Bootstrap, Trigger rule) and that `## AIC Server` follows the Glossary section.

### Step 2: Apply changes to documentation/claude-code-integration-layer.md

Apply Changes 2, 3, and 4: insert `## 12. Plugin distribution — available` and its content between §11 and §13; in §13 replace "See MVP Progress Phase U (U05) for the plugin structure." with "See `integrations/claude/plugin/` for the plugin structure."; append `## 17. Verification checklist` and its checklist content at the end of the file.

**Verify:** Grep for `## 12.`, `## 13.`, `## 17.` in order; confirm there is no "Phase U (U05)" in the file; confirm §17 contains the verification checklist with the specified categories and items.

### Step 3: Structural verification

Confirm installation.md: ToC order matches body section order (Glossary, AIC Server, …). Confirm claude-code-integration-layer.md: section numbers run 1–11, 12, 13, 14, 15, 17 with no duplicate numbers and no missing 12 or 17.

**Verify:** Parse both documents for `##` headings; compare ToC links to heading anchors; confirm mirror doc has sections 12 and 17 and correct numbering.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck`
Expected: pass. No new knip findings for documentation-only changes.

## Tests

| Test case | Description |
| --------- | ------------ |
| glossary_present | installation.md contains a Glossary heading and a table with four terms |
| toc_glossary_entry | installation.md ToC contains a link to the Glossary section |
| claude_section_12 | claude-code-integration-layer.md contains section 12 (Plugin distribution) |
| claude_section_17 | claude-code-integration-layer.md contains section 17 (Verification checklist) |
| no_phase_u_in_claude | claude-code-integration-layer.md does not contain "Phase U (U05)" |
| mirror_numbering | Claude doc section numbers 1–15 and 17 match Cursor doc (Cursor has no 16) |

## Acceptance Criteria

- [ ] installation.md: Key terms replaced by a Glossary section with table and ToC entry
- [ ] installation.md: Cursor and Claude Code sections keep same heading names and order for shared concepts (Trigger Rule, Hooks, Hook Lifecycle, How Hooks Are Delivered) — verified, no regression
- [ ] claude-code-integration-layer.md: Section 12 added; section 17 (Verification checklist) added; §13 Phase U reference replaced with path reference
- [ ] claude-code-integration-layer.md: Section numbering 1–12, 13, 14, 15, 17 — no jump from 11 to 13
- [ ] Mirror docs: Same section numbering (1–15, 17) and equivalent heading names for corresponding sections
- [ ] ToC in installation.md matches document body (Glossary first, then AIC Server, …)
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work, stop. List the adaptations, report to the user, and re-evaluate before continuing.
