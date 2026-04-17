# Change Specification — storage-layer.md

## Change 1 — correct PK claim

**Current (`storage-layer.md:45`):** "Every store uses `INTEGER AUTOINCREMENT` for the primary key."
**Required:** "Every entity store uses UUIDv7 (`TEXT(36)`) for the primary key. `INTEGER AUTOINCREMENT` is banned for entity PKs (ADR-007)."
**Rationale:** Factually contradicted by actual schema.
**Evidence:** `shared/src/storage/sqlite-compilation-store.ts:12`.

## Change 2 — add project-isolation invariant

**Insertion point:** after `storage-layer.md:60`.
**Required new paragraph:** "Per-project isolation. Every per-project store takes a `ProjectId` in its constructor and scopes all queries with `WHERE project_id = ?`."
**Rationale:** Invariant enforced everywhere but undocumented.
**Evidence:** 14 hits for `project_id = ?` across `shared/src/storage/`.

## Change 3 — split opening paragraph

**Current (`storage-layer.md:1-14`):** single 14-sentence paragraph.
**Required:** split into four paragraphs with explicit lead sentences (scope, layer boundary, invariants, schema).
**Rationale:** Exceeds 8-sentence limit in `SKILL-standards.md`.
**Evidence:** `SKILL-standards.md` §Paragraph length.

## Mechanical gates

- `bash .claude/skills/shared/scripts/ambiguity-scan.sh documentation/technical/storage-layer.md` — exit 0.
- `rg -n "INTEGER AUTOINCREMENT" documentation/technical/storage-layer.md` — no hits.
