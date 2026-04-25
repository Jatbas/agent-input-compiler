# Recipe: Benchmark (gold data, fixtures, evaluation tests)

Full detail: `../SKILL-recipes.md` lines 264–344.

## Quick Card

- **When to use:** Gold enrichment, new benchmark task, metric evolution, or fixture enrichment. Test infrastructure only — no production code.
- **Files:** derive from the benchmark family under test; common rows are gold-data JSON under `test/benchmarks/**`, fixture files under `test/benchmarks/repos/**`, the integration test that consumes the fixture, and `test/benchmarks/baseline.json` only when measured token counts deterministically change.
- **Template replaces Interface/Signature with "Gold Data Schema":**
  1. TypeScript interface describing the gold-data JSON shape.
  2. Complete example JSON entry with every field.
  3. Field-by-field mapping: gold field → pipeline output field.
- **Dependent Types:** Tier 0 for types the test reads fields from (`PipelineTrace`, `SelectedFile`). Tier 1 for pass-through types. Tier 2 for branded types used to construct inputs.
- **Gold data integrity — HARD:** Every annotation must be verifiable against the fixture repo. Read every referenced fixture file during exploration; record line ranges of functional landmarks. Never write gold annotations from assumption.
- **Fixture stability — HARD:** Changes to fixture files cascade — document impact on existing gold data and `baseline.json`.
- **Step granularity:** One gold file per step; one fixture change per step; one test file per step; include an existing-benchmark regression step; final verification.
- **Sibling reuse:** Mirror the closest existing benchmark test's wiring pattern exactly; cite at least two sibling benchmark tests when the family has more than one.

## Exploration specifics

Beyond the standard checklist:

- Read every existing gold-data file; record current schema shape.
- Read every existing benchmark test; record wiring pattern.
- Read every fixture file referenced by gold data; record line numbers of functions/classes/exports.
- Run the benchmark's existing test command; read the actual output shape before writing gold data.
- Check baseline impact (will token counts or paths change?).

## Mechanical checks

A, D, F, G, J, M, S. (Not applicable: K, L, O, P, Q, R, T unless the task crosses into other recipes.)
