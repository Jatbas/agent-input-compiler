# Prompt-log schema (current, per editor)

**Path:** `{projectRoot}/.aic/prompt-log.jsonl`

The file holds one JSON object per line. Two shapes exist; the shape depends on which editor wrote the line.

## Shape 1 — Cursor

Written by: `integrations/cursor/hooks/AIC-before-submit-prewarm.cjs` (beforeSubmitPrompt hook).

| Field          | Type   | Source / notes                           |
| -------------- | ------ | ---------------------------------------- |
| conversationId | string | `input.conversation_id` or `"unknown"`   |
| generationId   | string | `input.generation_id` or `"unknown"`     |
| title          | string | First 200 characters of the user prompt  |
| model          | string | `input.model` or `""`                    |
| timestamp      | string | ISO 8601 from `new Date().toISOString()` |

## Shape 2 — Claude

Written by: `integrations/claude/hooks/aic-session-end.cjs` and `integrations/claude/plugin/scripts/aic-session-end.cjs` (SessionEnd hook).

| Field     | Type   | Source / notes                                   |
| --------- | ------ | ------------------------------------------------ |
| sessionId | string | Parsed stdin: `session_id` or `input.session_id` |
| reason    | string | Parsed stdin: `reason` or `input.reason`         |
| timestamp | string | ISO 8601 from `new Date().toISOString()`         |

## Read sites

| File                                               | Function / context                 | Fields used    | Validated              |
| -------------------------------------------------- | ---------------------------------- | -------------- | ---------------------- |
| shared/src/maintenance/prune-jsonl-by-timestamp.ts | prunePromptLog (mcp/src/server.ts) | timestamp only | Yes (isValidTimestamp) |

No other production code reads prompt-log.jsonl. Tests that touch the file only assert existence or line count; they do not parse or validate fields.

## Write sites

| File                                                    | Shape   |
| ------------------------------------------------------- | ------- |
| integrations/cursor/hooks/AIC-before-submit-prewarm.cjs | Shape 1 |
| integrations/claude/hooks/aic-session-end.cjs           | Shape 2 |
| integrations/claude/plugin/scripts/aic-session-end.cjs  | Shape 2 |

## Fields each consumer needs

- Prune: `timestamp` only. Used to retain lines within the retention window; invalid lines are dropped.

## Field equivalence (Cursor vs Claude)

| Category    | Fields                                     | Notes                                                |
| ----------- | ------------------------------------------ | ---------------------------------------------------- |
| Cursor-only | conversationId, generationId, title, model | No Claude equivalent; Claude shape has no such field |
| Claude-only | sessionId, reason                          | No Cursor equivalent; Cursor shape has no such field |
| Common      | timestamp                                  | Both shapes; ISO 8601 string                         |
