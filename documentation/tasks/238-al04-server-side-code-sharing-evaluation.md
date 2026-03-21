# Task 238: AL04 server-side code sharing evaluation

> **Status:** Pending
> **Phase:** AL — Unified Cache Pipeline Review
> **Layer:** documentation
> **Depends on:** AL01 (integrations shared modules inventory) complete

## Goal

Produce maintainer-facing documentation that states whether `mcp/src/handlers/compile-handler.ts` and `mcp/src/latest-version-check.ts` duplicate `integrations/shared/` behavior, and whether importing those CommonJS modules into the MCP server via `createRequire` is justified.

## Architecture Notes

- Deliverable is Markdown under `documentation/` only; no TypeScript or CommonJS code changes.
- Factual claims must match `mcp/src/handlers/compile-handler.ts`, `mcp/src/latest-version-check.ts`, `integrations/shared/session-model-cache.cjs`, `integrations/shared/aic-dir.cjs`, and `shared/src/maintenance/cache-field-validators.ts`.
- Documentation must stay timeless: no phase identifiers, task numbers, or roadmap language in body text.
- This task uses the **Recommended** scope tier: new evaluation file, link from `documentation/integrations-shared-modules.md`, reciprocal link from `documentation/jsonl-cache-unification-evaluation.md`.

## Files

| Action | Path                                                                                         |
| ------ | -------------------------------------------------------------------------------------------- |
| Create | `documentation/server-side-code-sharing-evaluation.md`                                       |
| Modify | `documentation/integrations-shared-modules.md` (Related documentation — add link to new doc) |
| Modify | `documentation/jsonl-cache-unification-evaluation.md` (append Related documentation section)   |

## Change Specification

### Change 1: New file `documentation/server-side-code-sharing-evaluation.md`

**Current text:** (none — new file)

**Required change:** Add the full evaluation document so AL04 has a single canonical decision record.

**Target text:**

```markdown
# Server-side code sharing evaluation

## Scope and non-goals

This document answers whether the AIC MCP server TypeScript under `mcp/src/handlers/compile-handler.ts` and `mcp/src/latest-version-check.ts` duplicates logic from `integrations/shared/*.cjs`, and whether `createRequire` imports from that CommonJS tree into `mcp/src/` are warranted.

Assessment scope is limited to those two files. Other MCP modules perform filesystem operations around `.aic/` or global bootstrap; each remains a separate design surface.

## Integration shared modules (reference)

Canonical module inventory and caller matrix: `documentation/integrations-shared-modules.md`.

## compile-handler.ts versus session-model-cache.cjs

| Concern | `integrations/shared/session-model-cache.cjs` | `mcp/src/handlers/compile-handler.ts` |
| ------- | --------------------------------------------- | --------------------------------------- |
| Read `.aic/session-models.jsonl` | `readSessionModelCache` scans all lines, keeps last valid line per editor, prefers conversation id match | Local `readSessionModelCache` with the same scan and selection rules |
| Field validation on read | `isValidModelId`, `isValidConversationId`, `isValidEditorId` from `cache-field-validators.cjs` | Same validators from `shared/src/maintenance/cache-field-validators.ts` (published as `@jatbas/aic-core`) |
| `normalizeModelId` | Maps `"default"` to `"auto"` | Same mapping in a local helper |
| Write `session-models.jsonl` | `writeSessionModelCache` calls `appendJsonl` | No write path — compile handler only reads for `resolveAndCacheModelId` |
| Other `.aic/` artifacts | — | Writes `last-compiled-prompt.txt` via `fs.promises.writeFile`; no counterpart in `integrations/shared/` |

The read path is structurally the same program on both sides; validation rules stay aligned because TypeScript reuses the maintenance copy of the field validators.

## latest-version-check.ts versus integrations/shared

| Concern | `integrations/shared/aic-dir.cjs` | `mcp/src/latest-version-check.ts` |
| ------- | --------------------------------- | --------------------------------- |
| Ensure project `.aic/` exists | `ensureAicDir` uses `mkdirSync` with `recursive: true` and mode `0o700` | Local `ensureAicDir` creates the directory with mode `0o700` when missing |
| Artifacts | Supports generic append paths via `appendJsonl` | Writes `version-check-cache.json` and `update-available.txt` under `.aic/`; fetches registry metadata over HTTP |

`ensureAicDir` duplication is small. The npm version cache and update banner files are MCP-specific; they are not modeled in `integrations/shared/`.

## Shared modules not involved in these two files

The following `integrations/shared/` modules have no parallel in `compile-handler.ts` or `latest-version-check.ts` within the scope above: `conversation-id.cjs` (transcript basename parsing), `resolve-project-root.cjs` (hook environment resolution), `prompt-log.cjs`, `session-log.cjs`, `session-markers.cjs`, `edited-files-cache.cjs`, `read-stdin-sync.cjs`.

Conversation identifiers in the compile handler arrive from MCP tool arguments and schema sanitisation, not from hook transcript paths.

## createRequire from MCP into integrations/shared

**Mechanics:** Node allows loading CommonJS from an ESM TypeScript bundle through `module.createRequire` and a filesystem path into `integrations/shared/*.cjs`.

**Downsides for this repository:**

- **Boundary blur:** `integrations/shared/` is the integration layer copied beside editor hooks; the MCP server is the composition root that already depends on `shared/` packages. Pointing MCP at hook-adjacent CJS ties server releases to on-disk layout of integration sources.
- **Packaging:** Published `@jatbas/aic-mcp` must ship or resolve those files predictably; relative paths from `dist/` back to repo `integrations/shared/` break when consumers install from npm.
- **Determinism and testing:** MCP code already injects `Clock` and avoids `Date.now()` in product paths; CommonJS session-model writes still use `new Date().toISOString()` inside `writeSessionModelCache`. Sharing only the read path through CJS does not remove the split runtime models.

**Upside:** Removes one duplicate read loop for session models.

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
```

### Change 2: Related documentation in `documentation/integrations-shared-modules.md`

**Current text:**

```markdown
## Related documentation

- [Cursor integration layer](cursor-integration-layer.md)
- [Claude Code integration layer](claude-code-integration-layer.md)
- [JSONL cache unification evaluation](jsonl-cache-unification-evaluation.md)

```

**Required change:** Link the server-side evaluation from the inventory so AL04 is discoverable.

**Target text:**

```markdown
## Related documentation

- [Cursor integration layer](cursor-integration-layer.md)
- [Claude Code integration layer](claude-code-integration-layer.md)
- [JSONL cache unification evaluation](jsonl-cache-unification-evaluation.md)
- [Server-side code sharing evaluation](server-side-code-sharing-evaluation.md)

```

### Change 3: Related documentation in `documentation/jsonl-cache-unification-evaluation.md`

**Current text:**

```markdown
## Implementation prerequisites

If a future refactor still merges code paths:

- Keep validation at the append boundary in CJS hooks.
- Keep pruning on the MCP side with `Clock` injection; follow repository determinism rules for TypeScript layers.
- Mirror edits under `integrations/shared/` into `.cursor/hooks/` copies in the same commit per installer documentation.
```

**Required change:** Append a Related documentation section after Implementation prerequisites so readers can open the server-side evaluation from this doc.

**Target text:**

```markdown
## Implementation prerequisites

If a future refactor still merges code paths:

- Keep validation at the append boundary in CJS hooks.
- Keep pruning on the MCP side with `Clock` injection; follow repository determinism rules for TypeScript layers.
- Mirror edits under `integrations/shared/` into `.cursor/hooks/` copies in the same commit per installer documentation.

## Related documentation

- [Server-side code sharing evaluation](server-side-code-sharing-evaluation.md)
```

## Writing Standards

- **Tone:** Neutral technical decision record; active voice for behavior descriptions.
- **Audience:** Contributors maintaining `integrations/shared/`, MCP handlers, and `@jatbas/aic-core` maintenance validators.
- **Audience writing guidance:** Developer reference — cite concrete file paths; state boundary trade-offs explicitly; avoid user-tutorial steps.
- **Terminology:** Use exact paths `mcp/src/handlers/compile-handler.ts`, `mcp/src/latest-version-check.ts`, `integrations/shared/session-model-cache.cjs`, `integrations/shared/aic-dir.cjs`; call the published package `@jatbas/aic-core` when referring to TypeScript validators imported by MCP.
- **Formatting:** Use Markdown tables and `##` section headings matching **Change 1**; no table of contents required for the new file.
- **Cross-reference format:** Relative links between files in `documentation/`.
- **Temporal robustness:** No phase names, task identifiers, or scheduling language in any document body edited by this task.

## Cross-Reference Map

| Document                             | References server-side eval | Server-side eval references      | Consistency check                |
| ------------------------------------ | --------------------------- | -------------------------------- | -------------------------------- |
| `integrations-shared-modules.md`     | Yes — Related docs          | Yes — inventory pointer          | Add link in this task            |
| `jsonl-cache-unification-evaluation.md` | Yes — Related docs       | Yes — JSONL eval link            | Append section in this task      |

## Config Changes

- **shared/package.json:** no change
- **eslint.config.mjs:** no change

## Steps

### Step 1: Create evaluation document

Create `documentation/server-side-code-sharing-evaluation.md` with the full Markdown body from **Change 1** **Target text** (the fenced block only, without the outer fences). Do not paraphrase.

**Verify:** `documentation/server-side-code-sharing-evaluation.md` exists and contains these exact `##` headings: `Scope and non-goals`, `Integration shared modules (reference)`, `compile-handler.ts versus session-model-cache.cjs`, `latest-version-check.ts versus integrations/shared`, `Shared modules not involved in these two files`, `createRequire from MCP into integrations/shared`, `Recommendation`, `Related evaluations`, `Implementation prerequisites`.

### Step 2: Update integrations inventory links

Apply **Change 2** to `documentation/integrations-shared-modules.md` using the **Current text** as the search anchor and **Target text** as the replacement.

**Verify:** The file contains a markdown link whose label is `Server-side code sharing evaluation` and whose target is `server-side-code-sharing-evaluation.md`.

### Step 3: Update JSONL evaluation cross-link

Apply **Change 3** to `documentation/jsonl-cache-unification-evaluation.md` using the **Current text** as the search anchor and **Target text** as the replacement.

**Verify:** The file contains a `## Related documentation` heading followed by a link to `server-side-code-sharing-evaluation.md`.

### Step 4: Documentation writer review

Read `.claude/skills/aic-documentation-writer/SKILL-standards.md`. Re-read all three touched Markdown files. Fix any violation of those standards (voice, headings, temporal language, link hygiene).

**Verify:** No heading in the new evaluation doc sits deeper than `##` except where the standards allow; no `Phase ` substring and no `AL` task-id pattern used as a milestone label in prose.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

**Expected:** All commands exit zero with no new findings attributable to this task.

## Tests

| Test case              | Description                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `heading_scan`         | New evaluation file contains all nine `##` headings listed in Step 1                           |
| `inventory_link`       | `integrations-shared-modules.md` links to `server-side-code-sharing-evaluation.md`           |
| `jsonl_related_section` | `jsonl-cache-unification-evaluation.md` has `## Related documentation` and the cross-link target |

## Acceptance Criteria

- [ ] All files created or modified per Files table
- [ ] `heading_scan` passes
- [ ] `inventory_link` passes
- [ ] `jsonl_related_section` passes
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No temporal references (`Phase `, task IDs, roadmap scheduling language) in new or edited prose

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
