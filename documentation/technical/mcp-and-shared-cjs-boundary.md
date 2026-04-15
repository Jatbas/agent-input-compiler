# MCP server and shared CJS boundary

## When to update this document

Update this document when:

- You change `mcp/src/handlers/compile-handler.ts` or `mcp/src/latest-version-check.ts` in ways that affect session model reads, `.aic/` bootstrap, or overlap with `integrations/shared/`.
- You change the TypeScript versus CommonJS duplication story (read loop, `ensureAicDir`, or validator alignment with `shared/src/maintenance/cache-field-validators.ts`).
- You introduce or remove `createRequire` (or similar) from MCP into `integrations/shared/`; update the boundary description to match.
- You expand MCP scope beyond these two files; update the scope statement and comparison tables.
- Inventory and caller details for shared modules live in [Integrations shared modules reference](integrations-shared-modules.md); update that document when those change.

## Scope

This document compares the AIC MCP server TypeScript in `mcp/src/handlers/compile-handler.ts` and `mcp/src/latest-version-check.ts` with `integrations/shared/*.cjs`. It states why MCP does not load that CommonJS tree through `createRequire`.

Scope is limited to those two MCP files. Other MCP modules perform filesystem operations around `.aic/` or global bootstrap; each remains a separate design surface.

## Integration shared modules (reference)

Canonical module inventory and caller matrix: [Integrations shared modules reference](integrations-shared-modules.md).

## compile-handler.ts versus session-model-cache.cjs

| Concern                          | `integrations/shared/session-model-cache.cjs`                                                                                                                                                                                                                          | `mcp/src/handlers/compile-handler.ts`                                                                                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Read `.aic/session-models.jsonl` | `readSessionModelCache` calls `readSessionModelIdFromSessionModelsJsonl` from `read-session-model-jsonl.cjs` (bounded tail read, full-file fallback, reducer from `select-session-model-from-jsonl.cjs`; mirrors `shared/src/maintenance/read-session-model-jsonl.ts`) | Calls `readSessionModelIdFromSessionModelsJsonl` from `@jatbas/aic-core/maintenance/read-session-model-jsonl.js` (same tail and fallback semantics; reducer from `select-session-model-from-jsonl.ts`) |
| Field validation on read         | Validators live in `select-session-model-from-jsonl.cjs` via `cache-field-validators.cjs`                                                                                                                                                                              | Same selection module imports `shared/src/maintenance/cache-field-validators.ts` (published as `@jatbas/aic-core`)                                                                                     |
| `normalizeModelId`               | Maps `"default"` to `"auto"`                                                                                                                                                                                                                                           | Same mapping in a local helper                                                                                                                                                                         |
| Write `session-models.jsonl`     | `writeSessionModelCache` calls `appendJsonl`                                                                                                                                                                                                                           | No write path — compile handler only reads for `resolveAndCacheModelId`                                                                                                                                |
| Other `.aic/` artifacts          | —                                                                                                                                                                                                                                                                      | Writes `last-compiled-prompt.txt` via `fs.promises.writeFile`; no counterpart in `integrations/shared/`                                                                                                |

Session-models JSONL selection and disk read strategy have canonical implementations in `shared/src/maintenance/select-session-model-from-jsonl.ts` and `shared/src/maintenance/read-session-model-jsonl.ts`, with hand-synced CommonJS mirrors under `integrations/shared/`, and the MCP compile handler consumes the compiled TypeScript package.

## latest-version-check.ts versus integrations/shared

| Concern                       | `integrations/shared/aic-dir.cjs`                                       | `mcp/src/latest-version-check.ts`                                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Ensure project `.aic/` exists | `ensureAicDir` uses `mkdirSync` with `recursive: true` and mode `0o700` | Local `ensureAicDir` creates the directory with mode `0o700` when missing                                                                  |
| Artifacts                     | Supports generic append paths via `appendJsonl`                         | Writes `version-check-cache.json` and `update-available.txt` under `.aic/`; fetches registry metadata over HTTPS from `registry.npmjs.org` |

`ensureAicDir` duplication is small. The npm version cache and update banner files are MCP-specific; they are not modeled in `integrations/shared/`.

## Shared modules not involved in these two files

The following `integrations/shared/` modules have no parallel in `compile-handler.ts` or `latest-version-check.ts` within the scope above: `conversation-id.cjs` (transcript/direct conversation id resolution plus `resolveConversationIdFallback` for hook envelopes), `resolve-project-root.cjs` (hook environment resolution), `prompt-log.cjs`, `session-log.cjs`, `session-markers.cjs`, `edited-files-cache.cjs`, `read-stdin-sync.cjs`. Additional shared modules used only by editor hooks (for example `compile-recency.cjs`, `read-aic-prewarm-prompt.cjs`, `resolve-aic-server-id.cjs`, `editor-runtime-marker.cjs`, `read-model-from-transcript.cjs`) are intentionally out of scope here — see [Integrations shared modules reference](integrations-shared-modules.md).

Conversation identifiers in the compile handler arrive from MCP tool arguments and schema sanitization; hooks supply those arguments after resolving transcript/direct ids and optional synthetic fallbacks in `conversation-id.cjs`.

## createRequire from MCP into integrations/shared

Node allows loading CommonJS from an ESM TypeScript bundle through `module.createRequire` and a filesystem path into `integrations/shared/*.cjs`.

**Boundary:** `integrations/shared/` is the integration layer copied beside editor hooks; the MCP server is the composition root that already depends on `shared/` packages. Pointing MCP at hook-adjacent CJS ties server releases to on-disk layout of integration sources.

**Packaging:** Published `@jatbas/aic` must ship or resolve those files predictably; relative paths from `dist/` back to repo `integrations/shared/` break when consumers install from npm.

**Determinism:** MCP code injects `Clock` and avoids `Date.now()` in product paths; CommonJS session-model writes still use `new Date().toISOString()` inside `writeSessionModelCache`. Sharing only the read path through CJS does not remove the split runtime models.

**Tradeoff:** `createRequire` would fold hook-adjacent CJS into the server bundle; the integration layer stays copy-deployed beside hooks, while MCP already depends on `@jatbas/aic-core` for the same selection logic compiled from TypeScript.

## Related documentation

- [Implementation specification — Model id resolution](../implementation-spec.md#model-id-resolution-aic_compile)
- [AIC JSONL caches under `.aic/`](aic-jsonl-caches.md) — append, prune, and read semantics for `.aic/*.jsonl` logs.
- [Integrations shared modules reference](integrations-shared-modules.md)
