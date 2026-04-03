# AIC JSONL caches under `.aic/`

## When to update this document

Update this document when:

- You add another project-root JSONL log under `.aic/` that participates in the same append and prune story as `session-models.jsonl`, `prompt-log.jsonl`, or `session-log.jsonl`.
- You change append implementation (`appendJsonl` in `integrations/shared/aic-dir.cjs`) or retention and prune wiring for those logs, including `shared/src/maintenance/` or scheduling in `mcp/src/server.ts`.
- You change line shape, schema, or read semantics for those JSONL files.
- You introduce or redesign a shared JSONL façade across those logs; rewrite this document to match the new shape.
- Inventory and caller details for shared modules live in [Integrations shared modules reference](integrations-shared-modules.md); update that document when those change.

## Scope

This document describes how `session-models.jsonl`, `prompt-log.jsonl`, and `session-log.jsonl` under `.aic/` are written, pruned, and read from integration hooks and MCP maintenance code. It records why the repository does not use one generic `JsonlCache` abstraction across all three files.

Marker-file layout under `.aic/` for Claude SessionStart is documented in [Session start lock and session context marker](session-start-lock-and-marker.md). Edited-files temp storage under `os.tmpdir()` is out of scope here.

## Layout and wiring

| File                        | Append path                                                       | Read API in shared CJS                                                                                                       | Prune                                                                        |
| --------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `.aic/session-models.jsonl` | `integrations/shared/session-model-cache.cjs` calls `appendJsonl` | `readSessionModelCache` uses a bounded tail read with deterministic full-file fallback while preserving last-match selection | MCP startup via `pruneJsonlByTimestamp` with filename `session-models.jsonl` |
| `.aic/prompt-log.jsonl`     | `integrations/shared/prompt-log.cjs`                              | none (append-only from shared CJS)                                                                                           | MCP startup via `prunePromptLog` delegating to `pruneJsonlByTimestamp`       |
| `.aic/session-log.jsonl`    | `integrations/shared/session-log.cjs`                             | none (append-only from shared CJS)                                                                                           | MCP startup via `pruneSessionLog` delegating to `pruneJsonlByTimestamp`      |

Pruning is scheduled from `mcp/src/server.ts` inside `createMcpServer` using `setImmediate` alongside cache purge. Implementation lives under `shared/src/maintenance/`.

## Shared mechanisms

- **Append:** All three files use `appendJsonl` from `integrations/shared/aic-dir.cjs`, which creates `.aic/` at mode `0o700` and appends one JSON object per line.
- **Retention:** `shared/src/maintenance/prune-jsonl-by-timestamp.ts` removes lines whose `timestamp` field is older than twenty-four hours measured from the injected `Clock` at prune time. The same `RETENTION_MINUTES` value applies to every filename passed into this helper.
- **Field validation:** CJS writers use `integrations/shared/cache-field-validators.cjs`. TypeScript maintenance uses `shared/src/maintenance/cache-field-validators.ts` with aligned rules, summarized in [Integrations shared modules reference](integrations-shared-modules.md).

## Schema comparison

| JSONL file                  | Line shape                                                                                                                                                                                                          | `timestamp` for retention                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `.aic/session-models.jsonl` | Compact keys: `c` (conversation id), `m` (model id), `e` (editor id), plus `timestamp` (ISO string from the caller or from `writeSessionModelCache` when the caller omits it).                                      | Required on each kept line; parsed by `pruneJsonlByTimestamp`. |
| `.aic/prompt-log.jsonl`     | Discriminated `type`: `prompt` or `session_end`. Prompt lines: `editorId`, `conversationId`, `generationId`, `title`, `model`, `timestamp`. Session-end lines: `editorId`, `conversationId`, `reason`, `timestamp`. | Same.                                                          |
| `.aic/session-log.jsonl`    | `session_id`, `reason`, `duration_ms`, `timestamp`; printable ASCII enforced on `session_id` before append.                                                                                                         | Same.                                                          |

All three schemas expose a `timestamp` string that `pruneJsonlByTimestamp` can parse for retention.

## Read paths versus append-only writers

Only `session-model-cache.cjs` implements integration-layer reads. On the hot path it reads only a bounded tail of `.aic/session-models.jsonl`, then applies the same reducer as a full-file read; when the tail omits the winning line (for example a conversation-specific match earlier in the file), it falls back to reading the entire file so results stay identical to a full scan. Prompt and session logs are write-only from `integrations/shared/`; historical analysis reads the JSONL files on disk outside these modules.

## Why there is no single JsonlCache type

Append uses `fs.appendFileSync` in UTF-8 text mode with one JSON object serialized per line; age-based pruning is shared through `pruneJsonlByTimestamp`. A thin wrapper around `appendJsonl` alone would touch few call sites and mostly adds indirection.

**Schemas differ:** One shared class with a single record shape would need wide unions or would drop the per-file validation that runs before append.

**Read semantics differ:** Session models use last-match selection (and conversation-specific preference) shared with MCP via `select-session-model-from-jsonl` / `read-session-model-jsonl`, while prompt and session logs have no shared read helper in shared CJS. A generic cache focused on append and prune still needs that dedicated reader path; uniform query APIs would misrepresent prompt and session logs.

**Runtime split:** Hooks run CommonJS without the MCP `Clock`. Pruning uses `Clock` in TypeScript maintenance. One abstraction spanning both sides would blur the boundary between editor integration scripts and the MCP composition root unless split into thin adapters on each side.

The shared core remains `appendJsonl` and `pruneJsonlByTimestamp`. Small duplicated helpers, if they appear, should stay line-parse or timestamp-check utilities without a single domain type for all three logs.

## Related documentation

- [MCP server and shared CJS boundary](mcp-and-shared-cjs-boundary.md)
- [Integrations shared modules reference](integrations-shared-modules.md)
- [Session start lock and session context marker](session-start-lock-and-marker.md)
