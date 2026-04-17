# Recipe: Storage (SQLite store)

Full detail: `../SKILL-recipes.md` lines 67–101.

## Quick Card

- **When to use:** The task implements a `*Store` core interface backed by SQLite.
- **Files:**
  - Create: `shared/src/storage/sqlite-<name>-store.ts`
  - Create: `shared/src/storage/__tests__/sqlite-<name>-store.test.ts`
  - Modify: add a migration file in `shared/src/storage/migrations/` **if schema changes**.
- **Constructor:** Always starts with `db: ExecutableDb`. Add `clock: Clock` (timestamps), `idGenerator: IdGenerator` (new entity IDs) per the checklist.
- **Layer constraint — HARD:** No `node:fs`, `fs`, `node:path`, `path` in storage. If the store needs file I/O, this is a BLOCKER — stop and ask.
- **SQL column mapping:** In Steps, show exact type field → column mapping (UUIDv7 → `TEXT PK`, `ISOTimestamp` → `TEXT`, `boolean` → `INTEGER 0/1`).
- **Per-project isolation — HARD:** Every per-project store takes `projectId: ProjectId` and every query uses `WHERE project_id = ?`.
- **Timestamps — HARD:** Timestamps are passed as bound parameters from `Clock`. No `datetime('now')` / `date('now')` in SQL.
- **Tests:** Use `":memory:"` with the migration applied per test; mock `Clock` and `IdGenerator` deterministically.
- **Edge-test checklist:**
  - Computed columns (division by zero, NaN).
  - Idempotency (`INSERT OR REPLACE`, `ON CONFLICT`).
  - Empty result sets.

## Mechanical checks

A, B, C, F, G, H, J, M, S, T (Database normalization).

## Red flags

- Raw DDL outside the `MigrationRunner`.
- `INTEGER AUTOINCREMENT` for entity PKs (must be UUIDv7 `TEXT(36)`).
- `projectId` missing from a per-project store constructor.
