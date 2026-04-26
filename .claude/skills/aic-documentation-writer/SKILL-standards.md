# Documentation Writer — Writing Standards

Reference file for the documentation-writer skill. Read this before writing target text (Phase 2) or verifying edits (Phase 4). These standards are the single source of truth for documentation quality — both the planner (when writing Change Specifications) and the executor (when verifying edits) reference this file.

---

## Content Format Conventions

These rules are mandatory for all documentation edits. Violations cause verification failures.

### Definitions and glossaries

3+ terms being defined MUST use a table (columns: Term, Definition), placed under a `## Glossary` heading. Never inline multiple definitions as bold-text paragraphs. 1-2 terms may be defined inline if contextually appropriate.

### Comparisons

2+ items being compared across multiple dimensions MUST use a table, not prose paragraphs. Columns represent dimensions; rows represent items.

### Step-by-step procedures

MUST use numbered lists, not prose paragraphs. Each step starts with an action verb. If a step has sub-steps, use nested numbered lists (not lettered).

### New sections

Any new `##` or `###` heading MUST be added to the Table of Contents if one exists. The ToC entry must appear in the correct position relative to other entries. Never assume the executor or reader will notice the ToC needs updating — make it explicit.

### Section placement

When adding a new section, evaluate the document's existing flow:

- Introduction sections go at the top
- Glossary sections (`## Glossary`) follow the introduction, before concept sections. Use "Glossary" as the heading — not "Terminology," "Key Terms," or similar variants.
- Concept/definition sections follow the glossary (or the introduction when no glossary exists)
- Procedural/how-to sections follow concepts
- Reference/lookup sections follow procedures
- Appendix sections go at the end

Place the new section where it fits logically. Never insert a new section at the first convenient gap without considering document flow.

### Bold labels vs subheadings

When a section contains multiple labeled items (bold-prefixed entries like `**Label:** description`), choose between bold labels and `###` subheadings based on content length:

- If every item is a single sentence, bold labels are acceptable.
- If any item runs longer than one sentence, promote all items in that group to `###` subheadings. Mixing bold labels for short items and subheadings for long ones inside the same section creates visual inconsistency.

The test: scan the group of labeled items. If the longest one is multi-sentence, use subheadings for the group.

### Paragraph density

When a paragraph covers multiple distinct points, split it into one paragraph per point. Each paragraph should carry a single idea a reader can absorb without re-reading. Signs a paragraph needs splitting:

- It discusses two or more editors or platforms with different behaviors — give each its own paragraph
- It contains a general statement followed by editor-specific qualifications — put the general statement in its own paragraph, then one paragraph per editor
- It strings together cause, mechanism, and consequence in one block — separate the "what happens" from the "why it matters"
- A sentence introduces a new actor or context shift (e.g. switching from Cursor behavior to Claude Code behavior)

Dense paragraphs are the most common readability issue in generated documentation. When in doubt, split.

### Editor-specific content formatting

When a section discusses behavior that differs between editors (Cursor, Claude Code), format as follows:

1. If there is a general statement that applies to all editors, write it as its own paragraph first
2. Give each editor its own paragraph with a **bold label** prefix: `**Cursor:**` or `**Claude Code:**`
3. Separate each editor paragraph with a blank line
4. If the section warrants a sub-heading, use `### Section Title`

**Correct:**

```
### How AIC helps

**Cursor:** A new chat runs session-start compilation so file selection reflects the current tree.

**Claude Code:** Hooks compile on session start and on every user message; a new chat clears stale transcript.
```

**Incorrect (single dense paragraph):**

```
### How AIC helps

Cursor: a new chat runs session-start compilation so file selection reflects the current tree. Claude Code: hooks compile on session start and on every user message; a new chat clears stale transcript.
```

This pattern applies wherever content diverges by editor, environment, or platform — not only "How AIC helps" sections. The same rule applies to "Why" sections that explain different behavior per editor.

### Line-break preservation

Preserve the source document's line-break structure. Do not wrap prose onto multiple lines unless the surrounding text does. If the current text uses single-line sentences, the target text must remain single-line. If the current text wraps at a column width, match the wrap point.

### Notes and asides

Supplementary information that is not part of the main instructional flow — caveats, clarifications, scope boundaries, background context — MUST be formatted as a markdown blockquote using the `>` prefix. This renders with a vertical bar on the left, visually separating the note from the surrounding content.

**What qualifies as a note:**

- Scope or applicability caveats ("these files are local to your machine", "this applies only to X")
- Clarifications that prevent misunderstanding but are not the section's primary content
- Background context a reader may need but that would interrupt the main flow
- Warnings or important constraints that are secondary to the section's purpose
- Meta-information about the document structure or conventions

**Single note:**

```
> Task files under `documentation/tasks/` are local to your machine and not part of the published repository. The planner and executor skills define how to create and use them.
```

**Sequential notes form a unified block.** When two or more notes appear in sequence, join them into a single blockquote with a `>` blank line between each note. This renders as one continuous block with the vertical bar running the full height:

```
> Task files under `documentation/tasks/` are local to your machine.
>
> The planner and executor skills define how to create and use them.
```

Never place sequential notes as separate blockquotes with a plain blank line between them — that renders as disconnected blocks:

```
> First note.

> Second note.
```

**Note density limit.** A section where most paragraphs are blockquotes is a sign the content is miscategorized — if everything is a note, nothing is a note. Follow these limits:

- Maximum 1 note block per section (a unified block of sequential notes counts as 1 block)
- If a section needs more than 1 note block, the extra content is likely primary content that belongs in the section body, or it belongs in a different section altogether
- When reviewing a document that has too many notes, consolidate: merge related notes into one unified block, or promote notes that carry essential information back to regular paragraphs

**Do not use blockquotes for:**

- Document introductions — the first substantive paragraph(s) after the title heading (`#`). These are the primary orienting text: taglines, mission statements, product descriptions. They are the most important content on the page, not supplementary asides. Write them as plain paragraphs. Badges, shields, and image-only lines between the title and the introduction are decorative — they do not count as substantive content. A blockquote that follows only badges is still the introduction.
- Section openers that frame the content that follows — the first sentence of a section that sets the context for everything below it. If the reader needs this sentence before they can understand the section, it is primary content, not a note.
- Primary instructional content (steps, definitions, descriptions that carry the section's main message)
- Code examples (use fenced code blocks)
- Emphasis on regular content (use **bold** or restructure the sentence)
- Labels, commands, or short introductory lines that precede a code block, table, or screenshot — these are structural elements of the section, not asides. Use a subheading (`###` or `####`), bold text (`**label**`), or a plain sentence instead.

**Misclassified blockquotes.** A common error is wrapping short labels or command names in `>` because they are standalone lines. The test: _Does this line introduce or label content that follows it (a code block, a table, an example)?_ If yes, it is a structural label — never a blockquote. Only lines that provide supplementary context unrelated to the content flow qualify as notes.

**Subheading vs bold for labels.** When converting a misclassified blockquote label, choose between a subheading and bold text using this heuristic:

- **Subheading** (`####` or the next level below the parent) — when the label introduces a distinct, self-contained block: a code block, a multi-row table, a multi-line example, or a group of content that a reader might want to scan or skip to. Multiple labels at the same level in a section (e.g. several command examples) reinforce the subheading choice — they form parallel subsections.
- **Bold text** (`**label**`) — when the label is a short inline annotation within a paragraph or a single-line description that does not warrant its own navigable section.

This is the same principle as §Bold labels vs subheadings: if the labeled content runs longer than one sentence, use a subheading.

Incorrect (label misclassified as note):

````
> `show aic status`

\```text
Status = project-level AIC status.
...
\```
````

Correct (label as subheading — introduces a code block):

````
#### `show aic status`

\```text
Status = project-level AIC status.
...
\```
````

**Note classification checklist.** Before formatting any paragraph as a blockquote, it must pass ALL four tests. If any test fails, the paragraph is not a note.

1. **Removal test:** If you delete this paragraph entirely, does the section still deliver its primary message? If removing it would leave a gap in the section's purpose → not a note.
2. **Position test:** Is this the first substantive content after a `#` title or `##`/`###` heading? Badges, shields, and horizontal rules are decorative and do not count. If yes → not a note. First substantive content orients the reader and is always primary.
3. **Label test:** Does this paragraph introduce, name, or frame what immediately follows it (a code block, table, example, or subsection)? If yes → not a note; use a subheading, bold text, or plain sentence.
4. **Content test:** Is this paragraph a caveat, scope boundary, clarification, warning, or background context that a reader could skip without losing the section's main message? If yes → note. If the paragraph teaches, instructs, defines, or explains something the reader came to this section to learn → not a note.

A true note is something the reader benefits from knowing but does not need in order to follow the section. When in doubt, leave the paragraph as plain text — false negatives (a note left as plain text) are harmless; false positives (primary content blockquoted as a note) damage readability.

### Code blocks

Use fenced code blocks with language identifiers for all command examples and code snippets. Match the surrounding document's convention for code block usage (inline backticks vs fenced blocks).

### CLI options and flags

When a document lists 2+ CLI flags, environment variables, or configuration options, present them in a table — not inline prose or a bullet list. Tables let readers scan options, see defaults at a glance, and compare alternatives.

**Required columns:**

| Column     | Content                                                  |
| ---------- | -------------------------------------------------------- |
| Option     | Human-readable label describing what the option controls |
| Flag / env | The literal flag forms and environment variable name     |
| Default    | The behavior when the option is not specified            |

One row per logical option. If a flag has an explicit "enable" form and an explicit "disable" form (e.g. `--keep-aic-database=0` vs `--keep-aic-database=1`), document them in a **single row** — not two rows for opposite values. State the default value so the reader knows which form they need.

**When to use:** Any section that documents command-line arguments, environment variables, or configuration knobs. Inline prose is acceptable only for a single option with no alternatives.

### Table row consolidation

When two table rows describe opposite values of the same option (e.g. "Remove data" default=No and "Keep data" default=Yes), consolidate into one row. The reader needs to know: what does this option control, what are the flag forms, and what is the default. Two rows for one flag create the impression of two independent options and waste vertical space.

### Prose-table anti-duplication

When a table summarizes structured information (options, comparisons, artifacts), the surrounding prose should **introduce** the table or provide context — not restate the table's content. If a bullet list or paragraph preceding a table repeats the same flags, defaults, and values that the table contains, remove the duplication from the prose and keep the table as the single source.

Signs of prose-table duplication:

- A paragraph lists the same flag names and values that appear in the immediately following table
- A bullet list enumerates options that the table already covers row by row
- The prose adds no information beyond what the table columns show

The fix: trim the prose to one sentence introducing the table (e.g. "The script accepts these options:"), then let the table carry the detail.

### Cross-reference instead of duplication

When a topic is already covered by a dedicated document in `documentation/` or a root-level file (`README.md`, `CONTRIBUTING.md`), do NOT write the content inline. Instead:

- **Full coverage by sibling:** Write a single cross-reference sentence: `For [topic details], see [Document Title](relative-path-to-document.md).` Place it where the inline content would have gone, under an appropriate heading if one exists.
- **Partial coverage by sibling:** Write only the aspects specific to the target document's context. For everything the sibling already covers, link to it: `[Document Title](relative-path-to-document.md) covers [X and Y]. This document addresses [Z] specifically for [context].`
- **No sibling exists:** Write the full content as normal.

This is mandatory (HARD RULE 6). Duplicated content across documents is the primary source of cross-document inconsistency — when one copy is updated, the other drifts. A link ensures a single source of truth.

---

## Voice and Tone Rules

### Matching existing voice

Every edit must be indistinguishable from the surrounding text. The writing agent receives a tone profile from Explorer 3 — use it as the primary guide.

Tone matching checklist:

- Match formality level (formal documents do not use contractions; informal documents may)
- Match voice (active vs passive — if the document predominantly uses active voice, keep new text active)
- Match sentence length patterns (if the document uses short, declarative sentences, do not write long, complex ones)
- Match paragraph length (if sections are 2-3 sentence paragraphs, do not write 8-sentence paragraphs)
- Match technical level (if the document defines terms before using them, define terms in new text too)

### Audience-specific language

| Audience            | Language rules                                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User-facing guide   | Task-oriented: "Run this command", "Open settings". Short paragraphs. Numbered steps for procedures. Avoid internal implementation details unless essential for understanding. Every section answers "what do I do?" not "how does it work internally?" |
| Developer reference | Precise technical language: type signatures, architecture rationale, component relationships. Assume reader knows the codebase. Every section answers "how and why does this work?"                                                                     |
| Mixed               | Clearly separate user instructions from technical details using headings or callout blocks. Label which parts are for which audience.                                                                                                                   |

### Professional register

Use concise professional language. Documentation is not a conversation — avoid casual constructions that talk around a concept when a direct term exists.

| Instead of                       | Write                                    |
| -------------------------------- | ---------------------------------------- |
| "people who change the codebase" | "developers" or "contributors"           |
| "this page"                      | "this document"                          |
| "stuff under `X/`"               | "files under `X/`" or "contents of `X/`" |
| "things like hooks and rules"    | "hooks and rules"                        |
| "in order to"                    | "to"                                     |
| "make sure"                      | "verify" or "confirm"                    |
| "a bunch of"                     | state the quantity or drop the qualifier |

The goal is not formal prose. Contractions are fine when the surrounding document uses them. Short sentences are fine. The standard is: prefer the term a technical writer would choose over the term someone would say in a chat message.

### Temporal robustness

Never reference phase names (Phase T, Phase U), task numbers (U06, T14, 192), or temporal milestones ("in the next phase", "recently added") in document body. Never mention that a task existed — no "as per task X", "implemented in task Y", "this task adds", or "the task". These references become stale and expose internal process; readers need the current state only. Instead:

- Describe capabilities directly: "AIC supports X" / "Integrations can be triggered from MCP" — not "Phase T added X" or "Task 192 added trigger sources"
- If a feature is incomplete: "Not yet available" not "Will be added in Phase X"
- If referencing project evolution: "As of the current release" not "After Phase U"
- Explain what was implemented (behavior, feature, capability) without attributing it to any task

**Exception — planning documents:** Before applying this rule, check the document regime (`SKILL-policies.md §Document regime classification`). If the document is `documentation/project-plan.md`, skip this rule entirely — all temporal and sequencing language there is intentional. This includes: phase names in headings (`Phase 2: Semantic + Governance`), phase labels in tables and body text (`Phase 1+`, `Phase 0`), and future-tense roadmap statements (`"will be added in Phase X"`, `"Phase 2+ target"`). None of these are stale markers; they are planning content. Replacing them with version numbers or "near-term" qualifiers without explicit user instruction destroys planning intent. See `SKILL-policies.md §Planning documents` for the full regime.

### Prohibited patterns

Never use these in target text — they indicate unresolved decisions or hedging:

- "if needed", "if necessary", "if appropriate", "as needed"
- "may be", "might", "possibly", "potentially", "perhaps"
- "e.g.", "for example", "such as", "something like", "or similar"
- "etc.", "and so on", "and so forth"
- "appropriate", "suitable", "reasonable" (without specifying what)
- "consider", "you could", "you might want"

Each prohibited pattern means the writer has not decided. Decide, then write the definitive text.

---

## Audit Report Format

When mode = Audit, Phase 2 produces a Structured Audit Report instead of Change Specifications. This section defines the mandatory structure, ordering, and formatting rules.

### Report structure (mandatory sections in order)

**1. Executive Summary**

One paragraph. Format:

```
**Verdict: [PASS / ADVISORY / FAIL]**

[1-2 sentence summary of findings.] [N] sections audited. [X] critical issues, [Y] moderate issues, [Z] observations. [W] open questions.
```

- **PASS:** Zero corrections required. All claims verified, structure sound, writing quality consistent.
- **ADVISORY:** Zero critical corrections, but moderate corrections or observations exist. The document is usable but has improvement opportunities.
- **FAIL:** One or more critical corrections required (factual errors, broken links, stale content, missing critical coverage).

**2. Section-by-Section Assessment**

One status line per `##` section in the target document. Format:

```
### [Section heading]
**Status: CLEAN / ISSUES FOUND / NEEDS INVESTIGATION**
- [Key finding 1 with evidence citation]
- [Key finding 2 with evidence citation]
```

- **CLEAN:** All claims verified, no structural or writing issues. Cite at least one piece of evidence (a verified claim or structural check).
- **ISSUES FOUND:** List each issue with severity (critical / moderate) and evidence.
- **NEEDS INVESTIGATION:** Claims that could not be verified. List each with what was searched and why it is uncertain.

Every `##` section in the document MUST appear here. Omitting a section violates Gate 8 (audit coverage).

**3. Factual Accuracy Inventory**

Full claim-by-claim listing from Explorer 1, grouped by document section. Format per claim:

```
[exact claim] — [source file:line] — ACCURATE / INACCURATE / NOT FOUND / UNCERTAIN
```

Include ALL classifications, not just errors. This inventory demonstrates audit thoroughness. Present in a table when the section has 5+ claims.

**4. Structural Integrity**

Findings from Explorer 2, grouped by check type (ToC-body match, parallel section symmetry, stale markers, intra-document consistency). Use the evidence format from the explorer template.

**5. Writing Quality Assessment**

From Explorer 3. Present as a profile, not a list of problems:

- Audience: [classification with evidence]
- Tone: [profile — formality, voice, technical level, personality]
- Quality baseline: [metrics — passive voice frequency, sentence variance, paragraph cohesion]
- Notable strengths: [what the document does well]
- Areas for improvement: [patterns to address — these feed into Corrections Required if actionable]

**6. Completeness Assessment**

From Explorer 4. Present as:

- Coverage: [X] documented, [Y] undocumented ([Z] critical)
- Cross-references: [N] valid, [M] invalid
- Gaps: [K] total ([J] critical)
- Sibling coverage: [A] fully covered by siblings, [B] partially covered, [C] not covered

For each critical gap: one sentence explaining what is missing and why it matters.

**7. Corrections Required**

Each correction uses the standard Change Specification format:

```
#### Correction [N] — [severity: critical / moderate]

**Current text:** [exact quote from document]

**Required change:** [one sentence explaining what needs to change and why]

**Target text:** [exact replacement text]

**Evidence:** [file:line or grep result justifying the correction]
```

Order: critical corrections first, then moderate. Number sequentially.

**8. Observations**

Informational findings that do not require changes. Format:

```
- [Observation] — [evidence citation]
```

Include positive findings (well-structured sections, consistent terminology, accurate claims that were tricky to verify). A report with zero observations is suspicious — every document has noteworthy patterns.

**9. Open Questions**

Claims that could not be verified. Format:

```
- **Claim:** [exact text]
- **Searched:** [what was grepped/globbed]
- **Result:** [why it is uncertain]
- **Suggested resolution:** [how to verify — specific file to check, person to ask, test to run]
```

### Audit Report presentation rules

- Lead with the executive summary and section assessment — these are what the user needs first
- Do not present the full factual accuracy inventory or structural integrity unless the user asks — summarize in the section assessment
- Present corrections as an actionable list with clear severity
- Present observations and open questions after corrections
- Use tables for dense data (claim inventories with 5+ rows, cross-reference maps)
- Use bullet lists for narrative findings (observations, quality assessment)

---

## Cross-Document Consistency Rules

### Term consistency

When the same concept appears in multiple documents, use the SAME term everywhere. If `installation.md` calls it "bootstrap", `architecture.md` must not call it "initialization" for the same process. When in doubt, the more specific document (implementation spec) is the authority.

### Status alignment

If a document claims a component's status (Done, In Progress, Not started), it must match `documentation/tasks/progress/aic-progress.md` (main workspace only — gitignored). The progress file is the single source of truth for status. If a discrepancy is found, the progress file wins.

### Architecture claim alignment

Architecture claims (layer boundaries, dependency directions, module structure) must match what `project-plan.md` and `implementation-spec.md` state. If the code has evolved beyond the spec, the spec should be updated — not the other way around (unless the code is wrong).

### Package name and path consistency

When a package name, file path, or command appears in documentation, it must match the actual codebase. Grep-verify every path and package name. Common drift points:

- Package scope changes (verify `@jatbas/aic` and `@jatbas/aic-core` are used consistently)
- File renames or moves
- Command name changes in `package.json` scripts
- Config file path changes

---

## Quality Gate Definitions

These gates must ALL pass before documentation is considered complete.

### Gate 1: Evidence density

Every finding from exploration (Phase 1) must have at least 1 evidence citation — a file:line reference, grep result, or URL. Findings without evidence are removed.

**Threshold:** 100% of findings have citations.

### Gate 2: Factual accuracy

Critic 2 (factual re-verification) must find zero NOT FOUND or CONTRADICTED claims in the target text. Every technical claim in the final text is verified against the codebase.

**Threshold:** Zero unverified claims. Zero contradictions.

### Gate 3: Editorial quality

Critic 1 (editorial quality) must have zero unresolved issues. Every editorial finding is either fixed or explicitly accepted with justification.

**Threshold:** Zero open editorial issues.

### Gate 4: Cross-document consistency

Critic 3 (cross-document consistency) must find zero DIVERGENT terms in the target text. Terminology is consistent across all documentation.

**Threshold:** Zero term divergences.

### Gate 5: Reader comprehension (user-facing only)

Critic 4 (reader simulation) must find zero "undefined term" or "dead end" findings in the final text. First-time readers can follow the document without encountering unexplained concepts or incomplete instructions.

**Threshold:** Zero undefined terms. Zero dead ends. (Applies only to user-facing documents.)

### Gate 6: Mechanical verification

All applicable dimensions from the executor's 4-doc-c table must pass. This is the final mechanical sweep — grep/glob-based checks that catch issues the critics may have missed.

**Threshold:** Dimensions 1-7, 10, 12, and 13 clean. Dimensions 8-9 informational. Dimension 11 blocking within scope.

### Gate 7: Double-blind reconciliation

Explorer 1 and Critic 2 agree on every factual claim, or disagreements are resolved with source file evidence. No unresolved discrepancies remain.

**Threshold:** Zero unresolved factual discrepancies between Explorer 1 and Critic 2.

### Gate 8: Audit coverage (deep audit mode only)

Every `##` section in the target document must have at least one explorer finding in the Audit Report's Section-by-Section Assessment. Sections with zero findings indicate the audit skipped them — the explorers must re-investigate before the report is finalized. In scoped or triage audit mode, apply this gate only to the scoped sections and mark other sections OUT OF SCOPE.

**Threshold:** Zero in-scope sections with no findings. Every in-scope section has status CLEAN (with evidence), ISSUES FOUND (with details), or NEEDS INVESTIGATION (with explanation).

### Gate 9: Audit completeness (deep audit mode only)

Critic 5 (audit completeness) must find zero MISSED_SECTION or WRONG_CLASSIFICATION issues in the Audit Report, or those issues must be resolved by updating the report. Other Critic 5 finding types (MISSED_GAP, SEVERITY_MISMATCH, VERDICT_CHALLENGE) must be evaluated and either accepted with justification or resolved. Scoped and triage audits skip this gate unless the user explicitly requested a full audit.

**Threshold:** Zero unresolved MISSED_SECTION findings. Zero unresolved WRONG_CLASSIFICATION findings. All other Critic 5 findings evaluated.

---

## Mechanical Verification Dimensions

These dimensions are run during Phase 4 (direct invocation) or by the executor's `4-doc-c`. They are grep/glob-based — tool output is objective evidence.

| #   | Dimension                       | Method                                                                           | Blocking?         |
| --- | ------------------------------- | -------------------------------------------------------------------------------- | ----------------- |
| 1   | Change specification compliance | Re-read Change Spec vs actual document. Every change is applied.                 | Yes               |
| 2   | Factual accuracy                | Grep codebase for every technical claim in edited sections                       | Yes               |
| 3   | Cross-document consistency      | Grep sibling docs for key terms in edited sections                               | Yes               |
| 4   | Link validity                   | Glob for every markdown link target `[text](path)`                               | Yes               |
| 5   | Writing quality                 | Critic 1 output — all issues resolved                                            | Yes               |
| 6   | No regressions                  | `git diff` — verify only intended sections changed                               | Yes               |
| 7   | ToC-body structure match        | Parse ToC and body headings. Verify every entry matches.                         | Yes               |
| 8   | Scope-adjacent consistency      | Grep full document for key concepts from edited sections                         | Informational     |
| 9   | Pre-existing issue scan         | Grep for GAP, TODO, FIXME, stale phase headings (regex in Dimension 9 detail)    | Informational     |
| 10  | Content format compliance       | Tables for 3+ definitions, ToC entries for new sections, section placement logic | Yes               |
| 11  | Cross-doc term ripple           | Grep all sibling docs for old terms that were replaced                           | Blocking in scope |
| 12  | Intra-document consistency      | Grep full document for same-mechanism descriptions, verify agreement             | Yes               |
| 13  | Blockquote integrity            | Grep for disconnected blockquotes and note density violations                    | Yes               |

### Dimension details

**Dimension 1 — Change specification compliance:** For each change in the Change Specification, re-read the actual document and verify the target text was applied. Check for: truncation (text cut off), duplication (text repeated), partial application (only some changes applied).

**Dimension 2 — Factual accuracy:** For every interface name, type name, file path, ADR reference, command, and package name in the edited sections, grep the codebase. Report: `[claim] — [source] — VERIFIED / NOT FOUND / CONTRADICTED`.

**Dimension 3 — Cross-document consistency:** For every key term in the edited sections, grep all sibling documents. Report: `[term] — [this doc] vs [sibling] — CONSISTENT / DIVERGENT`.

**Dimension 4 — Link validity:** For every markdown link `[text](path)` in the FULL document (not just edited sections — a new section may break an existing anchor link), glob for the target path. Report: `[link] — VALID / BROKEN`.

**Dimension 5 — Writing quality:** Reference Critic 1's output. Verify all reported issues were resolved. Report: `[issue] — FIXED / ACCEPTED (with reason)`.

**Dimension 6 — No regressions:** Run `git diff` on the document. Verify only sections targeted by the Change Specification were modified. Unintended changes (whitespace reformatting, re-wrapping) are regressions.

**Dimension 7 — ToC-body structure match:** Parse the Table of Contents and body headings. Verify: every ToC entry has a matching body heading, every body heading appears in the ToC, the order matches. Report: `[entry] — MATCHES / MISSING IN BODY / MISSING IN TOC / ORDER MISMATCH`.

**Dimension 8 — Scope-adjacent consistency:** For every key concept in the edited sections (package names, commands, component names), grep the FULL document for other occurrences. Verify they are consistent with the edited text. Report: `[concept] — [location] — CONSISTENT / STALE / CONTRADICTED`.

**Dimension 9 — Pre-existing issue scan:** Grep the full document for: "GAP", "TODO", "FIXME", "will be added", "future task", task references ("task [0-9]+", "task [A-Z][0-9]+", "as per task", "implemented in task", "this task adds") (cross-reference against `documentation/tasks/progress/aic-progress.md` in main workspace). Also grep for phase heading references with `Phase (?:[A-Z]{1,2}|[0-9]+(?:\.[0-9]+)?)\b` (e.g. Phase AP, Phase O, Phase 0, Phase 1.5) — **but only flag these as stale for prescriptive and normal documents; for planning documents (`documentation/project-plan.md`), skip the phase-name grep only — still run all other Dimension 9 checks (GAP, TODO, FIXME, task numbers) on planning documents as normal.** Report: `[marker] at [location] — IN TARGET (should fix) / OUTSIDE TARGET (informational)`.

**Dimension 10 — Content format compliance:** Verify: (a) any group of 3+ definitions uses a table; (b) any new section has a ToC entry; (c) new section placement follows document flow logic.

**Dimension 11 — Cross-doc term ripple:** For every term that was replaced (old value to new value), grep the Phase 1 sibling document set for the old value. Classify each match as non-historical (should use new value) or historical (leave as-is). Non-historical matches within the task's scoped files must be fixed. Out-of-scope matches are reported as follow-up items.

**Dimension 12 — Intra-document consistency:** For each concept described in the edited sections, grep the FULL document for other sections describing the same concept. Verify they agree. Flag contradictions where sections use different verbs or descriptions for the same mechanism.

**Dimension 13 — Blockquote integrity:** Scan the FULL document for blockquote formatting violations. This is a mechanical grep — not an LLM judgment call. Check these patterns:

(a) **Disconnected blockquotes:** Find any line starting with `>` followed by a bare blank line (no `>` prefix) followed by another line starting with `>`. This creates two separate blockquote blocks instead of one unified block. The bare blank line must be replaced with `>` to join them. Regex pattern: a `> ` line, then one or more blank lines without `>`, then another `> ` line. Report: `[line numbers] — DISCONNECTED BLOCKQUOTE — bare blank line breaks block`.

(b) **Note density:** Count blockquote blocks per `##` section. A blockquote block is a contiguous group of `>` lines (including `>` blank separator lines). If a section has more than 1 blockquote block, report: `[section heading] — NOTE DENSITY VIOLATION — [N] note blocks (max 1)`.

(c) **Orphan blockquote lines:** Find single `>` lines surrounded by non-blockquote content on both sides (a blockquote that is just one short line). These are usually formatting artifacts, not intentional notes. Report for manual review: `[line number] — ORPHAN BLOCKQUOTE — single-line blockquote, verify intent`.

(d) **Misclassified label blockquotes:** Find any `>` line that is immediately followed (within 1-2 lines) by a fenced code block opening (` ``` `), a table header (`| `), or an image (`![`). These are structural labels misclassified as notes — the `>` prefix must be removed. Convert to a subheading when the label introduces a distinct content block (code block, multi-row table, multi-line example); convert to bold text only when the label is a short inline annotation. If multiple labels at the same level exist in the section, they are parallel subsections — use subheadings for all of them. Report: `[line number] — MISCLASSIFIED LABEL — blockquote precedes [code block / table / image], convert to [subheading / bold]`.

(e) **Blockquoted introductions:** Find any `>` line that is the first substantive content after the document title (`#` heading) or the first substantive content after a `##` section heading. Badges, shields (`![...](...)` lines), and horizontal rules (`---`) between the heading and the blockquote are decorative and do not count as substantive content — a blockquote following only decorative lines is still the introduction. Document introductions and section openers are primary content — never notes. Report: `[line number] — BLOCKQUOTED INTRODUCTION — first substantive content after [title / section heading], convert to plain paragraph`.
