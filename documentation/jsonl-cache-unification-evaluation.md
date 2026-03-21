# JSONL cache unification evaluation

## Scope and non-goals

This document answers whether `session-models.jsonl`, `prompt-log.jsonl`, and `session-log.jsonl` under `.aic/` should share one generic `JsonlCache` abstraction across integration hooks and MCP maintenance code.

> It does not decide marker-file layout (`.session-start-lock`, `.session-context-injected`) or edited-files temp storage under `os.tmpdir()`.

## Current architecture

| File                        | Append path                                                       | Read API in shared CJS                      | Prune                                                                        |
| --------------------------- | ----------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| `.aic/session-models.jsonl` | `integrations/shared/session-model-cache.cjs` calls `appendJsonl` | `readSessionModelCache` scans the full file | MCP startup via `pruneJsonlByTimestamp` with filename `session-models.jsonl` |
| `.aic/prompt-log.jsonl`     | `integrations/shared/prompt-log.cjs`                              | none (append-only from shared CJS)          | MCP startup via `prunePromptLog` delegating to `pruneJsonlByTimestamp`       |
| `.aic/session-log.jsonl`    | `integrations/shared/session-log.cjs`                             | none (append-only from shared CJS)          | MCP startup via `pruneSessionLog` delegating to `pruneJsonlByTimestamp`      |

Pruning is scheduled from `mcp/src/server.ts` inside `createMcpServer` using `setImmediate` alongside cache purge. Implementation lives under `shared/src/maintenance/`.

## Shared mechanisms today

- **Append:** All three files use `appendJsonl` from `integrations/shared/aic-dir.cjs`, which creates `.aic/` at mode `0o700` and appends one JSON object per line.
- **Retention:** `shared/src/maintenance/prune-jsonl-by-timestamp.ts` removes lines whose `timestamp` field is older than twenty-four hours measured from the injected `Clock` at prune time. The same `RETENTION_MINUTES` value applies to every filename passed into this helper.
- **Field validation:** CJS writers use `integrations/shared/cache-field-validators.cjs`. TypeScript maintenance uses `shared/src/maintenance/cache-field-validators.ts` with aligned rules, as summarized in [Integrations shared modules reference](integrations-shared-modules.md).

## Schema comparison

| JSONL file                  | Line shape                                                                                                                                                                                                          | `timestamp` for retention                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `.aic/session-models.jsonl` | Compact keys: `c` (conversation id), `m` (model id), `e` (editor id), plus `timestamp` (ISO string from the caller or from `writeSessionModelCache` when the caller omits it).                                      | Required on each kept line; parsed by `pruneJsonlByTimestamp`. |
| `.aic/prompt-log.jsonl`     | Discriminated `type`: `prompt` or `session_end`. Prompt lines: `editorId`, `conversationId`, `generationId`, `title`, `model`, `timestamp`. Session-end lines: `editorId`, `conversationId`, `reason`, `timestamp`. | Same.                                                          |
| `.aic/session-log.jsonl`    | `session_id`, `reason`, `duration_ms`, `timestamp`; printable ASCII enforced on `session_id` before append.                                                                                                         | Same.                                                          |

All three schemas expose a `timestamp` string that `pruneJsonlByTimestamp` can parse for retention.

## Read paths versus append-only writers

Only `session-model-cache.cjs` implements integration-layer reads. It scans all lines to pick the latest model for an editor, preferring a line whose conversation id matches when the caller supplies one. Prompt and session logs are write-only from `integrations/shared/`; any historical analysis reads the JSONL file on disk outside these small modules.

## Assessment of a unified JsonlCache abstraction

**Already centralized:** Append uses `fs.appendFileSync` in UTF-8 text mode with one JSON object serialized per line; age-based pruning is shared. A thin wrapper around `appendJsonl` alone would touch few call sites and mostly adds indirection.

Structural mismatch for one generic type:

### Schemas differ

One shared class with a single record shape would need wide unions or would drop the per-file validation that runs before append today.

### Read semantics differ

Session models need full-file scan and last-match selection. A generic cache focused on append and prune still needs a dedicated reader for session models; uniform "query" APIs would misrepresent prompt and session logs, which have no shared read helper.

### Runtime split

Hooks run CommonJS without the MCP `Clock`. Pruning uses `Clock` in TypeScript maintenance. One abstraction spanning both sides would fight the boundary between editor integration scripts and the MCP composition root unless split into thin adapters on each side.

**Proportional middle ground:** Keep `appendJsonl` and `pruneJsonlByTimestamp` as the shared core. If small duplicated helpers appear, extract line-parse or timestamp-check utilities without claiming a single domain type for all three logs.

## Recommendation

**Do not introduce a single generic `JsonlCache` with unified typed schema, append, prune, and query across all three files.** Shared primitives already cover append and retention. Schema and read behavior diverge enough that a unified façade costs more clarity than it saves. Treat this document as the decision record unless a future JSONL file repeats the same shape and read pattern as an existing one.

## Implementation prerequisites

If a future refactor still merges code paths:

- Keep validation at the append boundary in CJS hooks.
- Keep pruning on the MCP side with `Clock` injection; follow repository determinism rules for TypeScript layers.
- Mirror edits under `integrations/shared/` into `.cursor/hooks/` copies in the same commit per installer documentation.

## Related documentation

- [Server-side code sharing evaluation](server-side-code-sharing-evaluation.md)
- [Integrations shared modules reference](integrations-shared-modules.md)
