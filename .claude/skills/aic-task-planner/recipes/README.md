# Recipes — router

Each task-planner task must match exactly one recipe. This directory holds a Quick-Card file per recipe — read only the one that matches the task. The full detail for every recipe still lives in `../SKILL-recipes.md`; the Quick Cards cross-reference the line ranges.

| Recipe               | Quick Card                | Use when                                                       |
| -------------------- | ------------------------- | -------------------------------------------------------------- |
| Adapter              | `adapter.md`              | Wrapping an external library behind a core interface.          |
| Storage              | `storage.md`              | Implementing a `*Store` core interface backed by SQLite.       |
| Composition root     | `composition-root.md`     | Wiring concrete classes at the composition boundary.           |
| Pipeline transformer | `pipeline-transformer.md` | Implementing `ContentTransformer`.                             |
| Benchmark            | `benchmark.md`            | Adding gold data, fixtures, or evaluation tests.               |
| Release pipeline     | `release-pipeline.md`     | npm publish, CI automation for publishing.                     |
| Fix/patch            | `fix-patch.md`            | Correcting existing behavior without creating a new component. |
| General-purpose      | `general-purpose.md`      | Structured fallback when no specialized recipe fits.           |
| Documentation        | `documentation.md`        | Writing or editing `.md` documentation (no code).              |

**Routing rule:** Pick the most specific recipe. If more than one seems to fit, read the recipe's "use when" description in each candidate file and choose by evidence. General-purpose is the last resort — run its Closest-Recipe Analysis before committing to it.
