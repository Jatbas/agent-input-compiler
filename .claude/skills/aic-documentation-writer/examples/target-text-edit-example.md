# Target text edit — Change Specification example

**Target document:** `documentation/technical/storage-layer.md`
**Mode:** update (existing doc, scoped edits)
**Owner:** documentation-writer
**Status:** canonical example

## Inputs read during exploration

- `documentation/technical/storage-layer.md` (full)
- `shared/src/storage/sqlite-compilation-store.ts:1-150`
- `shared/src/storage/migrations/003-add-compilation-trace.ts`
- Sibling docs: `documentation/technical/adapter-layer.md`, `documentation/technical/pipeline-layer.md`

## Explorer findings summary

- Explorer 1 (accuracy): `storage-layer.md:45` claims "every store uses `INTEGER AUTOINCREMENT`" — contradicted by `sqlite-compilation-store.ts:12` which uses UUIDv7 `TEXT(36)`. HARD.
- Explorer 2 (completeness): the document does not mention the `project_id` isolation invariant. HARD.
- Explorer 3 (consistency): `storage-layer.md:72` uses the label "DB path", while `adapter-layer.md:91` uses "database location" for the same concept. SOFT.
- Explorer 4 (readability): the opening paragraph is 14 sentences long. SOFT.

## Change Specifications

### Change 1 — correct the primary-key claim

**Current (`storage-layer.md:45`):**

> Every store uses `INTEGER AUTOINCREMENT` for the primary key.

**Required:**

> Every entity store uses UUIDv7 (`TEXT(36)`) for the primary key. `INTEGER AUTOINCREMENT` is banned for entity PKs (ADR-007). The sole exception is `config_history`, which uses a composite `(project_id, config_hash)` PK with a SHA-256 hash.

**Rationale:** Matches ADR-007 and the actual schema. Evidence: `sqlite-compilation-store.ts:12`, `shared/src/storage/migrations/003-add-compilation-trace.ts:8`.

**Writing standards applied:** `SKILL-standards.md` §Claim-citation parity (every factual claim is traceable).

### Change 2 — add the project-isolation invariant

**Insertion point:** after `storage-layer.md:60` (end of "Shared invariants" section).

**Required new paragraph:**

> **Per-project isolation.** Every per-project store takes a `ProjectId` in its constructor and scopes all queries with `WHERE project_id = ?`. Row-level isolation is enforced at the query layer, not via separate databases. Cross-project reads are impossible in the default path; administrative maintenance uses a single documented helper (`shared/src/maintenance/purge-project.ts`). See ADR-003.

**Rationale:** Invariant is enforced in every per-project store — including `sqlite-compilation-store.ts:44-60` — but undocumented. Evidence: grep `project_id = ?` across `shared/src/storage/` returns 14 hits across all per-project stores.

**Writing standards applied:** `SKILL-standards.md` §Completeness (describe invariants readers must respect when extending the system).

### Change 3 — vocabulary normalisation

**Current (`storage-layer.md:72`):** "the DB path"

**Required:** "the database location"

**Rationale:** `adapter-layer.md:91` uses "database location"; same concept, two labels → reader confusion. Adopt the more descriptive one already in a sibling doc.

**Writing standards applied:** `SKILL-standards.md` §Cross-doc vocabulary consistency.

### Change 4 — split the opening paragraph

**Current (`storage-layer.md:1-14`):** single 14-sentence paragraph covering scope, layer boundaries, invariants, and a schema overview.

**Required:** split into four paragraphs with these lead sentences:

1. "This document describes the storage layer — the only place in AIC where SQL appears."
2. "The layer boundary is enforced by ESLint: no other layer may import `node:fs`, `better-sqlite3`, or raw SQL."
3. "Three invariants are non-negotiable: UUIDv7 PKs, `Clock`-bound timestamps, and per-project isolation."
4. "The schema is defined by the files under `shared/src/storage/migrations/` — never by ad-hoc DDL."

**Rationale:** Paragraph > 8 sentences flags SOFT under `SKILL-standards.md` §Paragraph length.

**Writing standards applied:** `SKILL-standards.md` §Paragraph length + §Lede clarity.

## Cross-reference map

| Updated claim               | Cross-referenced in                                                         |
| --------------------------- | --------------------------------------------------------------------------- |
| UUIDv7 PK rule              | `documentation/project-plan.md` §ADR-007                                    |
| Project-isolation invariant | `documentation/project-plan.md` §ADR-003, `.cursor/rules/aic-architect.mdc` |
| Database location label     | `documentation/technical/adapter-layer.md:91`                               |

## Mechanical gates (must all pass)

- `bash .claude/skills/shared/scripts/ambiguity-scan.sh documentation/technical/storage-layer.md` — exit 0.
- `bash .claude/skills/shared/scripts/evidence-scan.sh documentation/technical/storage-layer.md` — exit 0.
- `bash -lc 'rg -n "INTEGER AUTOINCREMENT" documentation/technical/storage-layer.md'` — no hits (old claim removed).
- `bash -lc 'rg -n "DB path" documentation/technical/storage-layer.md'` — no hits (vocabulary normalised).

## Why this example

Shows:

- Change Specification = current text + required text + rationale + evidence + standards-reference. No free-form "rewrite this section."
- Each change cites explorer findings that motivated it (provenance).
- Cross-reference map keeps sibling docs consistent.
- Mechanical gates are listed as concrete shell commands, not narrative ("verify consistency").
- Paragraph-splitting gets explicit lead sentences — the writer is not left to improvise structure.
