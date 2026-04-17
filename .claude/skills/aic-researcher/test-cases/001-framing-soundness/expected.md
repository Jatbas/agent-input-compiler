# Research — AIC pipeline latency (partially-framed)

**Classification:** codebase-analysis
**Framing verdict:** partially-framed — reframed to "Which pipeline steps dominate wall-clock time on repositories with > 50,000 files?"

## Framing

The original question "Why is the AIC pipeline slow?" is partially-framed: "slow" is not operationalised (no baseline, no fixture scale, no target metric). The framing-challenger verdict is `partially-framed`; the suggested reframing is above. Evidence: `framing-review.md:5`.

## Method

Three parallel explorers investigated timing evidence at the > 50k-file regime. A synthesis critic re-verified every citation.

## Findings (ranked by wall-clock contribution)

1. File-shape pre-pass dominates on cold runs (~38% on the 55k-file fixture). Evidence: `shared/src/pipeline/file-shape-scanner.ts:44`.
2. Tokeniser omits `sodium.ready` memoisation (~21%). Evidence: `shared/src/adapters/tokeniser-blake2.ts:31`.
3. `compilation_trace` query lacks a covering index (~11%). Evidence: `shared/src/storage/sqlite-trace-store.ts:78`.

## Disconfirmation

- Hypothesis: storage is the dominant bottleneck. Disproved — storage is #3, not #1. Evidence: finding 3 vs finding 1 timings.

## Recommendations

1. Cache file-shape scan (high leverage, medium effort).
2. Hoist `sodium.ready` (high leverage, low effort).
3. Add covering index on `compilation_trace` (medium leverage, low effort).

## Gaps

- Synthetic fixtures only; re-measure on a real repo before shipping recommendation 2.
