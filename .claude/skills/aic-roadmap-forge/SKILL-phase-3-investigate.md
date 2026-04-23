# Phase 3: Parallel Investigation

## §3. Parallel Investigation

Spawn 3–4 explorer subagents in parallel. Use `fast` model for all explorers.

**Inline work is prohibited.** You MUST use the Task tool to spawn explorers. Never produce explorer findings inline — if you find yourself writing "Explorer 1 findings:" without a Task tool call, stop and spawn. The quality of this skill depends on independent context windows — a single agent cannot hold contradictory positions simultaneously and cannot independently challenge its own conclusions.

**Explorer status protocol:** Each explorer must end its output with one of four status codes. The parent agent handles each differently:

- **`STATUS: FINDINGS_COMPLETE`** — Normal path. Explorer completed investigation and returned a full table. Proceed to validation.
- **`STATUS: FINDINGS_WITH_CONCERNS`** — Explorer completed but flags uncertainty on specific candidates. Parent reads the concerns section before synthesis. Concerned candidates get a caveat annotation in §4d scoring.
- **`STATUS: NEEDS_CONTEXT`** — Explorer could not complete investigation without additional input (e.g., a file it couldn't access, a document reference it couldn't resolve). Parent provides the missing context and re-dispatches. This does not count toward the re-spawn cap.
- **`STATUS: BLOCKED`** — Explorer hit a wall it cannot resolve (e.g., no web access for Explorer 3, codebase too large to search). Parent does not re-spawn with the same prompt — that wastes tokens. Instead: narrow the scope, split the task, or skip this explorer with a degradation warning.

Include this instruction in each explorer's prompt: "End your response with one of: `STATUS: FINDINGS_COMPLETE`, `STATUS: FINDINGS_WITH_CONCERNS` (followed by a Concerns section), `STATUS: NEEDS_CONTEXT` (followed by what you need), or `STATUS: BLOCKED` (followed by what blocked you)."

**Post-spawn verification (required before §4):** After all explorers return, produce a structured handoff report:

- "Explorer 1: [N] candidates found, [M] with disconfirmation notes. UP scores: [range]."
- "Explorer 2: [N] High-value findings returned. IS scores: [range], DR scores: [range]."
- "Explorer 3: [N] external findings, impact classes: [list]. UI scores: [range], EU scores: [range]."
- "Explorer 4: [spawned / not spawned — reason]."

If Explorer 1 disconfirmation count is 0, treat as convergence condition 2 in §5b — do not proceed to synthesis without re-spawning Explorer 1 with a disconfirmation-focused prompt.

**Parent-side output validation (run before §4):** After all explorers return, the parent agent validates each explorer's output before accepting it. This catches the most common fast-model failures: shallow investigation, missing citations, unjustified scores, and format violations.

For each explorer, check:

1. **Format compliance:** Output uses the required table format. If an explorer returned free-form prose instead of a table, re-spawn with: "Your output must use the required table format. Do not write prose paragraphs. Fill in the table template provided in your instructions."
2. **Citation floor:** Count file:line citations (Explorer 1, 2, 4) or URLs (Explorer 3). Each explorer's required output format specifies its minimum. If below the floor, re-spawn with: "Your investigation was too shallow — you returned [N] citations but the minimum is [M]. Search more broadly: [specific guidance on what to search]."
3. **Score justification check:** Every score cell must have a corresponding justification cell that is non-empty and names specific evidence. Count unjustified scores. If more than 25% of scores lack justification, re-spawn with: "Your scores lack justification. Each score must name the specific evidence — not just a number. Re-score all candidates using the format: '[1-5] — [one sentence citing evidence]'."
4. **Disconfirmation fill rate (Explorer 1 only):** The "Evidence against" column must be non-empty for every candidate row. "None found after checking [what]" is valid. A blank cell triggers re-spawn.
5. **Strategy balance (Explorer 3 only):** Count Strategy A vs Strategy B findings. If fewer than 2 from either strategy, re-spawn with: "Your findings are unbalanced — [N] from Strategy A, [M] from Strategy B. Run additional [A/B] searches before returning."

**Re-spawn cap:** Track total re-spawns per explorer. 1st: normal. 2nd: annotate "may be lower quality." 3rd: STOP — split the task, accept degraded output with a warning, or drop the explorer and note the gap in §6.

### Explorer 1 — Documentation gap analyst

**Role:** Find what the documentation plans but the roadmap doesn't track.

**Scope boundary:** Investigate only the §1 candidate list. Do not add candidates not identified in §1. Do not read files outside the resolved input source(s) unless cross-checking architectural fit in the codebase.

**Task:** For each §1 candidate, perform all checks below. Return results in the **required output format** — do not return free-form prose.

1. Verify it is genuinely absent from aic-progress.md — search by multiple phrasings, not exact name match, to catch renamed or grouped variants.
2. Perform a secondary codebase check: search for related implementation code using keywords from the candidate's domain. If implementation code exists, mark the candidate as "Likely already shipped under different name" and exclude it unless you can confirm the code is absent.
3. **Disconfirmation check (mandatory):** For each candidate, actively look for evidence it should NOT be built:
   - Was it attempted and removed? (Check git log, dead code, commented-out references)
   - Does it violate an architectural invariant from CLAUDE.md? (e.g., would it require `core/` to import from `adapters/`?)
   - Does any doc explicitly defer or de-prioritize it?
   - Is there a simpler existing mechanism that already solves it?
     Report disconfirming evidence even if the candidate passes overall — this evidence feeds the §5 critics.
4. Assess: is it architecturally necessary, optional, or speculative?
5. Assess: what is the implementation surface? (new pipeline step, adapter, storage migration, MCP handler, etc.)
6. Cite the source document with file:line for each candidate.
7. **Value score (per Value Scoring Rubric):** For each verified candidate, score **Unblock Potential (1-5)** — count how many tracked or proposed components depend on it. Enforce forced distribution.

**Required output format — one row per candidate:**

```
| Candidate | Status | Necessity | Surface | Source (file:line) | Evidence against | UP | UP justification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [name] | Verified / Excluded / Already shipped | Necessary / Optional / Speculative | [pipeline step, adapter, etc.] | [file:line] | [one sentence or "None found"] | [1-5] | [one sentence: why this score] |
```

**Output constraints:**

- Maximum 12 candidate rows (the §1 candidate list is bounded by input source scope)
- Minimum 3 file:line citations across all rows — if you cannot cite 3, your investigation was too shallow; search more broadly before returning
- The "Evidence against" column must be non-empty for every row — "None found after checking [what you checked]" is acceptable; a blank cell is not
- Every UP score must include a justification — a bare number without reasoning will be rejected by the parent agent

[INJECT: Codebase Investigation Depth section from SKILL-investigation.md verbatim here]

### Explorer 2 — Codebase optimizer

**Role:** Find concrete improvement opportunities — not new features, but work that improves the codebase without changing public behavior.

**Task:** Investigate these three axes. Return results in the **required output format** — do not return free-form prose.

1. **Simplification:** Abstractions with only one implementor? Intermediate types or mapping functions that could be inlined? Files mergeable without losing clarity?
2. **Performance:** O(n²) patterns, repeated file reads, unnecessary serialization in hot paths?
3. **Dead patterns:** TODO/FIXME/HACK markers. Phase references in code never cleaned up. Exports with no consumers.

**Required output format — High-value findings table:**

```
| # | Finding | Axis | File:line | Value | IS | IS justification | DR | DR justification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | [short name] | Simplification / Performance / Dead patterns | [file:line] | High | [1-5] | [one sentence] | [1-5] | [one sentence] |
```

**Output constraints:**

- Maximum 8 High-value rows. If you find more, rank by impact and return the top 8
- Each row must have a file:line citation — findings without citations are rejected
- Minimum 5 file:line citations across all rows — if you cannot cite 5, search more broadly
- Low-value findings go in a separate compact list (name + file:line only, no scores) — do not include them as phase component candidates
- Every IS and DR score must include a justification — a bare number will be rejected

[INJECT: Runtime Evidence Checklist section from SKILL-investigation.md verbatim here]

### Explorer 3 — External research and pain detection

**Role:** Find what the ecosystem is doing that AIC doesn't yet address, and — critically — identify where real users are experiencing pain that AIC could solve.

**Task:** Use `WebSearch` and `WebFetch` across two search strategies:

**Strategy A — Ecosystem landscape** (what exists):

- Recent MCP spec changes or upcoming capabilities AIC could leverage
- How adjacent tools handle context compilation, editor integration, or agent memory
- Emerging patterns in AI editor tooling (new hook events, new IDE APIs, new agent capabilities)

**Strategy B — Pain-directed search** (what hurts):

- Search for user complaints, frustrations, and workarounds in AI coding tools (GitHub issues, forum threads, blog rants). Example queries: "context window too small cursor", "AI coding tool forgets context", "MCP server memory problems 2026"
- Search for feature gaps users explicitly request — "I wish [tool] could...", "missing feature in [tool]"
- Search for migration patterns — users switching between tools and citing specific capability gaps
- Cross-reference findings against what AIC already does: the gap between user pain and AIC's current capabilities is the opportunity space

Use official documentation and primary sources for Strategy A. Community sources (GitHub issues, forums, developer blogs) are valid for Strategy B — but flag the source type.

Return results in the **required output format** — do not return free-form prose.

**Required output format — findings table:**

```
| # | Finding | Strategy | Source type | Impact class | URL | Search query | UI | UI justification | EU | EU justification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | [short name + one-line summary] | A / B | Official / Community | Additive / Interface-requiring / Breaking | [url] | [query used] | [1-5] | [one sentence] | [1-5] | [one sentence] |
```

**Impact class definitions:**

- **Additive** — new adapter, pipeline step, or feature; no existing interface changes needed
- **Interface-requiring** — requires adding methods to an existing interface or creating a new core interface
- **Breaking** — requires changing or removing methods on an existing interface; existing callers must be updated. For breaking-class findings, describe the interface affected, its current callers, and a proposed migration path. These must be proposed as separate "Interface Migration" phases, not standard Not started components.

**Output constraints:**

- Maximum 10 findings total (balance across Strategy A and B — at least 3 from each strategy)
- Each row must have a URL — findings without URLs are rejected
- Minimum 6 URLs across all rows — if you cannot find 6, broaden your search queries
- Every UI and EU score must include a justification — a bare number will be rejected
- At least 2 findings must be from Strategy B (pain-directed) — if your first search pass yields only Strategy A findings, run additional pain-directed queries before returning

### Explorer 4 — Specific document deep-read

**Spawn when:** Tier 3 is active (always), OR when Tier 2 yielded a research document with a Roadmap Mapping section.

**Document selection:** For Tier 3 — use the user-specified document. For Tier 2 — pass the document with the Roadmap Mapping section as the specified document. If multiple Tier 2 documents have Roadmap Mapping sections, spawn one Explorer 4 per document (each as a separate subagent with its own document).

**Prompt template:** Read `prompts/explorer-deep-read.md`. Substitute `{{DOCUMENT_PATH}}`, `{{SCOPE}}`, `{{BUDGET}}`, `{{OUTPUT_PATH}}`, `{{RUN_ID}}`. Verify no `{{` remains before dispatch.

---

Phase complete. Read `SKILL-phase-4-synthesize.md` and execute it immediately.
