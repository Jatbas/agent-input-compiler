# Phase 6: Final Synthesis + Document

## §6. Final Synthesis + Document

**Goal:** Produce the final research document incorporating adversarial review results.

### 6a. Update findings

For each finding in the draft:

- Update the Adversarial Status: "Unchallenged", "Challenged — incorporated [what changed]", or "Challenged — rejected because [reason]"
- Update confidence ratings based on critic's assessment
- Remove findings with 0 evidence citations (quality gate 1)

### 6b. Apply mandatory quality gates

Before finalizing, verify all five gates pass:

1. **Minimum evidence density:** Every finding has at least 1 evidence citation. If not → remove the finding or investigate further.
2. **Adversarial coverage:** Either (a) the critic ran in §5 and challenged at least some findings — if all critic outputs are "Unchallenged" despite a run, re-run §5 with stronger mandate; or (b) §5 was legitimately skipped per its documented skip rule (codebase analysis with all findings High confidence AND 2+ explorer convergence on each). In case (b), note in the document header "Critic: skipped — [reason]" and treat this gate as satisfied. If neither (a) nor (b) holds, run §5 now.
3. **Explicit gap acknowledgment:** Open Questions section is non-empty (unless factual lookup). If empty → re-examine: what aspects of the question remain uncertain?
4. **Confidence calibration:** No more than 60% of findings are rated "High confidence" (unless factual lookup). If over 60% → count the High findings and apply this heuristic: a finding is High only if it is a **binary verifiable fact** (code does X, schema has field Y, API exists/doesn't exist). Findings that **characterize** priorities, intentions, timelines, or external project direction are Medium — they depend on interpretation or external actors. Downgrade the weakest characterization-type findings until the ratio is at or below 60%. When in doubt, use these examples: _High_: "ESLint blocks `Date.now()` outside `system-clock.ts`" (grep confirms it — binary). _Medium_: "The project prioritizes hexagonal architecture" (interpretation of a pattern — characterization). _Borderline_: "Error handling is centralized in the config validator" — High if a single function proves it, Medium if you inferred it from a pattern across files.
5. **Cross-explorer convergence bonus:** Any finding independently discovered by 2+ explorers is upgraded to High confidence with note: "Independently confirmed by [N] explorers." This upgrade applies only to findings **not downgraded by the critic in §6a** — a challenged finding retains the critic's assessment.

### 6c. Refine the document

- Rewrite the Executive Summary to reflect the final findings (not the draft)
- Ensure the Analysis section connects findings to each other (not just lists them)
- Ensure Recommendations are actionable and specific
- Ensure Sources section lists every file and URL cited

### 6c-ii. Roadmap mapping (conditional)

**Auto-detection:** If any recommendation references a future phase (Phase 1, Phase 1+, Phase 2, Phase 2+, Phase 2-3, Phase 3) or uses language indicating deferred work ("track", "revisit when", "align when", "no code change now", "no action today"), generate the Roadmap Mapping section. This applies to technology evaluation and gap/improvement classifications. Skip for codebase analysis and documentation analysis (these produce findings about current state, not future work).

**On-demand:** If the user asks "write the roadmap mapping" or "map recommendations to the roadmap" after any research — regardless of classification — generate the section and append it to the existing document.

**How to generate:**

1. Read `documentation/tasks/progress/aic-progress.md` (main workspace) to understand the current phase structure, categories, and entry format.
2. For each recommendation, determine: (a) which phase it belongs to based on the evidence in the findings, (b) the closest category in aic-progress, (c) a one-line entry matching the style of existing entries, (d) whether it's immediately plannable or deferred (and why).
3. Write the Roadmap Mapping table in the research document using the template.
4. Recommendations that are purely informational ("track this") get "No — tracking only" in the Immediate column. Recommendations that depend on external events ("when WG forms") get "No — depends on [event]". Recommendations that can be planned and executed now get "Yes — plannable now".

### 6d. Save the document

Save to: `documentation/research/YYYY-MM-DD-kebab-title.md`

Use today's date. If a file with that name already exists, append a sequence number: `YYYY-MM-DD-kebab-title-2.md`.

### 6e. Present to user

> **Research complete.** Saved to `documentation/research/YYYY-MM-DD-kebab-title.md`
>
> **Classification:** [type] | **Findings:** [count] | **Confidence:** [overall — High/Medium/Low]
>
> **Executive Summary:** [2-3 sentences]
>
> **Key findings:** [top 3, one line each]
>
> **Roadmap mapping:** [count] recommendations mapped — [N immediate, M deferred] (or "None — all recommendations are current-phase" if section was omitted)
>
> **Open questions:** [count] — [one-line summary of what's uncertain]
>
> Tell me which roadmap entries to add to `documentation/tasks/progress/aic-progress.md`, or say "plan tasks based on this research".

---

## Research Document Template

```markdown
# Research: [Title]

> **Status:** Complete
> **Date:** [YYYY-MM-DD]
> **Question:** [the original question, restated precisely]
> **Classification:** [factual lookup | codebase analysis | gap/improvement analysis | technology evaluation | documentation analysis]
> **Confidence:** [High | Medium | Low] — [one sentence justification]
> **Explorers:** [count] | **Critic:** [yes/no/skipped — reason]

## Executive Summary

[2-3 sentences — the key answer. Must be actionable — not "it's complicated." If the answer is nuanced, state the primary conclusion first, then the nuance.]

## Findings

### Finding 1: [title]

**Evidence:** [file path:line, URL, or grep result — MANDATORY]
**Confidence:** [High | Medium | Low]
**Adversarial status:** [Unchallenged | Challenged — incorporated: [what changed] | Challenged — rejected: [reason]]

[Details — what was found and what it means. 2-5 sentences.]

### Finding N: [title]

[Same format for each finding]

## Analysis

[Synthesis — how findings connect, patterns, implications, trade-offs. This section must reference multiple findings in relation to each other. A flat list of independent observations is not analysis.]

## Recommendations

1. **[Priority 1]** — [actionable, specific recommendation with concrete next step]
2. **[Priority 2]** — [...]

[Recommendations must be ordered by impact. Each must be actionable by a human or the planner skill.]

## Roadmap Mapping

[Auto-generated when recommendations reference future phases. Omit this section if all recommendations are immediately actionable within the current phase or are purely informational (no code/doc change).]

| #   | Recommendation | Phase                              | Category                                                                   | Candidate progress entry                                  | Immediate?                                                                                     |
| --- | -------------- | ---------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [N] | [short name]   | [0 / 0.5 / 1 / 2 / 3 or "Current"] | [category from progress file — e.g. MCP Server, Documentation, Enterprise] | [one-line entry as it would appear in the progress table] | [Yes — plannable now / No — [reason: tracking only, depends on X, WG doesn't exist yet, etc.]] |

> **To add these to the roadmap:** tell me which rows to add to `documentation/tasks/progress/aic-progress.md` and I'll write them.

## Open Questions

- [Honestly stated unknown — what could not be determined and why]
- [What additional investigation would be needed to resolve this]

[This section must not be empty for analysis/evaluation questions. There is always something uncertain.]

## Sources

- `[file path]` — [what was learned from this file]
- [URL] — [what was learned] (technology evaluation only)

[Every file read and URL fetched during the investigation.]
```
