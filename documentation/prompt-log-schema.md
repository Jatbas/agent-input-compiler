# Prompt-log schema

**Path:** `{projectRoot}/.aic/prompt-log.jsonl`

The file holds one JSON object per line. Two shapes exist; the shape depends on which editor wrote the line.

## Unified schema (target)

The target format for new writes is a common envelope plus type-specific fields per entry. The file path remains `{projectRoot}/.aic/prompt-log.jsonl`. The current per-editor shapes (Shape 1 and Shape 2 below) remain in the file until write sites are migrated; they are documented under "Legacy shapes (current, per editor)" for reference.

| Field          | Type   | Required | Description                                                                                                                  |
| -------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| type           | string | yes      | Discriminator: `"prompt"` or `"session_end"`                                                                                 |
| editorId       | string | yes      | `"cursor"` or `"claude-code"`                                                                                                |
| conversationId | string | yes      | Cursor: `input.conversation_id`; Claude: same value as legacy `sessionId`                                                    |
| timestamp      | string | yes      | ISO 8601 UTC with milliseconds and trailing Z (`YYYY-MM-DDTHH:mm:ss.sssZ`). Validated at read: length 1–32, printable ASCII. |

### When type is prompt (Cursor)

| Field        | Type   | Source / notes                          |
| ------------ | ------ | --------------------------------------- |
| generationId | string | `input.generation_id` or `"unknown"`    |
| title        | string | First 200 characters of the user prompt |
| model        | string | `input.model` or `""`                   |

### When type is session_end (Claude Code)

| Field  | Type   | Source / notes                           |
| ------ | ------ | ---------------------------------------- |
| reason | string | Parsed stdin: `reason` or `input.reason` |

### Backward compatibility

Lines written before the unified schema lack `type` and `editorId`. Readers must accept them: treat as legacy Shape 1 (Cursor) when `generationId`, `title`, or `model` is present; treat as legacy Shape 2 (Claude) when `sessionId` or `reason` is present. The prune logic uses only `timestamp`; it keeps or drops lines by timestamp and drops lines that fail timestamp validation. Legacy lines remain valid for pruning.

## Legacy shapes (current, per editor)

The following shapes are written by current code and will be replaced by the unified schema once AG03/AG04 are done.

### Shape 1 — Cursor

Written by: `integrations/cursor/hooks/AIC-before-submit-prewarm.cjs` (beforeSubmitPrompt hook).

| Field          | Type   | Source / notes                           |
| -------------- | ------ | ---------------------------------------- |
| conversationId | string | `input.conversation_id` or `"unknown"`   |
| generationId   | string | `input.generation_id` or `"unknown"`     |
| title          | string | First 200 characters of the user prompt  |
| model          | string | `input.model` or `""`                    |
| timestamp      | string | ISO 8601 from `new Date().toISOString()` |

### Shape 2 — Claude

Written by: `integrations/claude/hooks/aic-session-end.cjs` and `integrations/claude/plugin/scripts/aic-session-end.cjs` (SessionEnd hook).

| Field     | Type   | Source / notes                                   |
| --------- | ------ | ------------------------------------------------ |
| sessionId | string | Parsed stdin: `session_id` or `input.session_id` |
| reason    | string | Parsed stdin: `reason` or `input.reason`         |
| timestamp | string | ISO 8601 from `new Date().toISOString()`         |

### Read sites

| File                                               | Function / context                 | Fields used    | Validated              |
| -------------------------------------------------- | ---------------------------------- | -------------- | ---------------------- |
| shared/src/maintenance/prune-jsonl-by-timestamp.ts | prunePromptLog (mcp/src/server.ts) | timestamp only | Yes (isValidTimestamp) |

No other production code reads prompt-log.jsonl. Tests that touch the file only assert existence or line count; they do not parse or validate fields.

### Write sites

| File                                                    | Shape   |
| ------------------------------------------------------- | ------- |
| integrations/cursor/hooks/AIC-before-submit-prewarm.cjs | Shape 1 |
| integrations/claude/hooks/aic-session-end.cjs           | Shape 2 |
| integrations/claude/plugin/scripts/aic-session-end.cjs  | Shape 2 |

### Fields each consumer needs

- Prune: `timestamp` only. Used to retain lines within the retention window; invalid lines are dropped.

### Field equivalence (Cursor vs Claude)

| Category    | Fields                                     | Notes                                                |
| ----------- | ------------------------------------------ | ---------------------------------------------------- |
| Cursor-only | conversationId, generationId, title, model | No Claude equivalent; Claude shape has no such field |
| Claude-only | sessionId, reason                          | No Cursor equivalent; Cursor shape has no such field |
| Common      | timestamp                                  | Both shapes; ISO 8601 string                         |
