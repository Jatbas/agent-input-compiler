# Phase 6: Present Draft & Write to Progress

## §6. Present Draft + User Approval Gate

Present the refined proposal in two distinct sections so the user can act on Quick Wins immediately while deliberating on the Strategic Phase:

> **Roadmap Forge complete.** Input source: [tier]. Explorers: [count]. Proposals: [N phases, M components].
>
> ---
>
> ### Category A — Quick Wins
>
> [1 sentence: what these fix and why they are immediately actionable]
>
> [Display the Category A phase in full (header + description + table). Each component should be scoped for a single `aic-task-planner` invocation.]
>
> **Task-planner prompts:** For each Category A component, provide a ready-to-use prompt the user can copy-paste into a new chat with `@aic-task-planner` attached. Format: quoted block starting with "Plan a task for:" followed by a specific description with file paths, line numbers, and the exact problem to fix.
>
> ---
>
> ### Category B — Strategic Phase
>
> **Value scorecard** (top 5 by composite, post-critic SA scores applied):
>
> | #   | Candidate | Composite | UI    | UP    | SA    | EU    | DR    | IS    |
> | --- | --------- | --------- | ----- | ----- | ----- | ----- | ----- | ----- |
> | 1   | [name]    | [n.n]     | [1-5] | [1-5] | [1-5] | [1-5] | [1-5] | [1-5] |
>
> [Display the Category B phase(s) in full (header + description + table + task details).]
>
> **Priority rationale:** [2-3 sentences referencing composite scores — "Phase X leads because its components average composite Y, driven by high Unblock Potential and User Impact"]
>
> ---
>
> **Adversarial challenges addressed:** [N incorporated, M rejected — one line summary]
>
> **Score disputes resolved:** [any cases where Critic B's SA score changed the ordering]
>
> **From external research:** [key finding and impact, or "None — all proposals from internal sources"]

**Large proposal handling:** If Category B exceeds 2 phases or 12 total components, present Category B phases one at a time. After each: "Approve, request changes, or reject? (Type `next` to move to the next phase without deciding now.)" Category A is always presented in full (it is capped at 4 components).

Otherwise, display all proposed phases in full (header + description + table).

**Wait for user approval before writing.** The user may:

- **Approve all phases** → proceed to §7
- **Approve specific phases** → queue approved phases for §7; for unapproved phases, explicitly announce: "Phase [X] was not approved and has been discarded. Invoke this skill again to revisit it."
- **Request changes** → revise inline, re-present the changed phases only. Wait for explicit re-approval before writing. Do not write until the user confirms the revised version. If a revision materially changes scope (adds components, reintroduces a critic-flagged component, changes phase ordering), re-run §5 for the changed sections only. Cap revision cycles at 3.
- **Mixed (approve some, change others)** → apply changes, re-present only changed phases, queue already-approved phases. Write all together only after changed phases receive final approval.
- **Reject** → do not write anything

**Context window note:** If the session has been active for more than 8 tool calls and the proposal exceeds 2,000 tokens, save the draft proposal to `documentation/tasks/forge-draft-[YYYY-MM-DD].md` before presenting it in chat. Note the file path at the top of the presentation so the user can recover it after compaction.

---

## §7. Write to aic-progress.md

**Main workspace only.** Never write to a worktree — `aic-progress.md` is gitignored and must live in the main workspace.

**Pre-write checks (run before any edit):**

1. **Freshness check:** Re-read `aic-progress.md` now. If the file has changed since §1 (compare header metrics or line count), announce: "aic-progress.md has changed since this session began. Proceeding with a fresh read." Use the current file state for all positional insertions and metric recounts.

2. **Collision check:** For each approved phase, search the file for any existing `### Phase [letter]` or `### Phase [letter][letter]` header matching the proposed name. If a collision is detected, halt and report: "Phase [X] already exists in the file. Confirm the intended phase letter or an alternative before writing."

**For each approved phase:**

1. **Determine insertion point:** Insert after the last existing phase in the same version group. If a new version group, insert immediately before the `## Daily Log` section — never at the literal end of file.

2. **Determine table schema:** Read the phase immediately preceding the insertion point. Use the same column names. If the new phase is documentation-focused (no source files), use a `Skill` column instead of `Package` (matching the Phase VA pattern).

3. **Update header metrics:** Following the update-progress recounting algorithm — recount `Done` rows per named header field (`**Phase 1.0:**`, `**Phase 1.5:**`), scoped to that version group only. New `Not started` entries increase M but not N. Also update `**Current phase:**` if the active phase letter has advanced. Update `**Status:**` with a one-sentence description of current progress state. Do NOT touch `**Version target:**` or `**Previous:**` unless explicitly asked. If a new version group is introduced, add a new `**Phase X.Y:** 0/M done` header field above the new section.

4. **Daily log entry:** After inserting phase sections, add a daily log entry following the format used by adjacent entries: today's date, action taken ("Forge: Added Phase [X] — [title], [N] components"), updated header metric.

**After writing:** Read back and show the user the updated header block and newly inserted phase sections.

Do not change any existing phase content, table structure, or other daily log entries. Do not stage or commit this file.
