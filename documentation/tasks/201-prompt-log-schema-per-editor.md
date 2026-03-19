# Task 201: Document current prompt-log schema per editor

> **Status:** Pending
> **Phase:** AG (Prompt-log unification)
> **Layer:** documentation
> **Depends on:** —

## Goal

Create a single documentation file that records the current `prompt-log.jsonl` JSON shapes per editor (Cursor vs Claude), all three write locations, the one production read location, the fields each consumer uses, and which fields exist only in Cursor or only in Claude so that AG02 can design a unified schema.

## Architecture Notes

- One new file only; no code changes. Matches documentation recipe.
- Structure follows cache-file-audit.md conventions: path first, schema tables, read sites table, write sites list.
- No phase names or task numbers in the document body (temporal robustness).

## Files

| Action | Path                              |
| ------ | --------------------------------- |
| Create | `documentation/prompt-log-schema.md` |

## Change Specification

### Change 1: Create documentation/prompt-log-schema.md

**Current text:**

> N/A — new file.

**Required change:** Create the new document with path, both JSON shapes side-by-side, all write sites, the production read site and fields used, and field-equivalence analysis so AG02 has one source of truth.

**Target text:**

> # Prompt-log schema (current, per editor)
>
> Path: `{projectRoot}/.aic/prompt-log.jsonl`
>
> The file holds one JSON object per line. Two shapes exist; the shape depends on which editor wrote the line.
>
> ## Shape 1 — Cursor
>
> Written by: `integrations/cursor/hooks/AIC-before-submit-prewarm.cjs` (beforeSubmitPrompt hook).
>
> | Field          | Type   | Source / notes                                      |
> | -------------- | ------ | ---------------------------------------------------- |
> | conversationId | string | `input.conversation_id` or `"unknown"`                |
> | generationId   | string | `input.generation_id` or `"unknown"`                  |
> | title          | string | First 200 characters of the user prompt              |
> | model          | string | `input.model` or `""`                                |
> | timestamp      | string | ISO 8601 from `new Date().toISOString()`            |
>
> ## Shape 2 — Claude
>
> Written by: `integrations/claude/hooks/aic-session-end.cjs` and `integrations/claude/plugin/scripts/aic-session-end.cjs` (SessionEnd hook).
>
> | Field     | Type   | Source / notes                                       |
> | --------- | ------ | ----------------------------------------------------- |
> | sessionId | string | Parsed stdin: `session_id` or `input.session_id`     |
> | reason    | string | Parsed stdin: `reason` or `input.reason`              |
> | timestamp | string | ISO 8601 from `new Date().toISOString()`             |
>
> ## Write sites
>
> | File                                                    | Shape   |
> | ------------------------------------------------------- | ------- |
> | integrations/cursor/hooks/AIC-before-submit-prewarm.cjs  | Shape 1 |
> | integrations/claude/hooks/aic-session-end.cjs           | Shape 2 |
> | integrations/claude/plugin/scripts/aic-session-end.cjs   | Shape 2 |
>
> ## Read sites
>
> | File                                               | Function / context              | Fields used   | Validated              |
> | -------------------------------------------------- | ------------------------------ | ------------- | ---------------------- |
> | shared/src/maintenance/prune-jsonl-by-timestamp.ts | prunePromptLog (via server.ts) | timestamp only| Yes (isValidTimestamp) |
>
> No other production code reads prompt-log.jsonl. Tests that touch the file only assert existence or line count; they do not parse or validate fields.
>
> ## Fields each consumer needs
>
> - Prune: `timestamp` only. Used to retain lines within the retention window; invalid lines are dropped.
>
> ## Field equivalence (Cursor vs Claude)
>
> | Category    | Fields                                                                 | Notes                                                |
> | ----------- | ---------------------------------------------------------------------- | ---------------------------------------------------- |
> | Cursor-only | conversationId, generationId, title, model                              | No Claude equivalent; Claude shape has no such field |
> | Claude-only | sessionId, reason                                                      | No Cursor equivalent; Cursor shape has no such field  |
> | Common      | timestamp                                                              | Both shapes; ISO 8601 string                         |

## Writing Standards

- **Tone:** Formal, technical. Developer reference.
- **Audience:** Developers and downstream tasks that need the current schema (unified-schema design, migration, tests).
- **Terminology:** Use "Shape 1" and "Shape 2" for the two JSON shapes; "Cursor" and "Claude" for the editors. Use "prompt-log.jsonl" for the file name.
- **Formatting:** Path at top; sections with ##. Tables for schema, write sites, read sites, and field equivalence. No Table of Contents for this short doc.
- **Temporal robustness:** No phase names, task numbers, or milestones in the body. Describe the current state only.

## Cross-Reference Map

| Document            | References this doc | This doc references |
| ------------------- | ------------------- | ------------------- |
| cache-file-audit.md | No (optional link)  | No                  |
| mvp-progress.md     | No                  | No                  |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create prompt-log schema document

Create the file `documentation/prompt-log-schema.md` with the exact content from the Change Specification target text above (the block under **Target text:**). Preserve heading levels, table formatting, and line breaks. Do not add phase names, task identifiers, or temporal phrases.

**Verify:** File exists at `documentation/prompt-log-schema.md` and contains all sections: path, Shape 1 (Cursor), Shape 2 (Claude), Write sites, Read sites, Fields each consumer needs, Field equivalence.

### Step 2: Final verification

Run: `pnpm lint`
Expected: passes with zero errors and zero warnings.

**Verify:** Lint passes. No code was added; the new file is markdown only.

## Tests

| Test case | Description                    |
| --------- | ------------------------------ |
| (none)    | Documentation task; no test file. Verification is file existence and content match. |

## Acceptance Criteria

- [ ] documentation/prompt-log-schema.md created with content matching the Change Specification target text
- [ ] All sections present: path, Shape 1, Shape 2, Write sites, Read sites, Fields each consumer needs, Field equivalence
- [ ] No phase names, task numbers, or temporal milestones in the document body
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] Tables and paths match the exploration report (cursor and claude hook paths, prune-jsonl-by-timestamp.ts, field names)

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work, stop. List the adaptations, report to the user, and re-evaluate before continuing.
