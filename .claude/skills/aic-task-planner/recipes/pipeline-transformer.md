# Recipe: Pipeline transformer (Phase L `ContentTransformer`)

Full detail: `../SKILL-recipes.md` lines 198–262.

## Quick Card

- **When to use:** The task implements `ContentTransformer` — a pipeline-layer component with no adapters, no storage, no external deps; pure string/regex logic.
- **Files:**
  - Create: `shared/src/pipeline/<name>.ts`
  - Create: `shared/src/pipeline/__tests__/<name>.test.ts`
  - Modify: `shared/src/bootstrap/create-pipeline-deps.ts` (wire transformer)
- **Constructor:** Usually no parameters (stateless). Config-driven transformers receive config values.
- **Interface:** `ContentTransformer` from `#core/interfaces/content-transformer.interface.ts` — fields `id`, `fileExtensions`, `transform(content, tier, filePath): string`.
- **Format-specific vs non-format-specific:**
  - `fileExtensions = []` → non-format-specific, runs on all files after format-specific transformers.
  - Specific extensions → format-specific, first match wins.
- **Wiring order in `create-pipeline-deps.ts`:**
  - Format-specific: `jsonCompactor`, `lockFileSkipper`, then new ones.
  - Non-format-specific: new ones first, then `whitespaceNormalizer`, `commentStripper` last (cleanup runs after content-stripping).
- **File-type safety tests — HARD:** Each transformer must test semantic safety for the file types it handles. Python indentation, YAML structure, JSX syntax must remain intact.
- **Benchmark verification step — HARD:** Every transformer task includes a penultimate step running `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts`. The test auto-ratchets `baseline.json` when tokens decrease.
- **Sibling reuse:** Check existing transformers before writing parsing helpers.

## Mechanical checks

A, B, C, D, F, G, J, M, Q (Transformer benchmark), R (Transformer safety tests), S.

## Red flags

- New transformer without safety tests for the file types it claims to handle.
- Missing benchmark verification step.
- Wiring position chosen without reference to the documented execution order.
