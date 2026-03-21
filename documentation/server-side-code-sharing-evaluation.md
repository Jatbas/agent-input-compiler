# Server-side code sharing evaluation

## When to update this document

Update this document when:

- You change `mcp/src/handlers/compile-handler.ts` or `mcp/src/latest-version-check.ts` in ways that affect session model reads, `.aic/` bootstrap, or overlap with `integrations/shared/`.
- You change the TypeScript versus CommonJS duplication story (read loop, `ensureAicDir`, or validator alignment with `shared/src/maintenance/cache-field-validators.ts`).
- You introduce, reject, or reconsider `createRequire` (or similar) from MCP into `integrations/shared/`; update the decision text explicitly.
- You expand MCP scope beyond these two files; update the scope statement and comparison tables.
- Inventory and caller details for shared modules belong in [Integrations shared modules reference](integrations-shared-modules.md); update that document when those change.

## Scope and non-goals

This document answers whether the AIC MCP server TypeScript under `mcp/src/handlers/compile-handler.ts` and `mcp/src/latest-version-check.ts` duplicates logic from `integrations/shared/*.cjs`, and whether `createRequire` imports from that CommonJS tree into `mcp/src/` are warranted.

Assessment scope is limited to those two files. Other MCP modules perform filesystem operations around `.aic/` or global bootstrap; each remains a separate design surface.

## Integration shared modules (reference)

Canonical module inventory and caller matrix: [Integrations shared modules reference](integrations-shared-modules.md).

## compile-handler.ts versus session-model-cache.cjs

| Concern                          | `integrations/shared/session-model-cache.cjs`                                                            | `mcp/src/handlers/compile-handler.ts`                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Read `.aic/session-models.jsonl` | `readSessionModelCache` scans all lines, keeps last valid line per editor, prefers conversation id match | Local `readSessionModelCache` with the same scan and selection rules                                      |
| Field validation on read         | `isValidModelId`, `isValidConversationId`, `isValidEditorId` from `cache-field-validators.cjs`           | Same validators from `shared/src/maintenance/cache-field-validators.ts` (published as `@jatbas/aic-core`) |
| `normalizeModelId`               | Maps `"default"` to `"auto"`                                                                             | Same mapping in a local helper                                                                            |
| Write `session-models.jsonl`     | `writeSessionModelCache` calls `appendJsonl`                                                             | No write path — compile handler only reads for `resolveAndCacheModelId`                                   |
| Other `.aic/` artifacts          | —                                                                                                        | Writes `last-compiled-prompt.txt` via `fs.promises.writeFile`; no counterpart in `integrations/shared/`   |

The read path is structurally the same program on both sides; validation rules stay aligned because TypeScript reuses the maintenance copy of the field validators.

## latest-version-check.ts versus integrations/shared

| Concern                       | `integrations/shared/aic-dir.cjs`                                       | `mcp/src/latest-version-check.ts`                                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Ensure project `.aic/` exists | `ensureAicDir` uses `mkdirSync` with `recursive: true` and mode `0o700` | Local `ensureAicDir` creates the directory with mode `0o700` when missing                                                                  |
| Artifacts                     | Supports generic append paths via `appendJsonl`                         | Writes `version-check-cache.json` and `update-available.txt` under `.aic/`; fetches registry metadata over HTTPS from `registry.npmjs.org` |

`ensureAicDir` duplication is small. The npm version cache and update banner files are MCP-specific; they are not modeled in `integrations/shared/`.

## Shared modules not involved in these two files

The following `integrations/shared/` modules have no parallel in `compile-handler.ts` or `latest-version-check.ts` within the scope above: `conversation-id.cjs` (transcript basename parsing), `resolve-project-root.cjs` (hook environment resolution), `prompt-log.cjs`, `session-log.cjs`, `session-markers.cjs`, `edited-files-cache.cjs`, `read-stdin-sync.cjs`.

Conversation identifiers in the compile handler arrive from MCP tool arguments and schema sanitization, not from hook transcript paths.

## createRequire from MCP into integrations/shared

**Mechanics:** Node allows loading CommonJS from an ESM TypeScript bundle through `module.createRequire` and a filesystem path into `integrations/shared/*.cjs`.

**Downsides for this repository:**

- **Boundary blur:** `integrations/shared/` is the integration layer copied beside editor hooks; the MCP server is the composition root that already depends on `shared/` packages. Pointing MCP at hook-adjacent CJS ties server releases to on-disk layout of integration sources.
- **Packaging:** Published `@jatbas/aic` must ship or resolve those files predictably; relative paths from `dist/` back to repo `integrations/shared/` break when consumers install from npm.
- **Determinism and testing:** MCP code already injects `Clock` and avoids `Date.now()` in product paths; CommonJS session-model writes still use `new Date().toISOString()` inside `writeSessionModelCache`. Sharing only the read path through CJS does not remove the split runtime models.

**Upside:**

- Removes one duplicate read loop for session models.

Given the small size of the duplicated logic and the shared validator module already imported from TypeScript, **do not import `integrations/shared/` into `mcp/src/` via `createRequire` for these cases.** Keep the TypeScript read implementation beside the compile handler.

## Recommendation

**Accept the documented duplication.** Session model reads belong in MCP TypeScript with the same validation rules as hooks; `latest-version-check.ts` should keep its local `.aic/` bootstrap and MCP-specific cache files. Revisit only if the duplicated surface grows large enough to justify a neutral shared package consumed by both runtimes, or a generated single source with two emit targets.

## Related evaluations

- [JSONL cache unification evaluation](jsonl-cache-unification-evaluation.md) — append, prune, and read semantics for `.aic/*.jsonl` logs.

## Implementation prerequisites

If a future change still merges code paths:

- Preserve the integration boundary: hooks stay on CommonJS copies under `integrations/shared/` and `.cursor/hooks/`; MCP stays on TypeScript plus `@jatbas/aic-core`.
- Any new shared artifact must respect determinism rules on the TypeScript side (`Clock` injection, no bare `Date.now()` in production paths outside exempt files).
- Mirror edits under `integrations/shared/` into `.cursor/hooks/` in the same commit when hook copies must stay identical.
