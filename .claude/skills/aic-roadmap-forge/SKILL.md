---
name: aic-roadmap-forge
description: Generates new phases and roadmap entries for the progress file by synthesizing documentation, codebase analysis, and external research through adversarial multi-agent review.
---

# Roadmap Forge

## Purpose

Synthesize what the project _should_ become next. Reads documentation, analyzes the codebase, and researches the external ecosystem to propose new phases and component entries for `documentation/tasks/progress/aic-progress.md`.

The deliverable is a **draft phase proposal** — header, description, and component table rows in the exact format used by aic-progress.md — shown to the user for approval before any write.

**Announce at start:** "Using the roadmap-forge skill."

## Editors

- **Cursor:** Attach the skill with `@` or invoke via `/`. Every "Spawn N explorers" instruction means N calls to the **Task tool** with the specified `subagent_type`. You MUST use the Task tool — never do the work inline. **Verification:** After all explorers return, list the Task tool call handles for each explorer before proceeding to §4. If you cannot list distinct handles for each explorer, you did not spawn them — stop and restart §3 with actual Task tool calls.
- **Claude Code:** Invoke with `/aic-roadmap-forge`. Every "Spawn N explorers" instruction means N parallel subagent launches. You MUST spawn separate agents — never do the work inline. **Verification:** After all explorers return, list the subagent launch confirmations (task IDs or agent IDs) before proceeding to §4. If you cannot show N distinct agents were launched, stop and restart §3.

## Process Overview

| Step                      | Deliverable                                                                        | User gate?                  |
| ------------------------- | ---------------------------------------------------------------------------------- | --------------------------- |
| Input Routing             | Resolved input source (Tier 1/2/3)                                                 | No                          |
| §0 Strategic framing      | 3-5 direction hypotheses (before reading any file)                                 | No                          |
| §1 Current state          | Gap candidate list + phase inventory                                               | No                          |
| §2 Pre-spawn setup        | SKILL-investigation sections extracted                                             | No                          |
| §3 Parallel investigation | Explorer findings with evidence, disconfirmation, and value scores                 | No                          |
| §4 Synthesize             | Scored, ranked, grouped phase proposals (named, deduped, normalized, second-order) | No                          |
| §4i Self-review           | Mechanical consistency check before critic dispatch                                | No                          |
| §5 Adversarial review     | Feasibility critic + strategic fit critic + adjudication                           | No                          |
| §5b Convergence detection | Re-spawn if explorers over-agreed or no disconfirmation found                      | No                          |
| §6 Present                | Draft phases displayed to user                                                     | **Yes — wait for approval** |
| §7 Write                  | Approved phases inserted into aic-progress.md                                      | No (post-approval)          |

## When to Use

- User says "what should we build next", "generate next phase", "plan Phase 2", "what's left", "forge roadmap"
- After a release cut, when the progress file has no remaining `Not started` entries worth pursuing. Typically run immediately after `aic-release` completes to generate the next internal phase structure in `aic-progress.md`.
- When `aic-task-planner` is invoked but `aic-progress.md` has no `Not started` or `Pending` components — forge is the correct next step.
- When the user provides a research document and says "generate phases from this"
- When the user wants codebase optimization proposals added to the roadmap

## Input Routing

Before §1, resolve the input source using this three-tier chain:

**Tier 1 — Default (no user instruction):**
Read `documentation/project-plan.md` and `documentation/implementation-spec.md`. If these contain planned-but-untracked work (architecturally intended components not yet in any phase table), use them as the primary source.

**Tier 1 supplement — `documentation/bck/` (temporary):** If `documentation/bck/` exists, also read any files there. This directory holds the original pre-rewrite versions of documents (created during Phase VA documentation audits). After VA02/VA03 sanitize the main docs of planning language, the `bck/` originals are the richer source for architectural intent and untracked planned work. When a `bck/` version of a file contradicts the current version on planning content, the `bck/` version takes precedence for gap identification (the current version reflects public-facing rewrites, not removed intent). This directory is temporary — once Phase VA is complete and no longer relevant, stop checking it.

If Tier 1 yields candidates AND the user's prompt also asks for ecosystem perspective ("what else should we consider", "include external research", "what's the ecosystem doing"), run Tier 1 as primary AND spawn Explorer 3 in §3. Announce: "Input source: Tier 1 + external research supplement."

**Tier 2 — Fallback (Tier 1 yields nothing new):**
If project-plan + impl-spec are exhausted, read all files in both `documentation/future/` and `documentation/research/`.

Extract candidates from any **Roadmap Mapping** sections first (these are pre-analysed), then from raw document content. If a Roadmap Mapping section is shorter than the document's findings section, treat it as incomplete and extract candidates from the full body as well.

If both directories are absent or empty, announce: "Tier 2 is empty. Proceeding with codebase optimization (Explorer 2) and external research (Explorer 3) only. Provide a document to use as Tier 3 input if you want documentation-driven candidates." Wait for user confirmation before proceeding.

**Tier 3 — User override (explicit document provided):**
Use ONLY the specified document. Skip Tier 1 and Tier 2. If the document yields zero candidates after §1 gap identification, announce: "The provided document contains no untracked roadmap candidates. Confirm how to proceed: (a) extract optimization candidates from this document, (b) treat deferred recommendations as candidates even without explicit phase mapping, or (c) provide a different document."

**Announce the tier:** "Input source: [Tier 1 — project-plan + impl-spec / Tier 1 + external research supplement / Tier 2 — future/ / Tier 3 — [filename]]"

---

## §0. Strategic Framing

> **Anti-Pattern: "Just Read the Docs and List the Gaps"**
> The most common failure mode is skipping framing and going straight to §1. The agent reads `aic-progress.md`, reads `project-plan.md`, diffs them, and proposes whatever is missing. This produces correct but useless output — the proposals are obvious, unsurprising, and indistinguishable from what a human could produce in 60 seconds. Strategic framing exists to prevent this. If you are tempted to skip §0 because "the gaps are obvious," that is exactly when you need it most.

**Run before reading any file — including aic-progress.md.** This step exists to prevent the single greatest failure mode in auto mode: convergence on safe, obvious, predictable proposals that a developer could derive from a 60-second scan of the docs.

Generate **3-5 hypotheses** about where the project should go. Each hypothesis is a possible answer to: _"What should AIC become in the next 6-12 months?"_

**Hypothesis rules:**

- Generate before reading any file. Do not anchor on what is already tracked.
- Each hypothesis is falsifiable and direction-setting, not a list of features. **Specificity requirement:** each hypothesis must name (1) a specific subsystem or user-facing behavior, (2) a specific user pain that has observable symptoms, and (3) what success looks like in measurable terms. A hypothesis that could apply unchanged to any software project fails this bar. Failing example: "AIC should improve performance because it addresses developer wait-time pain." Passing example: "AIC's context compilation is bottlenecked by synchronous file reads in the guard phase — batched async reads would cut p95 compile time materially, which matters because slow hook responses degrade Cursor's auto-mode responsiveness."
- Cover different angles: growth/adoption, technical depth, ecosystem positioning, developer experience, and market differentiation. At least one hypothesis should feel non-obvious or surprising — specific enough that a reader thinks "that's an unexpected bet."
- One hypothesis MUST argue against the current direction by naming a specific component or phase to simplify, remove, or consolidate: "What if [specific component] adds more complexity than value because [specific reason]?" A generic "we should simplify something" hypothesis fails this rule.
- **Self-check before proceeding:** Read back each hypothesis. If any hypothesis would be confirmed by findings from any plausible investigation of this codebase, rewrite it — it is too vague to act as a constraint.

**Announce hypotheses** before proceeding: "Strategic hypotheses: [list]." These will be tested against the evidence throughout the investigation.

**Hypothesis-driven investigation:** In §3, each explorer uses the hypotheses as a lens. Explorer 1 checks: "which hypotheses are supported or refuted by the documentation gaps?" Explorer 2: "which hypotheses are supported or refuted by the codebase state?" Explorer 3: "which hypotheses are supported or refuted by the external ecosystem?"

---

## §1. Establish Current State

Read these files **before** spawning any explorer:

1. `documentation/tasks/progress/aic-progress.md` (main workspace only) — understand every phase, every component, every status. Build an inventory of what is already tracked (regardless of Done/Not started).
2. The resolved input source(s) from Input Routing above.

**Gap identification:** The core question is: _"What appears in the input source(s) as planned, desired, or architecturally implied — but is absent from every phase table in aic-progress.md?"_

List candidates before proceeding. For each candidate, note that "absent from phase tables" is necessary but not sufficient — a component may be tracked under a different name, or already fully implemented in code. Explorer 1 will verify both.

If there are zero candidates from the input source, ask the user whether to proceed with Tier 2 fallback (if currently on Tier 1) or to focus on Explorer 2 (codebase optimizations) + Explorer 3 (external research) only.

---

## §2. Pre-Spawn Setup (mandatory before §3)

Before spawning any explorer, read `.claude/skills/shared/SKILL-investigation.md` and extract:

- The **Codebase Investigation Depth** section — paste verbatim into Explorer 1's prompt.
- The **Runtime Evidence Checklist** section — paste verbatim into Explorer 2's prompt.

Do NOT instruct subagents to read this file themselves. The parent agent reads it once and injects the content. This matches the protocol stated in the shared file itself.

**Fallback:** If `.claude/skills/shared/SKILL-investigation.md` does not exist or the named sections cannot be found, announce: "SKILL-investigation.md not found — proceeding without section injection. Explorer investigation depth may be reduced." Continue without blocking, but note this in the §6 presentation.

---

## §3. Parallel Investigation

Spawn 3–4 explorer subagents in parallel. Use `fast` model for all explorers.

> **Anti-Pattern: "I'll Just Do It Myself"**
> The second most common failure mode: the parent agent skips spawning subagents and writes explorer findings inline. The output looks correct but is worthless — a single agent cannot hold contradictory positions, cannot independently challenge its own conclusions, and converges on its first hypothesis. Every time this has happened in testing, the proposals were bland, obvious, and missing the non-obvious candidates that only independent investigation surfaces. If you are tempted to skip subagent dispatch because "it's faster" or "I already know what they'd find," that is exactly when you need independent agents most.

**Inline collapse is prohibited.** Do not produce explorer findings by reasoning through the explorer's task yourself and labeling the output "Explorer N findings." The quality of this skill's output depends entirely on independent context windows. If you find yourself writing "Explorer 1 findings:" without having used the Task tool, stop and use it.

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

**Re-spawn cap and escalation (the "3 failures = question the task" rule):**

An explorer can be re-spawned for three distinct reasons: (1) validation failure, (2) convergence detection (§5b), (3) `NEEDS_CONTEXT` status. Track total re-spawns per explorer across all reasons.

- **1st re-spawn:** Normal. Provide corrective guidance or missing context.
- **2nd re-spawn:** Acceptable but annotate: "Explorer [N] required 2 re-spawns — output may be lower quality."
- **3rd re-spawn: STOP.** Do not re-spawn a third time. The problem is the task scope, not the model. Escalate:
  - If the explorer's task can be split into two narrower subtasks, split and dispatch two new agents
  - If splitting is not feasible, accept available output with degradation warning: "Explorer [N] failed to produce quality findings after 2 re-spawns — findings from this explorer should be weighted lower in the user's assessment"
  - If no usable output exists from any attempt, drop this explorer entirely and note the gap in §6: "Explorer [N] could not complete its investigation. Proposals may underrepresent [scope area]."

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

**Task:** Read the specified document in full. Extract every roadmap candidate, deferred recommendation, and open question. Map each to the closest existing phase category in aic-progress.md. Verify feasibility by cross-checking the codebase: does the infrastructure exist to support this? Return results in the **required output format**.

**Required output format:**

```
| # | Candidate | Type | Closest phase | Feasibility | Codebase evidence (file:line) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | [name] | Roadmap candidate / Deferred recommendation / Open question | [phase name or "New phase needed"] | Ready / Partial / Missing infrastructure | [file:line or "None found"] | [one sentence] |
```

**Output constraints:**

- Extract all candidates — no maximum cap (this explorer reads one document thoroughly)
- Each feasibility assessment must cite at least one codebase file:line showing supporting or missing infrastructure
- Minimum 4 file:line citations across all rows

---

## §4. Synthesize Phase Proposals

### 4a. Evidence density gate

Before merging: count evidence citations (file:line or URL) across all explorer findings. If fewer than 1 citation per finding on average, re-spawn the weakest explorer with a more specific prompt targeting the uncited findings. Do not proceed to synthesis with hallucinated candidates.

### 4b. Deduplify

If two candidates from different explorers share more than 60% of their name words or describe the same implementation surface, merge them into one component, combining the best description and citing both explorers as sources.

### 4c. Name normalization

Before grouping, scan all candidate names against the convention: (1) title-cased, (2) identifies a specific implementation surface, (3) noun-form naming the thing (not "Improve X" — use "X Optimization" or "X Enforcement"). Rewrite violating names. Document rewrites in a note included in the critic's input at §5.

### 4d. Value score aggregation

Before grouping, compute the **composite value score** for each deduplicated candidate.

**Collecting scores:** Each explorer scores the dimensions in its mandate (see Explorer 1-3 task sections and the Value Scoring Rubric). A candidate may have scores from multiple explorers — a documentation gap (Explorer 1) that also appeared in external research (Explorer 3) carries both Unblock Potential and User Impact/Ecosystem Urgency scores.

**Missing dimensions:** If a candidate was scored by only one explorer, the unscored dimensions default to 2 (conservative neutral). The parent agent does not fabricate scores for dimensions no explorer investigated.

**Composite formula:**

`Value = (UI × 3 + UP × 2 + SA × 2 + EU × 1.5 + DR × 1) / (IS × 1.5)`

Where: UI = User Impact, UP = Unblock Potential, SA = Strategic Alignment (scored by Critic B in §5, defaults to 2 until then), EU = Ecosystem Urgency, DR = Debt Reduction, IS = Implementation Surface. Higher composite = higher priority.

**Present scores:** Include a ranked candidate table in the handoff to §5 critics:

| Candidate | UI    | UP    | SA    | EU    | DR    | IS    | Composite | Source     |
| --------- | ----- | ----- | ----- | ----- | ----- | ----- | --------- | ---------- |
| [name]    | [1-5] | [1-5] | [1-5] | [1-5] | [1-5] | [1-5] | [n.n]     | Explorer N |

Sort by composite descending. This table is advisory input to critics and to the §6 presentation — it does not mechanically determine inclusion or exclusion.

### 4e. Group into phases

**Grouping heuristics:**

- Candidates sharing an architectural layer belong together (e.g., all storage improvements → one phase)
- Candidates with hard dependencies should be ordered within a phase (note in Deps column)
- Codebase optimizations from Explorer 2 can form a standalone "Maintenance" phase or fold into a thematic phase
- Breaking-class findings from Explorer 3 get their own "Interface Migration" phase — never mixed with additive work
- External research findings requiring new interfaces go into a later phase than purely additive findings

**Size limits:** If a single heuristic group produces more than 8 components, split by architectural sub-layer. Ask the user if the split is desirable before finalizing. Never propose a phase with more than 12 components — it is a backlog, not a phase.

**Conflict resolution:** If two explorers propose incompatible structures for the same candidates, prefer the structure that minimizes cross-phase dependencies. If still ambiguous, create more phases rather than larger phases — it is easier to merge phases than to split them.

**For each proposed phase, draft using the schema of the adjacent phase in aic-progress.md** (read the phase immediately preceding the intended insertion point to determine whether the table uses `Package` or `Skill` column):

```
### Phase [letter/subletter or version] — [Short title]

[2-3 sentence description. What this phase delivers. Why it matters now.]

| Component | Status | Package | Deps | Description |
| --- | --- | --- | --- | --- |
| [Component Name] | Not started | [package path] | [deps or —] | [one sentence, imperative] |
| [Doc update task] | Not started | documentation/ | [component it follows] | Update [doc name] for [feature] |
```

**Priority ordering across phases (composite score primary, heuristics secondary):**

Use the §4d composite value scores as the **primary** ordering signal. Within equal-score tiers, apply these tiebreakers:

1. **Unblocks other work** — infrastructure before features (high UP score)
2. **Highest user impact** — end-user-visible before internal refactors (high UI score)
3. **Lowest risk** — additive before interface-requiring; interface-requiring before breaking

### 4f. Documentation impact analysis

For each proposed code component, identify which documentation files will need updating when that component ships. Classify by impact type:

- **`README.md`** — feature is end-user visible (new capability, changed command, new config field)
- **`documentation/best-practices.md`** — feature changes recommended usage patterns
- **`documentation/security.md`** — feature changes security properties or guardrail behavior
- **`documentation/installation.md`** — feature changes setup, install steps, or prerequisites
- **`documentation/architecture.md`** — feature changes the core pipeline or integration layer model
- **`documentation/implementation-spec.md`** — feature changes pipeline behavior, step contracts, or data flow
- **`documentation/technical/[file].md`** — feature touches a technical subsystem with its own reference doc (cursor integration layer, Claude Code integration layer, JSONL caches, etc.)
- **`documentation/contributor-agent-skills.md`** — feature ships or changes a skill

For each identified impact, add a companion row to the phase table:

- Component name: `[Doc name] Update for [feature]` (e.g., "README Update for Context Mode Selector")
- Status: `Not started`
- Package: `documentation/` (or `documentation/technical/` for technical docs)
- Deps: the code component it follows — documentation updates happen after the feature stabilizes. For multiple deps, use a comma-separated list: `CompA, CompB`. Do not abbreviate with `+N` notation.
- Description: one sentence on what changes (e.g., "Add context-mode selector usage to best-practices guide")

**Consolidation rule:** If multiple code components affect the **same document**, consolidate into one documentation update task with all code components listed in Deps. Do NOT consolidate documentation update tasks for distinct documents — each document that needs updating gets its own row regardless of whether the same code component triggers them.

**Scope exclusion:** `documentation/notes/` contains internal strategy documents and is not a documentation impact target — no companion rows needed for notes/ files.

### 4g. Task detail generation

After the summary table for each phase, generate a `#### Task details` section. Task details serve two audiences: human developers scoping work before picking it up, and the `aic-task-executor` skill when invoked directly. They are NOT consumed by `aic-task-planner` — the planner reads only component table rows (status + deps) and derives its own steps through Pass 1 exploration. Writing task details does not make the planner more accurate; it makes human review and direct execution faster.

For each component in the phase table — **including the documentation update rows produced in §4f** — write a task detail entry following this format exactly:

```
#### Task details

[Required when the phase has both code and documentation tasks: "Code tasks first; documentation tasks
after all code components in their Deps are Done." Omit only for phases with exclusively code tasks
or exclusively documentation tasks.]

**[PhaseCode]NN: [Component name]**

Skill: `[aic-task-planner or aic-documentation-writer]` — [mode: write, modify, or audit].

1. [Specific, executable step with file paths, interface names, and method signatures where known]
2. [Specific step with embedded verification — e.g., "Verify: grep for X returns no matches"]
3. [...]
N. Verification: [what "done" looks like — specific test file passes, lint clean, behavior observable in show aic status]

Why: [one sentence on ordering rationale or dependency — why this before/after that]
```

**aic-documentation-writer mode names:** Use exactly `write` (new section), `modify` (update existing text), or `audit` (verify accuracy). Do not use "targeted rewrite," "update," or any other label — these are not valid modes and will cause the documentation writer to misclassify the task.

**Phase code convention:** Three cases:

- Top-level single-letter phase (`Phase W`): `W01`, `W02`
- Sub-phase (`Phase WA`, `Phase WB`): `WA01`, `WA02` — matching the `VA01`, `VA02` precedent
- Version-prefixed phase (`Phase 2.0`): `2001`, `2002` — concatenate version digits (no dot, no hyphen) then zero-padded counter

**Task detail quality standards for code tasks:**

- Steps are specific enough to execute without reading other documents. If a step says "add interface method" it must name the interface file and method signature — these must come from Explorer 1's evidence, not inferred. If Explorer 1 did not return the interface file path, the step must use the escape hatch.
- Each step includes its own embedded verification where non-trivial.
- The final step is always a verification step: specific test file passes, lint clean, behavior observable.
- The "Why" note explains ordering: "after [X] because [reason]" or "before [Y] to unblock it."
- For code tasks: steps reference the composition root, the interface to implement, and the test file to write.

**Task detail quality standards for documentation tasks:**
Documentation tasks produced by forge are at **intent level** — forge never reads the target documentation files, so it cannot identify specific sections or line numbers. Steps for documentation tasks should state the intent clearly (e.g., "Update README.md to document the new `contextMode` config field") without fabricating section numbers or content structure. The `aic-documentation-writer` skill will perform its own Phase 1 deep analysis to identify the specific sections. Mark documentation task steps with: "Documentation-writer Phase 1 will identify specific sections and verify cross-doc consistency."

### 4h. Second-order implications

After task details are drafted, run one pass to answer: **"What does shipping this phase unlock?"** For each proposed phase:

1. **Dependency unlock:** Does this phase unblock any currently-blocked planned work? If yes, note it in the presentation as "Unlocks: [downstream work]."
2. **Interface leverage:** Does any new interface introduced here create a composition point that multiple future features could reuse? If yes, mark the interface component as "High leverage — future extension point."
3. **User-visible compounding:** Do two or more components in this phase combine to produce a user-visible improvement greater than either alone? If yes, note the combination explicitly.
4. **Risk surface:** Does shipping this phase introduce a new class of failure (new external dependency, new database write path, new security boundary)? If yes, annotate the highest-risk component: "Risk surface: [description]."

These annotations appear in the §6 presentation but are NOT added to the aic-progress.md table rows — they are advisory context for the user's approval decision.

---

**Escape hatch minimum specificity rule:** When implementation details are uncertain (interface signatures unknown, dependency graph unclear), write the step as far as known and add: "Planner verification required: [what must be confirmed before executing this step]." However, each step must contain at least one concrete, non-speculative element before the escape hatch annotation. Concrete means: (1) a specific `.ts` file path (not a directory — `shared/src/pipeline/` does not satisfy this; `shared/src/pipeline/context-compiler.ts` does), (2) a named interface from `shared/src/core/interfaces/` by name, (3) a runnable command with its flags, or (4) a grep pattern specific enough to return fewer than 20 results in this codebase. A step that says "add a pipeline step in `shared/src/pipeline/`" is not more specific than the component table row and is not acceptable. A step that contains nothing but a "Planner verification required" annotation is not acceptable. If a task detail genuinely cannot be written beyond what is in the component table row, omit the task detail entirely and annotate the table row Description: "(Task detail deferred — insufficient codebase evidence from explorers. Planner will derive steps during Pass 1.)"

---

## §4i. Synthesis Self-Review

**Run before dispatching critics.** The parent agent reviews its own synthesis output to catch obvious issues that would waste critic tokens. This is not a substitute for §5 adversarial review — it catches mechanical problems, not strategic or feasibility issues.

**Checklist (run inline, do not spawn a subagent):**

1. **Score consistency:** Does any candidate have a UP score of 5 but zero tracked dependents? Does any candidate score UI:5 with no user pain evidence from Explorer 3? Flag and adjust.
2. **Naming collision:** Do any two candidates in the same phase share 3+ words in their name? If yes, they may be duplicates that §4b missed.
3. **Grouping self-check:** Does any phase violate the skill's own heuristics — breaking-class mixed with additive, more than 12 components, cross-layer mixing?
4. **Documentation impact completeness:** For each code component, is the corresponding documentation update row present? Quick count: code components vs doc update rows. If the ratio is below 0.5 (fewer than 1 doc update per 2 code components), a documentation impact was likely missed.
5. **Score inflation check:** Run the §4d inflation detection now. If more than 40% of candidates have composite above 8.0, apply forced distribution correction before critics see inflated numbers.

**Fix issues inline.** If all checks pass, announce: "Self-review passed — proceeding to adversarial review." If issues were found, announce: "Self-review found [N] issues, corrected inline — proceeding to adversarial review."

---

## §5. Adversarial Review

**Always run — no skip condition.**

Spawn **2 critic subagents in parallel** (`fast` model for both). Each critic has a distinct and non-overlapping mandate.

**Inline criticism is prohibited.** Do not reason through Critic A's or Critic B's checklists yourself and label the output "Critic A findings." The adversarial value of critic review depends on the critic having a different context than the proposal author — it evaluates only the output, not the synthesis reasoning that produced it. An inline critic has seen all of that reasoning and cannot genuinely challenge it. If you find yourself writing "Critic A findings:" without having used the Task tool, stop and spawn a real critic.

---

### Critic A — Feasibility & Implementation

Include verbatim in Critic A's prompt:

> "You are an independent feasibility critic. Your only job is to find implementation flaws, challenge technical assumptions, and propose scoping reductions. If you agree with all proposals without challenge, your review will be rejected and you will be re-spawned. A genuine review proposes at least one removal and one scope reduction."

Critic A receives:

- The original input source(s) summary
- The draft phase proposals from §4 (including name normalization notes)
- The full aic-progress.md phase inventory

Critic A's tasks:

1. **Duplication check:** Does any proposed component duplicate or significantly overlap an existing tracked entry (even a Done one)?
2. **Feasibility challenge:** For each proposed component, challenge whether the codebase supports it. **You MUST search the codebase** — read relevant source files and report which files you read and what you found. A feasibility challenge without a file:line citation is rated "Unevaluated" and given lower weight.
3. **Priority challenge:** Is the ordering defensible? Would a different order deliver more value faster?
4. **Scope challenge:** Are any components too vague to be actionable? A component must be executable by `aic-task-planner` — if a human couldn't scope it in one session, it is too broad.
5. **External research validity:** For Explorer 3 findings — are cited sources credible? Is the relevance to AIC genuine or speculative?
6. **Task detail specificity:** For each task detail, verify that at least 50% of steps contain a concrete anchor — a file path, an interface name, a command, or a search pattern — rather than abstract descriptions or pure escape hatch annotations. Flag any task detail where the majority of steps are escape hatch annotations. A task detail that is entirely escape hatches is not a task detail — it is a deferred scope note and should be marked as such.
7. **Documentation impact completeness:** For each proposed code component, verify that all documentation files describing the affected subsystem are included in the documentation update rows. Specifically: does the proposal affect the core pipeline? If yes, is `documentation/implementation-spec.md` in the doc impact rows? Does it affect the architecture model? If yes, is `documentation/architecture.md` included?

**Critic A quality check:** Re-spawn with the stricter prompt if ANY of the following apply:

- Critic A accepts all proposals without removing or reducing scope of anything.
- Every challenge is scope-reduction only with no recommended removals.
- No challenge cites a file:line — all challenges are treated as "Unevaluated."
- The number of challenged components is fewer than 25% of proposed components.

Re-spawn prompt: "Your previous review was too agreeable. For each component, describe the strongest reason NOT to include it in this phase. You MUST recommend at least one complete removal (not a scope reduction) and at least one scope reduction. Both must cite file:line evidence from the codebase."

---

### Critic B — Strategic Fit

Include verbatim in Critic B's prompt:

> "You are an independent strategic critic. Your only job is to challenge whether these proposals are the right things to build at all — not whether they are technically feasible, but whether they serve AIC's purpose and its users. If you agree with all proposals without challenge, your review will be rejected and you will be re-spawned. A genuine review identifies at least one proposal that should be dropped or deferred on strategic grounds."

Critic B receives:

- The draft phase proposals from §4
- The §4d ranked candidate table with composite value scores
- The §0 strategic hypotheses and which were supported/refuted by explorer evidence
- The full aic-progress.md phase inventory
- The README.md "Why developers use AIC" and "What it helps with" sections (Critic B reads these to ground strategy in stated user pain)

Critic B's tasks:

1. **AIC positioning alignment:** Does each proposal advance AIC's core purpose (deterministic context compilation for AI coding tools)? Reject proposals that expand AIC's scope beyond this without strong user pain evidence.
2. **Real user pain evidence:** For each proposal, challenge whether it addresses a real, documented user pain. Does any explorer finding cite actual user pain (issue tracker, user feedback, observable behavior)? A technically interesting proposal with no user pain evidence should be flagged as "speculation risk."
3. **Opportunity cost:** Given finite development capacity, does including this phase crowd out higher-value work? If a proposal is lower value than what is already Not started in aic-progress.md, recommend deferral.
4. **Simpler alternative test:** For each proposal, ask: "Is there a simpler intervention that solves 80% of the same problem in 20% of the work?" If yes, propose the simpler alternative as a replacement.
5. **Hypothesis alignment:** Cross-reference each proposal against the §0 strategic hypotheses. Proposals that are not supported by any hypothesis AND were not identified by disconfirmation evidence should be challenged as hypothesis-free additions — either reject or require the forge to state which hypothesis they serve.
6. **Coherence check:** Do the proposals as a set tell a coherent story about where AIC is going? Or is it a grab-bag of independent improvements? If the latter, recommend a coherence edit — removing the least coherent proposal to strengthen the narrative.
7. **Value score challenge + Strategic Alignment scoring:** Review the §4d composite scores. For each candidate, assign a **Strategic Alignment (1-5)** score — this is Critic B's exclusive dimension. Challenge any composite score that seems inflated: if a candidate ranks top-3 by composite but Critic B rates its Strategic Alignment at 1-2, flag the discrepancy. Challenge any User Impact score above 3 that lacks cited user pain evidence. Return updated SA scores — these replace the default-2 in the final composite recalculation after §5.

**Critic B quality check:** Critic B's output is acceptable only if ALL of the following are true:

1. At least one proposal is recommended for **removal or deferral** — not just flagged with a caveat. "Speculation risk: flag for monitoring" is not a removal recommendation.
2. At least one "simpler alternative test" finding proposes a concrete replacement by name, not just notes the risk.
3. The hypothesis cross-reference explicitly names which §0 hypothesis supports which proposal — if all proposals map to the same hypothesis, challenge that mapping. All proposals cannot be supported by a single hypothesis.

If Critic B fails any of these criteria, re-spawn with: "Your previous review was too conservative. You are a product manager who must cut scope by 30%. You MUST recommend removal or deferral of at least one full component (not a doc update row), name it explicitly, and propose what to do instead: defer to a later phase, replace with a simpler alternative, or drop entirely. Caveats do not count."

---

### Adjudication

**Before adjudicating:** Verify both Critic A and Critic B returned output. If either is missing (silent subagent failure), re-spawn the missing critic before proceeding. Do not adjudicate with one critic's input only.

**Post-critic structured report (required before adjudicating):**

- "Critic A: proposed [N] removals, [M] scope reductions, [K] caveats."
- "Critic B: proposed [N] removals/deferrals, [M] simpler alternatives, [K] hypothesis misalignments. SA scores: [range]. Score challenges: [N]."

If Critic A removals = 0 AND scope reductions = 0 simultaneously, trigger the Critic A quality check re-spawn regardless of other outputs.

After both critics return, adjudicate each challenge. Critic A and Critic B findings are independent — a component challenged by both critics requires stronger justification to retain.

Evaluate each challenge:

- **Valid with codebase evidence (Critic A) or strategic argument (Critic B):** Incorporate — remove, split, reorder, or add dependency
- **Valid but minor:** Add a caveat in the Description column
- **Reasoning-only (no file:line for A / no user pain anchor for B):** Add as a caveat only; do not remove a component based on unevidenced reasoning alone
- **Invalid:** Reject with explanation; keep the proposal unchanged

Record adjudication results: "Incorporated: [N]. Rejected: [M]. Summary: [one line]." This feeds into the §6 presentation.

**Post-adjudication score recalculation:** Replace the default SA=2 values in the §4d composite table with Critic B's actual Strategic Alignment scores. Recalculate composites. If the recalculated ordering differs from the pre-critic ordering, note which candidates moved and why — this feeds the "Score disputes resolved" line in §6.

---

## §5b. Convergence Detection

Before presenting to the user, run this mechanical check to catch the most common auto-mode failure: all agents converged on the same safe subset of obvious candidates.

**Convergence is flagged if ANY of the following are true:**

1. All explorer findings overlap by > 70% — every explorer identified the same top candidates with no unique finds.
2. Zero disconfirming evidence was reported by Explorer 1 for any candidate — no candidate was challenged as "should NOT be built."
3. All proposals are additive (no interface-requiring or breaking candidates) AND the project has been active for more than 6 months — a mature project should surface some interface evolution work.
4. No hypothesis from §0 was refuted by any explorer — if all hypotheses were confirmed, the investigation was not thorough enough to falsify anything.
5. Critic B found no strategic misalignments — if Critic B raised zero challenges, re-run Critic B with stricter framing before proceeding. **Note:** If the §5 Critic B quality check already triggered a re-spawn and that re-spawn also found no misalignments, skip condition 5 and add a convergence warning to the §6 presentation rather than spawning a third time.
6. No explorer finding contradicts or complicates a finding from another explorer — if all findings are mutually compatible and reinforcing with no tension, genuine independent investigation almost certainly did not occur. Before proceeding, identify at least one cross-explorer tension point (a case where Explorer A's finding creates a question or caveat for Explorer B's conclusion). If none can be identified, flag convergence and note it in §6.

**If convergence is flagged:**

- Announce: "Convergence detected: [which condition triggered]. Re-spawning Explorer [most relevant] with disconfirmation focus."
- Re-spawn the flagged explorer with explicit instruction: "Your previous findings overlapped too heavily with other explorers. Specifically investigate: [what was missed]. Your goal is to find DIFFERENT candidates — not confirm existing ones."
- After re-spawn, merge new unique findings into the proposal. If the re-spawn still returns no unique findings, proceed but note in the §6 presentation: "Convergence warning: explorers found high agreement — proposals may underrepresent non-obvious candidates. User may want to provide a specific document (Tier 3) for a more targeted analysis."

**If no convergence is flagged:** proceed to §6 without note.

---

## §6. Present Draft + User Approval Gate

Present the refined proposal:

> **Roadmap Forge complete.** Input source: [tier]. Explorers: [count]. Proposals: [N phases, M components].
>
> **Value scorecard** (top 5 by composite, post-critic SA scores applied):
>
> | #   | Candidate | Composite | UI    | UP    | SA    | EU    | DR    | IS    |
> | --- | --------- | --------- | ----- | ----- | ----- | ----- | ----- | ----- |
> | 1   | [name]    | [n.n]     | [1-5] | [1-5] | [1-5] | [1-5] | [1-5] | [1-5] |
>
> **Proposed phases:** [list phase names + component counts]
>
> **Priority rationale:** [2-3 sentences referencing composite scores — "Phase X leads because its components average composite Y, driven by high Unblock Potential and User Impact"]
>
> **Adversarial challenges addressed:** [N incorporated, M rejected — one line summary]
>
> **Score disputes resolved:** [any cases where Critic B's SA score changed the ordering]
>
> **From external research:** [key finding and impact, or "None — all proposals from internal sources"]

**Large proposal handling:** If the proposal exceeds 3 phases or 15 total components, present phases one at a time. After each: "Approve, request changes, or reject? (Type `next` to move to the next phase without deciding now.)" Do not present all phases simultaneously when the total exceeds this threshold.

Otherwise, display all proposed phases in full (header + description + table).

**Wait for user approval before writing.** The user may:

- **Approve all phases** → proceed to §7
- **Approve specific phases** → queue approved phases for §7; for unapproved phases, explicitly announce: "Phase [X] was not approved and has been discarded. Invoke this skill again to revisit it."
- **Request changes** → revise inline, re-present the changed phases only. Wait for explicit re-approval before writing. Do not write until the user confirms the revised version. If a revision materially changes scope (adds components, reintroduces a critic-flagged component, changes phase ordering), re-run §5 for the changed sections only. Cap revision cycles at 3.
- **Mixed (approve some, change others)** → apply changes, re-present only changed phases, queue already-approved phases. Write all together only after changed phases receive final approval.
- **Reject** → do not write anything

**Context window note:** If the session has been active for more than 8 tool calls and the proposal exceeds 2,000 tokens, save the draft proposal to `documentation/tasks/forge-draft-[YYYY-MM-DD].md` before presenting it in chat. Note the file path at the top of the presentation so the user can recover it after compaction.

---

## §7. Write to aic-progress.md

**Main workspace only.** Never write to a worktree — `aic-progress.md` is gitignored and must live in the main workspace.

**Pre-write checks (run before any edit):**

1. **Freshness check:** Re-read `aic-progress.md` now. If the file has changed since §1 (compare header metrics or line count), announce: "aic-progress.md has changed since this session began. Proceeding with a fresh read." Use the current file state for all positional insertions and metric recounts.

2. **Collision check:** For each approved phase, search the file for any existing `### Phase [letter]` or `### Phase [letter][letter]` header matching the proposed name. If a collision is detected, halt and report: "Phase [X] already exists in the file. Confirm the intended phase letter or an alternative before writing."

**For each approved phase:**

1. **Determine insertion point:** Insert after the last existing phase in the same version group. If a new version group, insert immediately before the `## Daily Log` section — never at the literal end of file.

2. **Determine table schema:** Read the phase immediately preceding the insertion point. Use the same column names. If the new phase is documentation-focused (no source files), use a `Skill` column instead of `Package` (matching the Phase VA pattern).

3. **Update header metrics:** Following the update-progress recounting algorithm — recount `Done` rows per named header field (`**Phase 1.0:**`, `**Phase 1.5:**`), scoped to that version group only. New `Not started` entries increase M but not N. Also update `**Current phase:**` if the active phase letter has advanced. Update `**Status:**` with a one-sentence description of current progress state. Do NOT touch `**Version target:**` or `**Previous:**` unless explicitly asked. If a new version group is introduced, add a new `**Phase X.Y:** 0/M done` header field above the new section.

4. **Daily log entry:** After inserting phase sections, add a daily log entry following the format used by adjacent entries: today's date, action taken ("Forge: Added Phase [X] — [title], [N] components"), updated header metric.

**After writing:** Read back and show the user the updated header block and newly inserted phase sections.

Do not change any existing phase content, table structure, or other daily log entries. Do not stage or commit this file.

---

## Conventions

- Phase names: single letter or letter+subletter (`Phase V`, `Phase VA`, `Phase VB`) for sub-phases within a version group; version-prefixed (`Phase 2.0 — [title]`) for new version groups. Use the next available letter (W, X, ...) for peer phases at the same level. Use letter+A, letter+B for sub-phases subordinate to an existing phase.
- Component names are title-cased, specific, and actionable (bad: "Improve performance"; good: "Compilation cache TTL enforcement")
- Description column: one sentence, imperative, technical (matches the style of adjacent entries)
- Deps column: use `—` for no deps; component name for intra-phase deps; phase letter for cross-phase deps
- Package column: shortest accurate path (`mcp/`, `shared/src/adapters/`, `./`)
- This skill is the only entry point for adding new phases to aic-progress.md — status updates on existing entries go through `aic-update-progress`
- After a maintainer approves and ships a new skill (including this one), add an entry to `documentation/contributor-agent-skills.md` with Type: Internal and a one-sentence role description matching the skill's Purpose section

---

## Value Scoring Rubric

Each explorer scores candidates on the dimensions in its mandate. Scores use a **1-5 integer scale** with forced distribution to prevent clustering.

### Dimensions

| Dimension              | Code | Definition                                      | Scored by                        |
| ---------------------- | ---- | ----------------------------------------------- | -------------------------------- |
| User Impact            | UI   | Direct effect on end-user experience            | Explorer 3, Critic B (challenge) |
| Unblock Potential      | UP   | Downstream work this enables                    | Explorer 1                       |
| Strategic Alignment    | SA   | Fit with AIC's core thesis                      | Critic B (exclusive)             |
| Ecosystem Urgency      | EU   | External competitive pressure                   | Explorer 3                       |
| Debt Reduction         | DR   | Maintenance or simplification improvement       | Explorer 2                       |
| Implementation Surface | IS   | Effort and risk (higher = harder — denominator) | Explorer 2, Critic A (challenge) |

### Composite Formula

`Value = (UI × 3 + UP × 2 + SA × 2 + EU × 1.5 + DR × 1) / (IS × 1.5)`

Higher composite = higher priority. User Impact is weighted highest because features users need drive adoption. Implementation Surface is in the denominator because harder work must clear a higher value bar.

### Score Justification (mandatory)

Every score must include a one-line justification in the explorer's output table. The justification names the specific evidence that produced the score. Examples:

- "UP: 4 — unblocks memory extension (item 1) and editor memory (item 2) in the roadmap mapping"
- "UI: 2 — improves internal code quality but no user-visible behavior change"
- "EU: 5 — Cursor removed cross-session memory in v0.48; users actively requesting alternatives (GitHub issue #1234)"
- "IS: 3 — requires new adapter + interface + test file, no migration"

A bare number (e.g., "UP: 4") without justification is treated as an invalid score. The parent agent will set unjustified scores to the conservative default of 2.

### Forced Distribution (per explorer, per dimension)

Each explorer must enforce across all candidates they score on a given dimension:

- At most 2 scores of 5
- At least 1 score of 1 or 2 when scoring 4+ candidates
- No dimension where all candidates score 3 or 4 — if this occurs, re-rank relative to each other

### Anchor Examples

| Score | UI                                                            | UP                                                | EU                                                    | IS                                                                       |
| ----- | ------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| **5** | Users are leaving tools without this capability               | Unblocks 3+ tracked components or an entire phase | Competitors shipped it; users expect it within months | New pipeline step + storage migration + 3+ interfaces + composition root |
| **3** | Improves workflow for a subset of users in specific scenarios | Unblocks 1 tracked component                      | Industry trend, no direct competitive pressure yet    | New adapter + interface + tests                                          |
| **1** | No user-visible change; internal-only                         | Standalone; nothing depends on it                 | Academic/theoretical; no production adoption          | Single file change, config addition                                      |

### Score Inflation Detection

If the §4d aggregated scores show **more than 40% of candidates with composite above 8.0**, scores are inflated. Re-examine the highest-scored dimension across all candidates and apply forced distribution more strictly — at least one candidate must score 1 on that dimension.

---

## Auto-Mode Resilience

This section documents the structural mechanisms that make this skill produce higher-quality output than a single model pass — even when running in Cursor Agent auto mode where there is no human mid-loop.

**Why a single Opus pass is insufficient for roadmap generation:**
A single model pass — even a capable one — converges on the obvious: the most prominent documentation gaps, the most salient codebase complaints, the most cited external trends. It also has no mechanism to challenge itself. It confirms hypotheses rather than falsifying them, accepts proposals rather than removing them, and cannot hold two contradictory perspectives simultaneously.

**Why fast-model subagents need structural guardrails:**
Explorer and critic subagents run with `fast` model for cost and latency. Fast models follow structured instructions well but are weaker at open-ended investigation, disconfirmation reasoning, and self-calibration. The skill compensates by making every output expectation explicit (templates, citation floors, justification requirements) and validating outputs mechanically before accepting them. The parent agent (running at whatever model the user selected — typically a more capable model) handles synthesis, adjudication, and presentation where reasoning depth matters most.

**How this skill compensates structurally:**

| Failure mode                                      | Structural compensation                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Convergence on safe/obvious candidates            | §0 generates falsifiable hypotheses BEFORE reading files; convergence detection in §5b re-spawns if all explorers agree                                                         |
| Confirmation bias in investigation                | Disconfirmation mandate in Explorer 1 — must report evidence AGAINST each candidate; mandatory "Evidence against" column in output template                                     |
| Missing non-obvious candidates                    | Explorer 3 pain-directed search (Strategy B) + ecosystem landscape (Strategy A); Explorer 4 for deep document reads; strategy balance check enforces minimum findings from each |
| Technically feasible but strategically wrong      | Critic B strategic fit check anchored to user pain and AIC positioning; SA scoring is Critic B's exclusive dimension                                                            |
| Implementation blind spots                        | Critic A feasibility check requires file:line citations — unevidenced challenges are downweighted                                                                               |
| Shallow task detail                               | Evidence density gate (§4a) and escape hatch floor (§4g) ensure task steps have concrete anchors                                                                                |
| Short-term thinking                               | §4h second-order implications — explicitly asks "what does shipping this unlock?"                                                                                               |
| Hallucinated codebase state                       | Runtime Evidence Checklist injected into Explorer 2; Critic A must read source files                                                                                            |
| Score inflation (everything rated 3-4)            | Forced distribution per explorer per dimension; inflation detection gate in §4d triggers re-ranking; Critic B challenges UI scores lacking pain evidence                        |
| Qualitative-only prioritization                   | Composite value score replaces gut-feel ordering; formula weights are explicit and auditable; critics can challenge individual dimension scores                                 |
| Fast model returns free-form prose                | Required table output format per explorer; parent validation rejects prose and re-spawns with format instruction                                                                |
| Fast model skips citations                        | Per-explorer citation floor (Explorer 1: 3, Explorer 2: 5, Explorer 3: 6 URLs, Explorer 4: 4); parent validation re-spawns below floor                                          |
| Fast model assigns unjustified scores             | Every score needs a one-line justification; parent validation sets unjustified scores to default 2 (conservative penalty)                                                       |
| Fast model ignores disconfirmation                | Explorer 1 "Evidence against" column cannot be blank; parent validation re-spawns if any cell is empty; convergence detection in §5b as backstop                                |
| Fast model unbalanced investigation               | Explorer 3 strategy balance (min 2 from each strategy); Explorer 2 grouped by axis; output caps prevent kitchen-sink dumps                                                      |
| Silent explorer failure (no output, no error)     | Explorer status protocol — BLOCKED status surfaces the problem explicitly; NEEDS_CONTEXT enables recovery without wasting re-spawns                                             |
| Mechanical errors in synthesis                    | §4i self-review catches score inconsistencies, naming collisions, missing doc impact rows, and inflation before critics see them                                                |
| Infinite re-spawn loops                           | 3-failure escalation rule — after 2 re-spawns, stop and question the task scope; split or drop rather than retry                                                                |
| Skipping strategic framing ("gaps are obvious")   | Named anti-pattern at §0 top — directly addresses the rationalization and makes skipping feel wrong                                                                             |
| Inlining explorer work ("I'll just do it myself") | Named anti-pattern at §3 top — directly addresses the temptation and explains why it produces worthless output                                                                  |

**Note:** This table covers investigation, synthesis, fast-model defenses, and process-skip defenses. Write-safety defenses (freshness check, collision check) and presentation-safety defenses (incremental display for large proposals, revision cap, context window save) are documented in §7 and §6 respectively.

**When auto mode degrades:**

- If the session context is compressed mid-skill (between §3 and §4), explorers may return but their findings are truncated. The forge MUST read back all explorer results before synthesis — if a result is missing, re-spawn that explorer.
- If subagent spawning fails silently (no error, but no output), the parent MUST detect a missing result and re-spawn rather than proceeding with partial evidence. The explorer status protocol helps here: an explorer that returns `STATUS: BLOCKED` has explicitly surfaced the problem; an explorer that returns nothing is a silent failure.
- If the user skips §0 strategic framing by jumping straight to "generate phases now," the forge runs §0 anyway — framing is not optional and cannot be accelerated out of the process.
- If an explorer has been re-spawned twice (for any combination of validation, convergence, or context reasons), do not re-spawn a third time — question the task scope per the 3-failure escalation rule.
