# Researcher — Investigation Protocols

Reference file for the researcher skill. Read this after classifying the question (§1) to get the detailed investigation protocol for that classification.

---

## Codebase Analysis Protocol

**When:** The question asks how something works, or to trace a flow through the codebase.

**Examples:** "How does the compilation pipeline work?", "Trace the flow from aic_compile to the response", "How does file selection work?", "What happens when a config is loaded?"

### Investigation Dimensions

Each dimension gets an explorer subagent. Assign 2-4 of these based on what the question requires:

**Dimension 1 — Entry points:**

- Where does the flow start? What triggers it?
- Grep for the function/class name in exports, handler registrations, CLI command definitions
- Read the entry point file fully
- Trace the FULL call chain from the entry point to the target behavior. Read every intermediate function. Report the chain as: `file:line` -> `file:line` -> ... with one-line descriptions at each hop
- If the entry point involves a hook or bootstrap flow, verify that the actual deployed hook file matches the source. Read both the source (in `integrations/`) and the deployed copy (in `.cursor/hooks/` or `.claude/hooks/`) and diff them
- Evidence to collect: file path, function name, how it's triggered (MCP handler, CLI command, direct call), full call chain with file:line citations

**Dimension 2 — Data flow:**

- What types flow through the system? What gets passed as parameters and returned?
- Read the interfaces involved (from `core/interfaces/`) and the type definitions from `core/types/` verbatim. Do not paraphrase — report exact field names, optionality markers (`?:`), and branded type usage
- Trace parameter types from entry to exit
- For each data transformation step, check whether runtime data matches the expected types. If the investigation involves database columns, query actual rows from `~/.aic/aic.sqlite` to see real values
- Evidence to collect: interface names, method signatures, verbatim type definitions, type transformations at each step, sample runtime data when relevant

**Dimension 3 — Dependencies:**

- What does the target component depend on?
- Read import statements, constructor parameters
- For each dependency: is it an interface (DI) or concrete class? What layer is it in?
- For external library dependencies, read the installed `.d.ts` files under `node_modules/` to verify the actual API. Do not rely on documentation or memory. Report exact constructor and method signatures
- Check `shared/package.json` for pinned versions and `eslint.config.mjs` for restricted-import rules relevant to the target component
- Evidence to collect: dependency graph (component → depends on [list with file paths]), library API signatures from `.d.ts` files

**Dimension 4 — Consumers and scope-adjacent references:**

- What depends on the target component?
- Grep for imports of the target file/class across the codebase
- Classify consumers: direct callers, transitive dependents, test files
- Beyond import-based consumers: grep for string-literal references to the component name in dispatch tables (`Record<string, ...>` entries), error messages, log statements, test descriptions, comments, and documentation. These reveal the component's full footprint beyond the type system — references that import analysis misses
- Check string-literal references in: dispatch table keys, error messages, log statements, test descriptions (`it("...")`), and documentation files. These catch references the type system misses
- Evidence to collect: consumer list with file paths and how each consumer uses the component. Separate import-based consumers from string-reference consumers

### Synthesis Focus

The synthesis (§4) for codebase analysis should produce:

- A clear flow description: "When X happens, component A calls B with [type], which calls C..."
- A dependency map showing what depends on what
- Key design decisions visible in the code (why things are structured this way)

### When to Skip Adversarial Review

For codebase analysis: skip §5 if ALL findings have High confidence and at least 2 explorers produced converging evidence. Codebase analysis deals with facts (code either does X or doesn't) — adversarial review adds less value than for subjective analysis.

---

## Gap/Improvement Analysis Protocol

**When:** The question asks what's wrong, what could be improved, or to find gaps and problems.

**Examples:** "What's wrong with our error handling?", "How can we improve compilation performance?", "What gaps exist in our test coverage?", "Where are the weak points in our architecture?"

### Hypothesis Generation (mandatory — §2b)

Generate 3-5 hypotheses before reading any code. Each hypothesis proposes a specific problem or improvement opportunity.

**Heuristic 1 — Layer-based:** "The problem might be in [core / pipeline / storage / adapters / mcp]"

- Generate one hypothesis per plausible layer
- Each hypothesis names the layer AND the specific concern (not just "the pipeline might be slow" but "the pipeline's tokenization step might be O(n^2) because it processes files individually instead of batching")

**Heuristic 2 — Pattern-based:** "The problem might be caused by [pattern]"

- Performance: unnecessary recomputation, missing caching, synchronous where async would help, O(n^2) algorithms
- Architecture: wrong abstraction level, missing interface, leaky abstraction, circular dependency
- Missing feature: no error recovery, no logging, no validation, no fallback
- Wrong abstraction: interface too broad (ISP violation), class doing too much (SRP violation), premature generalization

**Heuristic 3 — Improvement-based:** "Improvement X might work because [reason]"

- Each hypothesis proposes a specific change and predicts its impact
- Include at least one "surprising" hypothesis (an unconventional approach)

**Heuristic 4 — Stale artifact scan (zero-cost evidence):** Before hypothesizing, grep the target area for `TODO`, `FIXME`, `HACK` markers and phase references (`Phase [A-Z]`). Cross-reference phase references against `documentation/tasks/progress/mvp-progress.md` (main workspace) to identify stale markers (referencing completed work). These are pre-identified improvement opportunities that require no hypothesis generation — they are explicit statements by the original author about known issues. Collect them as "low-hanging fruit" and include in the synthesis alongside deeper findings. This heuristic is additive — it runs alongside Heuristics 1-3, not instead of them.

### Explorer Assignment

Each hypothesis gets an explorer. The explorer tries to BOTH confirm AND disconfirm:

**Explorer prompt template:**
"Investigate whether [hypothesis]. Search for evidence that supports AND contradicts this hypothesis. Specifically:

- Read [target files/directories]
- Grep for [specific patterns]
- Check [specific conditions]

When investigating AIC codebase components, apply the **Runtime Evidence Checklist** and **Codebase Investigation Depth** requirements from `../shared/SKILL-investigation.md`. Read that file and include its protocols in your investigation: trace full code paths, read types/interfaces verbatim, query the database, diff deployed vs source files, check `.d.ts` library APIs, scan for stale markers, and cross-reference documentation.

Report findings with file:line citations. For each finding, state whether it supports or contradicts the hypothesis."

### Synthesis Focus

The synthesis for gap/improvement analysis should produce:

- Which hypotheses were confirmed, which were refuted, which remain uncertain
- Prioritized list of problems/improvements ranked by impact and confidence
- For each confirmed problem: root cause, affected components, suggested fix
- Connections between problems (is problem A caused by problem B?)

### Adversarial Review (mandatory)

The critic must challenge:

- Whether the identified problems are real (or just code style preferences)
- Whether the proposed improvements would actually help (or introduce new problems)
- Whether the root cause analysis is correct (or superficial)
- Whether there are problems the explorers missed entirely

---

## Technology Evaluation Protocol

**When:** The question asks to evaluate a technology, compare options, or assess fit for the project.

**Examples:** "Should we use better-sqlite3 or sql.js?", "Compare tiktoken vs gpt-tokenizer", "Is tree-sitter the right choice for parsing?", "What's the best approach for WASM grammar loading?"

### Evaluation Dimensions

Each dimension gets an explorer. **Dimension applicability:** Not every question requires all 4 dimensions. If a dimension does not apply to the question (e.g., "Alternatives" when evaluating fit of an existing standard rather than comparing competing options), explicitly state which dimension is skipped and why in the investigation plan (§2c). The research document's Analysis section must note: "Dimension [N] ([name]) not applicable because [reason]." Never silently omit a dimension — the omission must be a documented decision, not an oversight.

**Dimension 1 — Fit (codebase explorer):**

- Read the project's requirements for this capability (from `implementation-spec.md`, `project-plan.md`)
- Read the current implementation (if one exists) to understand what works and what doesn't
- Define the exact requirements: sync vs async, performance constraints, API surface needed
- Evidence to collect: requirement list with sources, current implementation assessment

**Dimension 2 — Integration (codebase explorer):**

- How would the technology integrate with the project's architecture?
- Check adapter boundaries (hexagonal architecture — can it be wrapped behind an interface?)
- Check DI patterns (can it be injected? Does it need eager or lazy initialization?)
- Check bundle size impact and dependency count
- Evidence to collect: integration assessment with specific code changes needed

**Dimension 3 — Technical assessment (web explorer):**

- Use `WebSearch` and `WebFetch` to research the technology
- Read official documentation, API reference, changelog
- Check: maintenance status (last release, open issues count, bus factor), performance benchmarks, known limitations
- Search for comparison articles (official sources preferred)
- Evidence to collect: version, last update, API surface, benchmarks, known issues

**Dimension 4 — Alternatives (web explorer):**

- Search for alternatives that solve the same problem
- For each alternative: brief assessment against the same criteria (fit, integration, technical quality)
- Evidence to collect: alternative list with one-line assessment each

### Synthesis Focus

The synthesis for technology evaluation should produce:

- Clear recommendation: "Use X because [reasons]" or "Don't use X because [reasons], use Y instead"
- Trade-off matrix: technology x criterion with ratings
- Migration/integration plan outline (if recommending a new technology)
- Risk assessment: what could go wrong with the recommendation

### Adversarial Review (mandatory)

The critic must challenge:

- Whether the recommended technology actually fits the stated requirements
- Whether integration concerns were adequately addressed
- Whether the alternative assessment was fair (not dismissed too quickly)
- Whether the evaluation missed important criteria

---

## Documentation Analysis Protocol

**When:** The question asks to analyze documentation quality, accuracy, consistency, or completeness.

**Examples:** "Analyze project-plan.md for accuracy", "Cross-check our docs against the codebase", "Find gaps in implementation-spec.md", "Are our docs consistent with each other?"

### Quality Dimensions

Each dimension gets an explorer (except Dimension 5 which stays with the main agent). For comprehensive analysis, use all 6. For targeted analysis (user asks about one specific aspect), use only the relevant dimensions.

**Dimension 1 — Factual accuracy (explorer):**

- Read the target document fully
- For every technical claim: interface names, type names, file paths, ADR references, component descriptions, architecture claims
- Grep the codebase to verify each claim
- Evidence to collect: `[claim in document] — [grep result] — ACCURATE / INACCURATE / NOT FOUND`
- Priority: check claims about code structure, API signatures, and type definitions first (these rot fastest)

**Dimension 2 — Completeness (explorer):**

- Glob the codebase for files/components/interfaces that should be documented
- Compare against what the document actually covers
- Evidence to collect: `[component/file] — DOCUMENTED / UNDOCUMENTED`
- For undocumented items: assess importance (is this a public API, internal utility, or implementation detail?)

**Dimension 3 — Consistency (explorer):**

- Read ALL documents in `documentation/`
- Build a terminology index: key terms and how each document uses them
- Check for: same component described differently, conflicting status claims, architecture described one way in one doc and differently in another
- Evidence to collect: `[term/concept] — [doc A says X] vs [doc B says Y] — CONSISTENT / INCONSISTENT`

**Dimension 4 — Currency (explorer):**

- For each documented interface, type, or code example: read the actual source file
- Check: does the documented version match the current code?
- Evidence to collect: `[documented item] — [doc version] vs [code version] — CURRENT / OUTDATED`
- Priority: check interfaces and type definitions first (these change most often)

**Dimension 6 — Parallel section and structural analysis (explorer):**

- Read the full document. Identify sections that describe the same concept for different targets (e.g., "Cursor" and "Claude Code" sections both describe editor-specific installation, or "macOS" and "Linux" sections both describe platform-specific setup).
- For each parallel pair: compare heading structure (do they mirror each other?), content coverage (features/steps in one but not the other), writing style and detail level (one verbose, one sparse?), and information density (approximate word count per subsection).
- Verify the Table of Contents matches the actual body heading order. Flag any ToC-body mismatches (missing entries, ordering differences).
- Evidence to collect: `[Section A] ↔ [Section B] — structure: SYMMETRIC / ASYMMETRIC ([details]) — content parity: BALANCED / IMBALANCED ([what's missing where]) — density: [A ~N words/subsection, B ~M words/subsection]`. For ToC: `[ToC entry] — MATCHES BODY / MISSING IN BODY / ORDER MISMATCH`.

**Dimension 5 — Clarity (main agent judgment, not a subagent):**

- After receiving all explorer results, the main agent reads the document and assesses:
  - Ambiguous sections (could be interpreted multiple ways)
  - Undefined terms (used without explanation)
  - Missing examples (concept explained abstractly but not demonstrated)
  - Audience mismatch (too detailed for users, too vague for developers, or vice versa)
  - Structural issues (orphan sections, missing transitions, heading hierarchy problems)
- This dimension relies on judgment, not grep — it stays with the main agent

### Synthesis Focus

The synthesis for documentation analysis should produce:

- Issue count by dimension: accuracy (N), completeness (N), consistency (N), currency (N), clarity (N)
- Prioritized issue list: critical issues first (factual errors > outdated content > inconsistencies > gaps > clarity)
- For each issue: what's wrong, where it is, what the correct content should be (if determinable)
- Overall document health assessment: "Good with minor issues" / "Needs significant updates" / "Fundamentally outdated"

### Adversarial Review (mandatory)

The critic must challenge:

- Whether reported "inaccuracies" are actually wrong (maybe the document is correct and the explorer misread the code)
- Whether "undocumented" items actually need documenting (not everything needs to be in docs)
- Whether "inconsistencies" are genuine conflicts or acceptable context-dependent differences
- Whether clarity judgments are fair (is the section actually ambiguous, or is the reviewer unfamiliar with the domain?)

---

## Cross-Protocol Guidelines

### Evidence Format (all protocols)

Every finding must include evidence in one of these formats:

- **Code evidence:** `shared/src/pipeline/token-counter.ts:42` — [what the code shows]
- **Grep evidence:** `grep for "processFile" found 12 matches in 8 files` — [what the pattern means]
- **Glob evidence:** `glob "shared/src/core/interfaces/*.interface.ts" returned 52 files` — [what this implies]
- **Web evidence:** `https://docs.example.com/api#method` — [what the documentation says]
- **Absence evidence:** `grep for "cacheInvalidation" in shared/src/ returned 0 matches` — [Weak confidence: absence of evidence is not evidence of absence]

### Subagent Prompt Quality

The quality of explorer output depends on prompt quality. Each explorer prompt must:

1. State the specific investigation target (not "look at the pipeline" but "read `shared/src/pipeline/` and determine how file scoring works")
2. List specific files or directories to start with (not "find relevant files" but "start with `relevance-scorer.ts` and trace its imports")
3. Define what constitutes evidence (not "report what you find" but "for each scoring factor, cite the file:line where it's computed and the weight it receives")
4. Include the disconfirmation mandate (for gap/improvement and technology evaluation)

### When Explorers Disagree

If two explorers report contradictory findings about the same thing:

1. Note both findings in the synthesis with their evidence
2. The critic receives both and attempts to determine which is correct
3. If the critic cannot resolve it, both findings appear in the document with a note: "Contradictory evidence — requires manual verification"
4. Add to Open Questions

### Uncertainty Resolution (all protocols)

If an explorer reports findings marked UNCERTAIN (partial evidence, ambiguous grep results, contradictory signals), the main agent must resolve them before synthesis:

- **1-2 uncertain findings:** Re-spawn the explorer with more specific instructions targeting the uncertainty. Provide the specific file paths, line numbers, and questions that need answers. One re-spawn typically resolves it.
- **3+ uncertain findings:** The investigation has significant ambiguity. Before finalizing the research document, add an **Uncertainty Summary** section listing each unresolved item with what was tried and what remains unclear. Inform the user: "This investigation has N uncertain findings that could not be fully resolved. See the Uncertainty Summary for details." Do not present uncertain findings as confirmed — the distinction between "confirmed" and "uncertain" is critical for downstream planning and execution.

This prevents cheaper models from producing confident-sounding research documents that contain unverified claims — the most dangerous failure mode for downstream consumers (planner, executor) that trust the research.

### Maximum Subagent Budget

- Explorers: maximum 4 per investigation (tool limit for parallel calls)
- Re-spawned explorers (for shallow results or gap coverage): maximum 2 additional
- Critic: exactly 1 (re-spawned at most once if too agreeable)
- Total subagent spawns per research: maximum 7

This budget prevents runaway cost while ensuring thorough investigation. If the question requires more than 7 subagent spawns, it should be split into multiple research questions.
