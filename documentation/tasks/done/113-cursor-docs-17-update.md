# Task 113: Update documentation for Cursor hook reality

> **Status:** Done
> **Phase:** 1.0 — OSS Release (Cursor integration)
> **Layer:** documentation
> **Depends on:** None (can be done in parallel with 109–112)

## Goal

Update AIC documentation to reflect Cursor hook API reality: Cursor exposes sessionEnd, preCompact, subagentStart, subagentStop, postToolUse, postToolUseFailure, stop, afterAgentResponse, afterAgentThought. Correct the capability tables and narrative so they no longer claim Cursor lacks these hooks; clarify that subagentStart is gating-only (no context injection) and preCompact is observational-only (no re-compilation). Fix mvp-progress.md so "afterFileEdit tracking hook" and "stop quality check hook" either reference the new task numbers (111) or state they require re-implementation.

## Architecture Notes

- Primary source: cursor.com/docs/agent/hooks. Docs are the source of truth; tables must match.
- SubagentStart output: only `permission` + `user_message` — no `additional_context`. So "Subagent start + context injection" for Cursor remains "No" (gating only).
- preCompact output: only `user_message` — no `additional_context`. So "Pre-compaction" for Cursor is "Hook available (observational only)" not "Re-compile before compaction."
- preToolUse `updated_input` is silently ignored for the Task tool (Cursor forum bug); document only if we have a public note.

## Files

| Action | Path                                                                                                                                |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Modify | `documentation/architecture.md` (coverage table + Cursor integration section)                                                       |
| Modify | `documentation/project-plan.md` (capability table + any Cursor-specific narrative)                                                  |
| Modify | `documentation/gaps.md` (Cursor column in capability table)                                                                         |
| Modify | `documentation/future/claude-code-hook-integration.md` (fix "Cursor has no hooks" to accurate statement)                            |
| Modify | `documentation/mvp-progress.md` (afterFileEdit tracking hook, stop quality check hook — link to Task 111 or note re-implementation) |

## Config Changes

- None.

## Steps

### Step 1: Update architecture.md

In `documentation/architecture.md`:

- In the "Editor hook coverage and integration status" table, update the Cursor column:
  - Session end: change "—" to "Hook available" (or "Integrated" after Task 110).
  - Pre-compaction: change "—" to "Hook available (observational only)".
  - Subagent start + context injection: keep "—" for context injection but add a note that Cursor exposes subagentStart for gating only (no context injection). Or add a row "Subagent start (gating only)" with "Hook available."
- In "Cursor Integration" and "What the Cursor integration does", add a short note that Cursor exposes sessionEnd, preCompact, subagentStart (gating only), stop, etc., and that AIC uses sessionEnd (Task 110), stop + afterFileEdit (Task 111) where implemented.
- In "Editor-specific integration gaps", update the Cursor bullet: Cursor does support sessionEnd and preCompact as hooks, but preCompact cannot inject context (observational only) and subagentStart cannot inject context (gating only).

**Verify:** Table and bullets match Cursor docs; no "—" for sessionEnd/preCompact where hooks exist.

### Step 2: Update project-plan.md

In `documentation/project-plan.md`:

- Find the "Current editor capabilities" table (Cursor vs Claude Code vs Generic MCP). Update Cursor row for "Session end" from "No" to "Yes (sessionEnd)" or "Hook available." Update "Pre-compaction" to "Yes (PreCompact, observational only)." Add a footnote or sentence that subagentStart in Cursor is gating only, no context injection.
- Add a short note that Cursor exposes these hooks; AIC integration layer is being updated (Tasks 109–111, 113).

**Verify:** Capability table Cursor column accurate; no outdated "No" for session end / pre-compaction.

### Step 3: Update gaps.md

In `documentation/gaps.md`:

- In the "Critical Finding: Claude Code Hooks" table (or any Cursor capability table), update Cursor column for Session end and Pre-compaction to reflect that Cursor now exposes these hooks (and whether AIC has integrated them). E.g. "Session end: Cursor hook available (AIC Task 110); Pre-compaction: Cursor hook available (observational only)."

**Verify:** Gaps table consistent with architecture and project-plan.

### Step 4: Update claude-code-hook-integration.md

In `documentation/future/claude-code-hook-integration.md`:

- Replace any sentence that says "Cursor has no hooks" or "Cursor does not support X" with an accurate statement: e.g. "Cursor does not support per-prompt context injection or subagent context injection; it exposes subagentStart for gating only and preCompact as observational only."

**Verify:** No false "Cursor has no hooks" claim; nuance about per-prompt and context injection preserved.

### Step 5: Update mvp-progress.md

In `documentation/mvp-progress.md`:

- Find the rows "afterFileEdit tracking hook" and "stop quality check hook" (Phase 0 or similar). They are marked "Done" but no script files exist. Either: (a) change status to "Pending" and set Deps to "Task 111", or (b) add a note that implementation is in Task 111 (re-implementation / first real implementation). Ensure the table does not claim Done without an implementation.

**Verify:** mvp-progress does not say "Done" for these two without pointing to Task 111 or marking Pending.

### Step 6: Final verification

Run: `pnpm lint` (if docs are linted). Skim all modified sections for consistency.

## Tests

| Test case | Description                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| Manual    | Cross-check every Cursor capability cell in architecture.md, project-plan.md, gaps.md against cursor.com/docs/agent/hooks |

## Acceptance Criteria

- [ ] architecture.md Cursor column and narrative match Cursor hooks (sessionEnd, preCompact, subagentStart gating-only)
- [ ] project-plan.md capability table updated
- [ ] gaps.md Cursor capabilities consistent
- [ ] claude-code-hook-integration.md does not claim Cursor has no hooks; nuance correct
- [ ] mvp-progress.md afterFileEdit/stop entries fixed (Task 111 or Pending)

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance
