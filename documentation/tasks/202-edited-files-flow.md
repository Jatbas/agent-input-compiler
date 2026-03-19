# Task 202: Document edited-files flow per editor

> **Status:** Pending
> **Phase:** AI
> **Layer:** documentation
> **Depends on:** —
> **Scope:** Comprehensive (new doc + links from all 7 referencing docs)

## Goal

Create the single reference document for the full afterFileEdit/PostToolUse → temp write → stop read → cleanup flow for Cursor and Claude Code, list all 8 implementation files with payload shapes, path extraction, output formats, and cleanup behavior (including the Cursor temp file leak). Add links to this document from installation, both integration-layer docs, mvp-progress, implementation-spec, architecture, and project-plan.

## Architecture Notes

- Documentation recipe: Phase 1 exploration (4 explorers) completed; target text produced from exploration report and verified against source (8 hook files).
- No code changes; documentation only. Cross-reference map: new doc is referenced by 7 existing docs after this task.
- Temporal robustness: describe current behavior and note that a follow-up change will add Cursor cleanup; do not reference phase or task identifiers in the doc body.

## Files

| Action | Path |
| ------ | ---- |
| Create | `documentation/edited-files-flow.md` |
| Modify | `documentation/installation.md` (add link after Hook Lifecycle for Cursor and Claude) |
| Modify | `documentation/cursor-integration-layer.md` (add link in §7.7 and §7.8) |
| Modify | `documentation/claude-code-integration-layer.md` (add link in §7.5, §7.6, §7.8) |
| Modify | `documentation/mvp-progress.md` (add link in Phase AI intro) |
| Modify | `documentation/implementation-spec.md` (add sentence + link in §2 or bootstrap) |
| Modify | `documentation/architecture.md` (add link where session end / afterFileEdit are mentioned) |
| Modify | `documentation/project-plan.md` (add link in Current state paragraph) |

## Change Specification

### Change 1: Create documentation/edited-files-flow.md

**Current text:** (none — new file)

**Required change:** Create the new document with the full content below so the edited-files flow and all 8 files are documented in one place.

**Target text:**

```markdown
# Edited-files flow (per editor)

## Purpose

This document is the single reference for the full flow that tracks edited file paths and runs quality checks at stop time: tracker hook writes paths to a temp file, stop hook reads the list and runs ESLint and `tsc`, and sessionEnd cleans up (where implemented). It lists all 8 implementation files, their payload shapes, path extraction, output formats, and cleanup behavior. Audience: integration developers and maintainers.

## Flow overview

The pattern is identical across editors: on each file edit, the tracker appends the path(s) to a session-keyed JSON array in `os.tmpdir()`. When the user stops, the stop hook reads that array, filters to existing paths, runs `eslint` and `tsc --noEmit`, and reports success or failure in the editor's protocol format. SessionEnd may delete the temp file (Claude Code) or not (Cursor — see cleanup section).

## Comparison (Cursor vs Claude Code)

| Aspect | Cursor | Claude Code |
| ------ | ------ | ----------- |
| Temp file prefix | `aic-edited-files-` | `aic-cc-edited-` |
| Key derivation | `conversation_id` ?? `conversationId` ?? `session_id` ?? `sessionId` ?? `AIC_CONVERSATION_ID` ?? `"default"` | `session_id` ?? `input.session_id` ?? `"default"` |
| Key sanitization | `/[^a-zA-Z0-9_-]/g` → `_` | `/[^a-zA-Z0-9*-]/g` → `_` (includes `*`) |
| Path extraction | Multiple fields: `files`, `paths`, `editedFiles`, `edited_paths` (arrays), `file`, `path`, `filePath` (single), `edit`/`edits` (object or array) | Single path: `tool_input.path` (or `input.input?.tool_input?.path`) |
| Stop output (success) | `{}` | `""` (empty stdout) |
| Stop output (failure) | `{ "followup_message": "Fix lint and typecheck errors..." }` | `{ "decision": "block", "reason": "..." }` |
| Stop path filter | `existsSync` only | `existsSync` and `.ts`/`.js` extension |
| Cleanup in sessionEnd | Does not delete edited-files temp files | Deletes temp file via `unlinkSync` |

## Cursor flow

1. **afterFileEdit** — `AIC-after-file-edit-tracker.cjs` reads JSON from stdin, derives the key from input or `AIC_CONVERSATION_ID`, extracts paths via `extractPaths(input)` (see Payload shapes), reads the existing temp file (or `[]`), merges and deduplicates, writes `JSON.stringify(merged)` to `os.tmpdir()/aic-edited-files-<sanitized_key>.json`. Stdout: `{}`.
2. **stop** — `AIC-stop-quality-check.cjs` reads stdin, derives the same key, reads the temp file, filters to paths that exist, runs `npx eslint --max-warnings 0 -- <paths>` and `npx tsc --noEmit`. On failure, stdout: `{ "followup_message": "<message>" }`; on success: `{}`.
3. **sessionEnd** — `AIC-session-end.cjs` cleans only temp files whose names start with `aic-gate-`, `aic-deny-`, or `aic-prompt-`. It does **not** delete `aic-edited-files-*` files, so those accumulate in `os.tmpdir()` until the process exits or the system clears temp. A follow-up change will add cleanup so Cursor matches Claude Code behavior.

## Claude Code flow

Claude Code has two deployment paths (hooks and plugin); each has its own copy of the three scripts. Behavior is the same.

1. **PostToolUse (Edit|Write)** — `aic-after-file-edit-tracker.cjs` reads stdin, gets `session_id` and `tool_input.path`, sanitizes the key, reads existing temp array (or `[]`), appends the resolved path, deduplicates, writes to `os.tmpdir()/aic-cc-edited-<sanitized>.json`. Stdout: `{}`.
2. **Stop** — `aic-stop-quality-check.cjs` reads stdin, gets `session_id` and project root (`cwd` or `CLAUDE_PROJECT_DIR`), reads the temp file, filters to existing paths with `.ts` or `.js` extension, runs eslint and tsc. On failure, stdout: `{ "decision": "block", "reason": "..." }`; on success: empty string.
3. **SessionEnd** — `aic-session-end.cjs` (hooks and plugin) builds the same temp path from `session_id` and calls `fs.unlinkSync(tempPath)` so the edited-files temp file is removed. Hooks version also deletes `.aic/.session-start-lock`; plugin version deletes `.aic/.current-conversation-id`.

## File inventory

| File | Editor | Role | Key source | Notes |
| ---- | ------ | ---- | ---------- | ----- |
| `integrations/cursor/hooks/AIC-after-file-edit-tracker.cjs` | Cursor | Tracker | input or env | Writes temp file |
| `integrations/cursor/hooks/AIC-stop-quality-check.cjs` | Cursor | Stop | same key | Reads temp, runs eslint/tsc |
| `integrations/claude/hooks/aic-after-file-edit-tracker.cjs` | Claude Code | Tracker | session_id | Hooks deployment |
| `integrations/claude/hooks/aic-stop-quality-check.cjs` | Claude Code | Stop | session_id | Hooks deployment |
| `integrations/claude/hooks/aic-session-end.cjs` | Claude Code | SessionEnd | session_id | Deletes temp file |
| `integrations/claude/plugin/scripts/aic-after-file-edit-tracker.cjs` | Claude Code | Tracker | session_id | Plugin deployment |
| `integrations/claude/plugin/scripts/aic-stop-quality-check.cjs` | Claude Code | Stop | session_id | Plugin deployment |
| `integrations/claude/plugin/scripts/aic-session-end.cjs` | Claude Code | SessionEnd | session_id | Deletes temp file |

Cursor's sessionEnd script (`AIC-session-end.cjs`) does not touch the edited-files temp file; the 8 files above are the ones that implement the edited-files flow (read/write/cleanup of the temp file).

## Payload shapes

**Cursor tracker** — Input is JSON on stdin. Key from `input.conversation_id`, `input.conversationId`, `input.session_id`, `input.sessionId`, `process.env.AIC_CONVERSATION_ID`, or `"default"`. Paths from:

- Arrays: `input.files`, `input.paths`, `input.editedFiles`, `input.edited_paths` (each element resolved with `path.resolve`).
- Single: `input.file`, `input.path`, `input.filePath`.
- Nested: `input.edit` or `input.edits` — if object, use `edit.file` / `edit.path` / `edit.filePath`; if array, each element's `file`/`path`/`filePath`.

**Claude Code tracker** — Input is JSON on stdin. Key from `input.session_id` or `input.input?.session_id` or `"default"`. Single path from `input.tool_input?.path` or `input.input?.tool_input?.path`; resolved with `path.resolve`.

## Output formats

| Hook | Editor | Success | Failure |
| ---- | ------ | ------- | ------- |
| Tracker | Both | `{}` | (same; errors swallowed) |
| Stop | Cursor | `{}` | `{ "followup_message": "Fix lint and typecheck errors..." }` |
| Stop | Claude Code | `""` | `{ "decision": "block", "reason": "Fix lint/typecheck errors:\n<stderr>" }` |

Stop output format is dictated by the editor's hook protocol and is not shared across editors.

## Cleanup and Cursor temp file leak

**Claude Code:** SessionEnd (hooks and plugin) deletes the edited-files temp file for the current `session_id` via `unlinkSync(tempPath)`.

**Cursor:** SessionEnd deletes only temp files matching `aic-gate-*`, `aic-deny-*`, and `aic-prompt-*`. It does **not** delete `aic-edited-files-*`. Those files therefore accumulate in `os.tmpdir()` for the lifetime of the machine or until the OS clears temp. A follow-up change will add cleanup so Cursor sessionEnd removes the edited-files temp file for the current key.

## Temp file schema and merge semantics

- **Content:** JSON array of strings (absolute file paths). Example: `["/path/to/a.ts","/path/to/b.ts"]`.
- **Read:** Parse JSON; if not an array, treat as `[]`. Filter to elements that are non-empty strings.
- **Write:** Read existing array (or `[]` if file missing or invalid). Merge new paths: `merged = [...new Set([...existing, ...newPaths])]`. Filter to `typeof p === "string" && p.length > 0`. Write `JSON.stringify(merged)` to the temp file. No duplicates; order is not specified.

## Stdin and shared helpers

All hooks receive JSON on stdin. The implementation currently uses a local 10-line buffer-loop helper to read stdin synchronously. A shared `readStdinSync()` helper will be used by all tracker, stop, and sessionEnd scripts (and by other hooks that read stdin) so there is a single implementation.
```

### Change 2: installation.md — add link after Cursor Hook Lifecycle

**Current text:**

```
Key point: hooks and the MCP server are **separate execution paths**. The MCP server does not control when hooks run. Cursor does.
```

**Required change:** Add one sentence after this paragraph pointing to the full edited-files flow.

**Target text:**

```
Key point: hooks and the MCP server are **separate execution paths**. The MCP server does not control when hooks run. Cursor does.

For the full edited-files flow (tracker → stop → cleanup and temp file behavior), see [edited-files flow](edited-files-flow.md).
```

### Change 3: installation.md — add link after Claude Code Hook Lifecycle

**Current text:**

```
Key point: hooks and the MCP server are **separate execution paths**. The MCP server does not control when hooks run. Claude Code does.
```

**Required change:** Add one sentence after this paragraph pointing to the full edited-files flow.

**Target text:**

```
Key point: hooks and the MCP server are **separate execution paths**. The MCP server does not control when hooks run. Claude Code does.

For the full edited-files flow (tracker → stop → cleanup and temp file behavior), see [edited-files flow](edited-files-flow.md).
```

### Change 4: cursor-integration-layer.md — add link at end of §7.7

**Current text:**

```
**File:** `.cursor/hooks/AIC-after-file-edit-tracker.cjs`

---

### 7.8 stop — quality gate (ESLint + typecheck)
```

**Required change:** Insert a sentence before the horizontal rule so §7.7 points to the full flow doc.

**Target text:**

```
**File:** `.cursor/hooks/AIC-after-file-edit-tracker.cjs`

For the full edited-files flow (tracker → stop → cleanup) and file list, see [edited-files flow](edited-files-flow.md).

---

### 7.8 stop — quality gate (ESLint + typecheck)
```

### Change 5: cursor-integration-layer.md — add link at end of §7.8

**Current text:**

```
**File:** `.cursor/hooks/AIC-stop-quality-check.cjs`

---

### 7.9 sessionEnd — cleanup and telemetry
```

**Required change:** Insert a sentence before the horizontal rule so §7.8 points to the full flow doc.

**Target text:**

```
**File:** `.cursor/hooks/AIC-stop-quality-check.cjs`

For the full edited-files flow and file list, see [edited-files flow](edited-files-flow.md).

---

### 7.9 sessionEnd — cleanup and telemetry
```

### Change 6: claude-code-integration-layer.md — add link at end of §7.5

**Current text:**

```
**File:** `.claude/hooks/aic-after-file-edit-tracker.cjs`

---

### 7.6 Stop — quality gate (ESLint + typecheck)
```

**Required change:** Insert a sentence before the horizontal rule.

**Target text:**

```
**File:** `.claude/hooks/aic-after-file-edit-tracker.cjs`

For the full edited-files flow (tracker → stop → cleanup) and file list, see [edited-files flow](edited-files-flow.md).

---

### 7.6 Stop — quality gate (ESLint + typecheck)
```

### Change 7: claude-code-integration-layer.md — add link at end of §7.6

**Current text:**

```
**File:** `.claude/hooks/aic-stop-quality-check.cjs`

---

### 7.7 PreCompact — context preservation before compaction
```

**Required change:** Insert a sentence before the horizontal rule.

**Target text:**

```
**File:** `.claude/hooks/aic-stop-quality-check.cjs`

For the full edited-files flow and file list, see [edited-files flow](edited-files-flow.md).

---

### 7.7 PreCompact — context preservation before compaction
```

### Change 8: claude-code-integration-layer.md — add link at end of §7.8

**Current text:**

```
**File:** `.claude/hooks/aic-session-end.cjs`

---

## 8. Full event coverage
```

**Required change:** Insert a sentence before the horizontal rule.

**Target text:**

```
**File:** `.claude/hooks/aic-session-end.cjs`

For the full edited-files flow and cleanup behavior, see [edited-files flow](edited-files-flow.md).

---

## 8. Full event coverage
```

### Change 9: mvp-progress.md — add link in Phase AI intro (after first paragraph)

**Current text:**

```
The edited-files tracking system uses temporary JSON files in `os.tmpdir()` to pass the list of edited file paths from the `afterFileEdit` hook to the `stop` quality-check hook. The implementation is split across 8 files with two prefix variants ...
```

**Required change:** Add one sentence at the end of this paragraph (before "**Current duplication**") pointing to the canonical flow doc.

**Target text:**

```
The edited-files tracking system uses temporary JSON files in `os.tmpdir()` to pass the list of edited file paths from the `afterFileEdit` hook to the `stop` quality-check hook. The implementation is split across 8 files with two prefix variants (`aic-edited-files-` for Cursor, `aic-cc-edited-` for Claude Code), two different key sources (Cursor uses `conversation_id / session_id / AIC_CONVERSATION_ID` with a multi-field fallback chain; Claude uses `session_id` only), two different path extraction strategies (Cursor extracts multiple paths from various payload shapes via `extractPaths`; Claude extracts a single path from `tool_input.path`), and two different sanitization regexes (`/[^a-zA-Z0-9_-]/g` for Cursor vs `/[^a-zA-Z0-9*-]/g` for Claude — the `*` in Claude's regex is likely a bug). The stop-quality-check hooks also diverge: Cursor outputs `{ followup_message }` while Claude outputs `{ decision: "block", reason }`, and Claude filters to `.ts/.js` files while Cursor does not filter by extension. Despite all these differences, the core pattern is identical: write to a temp JSON array on each file edit, read the array at stop time, run eslint/tsc, and report results. The `readStdinSync` buffer-loop helper is also duplicated verbatim in all these files plus 2 additional `aic-block-no-verify.cjs` files (8 total copies). For the canonical flow and file list, see [edited-files flow](edited-files-flow.md).

**Current duplication (the problem):**
```

(Note: executor must locate the exact end of the first paragraph and insert only the sentence "For the canonical flow and file list, see [edited-files flow](edited-files-flow.md)." before "**Current duplication**".)

### Change 10: implementation-spec.md — add sentence in §2 or bootstrap

**Current text:** (Locate the bullet or sentence in §2 "What Ships in MVP" or the bootstrap section that mentions hooks / integration layer. If it says "Bootstrap (automatic on connect or first compile) | Scaffold config, trigger rule, hooks, `.aic/` directory", add a new sentence after the table or in the following paragraph.)

**Required change:** Add one sentence that hooks provide quality checks on edited files and link to edited-files-flow.md. Exact placement: after the row "| Bootstrap (automatic on connect or first compile) | Scaffold config, trigger rule, hooks, `.aic/` directory |" in the table, the document may have a following paragraph; if so, add there: "Hooks run quality checks on edited files at stop time; see [edited-files flow](documentation/edited-files-flow.md) for the flow per editor."

**Target text:** Insert the sentence in the first paragraph that follows the "What Ships in MVP" table and mentions bootstrap or hooks. If no such paragraph exists immediately after the table, add a short sentence after the table: "The integration layer runs quality checks on edited files at stop time; see [edited-files flow](edited-files-flow.md) for the full flow per editor."

### Change 11: architecture.md — add link in Cursor/Claude paragraph

**Current text:**

```
Cursor exposes sessionEnd, preCompact, subagentStart (gating only — no context injection), stop, afterFileEdit, and others; see [Cursor agent hooks](https://cursor.com/docs/agent/hooks). AIC uses sessionEnd, stop, and afterFileEdit where the editor exposes them. Claude Code's hook system covers all 7 capabilities, and AIC's integration layer is built for them.
```

**Required change:** Add a parenthetical link to the edited-files flow after "afterFileEdit".

**Target text:**

```
Cursor exposes sessionEnd, preCompact, subagentStart (gating only — no context injection), stop, afterFileEdit, and others; see [Cursor agent hooks](https://cursor.com/docs/agent/hooks). AIC uses sessionEnd, stop, and afterFileEdit where the editor exposes them (see [edited-files flow](edited-files-flow.md) for the full flow). Claude Code's hook system covers all 7 capabilities, and AIC's integration layer is built for them.
```

### Change 12: project-plan.md — add link in Current state paragraph

**Current text:**

```
**Current state:** The Cursor integration layer is built (session-start injection, tool gating, sessionEnd, stop quality check, afterFileEdit tracking, prompt logging). The Claude Code integration layer is implemented (plugin and direct installer; see [installation](documentation/installation.md)). Generic MCP editors have no hooks — they rely on the trigger rule.
```

**Required change:** Add a link to edited-files-flow.md after "afterFileEdit tracking" or at the end of the sentence.

**Target text:**

```
**Current state:** The Cursor integration layer is built (session-start injection, tool gating, sessionEnd, stop quality check, afterFileEdit tracking, prompt logging). The Claude Code integration layer is implemented (plugin and direct installer; see [installation](documentation/installation.md)). For the edited-files flow (tracker → stop → cleanup) per editor, see [edited-files flow](documentation/edited-files-flow.md). Generic MCP editors have no hooks — they rely on the trigger rule.
```

## Writing Standards

- **Tone:** Developer reference; precise, technical, formal active voice. Match cursor-integration-layer and claude-code-integration-layer.
- **Audience:** Integration developers and maintainers.
- **Terminology:** "edited-files temp file", "tracker", "stop hook", "sessionEnd"; "key" for the conversation/session identifier in the temp filename.
- **Formatting:** Tables for file list, comparison, output formats; code blocks for JSON; separate subsections per editor for flow. No phase or task references in body.
- **Cross-reference:** Link to integration-layer docs for hook output format details where relevant.

## Steps

### Step 1: Create documentation/edited-files-flow.md

Write the file `documentation/edited-files-flow.md` with the exact content from Change 1 Target text above (the markdown block in the Change Specification). Do not omit or alter sections.

**Verify:** File exists; all 11 sections present (Purpose, Flow overview, Comparison, Cursor flow, Claude Code flow, File inventory, Payload shapes, Output formats, Cleanup and Cursor temp file leak, Temp file schema and merge semantics, Stdin and shared helpers); no phase or task identifiers in body.

### Step 2: Modify installation.md (two link additions)

Apply Change 2: After the Cursor Hook Lifecycle paragraph ending with "Cursor does.", add the sentence "For the full edited-files flow (tracker → stop → cleanup and temp file behavior), see [edited-files flow](edited-files-flow.md)."

Apply Change 3: After the Claude Code Hook Lifecycle paragraph ending with "Claude Code does.", add the same sentence.

**Verify:** Both paragraphs now have the new sentence; link uses relative path `edited-files-flow.md`.

### Step 3: Modify cursor-integration-layer.md (two link additions)

Apply Change 4: At end of §7.7, before `---` and `### 7.8 stop`, insert: "For the full edited-files flow (tracker → stop → cleanup) and file list, see [edited-files flow](edited-files-flow.md)."

Apply Change 5: At end of §7.8, before `---` and `### 7.9 sessionEnd`, insert: "For the full edited-files flow and file list, see [edited-files flow](edited-files-flow.md)."

**Verify:** Both sections contain the new sentence; links resolve to documentation/edited-files-flow.md.

### Step 4: Modify claude-code-integration-layer.md (three link additions)

Apply Change 6: At end of §7.5, before `---` and `### 7.6 Stop`, insert the link sentence.

Apply Change 7: At end of §7.6, before `---` and `### 7.7 PreCompact`, insert the link sentence.

Apply Change 8: At end of §7.8, before `---` and `## 8. Full event coverage`, insert: "For the full edited-files flow and cleanup behavior, see [edited-files flow](edited-files-flow.md)."

**Verify:** All three sections updated; links valid.

### Step 5: Modify mvp-progress.md (Phase AI intro)

Apply Change 9: In Phase AI, at the end of the first long paragraph (the one that ends with "8 total copies."), add: " For the canonical flow and file list, see [edited-files flow](edited-files-flow.md)."

**Verify:** Single sentence added; no duplicate links.

### Step 6: Modify implementation-spec.md

Apply Change 10: In §2 "What Ships in MVP", add one sentence that refers to quality checks on edited files and links to [edited-files flow](edited-files-flow.md). Place it in the first paragraph that follows the main table and mentions bootstrap or hooks, or immediately after that table.

**Verify:** Link present and resolvable.

### Step 7: Modify architecture.md

Apply Change 11: In the paragraph that mentions "AIC uses sessionEnd, stop, and afterFileEdit", add the parenthetical "(see [edited-files flow](edited-files-flow.md) for the full flow)" after "afterFileEdit where the editor exposes them".

**Verify:** Link present and resolvable.

### Step 8: Modify project-plan.md

Apply Change 12: In the "Current state" paragraph, after the sentence that references [installation](documentation/installation.md), add: " For the edited-files flow (tracker → stop → cleanup) per editor, see [edited-files flow](documentation/edited-files-flow.md)."

**Verify:** Link present; path documentation/edited-files-flow.md correct for project-plan context.

### Step 9: Final verification

Run: `pnpm lint` (no doc lint required; codebase lint only). Confirm all created and modified files are in the Files table and all links resolve (open each linked path from each doc).

## Tests

| Test case | Description |
| --------- | ----------- |
| doc_exists | documentation/edited-files-flow.md exists and has Purpose, Flow overview, Comparison, Cursor flow, Claude Code flow, File inventory, Payload shapes, Output formats, Cleanup, Temp file schema, Stdin helpers |
| links_resolve | Every link to edited-files-flow.md from the 7 modified docs resolves to the same file |
| no_stale_refs | No phase names or task numbers in edited-files-flow.md body |

## Acceptance Criteria

- [ ] documentation/edited-files-flow.md created with full content per Change 1
- [ ] All 7 documents modified with the exact link additions per Changes 2–12
- [ ] No phase or task identifiers in edited-files-flow.md body
- [ ] All internal links to edited-files-flow.md use correct relative path for each referring document
- [ ] pnpm lint passes (if run)

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations, stop. List the adaptations, report to the user, and re-evaluate before continuing.
