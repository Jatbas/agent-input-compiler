# Task 237: AL02 JSONL cache unification evaluation

> **Status:** Pending
> **Phase:** AL — Unified Cache Pipeline Review
> **Layer:** documentation
> **Depends on:** AL01 (integrations shared modules inventory) complete

## Goal

Produce maintainer-facing documentation that decides whether `.aic/session-models.jsonl`, `.aic/prompt-log.jsonl`, and `.aic/session-log.jsonl` should share a generic `JsonlCache` abstraction, and align integration-layer docs with where pruning runs.

## Architecture Notes

- Deliverable is Markdown under `documentation/` only; no TypeScript or CJS code changes.
- Factual claims must match `integrations/shared/*.cjs`, `shared/src/maintenance/prune-jsonl-by-timestamp.ts`, and `mcp/src/server.ts` startup wiring.
- Documentation must stay timeless: no phase identifiers, task numbers, or roadmap language in body text.

## Files

| Action | Path                                                                                                                                    |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Create | `documentation/jsonl-cache-unification-evaluation.md`                                                                                   |
| Modify | `documentation/integrations-shared-modules.md` (Related documentation — add link to new evaluation doc)                             |
| Modify | `documentation/cursor-integration-layer.md` (§7.2 prompt log note; §7.9 session log note — MCP startup pruning)                      |
| Modify | `documentation/claude-code-integration-layer.md` (§7.8 SessionEnd purpose — append versus prune split)                                  |

## Change Specification

### Change 1: New file `documentation/jsonl-cache-unification-evaluation.md`

**Current text:** (none — new file)

**Required change:** Add the full evaluation document so AL02 has a single canonical decision record.

**Target text:**

```markdown
# JSONL cache unification evaluation

## Scope and non-goals

This document answers whether `session-models.jsonl`, `prompt-log.jsonl`, and `session-log.jsonl` under `.aic/` should share one generic `JsonlCache` abstraction across integration hooks and MCP maintenance code. It does not decide marker-file layout (`.session-start-lock`, `.session-context-injected`) or edited-files temp storage under `os.tmpdir()`.

## Current architecture

| File | Append path | Read API in shared CJS | Prune |
| ---- | ----------- | ------------------------ | ----- |
| `.aic/session-models.jsonl` | `integrations/shared/session-model-cache.cjs` calls `appendJsonl` | `readSessionModelCache` scans the full file | MCP startup via `pruneJsonlByTimestamp` with filename `session-models.jsonl` |
| `.aic/prompt-log.jsonl` | `integrations/shared/prompt-log.cjs` | none (append-only from shared CJS) | MCP startup via `prunePromptLog` delegating to `pruneJsonlByTimestamp` |
| `.aic/session-log.jsonl` | `integrations/shared/session-log.cjs` | none (append-only from shared CJS) | MCP startup via `pruneSessionLog` delegating to `pruneJsonlByTimestamp` |

Pruning is scheduled from `mcp/src/server.ts` inside `createMcpServer` using `setImmediate` alongside cache purge. Implementation lives under `shared/src/maintenance/`.

## Shared mechanisms today

- **Append:** All three files use `appendJsonl` from `integrations/shared/aic-dir.cjs`, which creates `.aic/` at mode `0o700` and appends one JSON object per line.
- **Retention:** `shared/src/maintenance/prune-jsonl-by-timestamp.ts` removes lines whose `timestamp` field is older than twenty-four hours measured from the injected `Clock` at prune time. The same `RETENTION_MINUTES` value applies to every filename passed into this helper.
- **Field validation:** CJS writers use `integrations/shared/cache-field-validators.cjs`. TypeScript maintenance uses `shared/src/maintenance/cache-field-validators.ts` with aligned rules, as summarized in `documentation/integrations-shared-modules.md`.

## Schema comparison

- **Session models (compact keys):** Each line is a JSON object with `c` (conversation id), `m` (model id), `e` (editor id), and `timestamp` (ISO timestamp string from the caller or from `writeSessionModelCache` when the caller omits it).
- **Prompt log (discriminated):** Each line includes `type` set to `prompt` or `session_end`. Prompt lines carry `editorId`, `conversationId`, `generationId`, `title`, `model`, `timestamp`. Session-end lines carry `editorId`, `conversationId`, `reason`, `timestamp`.
- **Session log:** Each line has `session_id`, `reason`, `duration_ms`, and `timestamp`, with printable ASCII constraints on `session_id` enforced before append.

All three schemas expose a `timestamp` string that `pruneJsonlByTimestamp` can parse for retention.

## Read paths versus append-only writers

Only `session-model-cache.cjs` implements integration-layer reads. It scans all lines to pick the latest model for an editor, preferring a line whose conversation id matches when the caller supplies one. Prompt and session logs are write-only from `integrations/shared/`; any historical analysis reads the JSONL file on disk outside these small modules.

## Assessment of a unified JsonlCache abstraction

**Already centralized:** Append uses `fs.appendFileSync` in UTF-8 text mode with one JSON object serialized per line; age-based pruning is shared. A thin wrapper around `appendJsonl` alone would touch few call sites and mostly adds indirection.

**Structural mismatch for one generic type:**

- **Schemas differ:** One shared class with a single record shape would need wide unions or would drop the per-file validation that runs before append today.
- **Read semantics differ:** Session models need full-file scan and last-match selection. A generic cache focused on append and prune still needs a dedicated reader for session models; uniform “query” APIs would misrepresent prompt and session logs, which have no shared read helper.
- **Runtime split:** Hooks run CommonJS without the MCP `Clock`. Pruning uses `Clock` in TypeScript maintenance. One abstraction spanning both sides would fight the boundary between editor integration scripts and the MCP composition root unless split into thin adapters on each side.

**Proportional middle ground:** Keep `appendJsonl` and `pruneJsonlByTimestamp` as the shared core. If small duplicated helpers appear, extract line-parse or timestamp-check utilities without claiming a single domain type for all three logs.

## Recommendation

**Do not introduce a single generic `JsonlCache` with unified typed schema, append, prune, and query across all three files.** Shared primitives already cover append and retention. Schema and read behavior diverge enough that a unified façade costs more clarity than it saves. Treat this document as the decision record unless a future JSONL file repeats the same shape and read pattern as an existing one.

## Implementation prerequisites

If a future refactor still merges code paths:

- Keep validation at the append boundary in CJS hooks.
- Keep pruning on the MCP side with `Clock` injection; follow repository determinism rules for TypeScript layers.
- Mirror edits under `integrations/shared/` into `.cursor/hooks/` copies in the same commit per installer documentation.
```

### Change 2: Related documentation in `documentation/integrations-shared-modules.md`

**Current text:**

```markdown
## Related documentation

- [Cursor integration layer](cursor-integration-layer.md)
- [Claude Code integration layer](claude-code-integration-layer.md)

```

**Required change:** Link the new evaluation doc from the inventory so AL02 is discoverable.

**Target text:**

```markdown
## Related documentation

- [Cursor integration layer](cursor-integration-layer.md)
- [Claude Code integration layer](claude-code-integration-layer.md)
- [JSONL cache unification evaluation](jsonl-cache-unification-evaluation.md)

```

### Change 3: Prompt log subsection in `documentation/cursor-integration-layer.md`

**Current text:**

```markdown
1. **Prompt log:** Appends one JSON line per user message to `.aic/prompt-log.jsonl`
   (`conversationId`, `generationId`, first 200 chars as `title`, `model`, `timestamp`).

```

**Required change:** State that pruning runs at MCP server startup, not inside the hook.

**Target text:**

```markdown
1. **Prompt log:** Appends one JSON line per user message to `.aic/prompt-log.jsonl`
   (`conversationId`, `generationId`, first 200 chars as `title`, `model`, `timestamp`).
   Age-based pruning of that file is not performed inside this hook; it runs when the AIC MCP server process starts, via `shared/src/maintenance/prune-jsonl-by-timestamp.ts` (same helper as `.aic/session-log.jsonl` and `.aic/session-models.jsonl`).

```

### Change 4: Session log bullets in `documentation/cursor-integration-layer.md`

**Current text:**

```markdown
2. **Session log:** Append one JSON line to `.aic/session-log.jsonl` with `session_id`,
   `reason`, `duration_ms`, `timestamp`.

**Must never block:** Exit 0 always. No stdout. If `appendSessionLog` fails, silently ignore.
```

**Required change:** Note MCP-side pruning for the session log file.

**Target text:**

```markdown
2. **Session log:** Append one JSON line to `.aic/session-log.jsonl` with `session_id`,
   `reason`, `duration_ms`, `timestamp`. Age-based pruning uses the same MCP startup path and `shared/src/maintenance/prune-jsonl-by-timestamp.ts` helper as the other `.aic/*.jsonl` logs.

**Must never block:** Exit 0 always. No stdout. If `appendSessionLog` fails, silently ignore.
```

### Change 5: SessionEnd purpose in `documentation/claude-code-integration-layer.md`

**Current text:**

```markdown
**Purpose:** Log session lifecycle data to `.aic/prompt-log.jsonl`. No context injection — this hook produces no stdout. Exit 0 always (telemetry must never block the session from ending).
```

**Required change:** Clarify append-only hook behavior versus MCP pruning.

**Target text:**

```markdown
**Purpose:** Log session lifecycle data to `.aic/prompt-log.jsonl`. The hook appends lines only; age-based pruning runs when the AIC MCP server starts (`shared/src/maintenance/prune-jsonl-by-timestamp.ts`). No context injection — this hook produces no stdout. Exit 0 always (telemetry must never block the session from ending).
```

## Writing Standards

- **Tone:** Neutral technical decision record; active voice for behavior descriptions.
- **Audience:** Contributors maintaining `integrations/shared/` and MCP startup code.
- **Audience writing guidance:** Developer reference — cite concrete file paths, describe append versus prune split, avoid user-tutorial steps.
- **Terminology:** Use exact filenames `session-models.jsonl`, `prompt-log.jsonl`, `session-log.jsonl`; call the helper `pruneJsonlByTimestamp` when naming the retention implementation.
- **Formatting:** Use Markdown tables and `##` section headings matching **Change 1**; no table of contents required for the new file.
- **Cross-reference format:** Relative links from `integrations-shared-modules.md` to sibling docs in `documentation/`.
- **Temporal robustness:** No phase names, task identifiers, or “will be added” language in any document body edited by this task.

## Cross-Reference Map

| Document                               | References evaluation doc | Evaluation doc references              | Consistency check                                |
| -------------------------------------- | ------------------------- | -------------------------------------- | ------------------------------------------------ |
| `integrations-shared-modules.md`       | Yes — Related docs        | Yes — inventory summary                | Add link in this task                            |
| `cursor-integration-layer.md`          | No                        | No                                     | Prune note must match maintenance implementation |
| `claude-code-integration-layer.md`     | No                        | No                                     | Same                                             |

## Config Changes

- **shared/package.json:** no change
- **eslint.config.mjs:** no change

## Steps

### Step 1: Create evaluation document

Create `documentation/jsonl-cache-unification-evaluation.md` with the full Markdown body from **Change 1** **Target text** (the fenced block only, without the outer fences). Do not paraphrase.

**Verify:** `documentation/jsonl-cache-unification-evaluation.md` exists and contains these exact `##` headings: `Scope and non-goals`, `Current architecture`, `Shared mechanisms today`, `Schema comparison`, `Read paths versus append-only writers`, `Assessment of a unified JsonlCache abstraction`, `Recommendation`, `Implementation prerequisites`.

### Step 2: Update integrations inventory links

Apply **Change 2** to `documentation/integrations-shared-modules.md` using the Current text as the search anchor and **Target text** as the replacement.

**Verify:** The file contains a markdown link whose label is `JSONL cache unification evaluation` and whose target is `jsonl-cache-unification-evaluation.md`.

### Step 3: Update Cursor integration layer

Apply **Change 3** then **Change 4** to `documentation/cursor-integration-layer.md` in that order, each anchored on its **Current text** block.

**Verify:** `rg 'prune-jsonl-by-timestamp' documentation/cursor-integration-layer.md` prints at least two matching lines.

### Step 4: Update Claude Code integration layer

Apply **Change 5** to `documentation/claude-code-integration-layer.md`.

**Verify:** `rg 'prune-jsonl-by-timestamp' documentation/claude-code-integration-layer.md` prints at least one matching line.

### Step 5: Documentation writer review

Read `.claude/skills/aic-documentation-writer/SKILL-standards.md`. Re-read all four touched Markdown files. Fix any violation of those standards (voice, headings, temporal language, link hygiene).

**Verify:** No heading in the new evaluation doc sits deeper than `##` except where the standards allow; no `Phase ` or task-id pattern appears in prose.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

**Expected:** All commands exit zero with no new findings attributable to this task.

## Tests

| Test case              | Description                                                                 |
| ---------------------- | --------------------------------------------------------------------------- |
| `heading_scan`         | New evaluation file contains all eight `##` headings listed in Step 1       |
| `inventory_link`       | `integrations-shared-modules.md` links to `jsonl-cache-unification-evaluation.md` |
| `cursor_prune_mentions` | `cursor-integration-layer.md` mentions `prune-jsonl-by-timestamp` twice    |
| `claude_prune_mention` | `claude-code-integration-layer.md` mentions `prune-jsonl-by-timestamp` once  |

## Acceptance Criteria

- [ ] All files created or modified per Files table
- [ ] `heading_scan` passes
- [ ] `inventory_link` passes
- [ ] `cursor_prune_mentions` passes
- [ ] `claude_prune_mention` passes
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
