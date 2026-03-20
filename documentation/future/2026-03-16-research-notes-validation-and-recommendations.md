# Research: Validation of research-notes.md Gaps, Claims, and Recommendations

> **Status:** Complete
> **Date:** 2026-03-16
> **Question:** Are the gaps, competitive analysis, Phase 2 validation claims, and recommended features in documentation/future/research-notes.md accurate relative to the current AIC codebase and external sources? Should they inform the roadmap?
> **Classification:** gap/improvement analysis (with technology validation)
> **Confidence:** High — multiple explorers converged; external and codebase evidence cited
> **Explorers:** 4 | **Critic:** yes — Finding 5 corrected; Findings 2–3 caveated (absence-of-evidence)

## Executive Summary

The research-notes document is **largely accurate**: the stated gaps (no AST-driven repo map, no semantic/perplexity-based pruning, no cross-session agentic memory injection, no subagent-specific MCP tools) correctly describe the current AIC implementation. Phase 2 validation claims are **partially accurate**: tree-sitter incremental parsing and MCP lifecycle are validated; LLMLingua-2 CPU/BERT-level is validated but the "<100ms for 100k tokens" claim is unsupported; MCP "Persistent vs Ephemeral Resources" is overstated (not in the official spec). The three recommendations (AST Repo Map, semantic/perplexity pruning, cross-session memory) are **architecturally aligned** but **not currently on the Phase 2 roadmap**; adding them would require an explicit roadmap decision.

## Findings

### Finding 1: Gap — No AST-driven global repo map (confirmed)

**Evidence:** `shared/src/core/types/repo-map.ts` — RepoMap is file-level (path, language, size, estimatedTokens, lastModified); `shared/src/pipeline/structural-map-builder.ts:9-28` — StructuralMapBuilder builds directory summary (dir/ n files), not symbols/signatures; `documentation/future/research-notes.md:22-24` — states AIC lacks AST-aware global repository map.
**Confidence:** High
**Adversarial status:** Unchallenged

AIC uses AST/symbols per-file (LanguageProviders for summarisation ladder; HeuristicSelector uses SymbolRelevanceScorer and ImportProximityScorer for file-level scoring) but does not aggregate into a repo-wide map. RepoMap and StructuralMapBuilder are file-tree and directory-count only. No repo-wide AST, symbol, or call-graph map exists. The research-notes gap is accurate.

### Finding 2: Gap — No semantic or perplexity-based token pruning (confirmed)

**Evidence:** Grep for `LLMLingua|perplexity` in codebase returns only research-notes references; `shared/src/pipeline/line-level-pruner.ts:10-37,47-62` — LineLevelPruner uses subject tokens + syntax/structural line rules, no model or perplexity.
**Confidence:** Moderate
**Adversarial status:** Challenged — incorporated: caveat added. Conclusion based on grep for specific terms (LLMLingua, perplexity); no exhaustive audit for other names (e.g. token scorer). No counter-evidence found.

Compression is heuristic and tier-based (SummarisationLadder) plus line-level rule pruning. No LLMLingua or perplexity-based token pruning is implemented.

### Finding 3: Gap — No cross-session agentic memory injection (confirmed)

**Evidence:** `shared/src/core/interfaces/agentic-session-state.interface.ts` — AgenticSessionState has steps, previously shown files, recordStep; `shared/src/core/run-pipeline-steps.ts:111-112,146-148,206-208` — session dedup and conversationCompressor.compress(steps). Grep for `.aic/memory`, `NOTES.md` — only in research-notes as a proposal.
**Confidence:** Moderate
**Adversarial status:** Challenged — incorporated: caveat added. Conclusion based on grep for those paths; no exhaustive audit of all context loaded at session start. No counter-evidence found.

In-session state (dedup, conversation compression) exists. No reading or injection of `.aic/memory` or NOTES.md; that is proposed only in research-notes.

### Finding 4: Gap — No subagent-specific MCP tools or micro-compilations (confirmed)

**Evidence:** `mcp/src/schemas/compilation-request.ts:36` — triggerSource includes subagent_start; `mcp/src/server.ts:378,396,408,425,435,444` — single set of MCP tools (aic_compile, aic_inspect, aic_status, etc.); `shared/src/core/run-pipeline-steps.ts` — one pipeline, no branch for subagent.
**Confidence:** High
**Adversarial status:** Unchallenged

Subagent is a trigger source for the same full pipeline. No subagent-only tool or micro-compilation path.

### Finding 5: research-notes description of pipeline is accurate with corrected nuance

**Evidence:** `shared/src/pipeline/heuristic-selector.ts:129-159` — fitToBudget adds full files until budget/maxFiles; `shared/src/pipeline/heuristic-selector.ts` — scoreCandidate uses symbolRelevanceScores (SymbolRelevanceScorer → LanguageProvider.extractNames) and importProximityScores (ImportProximityScorer); `shared/src/pipeline/summarisation-ladder.ts:20-43,125-136` — tier demotion and drop; `shared/src/pipeline/line-level-pruner.ts` — subject-token + syntax/structural.
**Confidence:** Moderate
**Adversarial status:** Challenged — incorporated. Selection does use syntax/symbol signals at file level (symbol relevance, import proximity). What is missing is chunk-level syntax-aware selection and a global AST repo map, not "no syntax for selection."

"File inclusion/exclusion and token-budget truncation" and "heuristic/algorithmic reduction" are accurate. Corrected nuance: file-level selection uses symbol relevance and import proximity (AST-derived); chunk-level selection and a global AST repo map are absent.

### Finding 6: Tree-sitter Phase 2 validation — partially valid

**Evidence:** [https://tree-sitter.github.io/tree-sitter](https://tree-sitter.github.io/tree-sitter) — "incremental parsing library," "fast enough to parse on every keystroke"; [https://github.com/tree-sitter/tree-sitter/issues/4019](https://github.com/tree-sitter/tree-sitter/issues/4019) — large files (e.g. 25k lines) can see 0.2–0.3s per change; background parsing used for responsiveness.
**Confidence:** High
**Adversarial status:** Unchallenged

Incremental parsing is validated. "Every keystroke with negligible lag" is not universal; large files may need background/timeout-based parsing.

### Finding 7: LLMLingua-2 Phase 2 validation — CPU/BERT valid; "<100ms for 100k tokens" unsupported

**Evidence:** [https://huggingface.co/microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank](https://huggingface.co/microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank) — BERT 0.2B, CPU; [https://github.com/microsoft/LLMLingua/issues/75,79](https://github.com/microsoft/LLMLingua/issues/75,79) — CPU usage; [https://github.com/microsoft/LLMLingua/issues/175](https://github.com/microsoft/LLMLingua/issues/175) — users target "~100k tokens in under 2 seconds" on CPU, not 100ms.
**Confidence:** High
**Adversarial status:** Unchallenged

BERT-level, data distillation, and CPU execution are validated. The research-notes claim "often <100ms for 100k tokens" has no supporting source; treat as unsupported/optimistic.

### Finding 8: MCP lifecycle validated; "Persistent vs Ephemeral Resources" overstated

**Evidence:** [https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle) — Initialization → Operation → Shutdown; [https://modelcontextprotocol.io/docs/concepts/resources](https://modelcontextprotocol.io/docs/concepts/resources) — no "Persistent" or "Ephemeral" in official spec; third-party (e.g. Milvus) use the distinction conceptually.
**Confidence:** Moderate
**Adversarial status:** Unchallenged

(Characterization of spec wording; official lifecycle is High, "overstated" is interpretive.)

Lifecycle claim is correct. MCP does not "explicitly define" Persistent vs Ephemeral Resources; that is ecosystem usage, not spec vocabulary.

### Finding 9: Recommendations are not on Phase 2 roadmap but align with architecture

**Evidence:** `documentation/project-plan.md:3174` — Phase 2 = VectorSelector, HybridSelector, governance, V8, Conversation Compressor; no AST repo map, perplexity pruning, or cross-session memory; `documentation/project-plan.md:1796-1802,2115-2118` — ContextSelector accepts RepoMap, ContentTransformer is extensible; new interfaces (e.g. MemoryProvider) would fit DI.
**Confidence:** High
**Adversarial status:** Unchallenged

None of the three research-notes recommendations appear in the current Phase 2 roadmap. All can be implemented via existing or new interfaces without breaking hexagonal/DI design.

## Analysis

Findings 1–4 confirm that the gaps described in research-notes match the codebase: AIC has file-level RepoMap and directory structural map, heuristic selection and tier/line compression, in-session agentic state but no persistent memory injection, and a single pipeline used for subagent_start. Finding 5 (post-critic): file-level selection does use syntax/symbol signals (symbol relevance, import proximity); the missing pieces are chunk-level syntax-aware selection and a global AST repo map.

Findings 6–8 validate or correct the Phase 2 feasibility claims. Tree-sitter is viable; the only correction is that "negligible lag on every keystroke" does not hold for very large files without background parsing. LLMLingua-2 is CPU-viable and BERT-level, but the specific "<100ms for 100k tokens" claim should be removed or downgraded to "multi-second range for 100k tokens on CPU" until benchmarked. MCP lifecycle is correct; the Persistent/Ephemeral Resources wording overstates what the spec defines.

Finding 9 connects recommendations to the roadmap: they are architecturally compatible but out of current Phase 2 scope. The project plan already has Phase 2 semantic work (VectorSelector, HybridSelector) and in-session agentic support (Conversation Compressor); the research-notes adds AST-level repo map, token-level perplexity pruning, and cross-session persistent memory as optional future directions. Prioritising them would require an explicit roadmap update.

## Recommendations

1. **Update research-notes Phase 2 section** — Correct the LLMLingua-2 claim to "multi-second range for ~100k tokens on CPU" (or remove the 100ms claim) and soften "MCP explicitly defines Persistent vs Ephemeral Resources" to "MCP lifecycle supports stateful connections; the persistent/ephemeral resource distinction is used in the ecosystem." Add a caveat for tree-sitter on very large files (background parsing).
2. **Keep the three feature recommendations as candidate roadmap items** — AST-driven repo map, semantic/perplexity-based pruning, and cross-session memory injection are validated as feasible and architecturally aligned. Decide whether to add them to Phase 2+ or a dedicated "research-backed extensions" backlog.
3. **Do not present "<100ms for 100k tokens" as validated** — Until AIC or the community has benchmarks, treat LLMLingua-2 CPU performance as "suitable for batch compression" rather than sub-100ms real-time.
4. **LLMLingua-2 (or similar) integration** — Do not add per-request semantic compression by default (adds ~1–4s; AIC has a 30s compile timeout). Prefer batch/session-start (run once, cache) or threshold-gated (only when assembled tokens exceed e.g. 80k). Define explicit latency targets (e.g. P95 compile &lt; 10s; batch step &lt; 15s once per session). Make it config-driven (e.g. `semanticCompression: "off" | "batch" | "when_over_80k"`).
5. **Subagent micro-compilations** — Implement as optional parameters on `aic_compile`, not a separate MCP tool. Extend the compilation request with e.g. `scope?: "full" | "micro"` and optional `scopeHint` (e.g. "database", "tests"); when `triggerSource === "subagent_start"` and `scope === "micro"`, use a smaller budget and/or micro rule pack. One server, one tool.

## Roadmap Mapping

| #   | Recommendation                                        | Phase   | Category      | Candidate `mvp-progress.md` entry                                                                          | Immediate?           |
| --- | ----------------------------------------------------- | ------- | ------------- | ---------------------------------------------------------------------------------------------------------- | -------------------- |
| 1   | Correct research-notes Phase 2 claims                 | Current | Documentation | Correct Phase 2 validation wording in research-notes (LLMLingua timing, MCP Resources, tree-sitter caveat) | Yes — plannable now  |
| 2   | Candidate roadmap items (AST map, perplexity, memory) | 2 / 2+  | Backlog       | Add AST-driven repo map, semantic/perplexity pruning, cross-session memory as candidate Phase 2+ items     | No — decision needed |
| 3   | Avoid unvalidated 100ms claim                         | Current | Documentation | Do not cite "<100ms for 100k tokens" for LLMLingua-2 until benchmarked                                     | Yes — plannable now  |

> **To add these to the roadmap:** tell me which rows to add to `mvp-progress.md` and I'll write them.

## Sources

- `documentation/future/research-notes.md` — base document
- `documentation/project-plan.md` — RepoMap, Phase 2, roadmap, interfaces
- `documentation/implementation-spec.md` — MVP pipeline, excluded features
- `documentation/tasks/progress/mvp-progress.md` — Phase P/Q, structural map, chunk-level inclusion
- `shared/src/core/run-pipeline-steps.ts` — pipeline order and steps
- `shared/src/core/types/repo-map.ts` — RepoMap type
- `shared/src/pipeline/structural-map-builder.ts` — directory structural map
- `shared/src/pipeline/heuristic-selector.ts` — file selection, fitToBudget
- `shared/src/pipeline/summarisation-ladder.ts` — tiers, chunk resolution
- `shared/src/pipeline/line-level-pruner.ts` — line pruning logic
- `mcp/src/server.ts` — MCP tools; `mcp/src/schemas/compilation-request.ts` — triggerSource
- [https://tree-sitter.github.io/tree-sitter](https://tree-sitter.github.io/tree-sitter) — incremental parsing
- [https://github.com/tree-sitter/tree-sitter/issues/4019](https://github.com/tree-sitter/tree-sitter/issues/4019) — large-file performance
- [https://huggingface.co/microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank](https://huggingface.co/microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank) — LLMLingua-2 BERT
- [https://github.com/microsoft/LLMLingua/issues/75,79,175](https://github.com/microsoft/LLMLingua/issues/75,79,175) — CPU usage, 100k token timing
- [https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle) — MCP lifecycle
- [https://modelcontextprotocol.io/docs/concepts/resources](https://modelcontextprotocol.io/docs/concepts/resources) — MCP resources (no Persistent/Ephemeral terms)
