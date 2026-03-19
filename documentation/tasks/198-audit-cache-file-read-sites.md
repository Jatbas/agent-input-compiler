# Task 198: Audit all cache file read sites (AE01)

> **Status:** Pending
> **Phase:** AE (cache security)
> **Layer:** documentation (audit scope: integrations/ + mcp/src/handlers/)
> **Depends on:** —

## Goal

Create a single audit document that inventories every read and write site for the three `.aic/` JSONL cache files, documents the expected schema per file, and identifies which reads currently lack validation so AE02 can add per-field validation.

## Architecture Notes

- AE01 is audit-and-document only; no code changes. AE02 will add validation at the read sites listed in this audit.
- Threat model and constraints are in `documentation/mvp-progress.md` Phase AE. The audit doc references that section and does not duplicate it.
- Document lives at `documentation/cache-file-audit.md` so AE02 and AF can reference one file.

## Files

| Action | Path |
| ------ | ---- |
| Create | `documentation/cache-file-audit.md` |

## Change Specification

This is a new document. Create `documentation/cache-file-audit.md` with the following content in full.

**Target text (full document):**

```markdown
# Cache file read/write audit

Inventory of all read and write sites for the three JSONL cache files under `.aic/`. Expected schema per file and validation status at each read site. See `documentation/mvp-progress.md` Phase AE for threat model and validation constraints.

## session-models.jsonl

**Path:** `{projectRoot}/.aic/session-models.jsonl`

**Expected schema (per line):**

| Field | Type | Description |
| ----- | ---- | ----------- |
| c | string | conversationId |
| m | string | modelId |
| e | string | editorId |
| timestamp | string | ISO 8601 |

**Read sites**

| File | Function / context | m validated | c, e, timestamp validated |
| ---- | ------------------ | ---------- | ------------------------- |
| mcp/src/handlers/compile-handler.ts | readSessionModelCache() | Yes (isValidModelId) | No |
| integrations/claude/hooks/aic-compile-helper.cjs | readSessionModelCache() | Yes | No |
| integrations/claude/plugin/scripts/aic-compile-helper.cjs | readSessionModelCache() | Yes | No |
| integrations/claude/hooks/aic-inject-conversation-id.cjs | readSessionModelCache() | Yes | No |
| integrations/cursor/hooks/AIC-subagent-compile.cjs | readSessionModelCache() | Yes | No |

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

| Field | Type | Description |
| ----- | ---- | ----------- |
| session_id | string | Session identifier |
| reason | string | End reason |
| duration_ms | number | Session duration in milliseconds |
| timestamp | string | ISO 8601 |

**Read sites**

| File | Function / context | Fields used | Validated |
| ---- | ------------------ | ----------- | --------- |
| shared/src/maintenance/prune-jsonl-by-timestamp.ts | pruneSessionLog (mcp/src/server.ts) | timestamp only | No |

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

| File | Function / context | Fields used | Validated |
| ---- | ------------------ | ----------- | --------- |
| shared/src/maintenance/prune-jsonl-by-timestamp.ts | prunePromptLog (mcp/src/server.ts) | timestamp only | No |
| mcp/src/handlers/__tests__/compile-handler.test.ts | Test assertion | full line | Test context only |

**Write sites**

- integrations/cursor/hooks/AIC-before-submit-prewarm.cjs — appendLog() (Shape 1)
- integrations/claude/hooks/aic-session-end.cjs — appendFileSync (Shape 2)
- integrations/claude/plugin/scripts/aic-session-end.cjs — appendFileSync (Shape 2)

**Validation gap:** No production read consumes prompt-log fields for pipeline or tool use. Prune only uses timestamp (unvalidated). Documented so AE02/AE04 and future readers know expected shapes.
```

## Writing Standards

- **Tone:** Technical reference; concise tables and bullet lists.
- **Audience:** Developers implementing AE02 (validation) and AF (model ID simplification).
- **Terminology:** Use "read site", "write site", "validation at read", "expected schema" consistently. Link to mvp-progress.md Phase AE for threat model.
- **Formatting:** One section per cache file; tables for read sites and write sites; no temporal references (no "Phase AE", "AE02" in body beyond dependency note — use "documentation/mvp-progress.md Phase AE" once).

## Cross-Reference Map

| Document | References this doc | This doc references | Consistency |
| -------- | ------------------ | ------------------- | ----------- |
| documentation/mvp-progress.md | Phase AE points to audit | Phase AE (threat model) | Align with Phase AE text |
| documentation/security.md | — | — | None |
| AE02 task | Will reference this audit | — | Audit lists every read site AE02 must change |

## Steps

### Step 1: Create cache-file-audit.md

Create `documentation/cache-file-audit.md` with the exact content from the Change Specification "Target text" above. Preserve heading hierarchy, table structure, and bullet lists. Do not add a Table of Contents (document is short).

**Verify:** File exists; every file path in the document exists in the repo (spot-check at least one path per cache file with Glob or Read).

### Step 2: Final verification

Run: `pnpm lint && pnpm typecheck`
Expected: all pass. The new markdown file is not typechecked; the command ensures the repo remains healthy.

**Verify:** Zero errors, zero new warnings.

## Tests

| Test case | Description |
| --------- | ----------- |
| Doc exists and is self-contained | documentation/cache-file-audit.md exists; all listed source paths are valid (reader can locate each file) |
| Lint and typecheck pass | pnpm lint and pnpm typecheck pass with no new failures |

## Acceptance Criteria

- [ ] documentation/cache-file-audit.md created with full content per Change Specification
- [ ] Every read site and write site listed in the doc exists in the codebase (paths resolve)
- [ ] `pnpm lint` — zero errors, zero new warnings
- [ ] `pnpm typecheck` — clean
- [ ] No temporal references in document body (no "Phase AE" or task IDs as capability descriptions; single reference to mvp-progress Phase AE for threat model is allowed)

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work, stop. List the adaptations, report to the user, and re-evaluate before continuing.
