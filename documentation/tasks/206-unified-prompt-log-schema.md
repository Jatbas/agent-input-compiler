# Task 206: Design unified prompt-log schema

> **Status:** Pending
> **Phase:** AG (Prompt Log Pipeline Simplification)
> **Layer:** documentation
> **Depends on:** AG01 (Document current prompt-log schema per editor)

## Goal

Define a single JSONL schema for `prompt-log.jsonl` with a common envelope and discriminated fields per entry type, and document backward-compatibility rules so existing log entries remain valid and readers (including the prune logic) behave correctly.

## Architecture Notes

- Phase AG target: one schema with envelope (`type`, `editorId`, `conversationId`, `timestamp`) and type-specific fields; additive, not breaking.
- Canonical schema document is `documentation/prompt-log-schema.md`; `documentation/cache-file-audit.md` references it for read/write sites.
- Timestamp format and validation align with `shared/src/maintenance/cache-field-validators.ts` (`isValidTimestamp`: length 1–32, printable ASCII); document for AG03 implementers.

## Files

| Action | Path                                  |
| ------ | ------------------------------------- |
| Modify | `documentation/prompt-log-schema.md`  |

## Schema specification (unified — to be added to document)

**Common envelope (every line):**

| Field           | Type   | Required | Description |
| --------------- | ------ | -------- | ----------- |
| type            | string | yes      | Discriminator: `"prompt"` or `"session_end"` |
| editorId        | string | yes      | `"cursor"` or `"claude-code"` |
| conversationId  | string | yes      | Cursor: `input.conversation_id`; Claude: same value as legacy `sessionId` |
| timestamp       | string | yes      | ISO 8601 UTC with milliseconds and trailing Z (`YYYY-MM-DDTHH:mm:ss.sssZ`). Validated at read: length 1–32, printable ASCII. |

**When `type === "prompt"` (Cursor, beforeSubmitPrompt):**

| Field        | Type   | Source / notes                          |
| ------------ | ------ | --------------------------------------- |
| generationId | string | `input.generation_id` or `"unknown"`    |
| title        | string | First 200 characters of the user prompt |
| model        | string | `input.model` or `""`                    |

**When `type === "session_end"` (Claude Code, SessionEnd):**

| Field | Type   | Source / notes                    |
| ----- | ------ | --------------------------------- |
| reason | string | Parsed stdin: `reason` or `input.reason` |

**Backward compatibility:** Lines written before the unified schema lack `type` and `editorId`. Readers must accept them: treat as legacy Shape 1 (Cursor) when `generationId`, `title`, or `model` is present; treat as legacy Shape 2 (Claude) when `sessionId` or `reason` is present. The prune logic uses only `timestamp`; it keeps or drops lines by timestamp and drops lines that fail timestamp validation. Legacy lines remain valid for pruning.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add unified schema section

In `documentation/prompt-log-schema.md`, after the opening paragraph (before "## Shape 1"), insert a new top-level section **"## Unified schema (target)"** containing:

- One paragraph stating that the target format for new writes is a common envelope plus type-specific fields, and that the file path remains `{projectRoot}/.aic/prompt-log.jsonl`.
- A table for the common envelope with columns: Field, Type, Required, Description. Rows: type (string, yes, discriminator `"prompt"` \| `"session_end"`), editorId (string, yes, `"cursor"` \| `"claude-code"`), conversationId (string, yes, Cursor: input.conversation_id; Claude: same as legacy sessionId), timestamp (string, yes, ISO 8601 UTC with ms and Z; validated at read: length 1–32, printable ASCII).
- A subsection **"When type is prompt (Cursor)"** with a table: generationId, title, model (types and sources as in Schema specification above).
- A subsection **"When type is session_end (Claude Code)"** with a table: reason (type and source as above).
- A subsection **"Backward compatibility"** stating: lines written before the unified schema do not have `type` or `editorId`; readers must accept them; legacy Shape 1 is identified by presence of generationId/title/model, legacy Shape 2 by presence of sessionId/reason; prune uses only `timestamp` and drops lines that fail timestamp validation; legacy lines remain valid for pruning.

Use the exact field names, types, and descriptions from the Schema specification section of this task. Do not add optional fields or alternative shapes beyond the two types above.

**Verify:** The new section is present and matches the Schema specification; no hedging or optional language in the added text.

### Step 2: Reference legacy shapes from unified section

In the new "Unified schema (target)" section, add one sentence after the opening paragraph: the current per-editor shapes (Shape 1 and Shape 2 below) remain in the file until write sites are migrated; they are documented under "Prompt-log schema (current, per editor)" for reference.

Rename the existing top-level heading from "Prompt-log schema (current, per editor)" to "Legacy shapes (current, per editor)" so that the document has a clear "target" vs "legacy" split. Update the first line under that heading to state that the following shapes are written by current code and will be replaced by the unified schema once AG03/AG04 are done.

**Verify:** The document has both "Unified schema (target)" and "Legacy shapes (current, per editor)"; the cross-reference sentence is present; the legacy section still lists Shape 1, Shape 2, read sites, write sites, and field equivalence.

### Step 3: Final verification

Read `documentation/prompt-log-schema.md` in full. Confirm: (1) unified envelope and both type variants are documented, (2) backward-compat rules are stated, (3) timestamp format and validation are described, (4) legacy section is intact and correctly labeled. Run `pnpm lint` from the repo root; expect no errors from documentation (no code changes).

**Verify:** Doc is coherent; lint passes.

## Tests

| Test case              | Description |
| ---------------------- | ----------- |
| Unified section exists | Manual: "Unified schema (target)" section present with envelope, both type variants, and backward-compat subsection. |
| Legacy preserved       | Manual: "Legacy shapes (current, per editor)" section retains Shape 1, Shape 2, read/write sites, and field equivalence. |

## Acceptance Criteria

- [ ] `documentation/prompt-log-schema.md` modified per Files table
- [ ] "Unified schema (target)" section added with envelope, type discrimination, and backward-compat rules
- [ ] "Legacy shapes (current, per editor)" section present and cross-referenced from unified section
- [ ] No code or config changes; `pnpm lint` passes
- [ ] Single-line comments only in any touched non-doc files (none for this task)

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
