# Recipe: Adapter (wraps an external library)

Full detail: `../SKILL-recipes.md` lines 7–65.

## Quick Card

- **When to use:** The task wraps exactly one external library behind a core interface.
- **Files:**
  - Create: `shared/src/core/interfaces/<name>.interface.ts` (if new)
  - Create: `shared/src/adapters/<library>-adapter.ts`
  - Create: `shared/src/adapters/__tests__/<library>-adapter.test.ts`
  - Modify: `eslint.config.mjs` (per-library restriction)
- **Constructor:** Usually `constructor()`. Exception: inject `Clock` / `IdGenerator` if the adapter generates timestamps or IDs.
- **Sync/async:** Match the core interface's return type. Interface returns `T` → adapter uses sync library API; interface returns `Promise<T>` → async.
- **ESLint per-library block — HARD:** Preserve every existing adapter-boundary path and pattern when adding the new library entry. Flat-config overrides REPLACE the previous `rules` value — they do not merge. Copy the full adapter-boundary paths/patterns before adding the new entry. See `SKILL-recipes.md` §"CRITICAL — flat config override semantics".
- **Sibling reuse:**
  - First adapter in a family → predict generic vs specific functions; if 2+ generic, extract utility file on day one.
  - Second adapter → extract shared utilities as a prerequisite step.
  - Third+ → MUST use the shared factory and utilities; Interface/Signature shows usage of the factory, not a hand-written class.
- **Tests:** Happy path + error paths + sync/async semantics per interface.

## Mechanical checks that apply

A (Ambiguity), B (Signature cross-check), F (Files table), H (Branded types in constructor), K (Library API accuracy), S (Code block API extraction).

## Red flags

- Any `new LibraryClass(...)` outside the single wrapper file.
- Missing ESLint restriction block.
- Adapter uses `Date.now()` / `Math.random()` directly — must use `Clock` / `IdGenerator`.
