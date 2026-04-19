# Phase 4: Synthesize Phase Proposals

## §4. Synthesize Phase Proposals

### 4a. Evidence density gate

Before merging: count evidence citations (file:line or URL) across all explorer findings. If fewer than 1 citation per finding on average, re-spawn the weakest explorer with a more specific prompt targeting the uncited findings. Do not proceed to synthesis with hallucinated candidates.

### 4b. Deduplify

If two candidates from different explorers share more than 60% of their name words or describe the same implementation surface, merge them into one component, combining the best description and citing both explorers as sources.

**Cross-explorer convergence boost:** When two or more explorers independently identify the same candidate (before deduplication merges them), add +1 to the merged candidate's Unblock Potential (UP) score (capped at 5). Note "Cross-explorer convergence: Explorer N + Explorer M" in the Source column of the §4d table. Independent identification by separate agents with different mandates signals a real, multi-faceted need — reward it.

### 4c. Name normalization

Before grouping, scan all candidate names against the convention: (1) title-cased, (2) identifies a specific implementation surface, (3) noun-form naming the thing (not "Improve X" — use "X Optimization" or "X Enforcement"). Rewrite violating names. Document rewrites in a note included in the critic's input at §5.

### 4d. Value score aggregation

Before grouping, compute the **composite value score** for each deduplicated candidate.

**Collecting scores:** Each explorer scores the dimensions in its mandate (see Explorer 1-3 task sections and the Value Scoring Rubric). A candidate may have scores from multiple explorers — a documentation gap (Explorer 1) that also appeared in external research (Explorer 3) carries both Unblock Potential and User Impact/Ecosystem Urgency scores.

**Missing dimensions:** If a candidate was scored by only one explorer, the unscored dimensions default to 2 (conservative neutral). The parent agent does not fabricate scores for dimensions no explorer investigated.

**Composite formula:**

`Value = MC × (UI × 3 + UP × 2 + SA × 2 + EU × 1.5 + DR × 1) / (IS × 1.5)`

Where: UI = User Impact, UP = Unblock Potential, SA = Strategic Alignment (scored by Critic B in §5, defaults to 2 until then), EU = Ecosystem Urgency, DR = Debt Reduction, IS = Implementation Surface, **MC = Meta-Capability Multiplier** (default 1.0; 1.25 or 1.5 per `SKILL-scoring.md` when the candidate is a meta-capability). Higher composite = higher priority. MC is assigned by Explorer 4 when present (see Phase 3 §Explorer 4); for candidates that Explorer 4 did not see, MC defaults to 1.0 and remains 1.0 unless Critic B flags the candidate for promotion at §5.

**Present scores:** Include a ranked candidate table in the handoff to §5 critics:

| Candidate | UI    | UP    | SA    | EU    | DR    | IS    | MC             | Composite | Source     |
| --------- | ----- | ----- | ----- | ----- | ----- | ----- | -------------- | --------- | ---------- |
| [name]    | [1-5] | [1-5] | [1-5] | [1-5] | [1-5] | [1-5] | [1.0/1.25/1.5] | [n.n]     | Explorer N |

Sort by composite descending. This table is advisory input to critics and to the §6 presentation — it does not mechanically determine inclusion or exclusion.

**MC cap enforcement (parent-agent check before dispatching critics):** Across the full ranked table, at most **one** candidate may carry MC = 1.5 and at most **two** may carry MC ≥ 1.25. If Explorer 4 returned more, demote the weakest (by MC justification strength) to 1.0 until the cap holds and note the demotion in the handoff to critics: "Demoted [N] candidates from MC ≥ 1.25 to 1.0 per cap rule; weakest justifications: [list]."

### 4e. Group into phases

**Mandatory dual-output:** Always produce exactly two output categories:

**Category A — Quick Wins:** Fixes, dead code, broken references, performance patches, and documentation repairs that can be planned and executed immediately without architectural decisions. Source: primarily Explorer 2 (codebase optimizer) findings, Explorer 1 disconfirmation findings (broken cross-references, dead patterns), and any explorer finding with IS ≤ 2 (low implementation surface). Minimum 1 component, maximum 4. These are plannable via `aic-task-planner` directly — each component should be scoped to a single task-planner invocation.

**Category B — Strategic Phase:** The next meaningful capability, positioning move, or architectural evolution that advances the project's roadmap. Source: Explorer 1 verified gaps, Explorer 3 ecosystem findings, and §0 hypothesis-driven candidates with composite score above the median. Minimum 1 component. This is the "real phase" — it gets a full phase header, description, and component table in aic-progress.md with task details per §4g.

If investigation yields zero Quick Wins, the forge must still produce Category B. If investigation yields zero strategic candidates, announce: "No strategic phase candidates survived adversarial review. Consider running with Tier 2/3 input or providing a research document." and produce Category A only.

Categories A and B use separate phase letters in aic-progress.md. Category A uses the naming pattern `Phase [letter] — [Scope] Fixes` (e.g., "Phase AP — Compile Hot-Path Fixes"). Category B uses the standard naming convention for strategic phases.

**Grouping heuristics (apply within each category):**

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

**Document-internal build-order respect (when Explorer 4 ran and the input document declared an order):**

If Explorer 4 returned non-`—` Build-order ranks (i.e., the input document contains an explicit priority or build-order section such as "Recommended build order," "Implementation priority," or a critical-path callout), the synthesis proposal's ordering across candidates **from that document** must either:

- **Match the document's order**, or
- **Document each departure** with cited evidence — a specific explorer finding (file:line or URL) that overrides the document's framing. Absent cited evidence, the document's order wins within its own candidate set.

The composite score still ranks candidates **across** documents and against Explorer 1/2/3 findings; it is only when the order contradicts a document-internal signal that the departure must be justified. Critic B will validate this at §5 task 7a.

When a meta-capability (MC ≥ 1.25) is present in the same phase as its beneficiaries, the meta-capability **must be sequenced first** within that phase. If the meta-capability is deferred to a later phase, the Deps column of the beneficiaries must reference it explicitly so the planner / executor see the ordering constraint.

### 4f. Documentation impact analysis

For each proposed code component, identify which documentation files will need updating when that component ships. Classify by impact type:

- **`README.md`** — feature is end-user visible (new capability, changed command, new config field)
- **`documentation/best-practices.md`** — feature changes recommended usage patterns
- **`documentation/security.md`** — feature changes security properties or guardrail behavior
- **`documentation/installation.md`** — feature changes setup, install steps, or prerequisites
- **`documentation/architecture.md`** — feature changes the core pipeline or integration layer model
- **`documentation/implementation-spec.md`** — feature changes pipeline behavior, step contracts, or data flow
- **`documentation/technical/[file].md`** — feature touches a technical subsystem with its own reference doc (cursor integration layer, Claude Code integration layer, JSONL caches, etc.)

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

**Escape hatch rule:** When details are uncertain, add "Planner verification required: [what to confirm]." Each step must contain at least one concrete element: a specific `.ts` file path (not directory) (e.g. `shared/src/pipeline/context-compiler.ts` — NOT `shared/src/pipeline/`), a named interface, a runnable command, or a specific grep pattern (must return fewer than 20 results in this codebase). Steps with only escape hatch annotations are not acceptable. A step that says "add a pipeline step in shared/src/pipeline/" is not more specific than the component table row and is not acceptable. If a task detail cannot exceed the table row, omit it and annotate the Description: "(Task detail deferred — planner will derive steps during Pass 1.)"

---

## §4i. Synthesis Self-Review

**Run before dispatching critics.** The parent agent reviews its own synthesis output to catch obvious issues that would waste critic tokens. This is not a substitute for §5 adversarial review — it catches mechanical problems, not strategic or feasibility issues.

**Checklist (run inline, do not spawn a subagent):**

1. **Score consistency:** Does any candidate have a UP score of 5 but zero tracked dependents? Does any candidate score UI:5 with no user pain evidence from Explorer 3? Flag and adjust.
2. **Naming collision:** Do any two candidates in the same phase share 3+ words in their name? If yes, they may be duplicates that §4b missed.
3. **Grouping self-check:** Does any phase violate the skill's own heuristics — breaking-class mixed with additive, more than 12 components, cross-layer mixing?
4. **Documentation impact completeness:** For each code component, is the corresponding documentation update row present? Quick count: code components vs doc update rows. If the ratio is below 0.5 (fewer than 1 doc update per 2 code components), a documentation impact was likely missed.
5. **Score inflation check:** Run the §4d inflation detection now. If more than 40% of candidates have composite above 8.0, apply forced distribution correction before critics see inflated numbers.
6. **MC cap and build-order check:** Verify the §4d table does not exceed the MC caps (at most one MC = 1.5, at most two MC ≥ 1.25 across the full table). If Explorer 4 returned a document-internal build order, verify every departure from that order in the proposal has an inline "Departure reason: [cited evidence]" note attached. Missing notes are a synthesis failure — either restore the document's order for that candidate or add the evidence before critics see it.

**Fix issues inline.** If all checks pass, announce: "Self-review passed — proceeding to adversarial review." If issues were found, announce: "Self-review found [N] issues, corrected inline — proceeding to adversarial review."

---

Phase complete. Read `SKILL-phase-5-review.md` and execute it immediately.
