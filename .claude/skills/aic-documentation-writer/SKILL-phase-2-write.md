# Phase 2: Synthesis + Draft Writing

**Goal:** Merge all explorer findings into a coherent synthesis, then write the Change Specification target text (or direct edits). The main agent writes — no subagents in this phase.

### 2a. Synthesize findings

Organize findings from all explorers:

- **Convergence:** Multiple explorers independently found the same issue. Note which explorers converged — this is strong evidence.
- **Contradiction:** Explorers found conflicting evidence. Note both sides. Investigate further (re-read the source files) before writing target text that depends on the disputed claim.
- **Unique findings:** From only one explorer. These need the critics' attention most in Phase 3.

### 2b. Build the analysis report

Write a structured analysis covering:

- Document profile (target, purpose, audience, current state, tone)
- Factual accuracy inventory (from Explorer 1)
- Structural findings (from Explorer 2)
- Writing quality baseline and audience assessment (from Explorer 3)
- Completeness and gap inventory (from Explorer 4)

When called by the planner, this report becomes the documentation-specific fields in the Exploration Report (DOCUMENT PROFILE, FACTUAL ACCURACY, COMPLETENESS, CONSISTENCY, etc.).

### 2c. Write the Change Specification target text

**Deduplication gate (Cardinal Rule 5) — run BEFORE writing gap-fill content:**

For every gap identified by Explorer 4, check Explorer 4's sibling coverage classification:

- **COVERED BY SIBLING:** Do not write a new section. If a cross-reference is warranted, write a single sentence with a markdown link to the sibling document. If the target document has no contextual reason to mention the topic, skip it entirely — no change needed.
- **PARTIALLY COVERED BY SIBLING:** Write only the aspects specific to the target document's context. Link to the sibling for everything it already covers. Do not duplicate content the sibling handles.
- **NOT COVERED:** Write the full section as normal.

For each identified change, write all three parts:

1. **Current text:** Quote the exact text that will be changed (so the executor can locate it)
2. **Required change:** What needs to change and why (one sentence)
3. **Target text:** The exact replacement text — the actual words, not "improve this"

**Writing rules (from SKILL-standards.md and SKILL-policies.md):**

- Match the voice and tone identified by Explorer 3
- Follow content format conventions: tables for 3+ definitions, numbered lists for procedures, proper heading hierarchy
- Paragraph density: one idea per paragraph — split paragraphs that cover multiple distinct points, editors, or contexts (see SKILL-standards.md §Paragraph density)
- Editor-specific formatting: when content diverges by editor, give each editor its own paragraph with a bold label prefix like `**Cursor:**` — never inline multiple editors in one paragraph (see SKILL-standards.md §Editor-specific content formatting)
- Notes and asides: supplementary information must use markdown blockquote format (`>`); every candidate must pass all 4 tests (removal, position, label, content) before blockquoting — when in doubt, leave as plain text; sequential notes join into one unified block with `>` blank lines; maximum 1 note block per section (see SKILL-standards.md §Notes and asides)
- No temporal references (phase names, task numbers, "recently added"); no task references — do not mention that a task existed; describe what was implemented directly
- Line-break preservation: match the source document's structure
- Every technical claim in target text must be traceable to an Explorer 1 finding
- Cross-reference, do not duplicate: if a sibling document covers the topic, link to it (see SKILL-standards.md §Cross-Reference Instead of Duplication)
- Cross-editor references: name another editor only when it helps the reader; no rankings or gratuitous comparisons (see SKILL-policies.md §Cross-editor references)
- No marketing or hedge language: no "powerful," "seamless," "robust," "leverage"; describe what happens factually (see SKILL-policies.md §No marketing or hedge language)
- Examples must be verifiable: every code snippet, command, and path must match the current codebase (see SKILL-policies.md §Examples must be verifiable)
- No secrets in examples: use placeholders for API keys, tokens, and user-specific paths (see SKILL-policies.md §No secrets in examples)
- Acronyms and key terms: define on first use; one canonical term per concept across all docs (see SKILL-policies.md §Acronyms and key terms)
- Omit ambient knowledge: do not restate obvious high-level tooling usage (generic skills invocation, generic Git) — document repo-specific commands and flows instead (see SKILL-policies.md §Omit ambient / obvious knowledge)

### 2d. Pre-verification self-check

Before proceeding to Phase 3:

- Grep all target text blocks for temporal references: phase names ("Phase [A-Z]"), task identifiers ("[A-Z][0-9]{2}:", "task [0-9]+", "task [A-Z][0-9]+"), task-existence phrases ("as per task", "implemented in task", "this task adds", "the task"), temporal phrases ("will be added", "in the next", "recently", "upcoming", "future task"). Rewrite any found — describe capabilities directly, never attribute to a task.
- For each technical claim in target text, annotate it inline with the Explorer 1 finding that backs it (e.g. `[E1: InterfaceName at shared/src/core/interfaces/foo.interface.ts:12]`). Any claim you cannot annotate has no backing evidence — investigate further before including it in target text, or remove it. Strip these inline annotations before presenting the final Change Specification.

### 2e. Audit mode: Build the Structured Audit Report

**This subsection replaces 2c-2d when mode = Audit.** The main agent writes the report — no subagents in this phase.

Instead of producing only Change Specifications, produce a **Structured Audit Report** that covers the entire document. The report is the primary deliverable. See `SKILL-standards.md §Audit Report Format` for the mandatory structure.

**Report sections (in order):**

1. **Executive summary** — One-paragraph verdict: PASS (no corrections required), ADVISORY (observations but no factual or structural errors), or FAIL (corrections required). Include severity counts: N critical, M moderate, K informational.

2. **Section-by-section assessment** — For every `##` section in the target document, a status line:
   - CLEAN: all claims verified, no issues found (cite evidence)
   - ISSUES FOUND: list each issue with severity and evidence
   - NEEDS INVESTIGATION: claims that could not be verified (list with reasons)

3. **Factual accuracy inventory** — Every technical claim from Explorer 1, with its classification and file:line citation. Group by document section. This is the full inventory — not a summary. Include ACCURATE findings, not just errors.

4. **Structural integrity** — ToC-body match, parallel section symmetry, stale markers, intra-document consistency (from Explorer 2).

5. **Writing quality assessment** — Audience classification, tone profile, quality baseline metrics (from Explorer 3). This section does not produce changes — it characterizes the document's current state.

6. **Completeness assessment** — Coverage, gaps, cross-reference map (from Explorer 4). For each gap, include the sibling coverage classification (COVERED BY SIBLING / PARTIALLY COVERED / NOT COVERED).

7. **Corrections required** — For each issue that needs fixing, a full Change Specification in the standard format (current text / required change / target text). Each correction has a severity: **critical** (factual error, broken link, stale content) or **moderate** (structural inconsistency, writing-quality issue, missing cross-reference).

8. **Observations** — Findings that are informational, not actionable. Patterns worth noting, areas that are well-written, structural choices that work.

9. **Open questions** — Claims that could not be verified by Explorer 1. Each includes: the claim text, what was searched, why it is uncertain, and suggested resolution method.

**Key principles:**

- The audit report includes positive findings (what is correct), not just errors. A review that only reports problems gives no confidence about the rest of the document.
- Corrections required (section 7) use the same Change Specification format as write/modify mode. They can be applied in Phase 4.
- Every finding must have at least one evidence citation (Cardinal Rule 1). Findings without evidence are moved to Open Questions.

---

Phase complete. Read `SKILL-phase-3-review.md` and execute it immediately.
