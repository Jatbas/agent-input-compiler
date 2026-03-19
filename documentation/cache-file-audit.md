# Cache file read/write audit

Inventory of all read and write sites for the three JSONL cache files under `.aic/`. Expected schema per file and validation status at each read site. See `documentation/mvp-progress.md` Phase AE for threat model and validation constraints.

## session-models.jsonl

**Path:** `{projectRoot}/.aic/session-models.jsonl`

**Expected schema (per line):**

| Field     | Type   | Description    |
| --------- | ------ | -------------- |
| c         | string | conversationId |
| m         | string | modelId        |
| e         | string | editorId       |
| timestamp | string | ISO 8601       |

**Read sites**

| File                                                      | Function / context      | m validated          | c, e, timestamp validated |
| --------------------------------------------------------- | ----------------------- | -------------------- | ------------------------- |
| mcp/src/handlers/compile-handler.ts                       | readSessionModelCache() | Yes (isValidModelId) | No                        |
| integrations/claude/hooks/aic-compile-helper.cjs          | readSessionModelCache() | Yes                  | No                        |
| integrations/claude/plugin/scripts/aic-compile-helper.cjs | readSessionModelCache() | Yes                  | No                        |
| integrations/claude/hooks/aic-inject-conversation-id.cjs  | readSessionModelCache() | Yes                  | No                        |
| integrations/cursor/hooks/AIC-subagent-compile.cjs        | readSessionModelCache() | Yes                  | No                        |

Prune (shared/src/maintenance/prune-jsonl-by-timestamp.ts) reads this file when invoked for "session-models.jsonl" from mcp/src/server.ts; it only uses the `timestamp` field. No validation of c, m, e at prune.

**Write sites**

- mcp/src/handlers/compile-handler.ts — writeSessionModelCache()
- integrations/claude/hooks/aic-compile-helper.cjs — writeSessionModelCache()
- integrations/claude/plugin/scripts/aic-compile-helper.cjs — writeSessionModelCache()
- integrations/cursor/hooks/AIC-subagent-compile.cjs — writeSessionModelCache()
- integrations/cursor/hooks/AIC-compile-context.cjs — inline fs.appendFileSync + JSON.stringify
- integrations/cursor/hooks/AIC-inject-conversation-id.cjs — inline fs.appendFileSync
- integrations/cursor/hooks/AIC-before-submit-prewarm.cjs — inline fs.appendFileSync (modelId validated before write)

**Validation gap:** Only `m` is validated at read (isValidModelId: length 1–256, printable ASCII). Fields `c`, `e`, and `timestamp` are read and used (c/e for matching; timestamp in prune) with no type, length, or printable-ASCII checks.

---

## session-log.jsonl

**Path:** `{projectRoot}/.aic/session-log.jsonl`

**Expected schema (per line):**

| Field       | Type   | Description                      |
| ----------- | ------ | -------------------------------- |
| session_id  | string | Session identifier               |
| reason      | string | End reason                       |
| duration_ms | number | Session duration in milliseconds |
| timestamp   | string | ISO 8601                         |

**Read sites**

| File                                               | Function / context                  | Fields used    | Validated |
| -------------------------------------------------- | ----------------------------------- | -------------- | --------- |
| shared/src/maintenance/prune-jsonl-by-timestamp.ts | pruneSessionLog (mcp/src/server.ts) | timestamp only | No        |

**Write sites**

- integrations/cursor/hooks/AIC-session-end.cjs — appendSessionLog() (Cursor only; Claude SessionEnd writes to prompt-log.jsonl)

**Validation gap:** No read site consumes session_id, reason, or duration_ms for pipeline or tool use. Prune only uses timestamp (unvalidated). If future code reads these fields, they must be validated.

---

## prompt-log.jsonl

**Path:** `{projectRoot}/.aic/prompt-log.jsonl`

**Expected schema — two row shapes:**

**Shape 1 (Cursor, AIC-before-submit-prewarm.cjs):** conversationId, generationId, title (first 200 chars of prompt), model, timestamp.

**Shape 2 (Claude SessionEnd, aic-session-end.cjs):** sessionId, reason, timestamp.

**Read sites**

| File                                               | Function / context                 | Fields used    | Validated         |
| -------------------------------------------------- | ---------------------------------- | -------------- | ----------------- |
| shared/src/maintenance/prune-jsonl-by-timestamp.ts | prunePromptLog (mcp/src/server.ts) | timestamp only | No                |
| mcp/src/handlers/**tests**/compile-handler.test.ts | Test assertion                     | full line      | Test context only |

**Write sites**

- integrations/cursor/hooks/AIC-before-submit-prewarm.cjs — appendLog() (Shape 1)
- integrations/claude/hooks/aic-session-end.cjs — appendFileSync (Shape 2)
- integrations/claude/plugin/scripts/aic-session-end.cjs — appendFileSync (Shape 2)

**Validation gap:** No production read consumes prompt-log fields for pipeline or tool use. Prune only uses timestamp (unvalidated). Documented so AE02/AE04 and future readers know expected shapes.
