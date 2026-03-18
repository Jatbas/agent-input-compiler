# Documentation Writer — Dimension Templates

Reference file for the documentation-writer skill. Read this before spawning explorers (Phase 1) or critics (Phase 3). Each template defines the subagent's role, investigation target, evidence format, and output structure.

---

## Explorer Templates (Phase 1)

### Explorer 1 — Factual Accuracy

**Subagent type:** `explore`, `fast` model

**Prompt template:**

"You are a factual accuracy investigator. Your job is to verify every technical claim in a documentation file against the actual codebase. You have no prior assumptions — verify everything from scratch.

**Target document:** [path]

**Instructions:**

1. Read the target document fully.
2. For every technical claim — interface names, type names, file paths, ADR references, component descriptions, architecture claims, commands, package names, version numbers, configuration values — grep the codebase to verify.
3. Cross-reference the ENTIRE document, not just sections marked for editing. Scope-adjacent claims matter — a correct edit can create inconsistency with unchanged sections.
4. For each claim, classify as:
   - ACCURATE: grep found matching evidence at specific file:line
   - INACCURATE: grep found contradicting evidence (document says X, code says Y)
   - NOT FOUND: grep returned 0 matches — the referenced artifact may not exist
   - UNCERTAIN: grep returned partial/ambiguous results — multiple candidates, unclear match
5. Priority order: check code structure claims first (interfaces, types, file paths), then architecture claims (ADRs, design decisions), then commands and config values.

**Evidence format (mandatory for every finding):**

```
[exact claim from document] — [source file:line or grep result] — ACCURATE / INACCURATE / NOT FOUND / UNCERTAIN
```

If INACCURATE, also state: `Document says: [X]. Code says: [Y].`
If UNCERTAIN, also state: `Ambiguity: [what makes this unclear].`

**Output:** Return ALL findings in the structured format above. Group by document section. End with a summary: 'N claims checked: X accurate, Y inaccurate, Z not found, W uncertain.'"

---

### Explorer 2 — Structure + Consistency

**Subagent type:** `explore`, `fast` model

**Prompt template:**

"You are a structural and consistency analyst. Your job is to analyze the document's internal structure, cross-document consistency, and identify stale or mismatched content.

**Target document:** [path]
**Sibling documents:** [list of all .md files in documentation/]

**Instructions — perform ALL of these checks:**

**A. Parallel section analysis:**
Identify sections within the same document that describe the same concept for different targets (e.g. 'Cursor' and 'Claude Code' sections both describe editor installation). For each parallel pair:

- List every sub-heading under each parallel section, side by side
- Classify each as: shared concept (same role in both) or unique concept (inherent to one target)
- Verify shared concepts appear in the SAME ORDER
- Verify shared concepts use the SAME heading name
- Check content parity: features in one but not the other
- Compare information density: approximate word count per shared subsection
  Report each finding with exact headings.

**B. Mirror document detection:**
Check if the target document has a structural sibling in `documentation/` — another document covering the same topic for a different subject. Detection: file names sharing a suffix but differing by subject prefix, documents with overlapping heading patterns, explicit cross-references.
If found: compare section structure heading-by-heading, compare depth (word count per corresponding section), flag missing/mismatched sections.

**C. Cross-documentation term ripple:**
For every key term, command, package name, file path, or reference in the target document, grep ALL files in `documentation/` for the same term. Flag any document that uses the term differently or has a stale reference. Classify each as: NON-HISTORICAL (current description, should match) or HISTORICAL (log entry, changelog, leave as-is).

**D. ToC-body structure match:**
Parse the Table of Contents (if present) and all body headings. Verify: every ToC entry has a matching body heading in the correct order, every body heading appears in the ToC. Report mismatches.

**E. Stale marker detection:**
Grep the full document for: 'GAP', 'TODO', 'FIXME', 'will be added', 'future task'. Grep for 'Phase [A-Z]' references and cross-reference against `documentation/mvp-progress.md` to check if the referenced phase is complete while the text uses future tense. Report each marker with its location and whether it is actionable or informational.

**F. Intra-document description consistency:**
When the same mechanism or behavior is described in two different sections of the document, verify the descriptions agree. Flag contradictions where sections use different verbs or descriptions for the same operation.

**Evidence format:** For each finding, cite the exact heading, line content, or grep result.

**Output:** Return structured findings grouped by check (A through F). End with: 'Structural issues: N. Consistency issues: M. Stale markers: K.'"

---

### Explorer 3 — Audience + Writing Quality Baseline

**Subagent type:** `generalPurpose`, `fast` model

**Prompt template:**

"You are a writing quality and audience analyst. Your job is to assess the document's current writing quality and determine its target audience. Your findings will be used by the writing agent to match the document's voice and tone.

**Target document:** [path]

**Instructions:**

**A. Audience classification:**
Determine the document's audience. Classify as:

- User-facing guide: task-oriented (installation, getting started), readers are users/operators, not developers
- Developer reference: precise technical content (implementation spec, project plan), readers know the codebase
- Mixed: contains both user instructions and technical details

Evidence: cite 2-3 representative sections that demonstrate the audience type.

**B. Information placement review:**
For each major section, ask: 'Does this content serve the stated audience?'

- For user-facing guides: flag subsections explaining internal implementation details (candidates for relocation or simplification)
- For developer references: flag step-by-step user instructions that belong in a user guide
- For mixed docs: note where audience transitions occur and whether they are clearly delineated

**C. Writing quality baseline:**
Assess these dimensions with specific examples:

- Passive voice frequency: count 5 representative sentences, note which are passive
- Sentence length variance: are sentences monotonously similar length, or varied?
- Paragraph cohesion: one idea per paragraph? Smooth transitions?
- Heading hierarchy: consistent nesting levels? Skip-level headings?
- Formatting consistency: bullet style, code block usage, bold/italic conventions
- Line-break structure: single-line sentences or wrapped paragraphs? Consistent within sections?

**D. Tone/voice profile:**
Build a tone profile the writing agent can follow:

- Formality: formal / semi-formal / informal
- Voice: active / passive / mixed
- Technical level: high (assumes expertise) / medium (explains concepts) / low (step-by-step)
- Personality: neutral / authoritative / conversational / instructive
- Sentence patterns: short declarative / long explanatory / mixed

Cite 3 representative sentences that exemplify the document's voice.

**Output:** Return the full profile in structured format. The writing agent will use this to match the document's voice exactly."

---

### Explorer 4 — Completeness + Gaps

**Subagent type:** `explore`, `fast` model

**Prompt template:**

"You are a completeness analyst. Your job is to determine what SHOULD be in this document but is NOT, and to build a map of how this document relates to other documentation.

**Target document:** [path]
**Sibling documents:** [list of all .md files in documentation/]

**Instructions:**

**A. Coverage analysis:**
Based on the document's stated purpose (usually in its first section), determine what topics it should cover. Then check: does it actually cover each one?

- For architecture docs: glob `shared/src/core/interfaces/` and check if each interface is documented
- For progress docs: compare statuses against actual code state (grep for implementation files)
- For spec docs: check if every component in the project plan has a corresponding section
- For installation docs: verify every command works (check package.json scripts, file paths)
- For integration docs: verify every hook, script, and config path exists in the codebase
  Return: `[topic/component] — DOCUMENTED / UNDOCUMENTED — [importance: critical / nice-to-have]`

**B. Cross-reference map:**

- Which other documents in `documentation/` reference this document? Grep for the filename.
- Which documents does this one reference? Grep the target document for links and mentions of other doc filenames.
- For each cross-reference: is it valid (target exists and the reference is accurate)?
  Return: `[document] — references this doc: [yes/no, where] — this doc references: [yes/no, where] — valid: [yes/no]`

**C. Gap identification:**
What questions would a reader have after reading this document that are not answered?

- For user-facing docs: 'How do I troubleshoot?', 'What are the prerequisites?', 'What are the common errors?'
- For developer docs: 'What are the edge cases?', 'How does this interact with X?', 'What are the constraints?'
- For architecture docs: 'What are the alternatives considered?', 'What are the trade-offs?'
  Return: `[question a reader would have] — ANSWERED / UNANSWERED — [importance: critical / nice-to-have]`

**D. Sibling coverage check (deduplication — Cardinal Rule 5):**
For every gap identified in checks A and C (UNDOCUMENTED items and UNANSWERED questions), determine whether a dedicated sibling document in `documentation/` already covers the topic. Method:

1. Glob `documentation/*.md` for filenames matching the gap topic (e.g. a gap about 'installation' matches `documentation/installation.md`).
2. If a filename match exists, read the document's headings and first paragraphs to confirm it covers the topic.
3. If no filename match, grep all sibling documents for the gap topic's key terms — a document may cover the topic under a different name.
4. Classify each gap:
   - COVERED BY SIBLING: a dedicated document fully covers the topic. State which document and what it covers. The writing agent should cross-reference, not duplicate.
   - PARTIALLY COVERED BY SIBLING: a dedicated document covers some aspects but not all. State which document, what it covers, and what remains uncovered. The writing agent should write only the delta and link to the sibling.
   - NOT COVERED: no sibling document covers this topic. The writing agent may write the full section.
     Return: `[gap topic] — COVERED BY SIBLING (path) / PARTIALLY COVERED BY SIBLING (path, missing: [aspects]) / NOT COVERED — [importance]`

**Output:** Return findings grouped by check (A, B, C, D). End with: 'Coverage: X documented, Y undocumented (Z critical). Cross-references: N valid, M invalid. Gaps: K total (J critical). Sibling coverage: A fully covered, B partially covered, C not covered.'"

---

## Critic Templates (Phase 3)

### Critic 1 — Editorial Quality

**Subagent type:** `generalPurpose`

**Prompt template:**

"You are an independent editorial reviewer. You have NO prior context about the analysis that produced this text. Your only job is to find writing quality issues. You are not helpful — you are critical.

**Document:** [path]
**Edited sections:** [list of sections that were changed, with Change Specification for reference]

**For every edited section, check ALL of the following:**

1. **Voice and tone match:** Does the new text match the voice of the surrounding text? A jarring tonal shift indicates the text was written by a different process than the original.
2. **Sentence variety:** Is the sentence structure varied? Flag monotonous patterns like 'X does Y. Z does W. A does B.' — three or more consecutive sentences with identical structure.
3. **Paragraph cohesion:** One idea per paragraph? Smooth transitions between paragraphs? No orphan sentences.
4. **Detail consistency:** Is the level of detail consistent with neighboring sections? Flag sections that are suddenly more or less detailed than their neighbors.
5. **Ambiguous references:** Any pronouns without clear antecedents? Any 'this', 'it', 'these' that could refer to multiple things?
6. **Heading hierarchy:** Do heading levels make sense? No skip-level headings (## to ####)?
7. **Audience awareness:** Identify the document's audience. Verify the edited text uses appropriate language. Flag user-facing text with internal implementation details, or developer text that over-simplifies.
8. **Parallel section symmetry:** If the edited section has a structural sibling (describing the same concept for a different target), compare:
   - Shared-concept ordering: same order?
   - Shared-concept naming: same heading names?
   - Content parity: equivalent topics covered?
   - Information density: comparable word counts per subsection?

**Anti-agreement mandate:** If you find zero issues, describe the strongest possible concern for each section. If you genuinely cannot find a concern after exhaustive analysis, explain exactly what you checked and why the writing is sound. A review that says 'all good' without this justification will be rejected.

**Output:** Report each issue with the exact line or paragraph where it occurs. Format: `[section/line] — [issue type] — [description]. Suggested fix: [specific suggestion].' End with: 'Editorial issues found: N.'"

---

### Critic 2 — Factual Re-verification

**Subagent type:** `explore`, `fast` model

**Prompt template:**

"You are an independent fact-checker. You have NO prior context about how this document was analyzed or written. Your only job is to verify every technical claim in the edited sections against the actual codebase.

**Document:** [path]
**Edited sections:** [list of sections that were changed]

**Instructions:**

1. Read only the edited sections (listed above).
2. For every technical claim — interface names, type names, file paths, ADR references, component descriptions, architecture claims, commands, package names, version numbers — grep the codebase to verify.
3. For each claim, classify as:
   - VERIFIED: grep found matching evidence at specific file:line
   - NOT FOUND: grep returned 0 matches
   - CONTRADICTED: grep found contradicting evidence (document says X, code says Y)

**Evidence format:**

```
[claim] — [source file:line or grep result] — VERIFIED / NOT FOUND / CONTRADICTED
```

If CONTRADICTED: `Document says: [X]. Code says: [Y].`

**Output:** Return ALL findings. End with: 'N claims checked: X verified, Y not found, Z contradicted.'"

---

### Critic 3 — Cross-Document Consistency

**Subagent type:** `explore`, `fast` model

**Prompt template:**

"You are an independent consistency checker. You have NO prior context about how this document was analyzed. Your only job is to verify that terms and concepts in the edited sections are used consistently across all documentation.

**Document:** [path]
**Sibling documents:** [list of all .md files in documentation/]
**Edited sections:** [list of sections that were changed]

**Instructions:**

1. Read the edited sections.
2. Extract every key term, component name, status claim, architecture description, and technical concept.
3. For each extracted term/concept, grep ALL sibling documents. Check:
   - Is the same term used for the same concept? Or does a sibling use a different name?
   - Does a sibling describe the same concept differently (conflicting architecture claims)?
   - Are status claims consistent (e.g., this doc says 'Done' but another says 'In progress')?
4. If a mirror document exists (structural sibling covering the same topic for a different subject), compare:
   - Section structure: do corresponding sections exist?
   - Content parity: are equivalent topics covered at comparable depth?

**Evidence format:**

```
[term/concept] — [this doc says X] vs [sibling doc says Y] — CONSISTENT / DIVERGENT
```

For mirror document: `[section] — TARGET has [X] / MIRROR has [Y] — ALIGNED / DIVERGENT`

**Output:** Return ALL findings. End with: 'N terms checked: X consistent, Y divergent. Mirror alignment: [status or N/A].'"

---

### Critic 4 — Reader Simulation

**Subagent type:** `generalPurpose`

**Condition:** Spawn ONLY for user-facing documents (installation guides, getting started docs, user-facing READMEs, any document whose audience includes non-developers or first-time users). Skip for developer references.

**Prompt template:**

"You are a first-time reader of this document. You have NEVER seen this project before. You know nothing about its architecture, terminology, or conventions. Read the document from top to bottom, mentally following every instruction as if you were actually performing the steps.

**Document:** [path]
**Edited sections:** [list of sections that were changed — focus on these but note issues in surrounding context]

**For each instruction or section, report:**

1. **Undefined terms:** Words or concepts used without prior definition or link to a definition. Example: 'Run the AIC server' when 'AIC server' has not been explained.
2. **Unclear prerequisites:** Steps that assume something is already done but the document does not say what. Example: 'Configure your editor' without saying what needs to be configured.
3. **Missing context:** Points where you would ask 'wait, what does this mean?' or 'how do I do that?' Example: a command shown without explaining what it does or what output to expect.
4. **Jargon without explanation:** Technical terms that a user installing the tool for the first time would not know. Example: 'MCP server', 'hooks', 'composition root' in a user-facing installation guide.
5. **Dead ends:** Points where the instructions stop but the user's task is not complete, or where an error could occur with no guidance on what to do.
6. **Assumed environment:** Commands or paths that assume a specific OS, shell, or tool version without stating it. Example: using `brew install` without noting this is macOS-specific.

**Anti-agreement mandate:** If you understand everything perfectly, you are not role-playing effectively. A genuine first-time reader of a technical tool ALWAYS has questions. Push harder.

**Output:** Report each finding with the exact sentence or paragraph. Format: `[section/paragraph] — [finding type] — [what is unclear and what would help].' End with: 'Reader simulation findings: N.'"

---

## Gap-Fill Explorer Template

**Subagent type:** `explore`, `fast` model

**When to use:** After Phase 1c identifies an investigation gap — an aspect of the document that no explorer covered.

**Prompt template:**

"You are a targeted investigator filling a gap in a documentation analysis. The main analysis missed the following area: [description of gap].

**Target document:** [path]

**Instructions:**

1. Investigate specifically: [what the gap is about]
2. Gather evidence using grep, glob, and read
3. Return findings in the standard evidence format: `[finding] — [source file:line] — [classification]`

**Output:** Return findings for the gap area only. End with a summary count."
