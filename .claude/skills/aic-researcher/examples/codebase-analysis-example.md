# Research: Which pipeline steps dominate latency on large repositories?

**Classification:** codebase-analysis
**Date:** 2026-04-16
**Status:** canonical example

## Question

For repositories with > 50,000 files, which steps of the AIC compilation pipeline account for the highest wall-clock time, and where is the leverage for reducing that time?

## Framing

Sound. The question specifies a concrete regime (> 50k files), asks for ordered contribution (not just "what is slow"), and allows multiple answers. The framing was reviewed by a framing-challenger subagent which confirmed (evidence: `framing-review.md:12`, example verdict: "sound").

## Method

Four parallel explorers investigated the runtime evidence independently:

- Explorer A — top-level pipeline timings (`shared/src/pipeline/` + trace output).
- Explorer B — storage queries issued per compilation (sqlite `EXPLAIN` output).
- Explorer C — tokeniser and encoder paths (`shared/src/adapters/tokeniser-*.ts`).
- Explorer D — integration tests on large fixtures (`test/benchmarks/` + captured timings).

Each explorer produced an evidence-backed report. A synthesis critic re-verified every citation.

## Findings (ranked by wall-clock contribution)

1. **File-shape pre-pass dominates on first compilation.** The initial `FileShapeScanner` pass walks every file in the project once. On the 55k-file fixture, this is ~38% of wall-clock on a cold cache and ~4% on a warm cache. Evidence: `shared/src/pipeline/file-shape-scanner.ts:44` (the walk), trace timings at `test/benchmarks/traces/55k-cold.json:117-142`.

2. **Tokeniser cost grows faster than linear in number of selected files.** The tokeniser invokes `sodium.ready` per call; the adapter does not memoise. On the 55k-file fixture with ~1200 selected files, tokeniser wall-clock is ~21% of total, and `sodium.ready` contributes half of that. Evidence: `shared/src/adapters/tokeniser-blake2.ts:31`, profile at `test/benchmarks/profiles/tokeniser-55k.cpuprofile`.

3. **Storage: `SELECT … WHERE project_id = ?` over the `compilation_trace` table lacks a covering index.** Every compilation issues 3 + N queries (N = selected files). On the 55k-file fixture this is ~11% of wall-clock. Evidence: `shared/src/storage/sqlite-trace-store.ts:78`, `EXPLAIN QUERY PLAN` output captured at `.aic/evidence/2026-04-16-explain.txt:7`.

4. **Guard scanners are currently ordered alphabetically.** Moving the cheapest scanner first (path-allowlist) and the most expensive last (prompt-injection-scanner) yields ~5% savings on fixtures where no finding is produced, because guard scanning short-circuits on a HARD block. Evidence: `shared/src/pipeline/guard-pipeline.ts:55`, measured shift in `test/benchmarks/traces/55k-reordered.json:9`.

5. **JSON compaction cost is negligible.** The JSON compactor transformer accounts for < 1% on all measured fixtures. No leverage here. Evidence: `test/benchmarks/traces/55k-cold.json:200`.

## Disconfirmation outcomes

- Hypothesis A: "Storage is the bottleneck." Disproved — storage is third in rank, not first (finding 3 evidence).
- Hypothesis B: "Tokenisation is memoised." Disproved — see finding 2 and `tokeniser-blake2.ts:31`.
- Hypothesis C: "Guard order does not matter." Disproved — finding 4 evidence.

## Recommendations (leverage-ordered)

1. Cache the `FileShapeScanner` walk across runs keyed by repo-mtime-fingerprint. Potential: eliminates ~38% cold-start cost, ~90% of which is on files that never change between runs. (High leverage, medium effort.)
2. Hoist `await sodium.ready` out of the per-call path in `tokeniser-blake2.ts`. Potential: halves tokeniser cost. (High leverage, low effort.)
3. Add a covering index `(project_id, created_at)` on `compilation_trace`. Potential: ~11% wall-clock reduction. (Medium leverage, low effort — requires a migration.)
4. Reorder guard scanners cheapest-first. Potential: ~5%. (Low leverage, trivial effort; can be bundled with recommendation 2.)

## Open questions / gaps

- The 55k-fixture uses synthetic file content. Real-world repos may have very different tokenisation distributions; recommendation 2 should be re-measured on a real repo before shipping.
- `FileShapeScanner` cache invalidation on symlink edge cases is not covered by this research; a follow-up is needed before recommendation 1 ships.

## Why this example

Shows:

- A precise, falsifiable question.
- Framing explicitly confirmed by a framing-challenger.
- Parallel explorers with non-overlapping scope, each producing cited findings.
- Explicit disconfirmation outcomes, not smoothed over.
- Findings ranked by contribution with evidence, not just listed.
- Recommendations ordered by leverage/effort, with quantified potentials.
- Open gaps recorded — what this research did NOT establish.
