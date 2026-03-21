---
name: aic-documentation-writer
description: Multi-agent documentation pipeline—exploration, Change Specifications, adversarial review, and double-blind factual checks.
---

# Documentation Writer

## Purpose

Produce documentation that surpasses single-model quality through a multi-agent pipeline: parallel deep analysis, synthesis-driven writing, adversarial review, and backward-feedback revision. The skill compensates for individual model blind spots by using specialized explorers, producer-critic separation, and double-blind factual verification — achieving depth and consistency that matches or exceeds a single Opus pass.

The deliverable depends on the operation mode:

- **Write / Modify** — a **Change Specification** (when called by the planner) with fully written target text, or **direct edits** to documentation files (when called by the executor or user).
- **Audit** — a **Structured Audit Report** that inventories every factual claim, structural finding, writing-quality observation, and completeness gap with evidence — plus embedded Change Specifications for issues that need correction.

The same multi-agent machinery (4 explorers, 3-5 critics, double-blind verification) runs in every mode. Quality is equal whether the skill is writing, modifying, or reviewing.

**Announce at start:** "Using the documentation-writer skill."

## Editors

- **Cursor:** Attach the skill with `@` or invoke via `/`. Every "Spawn N agents" instruction means N calls to the **Task tool** with the specified `subagent_type` and `model`. You MUST use the Task tool — never do the work inline.
- **Claude Code:** Invoke with `/aic-documentation-writer`. Every "Spawn N agents" instruction means N parallel subagent launches. You MUST spawn separate agents — never do the work inline.

## Cardinal Rules

### 0. Mandatory Subagent Dispatch

**This skill's entire value comes from multi-agent parallelism. You MUST use the Task tool to spawn subagents where specified — NEVER perform explorer or critic work in the main conversation.** The point of producer-critic separation is that independent agents find issues the main agent misses due to anchoring bias. If you skip subagent dispatch and do the analysis yourself, the output is single-model quality — which defeats the purpose of this skill and violates Cardinal Rule 2 (Producer-Critic Separation).

Concretely: Phase 1 says "Spawn 4 explorers" — you MUST make 4 Task tool calls. Phase 3 says "Spawn 3-5 critics" — you MUST make 3-5 Task tool calls. There is no "I'll just do it myself" shortcut. If the Task tool is unavailable (e.g. readonly mode), tell the user and stop — do not fall back to single-agent work silently.

### 1. Evidence Over Claims

Every finding must cite at least one concrete source: a file path with line number, a grep result, or a URL. If you cannot cite a source, the finding does not exist — move it to Open Questions. This prevents the most common auto-mode failure: plausible-sounding hallucination.

### 2. Producer-Critic Separation

The agent that writes the target text must NEVER evaluate its own writing. Explorers analyze, the main agent writes, critics review. No role crosses boundaries. This structural constraint is what makes the pipeline stronger than a single Opus pass — Opus self-evaluates and anchors on its own reasoning.

### 3. Double-Blind Factual Verification

Technical claims are verified twice: once during analysis (Explorer 1) and independently during review (Critic 2). The critic does NOT see Explorer 1's findings — it starts from scratch. If the two verification passes disagree, the claim is flagged for manual resolution.

### 4. No Unverified Target Text

Every sentence in the Change Specification's target text must be traceable to an explorer finding with evidence. If a sentence cannot be traced, it is a candidate for hallucination — remove it or investigate further.

### 5. Deduplicate Before Writing

When a gap is identified (a topic the document does not cover), the skill MUST check whether a dedicated document in `documentation/` already covers it before writing any content. Glob `documentation/` for files whose name or content matches the gap topic. Three outcomes:

- **Dedicated document exists and covers the topic fully:** Do NOT write the section. Either skip entirely (if the target document has no reason to mention the topic) or write a single cross-reference sentence with a markdown link: `For [topic], see [document title](relative-path).`
- **Dedicated document exists but covers it partially:** Write only the delta — the aspects specific to the target document's context that the sibling does not cover. Link to the sibling for the rest.
- **No dedicated document exists:** Write the full section as normal.

This prevents content duplication across documents, which is the primary source of cross-document inconsistency drift.

### 6. No Task References in Documentation

Documentation must never mention task numbers (e.g. 192, U06) or that a task existed (e.g. "as per task", "implemented in task X", "this task adds"). Describe what was implemented directly — the capability, behavior, or feature — without attributing it to a task. Readers see the current state; they do not need task history.

### 7. Never Change Code

The documentation-writer skill must NEVER modify source code (`.ts`, `.js`, `.cjs`, config files, or anything outside `.md` documentation files). It may only create or edit `.md` files. This rule has no exceptions — not even to "fix a bug" that would make the documentation correct.

**When documentation and code disagree, two regimes apply:**

**Normal documents** (guides, READMEs, best-practices, installation docs): Always change the documentation to match the code. The code is the source of truth. Even if the code appears to have a bug, the documentation-writer documents reality — what the code actually does — not what it should do. If a code bug is suspected, note it as a follow-up item but still update the documentation to match the codebase.

**Prescriptive documents** — documents that specify or constrain implementation. These are the source of truth for what the code _should_ do:

- `documentation/project-plan.md`
- `documentation/implementation-spec.md`
- `documentation/architecture.md`
- `documentation/security.md`

For prescriptive documents, if an incongruence is detected between the codebase and the documentation, STOP — regardless of whether it looks like a code bug, an intentional deviation, or an ambiguous mismatch. Do not change the documentation. Do not change the code. Report the incongruency to the user (cite both the document location and the code location) and ask how to proceed:

1. Update the documentation to match the code (the code is intentionally different)
2. Fix the bug in the code (the document is correct; user or another agent handles the fix)
3. Fix the bug in the code first, then update the documentation

Only after the user has chosen may the skill proceed — and only by changing documentation (options 1 or 3 after a separate bugfix). If the user chose option 2, stop and hand off.

## When to Use

- **Via the planner:** The planner's documentation recipe delegates to this skill for Phase 1 (analysis) and Phases 2-3 (writing + review). The planner reads this `SKILL.md` and follows the protocol. Mode is always write/modify.
- **Via the executor:** The executor's documentation mode (`4-doc`) delegates to this skill's Phase 3 (adversarial review) for post-edit verification. The executor reads this `SKILL.md` and runs Phase 3. Mode is always write/modify.
- **Directly (write/modify):** User says "improve this document", "rewrite section Y", "fix the docs", or "update the installation guide". The skill classifies as write or modify mode and runs the full pipeline (Phases 1-4) end-to-end, producing direct edits.
- **Directly (audit):** User says "review documentation X", "validate this document", "check X for accuracy", "audit this doc", or "verify the installation guide". The skill classifies as audit mode and runs the audit pipeline variant (Phases 1, 2-audit, 3-audit, 4-audit), producing a Structured Audit Report with corrections.

## Inputs (read these when the skill runs directly)

1. The target document path
2. `documentation/` — all sibling documents (for cross-document consistency)
3. `.cursor/rules/AIC-architect.mdc` — active architectural rules
4. Existing source in `shared/src/` — for factual verification against codebase
5. `SKILL-dimensions.md` (this file's sibling — explorer and critic prompt templates)
6. `SKILL-standards.md` (this file's sibling — writing standards and quality gates)
7. `SKILL-policies.md` (this file's sibling — editorial content policies)
8. `../shared/SKILL-investigation.md` — runtime evidence checklist and codebase investigation depth protocols

When called by the planner or executor, these inputs are already in context from the caller's pre-read batch.

## Operation Mode Classification

Before the pipeline runs, classify the user's request into one of three modes. The mode determines the Phase 2 deliverable, Phase 3 critic scope, and Phase 4 output format.

| Mode       | Trigger keywords                                            | Deliverable                                    |
| ---------- | ----------------------------------------------------------- | ---------------------------------------------- |
| **Write**  | "write", "create", "add section", "document X"              | Change Specification with target text          |
| **Modify** | "improve", "rewrite", "fix", "update section", "align"      | Change Specification with target text          |
| **Audit**  | "review", "validate", "check", "verify", "audit", "inspect" | Structured Audit Report + embedded corrections |

**Classification heuristic:** Match keywords in the user's request. If ambiguous (request contains both modify and audit signals), default to **Modify** — it produces both analysis and changes.

When called by the planner or executor, the caller specifies the mode. When invoked directly, the skill classifies based on the user's request.

**Mode effects on the pipeline:**

- **Write / Modify:** Phase 2 produces Change Specifications. Phase 3 critics review the proposed changes (edited-section scope). Phase 4 applies changes and runs mechanical verification.
- **Audit:** Phase 2 produces a Structured Audit Report. Phase 3 critics review the existing document (full-document scope) and challenge the audit itself (Critic 5). Phase 4 presents the report and applies approved corrections.

Phase 1 (Deep Analysis) is identical across all modes — the 4 explorers always run full-document investigation regardless of mode.

## Process Overview

| Phase                       | Write / Modify deliverable              | Audit deliverable                              | Subagents            | Typical duration |
| --------------------------- | --------------------------------------- | ---------------------------------------------- | -------------------- | ---------------- |
| Phase 1: Deep Analysis      | Explorer findings with evidence         | Explorer findings with evidence (same)         | 4 parallel explorers | 2-4 min          |
| Phase 2: Synthesis + Write  | Change Specification with target text   | Structured Audit Report + embedded corrections | 0 (main agent)       | 1-2 min          |
| Phase 3: Adversarial Review | Critic findings + revised target text   | Critic findings on existing doc + audit review | 3-5 parallel critics | 2-4 min          |
| Phase 4: Revise + Verify    | Final verified text + mechanical checks | Report presentation + approved corrections     | 0 (main agent)       | 1-2 min          |

Not every entry point needs all phases — see Entry Point Routing.

---

## Entry Point Routing

| Caller                              | Mode         | Phases to run                | Why                                                                                                                                                             |
| ----------------------------------- | ------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planner (doc recipe exploration)    | Write/Modify | 1, 2, 3                      | Planner needs the Change Specification with verified target text. Planner owns Phase 4 (mechanical verification via its own C.5 checks).                        |
| Executor (4-doc verification)       | Write/Modify | 3 only                       | The Change Specification was already verified during planning. The executor re-runs adversarial review on the APPLIED edits — a second pass with fresh critics. |
| Direct invocation (write or modify) | Write/Modify | 1, 2, 3, 4                   | Full pipeline end-to-end. The skill handles everything including mechanical verification and direct file edits.                                                 |
| Direct invocation (audit)           | Audit        | 1, 2-audit, 3-audit, 4-audit | Full pipeline with audit variants. Produces Structured Audit Report; applies corrections the user approves.                                                     |

---

## Phase 1: Deep Analysis (4 Parallel Explorers)

**Goal:** Gather every fact needed to write accurate, consistent documentation. Four specialized explorers investigate in parallel, each focused on one dimension. This replaces a single agent attempting all 12 exploration items from the planner's documentation recipe.

### 1a. Pre-read inputs

Before spawning explorers, read in one parallel batch:

- The full target document
- All `.md` files in `documentation/` (sibling documents)
- `SKILL-dimensions.md` (explorer prompt templates)
- `SKILL-standards.md` (writing standards)
- `SKILL-policies.md` (editorial content policies)
- `../shared/SKILL-investigation.md` (runtime evidence checklist and codebase investigation depth — inject relevant content into Explorer 1 and Critic 2 prompts for runtime behavior claims)

### 1b. Spawn 4 explorers in parallel (MANDATORY — Cardinal Rule 0)

**You MUST make 4 Task tool calls here.** Build each explorer's prompt from the templates in `SKILL-dimensions.md`. Each explorer receives: the target document path, sibling document paths, and its specific investigation mandate. Do NOT skip this step or attempt to perform the exploration yourself.

**Explorer 1 — Factual accuracy** (`explore` subagent, `fast` model):

Read the target document. For every technical claim — interface names, type names, file paths, ADR references, component descriptions, architecture claims, commands, package names — grep the codebase to verify. Cross-reference the ENTIRE document, not just target sections. Return structured findings: `[claim] — [source file:line] — ACCURATE / INACCURATE / NOT FOUND / UNCERTAIN`.

If 3+ claims are UNCERTAIN, escalate: delegate to the `aic-researcher` skill for a focused factual investigation before proceeding.

**Explorer 2 — Structure + consistency** (`explore` subagent, `fast` model):

Parallel section analysis: identify sections describing the same concept for different targets, compare heading structure, content parity, information density. Mirror document detection: find structural siblings in `documentation/`. Cross-documentation term ripple: grep all docs for terms being modified. ToC-body structure match. Stale marker detection: grep for GAP, TODO, FIXME, stale phase references. Return: structural findings with heading-by-heading comparisons, term divergences, stale markers.

**Explorer 3 — Audience + writing quality baseline** (`generalPurpose` subagent, `fast` model):

Audience classification (user-facing guide, developer reference, mixed). Information placement review: flag subsections where detail level does not match audience. Writing quality baseline: passive voice frequency, sentence length variance, paragraph cohesion, heading hierarchy, formatting consistency. Tone/voice analysis: formal/informal, active/passive, technical level. Return: audience type, mismatches found, quality baseline metrics, tone profile.

**Explorer 4 — Completeness + gaps** (`explore` subagent, `fast` model):

Compare document coverage against codebase reality: glob for files/components/interfaces that should be documented, compare against what the document covers. Build the cross-reference map: which documents reference this one, which does this one reference. Identify undocumented components/concepts with importance ratings (critical / nice-to-have). Return: gap inventory, cross-reference map, completeness assessment.

### 1c. Collect and merge explorer findings

Read all 4 explorer outputs. For each finding:

- Verify the citation format (must have file:line, grep result, or URL)
- Note which explorer produced it
- Flag findings with no evidence citation — candidates for removal
- Identify convergence (multiple explorers found the same thing — strong evidence)
- Identify contradictions (explorers disagree — flag for investigation)

### 1d. Gap check

Ask: "What aspects of the document did NO explorer investigate?" If important gaps exist, spawn one additional `explore` subagent for the uncovered area. Maximum 1 gap-fill explorer.

### 1e. Evidence density check

Count evidence citations across all findings. If fewer than 1 citation per finding on average, the investigation was too shallow. Re-spawn the weakest explorer with a more specific prompt.

---

## Phase 2: Synthesis + Draft Writing

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

## Phase 3: Adversarial Review (3-5 Parallel Critics)

**Goal:** A fresh set of agents with zero prior commitment challenges the draft. Each critic receives the target text (write/modify) or the existing document (audit) but NOT the explorer findings — they start fresh, preventing anchoring bias. This is the quality mechanism that most directly surpasses Opus: Opus self-evaluates its own writing; these critics have zero sunk cost.

### 3a. Pre-read critic templates

Read `SKILL-dimensions.md` for the critic prompt templates. Use the **standard critic templates** for write/modify mode, or the **audit-mode critic templates** for audit mode. Each critic's prompt is built from the template plus the specific document and target text (or audit report).

### 3b. Spawn critics in parallel (MANDATORY — Cardinal Rule 0)

**You MUST make 3-5 Task tool calls here.** Do NOT perform critic analysis yourself — that violates Cardinal Rule 2 (Producer-Critic Separation). **In write/modify mode:** spawn 3-4 critics (Critics 1-4) scoped to edited sections. **In audit mode:** spawn 4-5 critics (Critics 1-5) scoped to the full document.

**Critic 1 — Editorial quality** (`generalPurpose` subagent):

- **Write/Modify scope:** Read the document with the target text applied. Check: voice/tone match with surrounding text, sentence structure variety (not monotonous), paragraph cohesion (one idea per paragraph, smooth transitions), detail level consistency with neighboring sections, ambiguous pronouns or dangling references, heading hierarchy. Parallel section symmetry: if the edited section has a structural sibling, compare ordering, naming, content parity, information density. Audience awareness: verify the text uses appropriate language for the document's audience. Report each issue with the exact line or paragraph. Apply the **anti-agreement mandate** from the Critic 1 template in `SKILL-dimensions.md` — "No editorial issues found" without exhaustive per-section justification will be rejected.
- **Audit scope:** Read the ENTIRE document. Perform the same checks across ALL sections, not just edited ones. Use the audit-mode Critic 1 template from `SKILL-dimensions.md`. Report issues per section.

**Critic 2 — Factual re-verification** (`explore` subagent, `fast` model):

- **Write/Modify scope:** Read the target text. For every technical claim — interface names, type names, file paths, ADR references, component descriptions, commands, package names — grep the codebase to verify. This is INDEPENDENT of Explorer 1's work. The critic has NOT seen Explorer 1's findings. Return: `[claim] — [source file:line] — VERIFIED / NOT FOUND / CONTRADICTED / UNCERTAIN`. Check every claim, not a sample. If 1+ claims are UNCERTAIN (ambiguous grep results, multiple candidates, or source/deployed divergence), flag them for escalation — the main agent routes these to `aic-researcher` before finalizing the Change Specification.
- **Audit scope:** Read the ENTIRE document. Verify every technical claim in ALL sections against the codebase. Use the audit-mode Critic 2 template from `SKILL-dimensions.md`. This is the double-blind pass against Explorer 1 — same principle, full-document scope.

**Critic 3 — Cross-document consistency** (`explore` subagent, `fast` model):

- **Write/Modify scope:** Read the target text and ALL sibling documents. For every key term, component name, status claim, and architecture description in the target text, check that the same term/concept is used consistently in sibling documents. If a mirror document exists, compare section structure and content parity. Return: `[term] — [this doc says X] vs [sibling says Y] — CONSISTENT / DIVERGENT`.
- **Audit scope:** Same checks, but extract terms from the ENTIRE document, not just edited sections. Use the audit-mode Critic 3 template.

**Critic 4 — Reader simulation** (`generalPurpose` subagent, **conditional**):

Spawn for user-facing documents (installation guides, getting started docs, user-facing READMEs) and for **mixed-audience documents** (Explorer 3 classified as "Mixed"). Skip only for pure developer references (implementation specs, project plans, architecture docs).

For mixed-audience documents, use Explorer 3's section-level classification to scope the review — focus Reader Simulation on the user-facing sections only, not developer-reference sections.

- **Write/Modify scope:** Read the document from top to bottom as a first-time reader with zero project knowledge. Report: undefined terms (used without prior definition), unclear prerequisites (steps that assume prior context), missing context (points where the reader would ask "what does this mean?"), jargon without explanation (technical terms a first-time user would not know), dead ends (instructions that stop before the task is complete). Focus on the edited sections but note issues in surrounding context that affect comprehension.
- **Audit scope:** Same checks, full-document scope. Read every section with equal attention. Use the audit-mode Critic 4 template.

**Critic 5 — Audit completeness** (`generalPurpose` subagent, **audit mode only**):

Spawn ONLY in audit mode. This critic receives the Structured Audit Report from Phase 2 and challenges it. The critic has NOT seen the explorer findings — only the report and the document.

Investigation mandate:

- Re-read the document section by section. For each section, check whether the audit report has findings. Flag sections with zero findings — the audit may have skimmed them.
- For claims the report marked ACCURATE, spot-check a sample by grepping the codebase. Flag any that appear wrong.
- Check whether the report missed obvious gaps (topics the document should cover but does not).
- Verify the severity classifications: are critical issues classified as critical? Are moderate issues genuinely moderate?
- Challenge the executive summary verdict: does the evidence support PASS / ADVISORY / FAIL?

Return: `[section or finding] — [issue type: MISSED_SECTION / WRONG_CLASSIFICATION / MISSED_GAP / SEVERITY_MISMATCH / VERDICT_CHALLENGE] — [description with evidence]`. End with: "Audit completeness issues: N."

### 3c. Anti-agreement enforcement

If any critic reports zero issues ("No problems found", "All claims verified", "All terms consistent"), evaluate whether this is genuine or the critic was too shallow:

- If the document is short (< 50 lines) and the changes are minor, zero issues may be genuine. Accept.
- If the document is substantial and the changes are significant, re-spawn the critic with a strengthened mandate: "Your previous review found no issues, which is unlikely for a document of this size. For each section, describe the strongest possible concern. If you genuinely cannot find a concern after exhaustive search, explain exactly what you searched for."

### 3d. Evaluate critic outputs

Read all critic outputs. For each reported issue:

- **Editorial issues (Critic 1):** In write/modify mode: fix the target text. In audit mode: add to the Corrections Required section of the Audit Report. Re-read context around each fix to ensure the fix itself does not introduce new problems.
- **Factual issues — NOT FOUND or CONTRADICTED (Critic 2):** Investigate. Read the source file to determine whether the document or the codebase is correct. For normal documents: fix the target text (write/modify) or add to Corrections Required (audit) to match the code (never change code; see Cardinal Rule 7). For prescriptive documents (project-plan, implementation-spec, architecture, security): STOP, report the incongruency to the user with both locations, and ask how to proceed per Cardinal Rule 7.
- **Consistency divergences (Critic 3):** Fix the target text (write/modify) or add to Corrections Required (audit) to align with the authoritative source. If the sibling document is wrong, note as a follow-up item (do not edit sibling documents outside scope).
- **Reader simulation findings (Critic 4):** In write/modify mode: for issues in the edited sections, fix them (add definitions, clarify prerequisites, simplify jargon); for issues in surrounding context, note as follow-up items. In audit mode: all findings go into the Section-by-section Assessment or Corrections Required.
- **Audit completeness findings (Critic 5, audit mode only):** For each finding, investigate: re-read the document section, re-check the audit report. If the critic is correct (section was missed, classification is wrong, gap was overlooked), update the Audit Report accordingly. If the critic is wrong (the audit did cover it), note the false positive for transparency.

### 3e. Double-blind factual reconciliation

Compare Explorer 1's factual findings against Critic 2's factual findings:

- **Both ACCURATE/VERIFIED:** Strong confidence. No action needed.
- **Explorer 1 ACCURATE but Critic 2 NOT FOUND:** Critic may have searched differently. Re-read the source file. If the claim is correct, note the discrepancy for transparency.
- **Explorer 1 ACCURATE but Critic 2 CONTRADICTED:** Serious discrepancy. Read the source file to resolve. The more specific citation wins. If unresolvable, flag in Open Questions.
- **Explorer 1 INACCURATE and Critic 2 CONTRADICTED:** Strong agreement — the document claim is wrong. For normal documents: fix the target text to match the code (never change code). For prescriptive documents: STOP and ask the user how to proceed per Cardinal Rule 7.
- **Either UNCERTAIN:** The claim needs manual verification. Do not include it in target text without resolution.

### 3f. Backward feedback loop

If Phase 3 found issues that require rewriting target text (not just minor fixes):

1. Apply all fixes to the target text
2. Re-run ONLY Critic 2 (factual re-verification) on the revised text — the other critics' concerns were addressed by the fixes
3. Maximum 2 revision loops. "Still failing" means Critic 2 reports 1+ NOT FOUND or CONTRADICTED claims after the revision. UNCERTAIN claims that existed before revision are not blocking — move them to Open Questions. If still failing after 2 loops, flag unresolvable issues in a Blocked section

---

## Phase 4: Revise + Verify (Direct Invocation Only)

**Goal:** Apply the verified target text to the document and run mechanical verification. This phase runs only during direct invocation — when called by the planner or executor, they handle verification through their own protocols.

### Write/Modify mode

#### 4a. Apply changes

For each change in the Change Specification:

1. Use targeted edits (StrReplace) to apply the target text
2. After each edit, re-read the edited section plus 5 lines before and after
3. Verify: target text applied correctly, smooth transitions, no formatting inconsistencies

#### 4b. Run mechanical verification

Run all 13 dimensions from the executor's `4-doc-c` table:

| #   | Dimension                       | Method                                               |
| --- | ------------------------------- | ---------------------------------------------------- |
| 1   | Change specification compliance | Re-read Change Spec vs actual document               |
| 2   | Factual accuracy                | Grep codebase for every technical claim              |
| 3   | Cross-document consistency      | Grep sibling docs for key terms                      |
| 4   | Link validity                   | Glob for every markdown link target                  |
| 5   | Writing quality                 | Critic 1 output — all issues resolved                |
| 6   | No regressions                  | git diff — only intended sections changed            |
| 7   | ToC-body structure match        | Parse ToC and body headings, verify match            |
| 8   | Scope-adjacent consistency      | Grep full document for key concepts                  |
| 9   | Pre-existing issue scan         | Grep for GAP, TODO, FIXME, stale phases              |
| 10  | Content format compliance       | Tables for definitions, ToC entries for new sections |
| 11  | Cross-doc term ripple           | Grep all documentation/ for old terms replaced       |
| 12  | Intra-document consistency      | Grep full document for same-mechanism descriptions   |
| 13  | Blockquote integrity            | Grep for disconnected blockquotes and note density   |

Dimensions 1-7, 10, 12, and 13 must be clean. Dimensions 8-9 are informational. Dimension 11 is blocking within scoped files only.

#### 4c. Present results

Report to the user:

- What was changed (section-by-section summary)
- Explorer findings (Phase 1 highlights)
- Critic results (Phase 3 — issues found and resolved)
- Mechanical verification results (Phase 4b — dimension-by-dimension)
- Follow-up items (issues outside scope noted by critics)
- Open questions (unresolved factual discrepancies)

### Audit mode

#### 4d. Present the Audit Report

Present the Structured Audit Report to the user as a formatted dashboard:

1. **Executive summary first** — the verdict (PASS / ADVISORY / FAIL) and severity counts
2. **Section-by-section assessment** — status per document section with key findings
3. **Corrections required** — each correction with its Change Specification and severity
4. **Observations** — informational findings
5. **Open questions** — unresolved claims

Do not present the full factual accuracy inventory or structural integrity details unless the user asks — these are available on request. Lead with what matters: verdict, corrections, and observations.

#### 4e. Apply approved corrections

After presenting the report:

1. Apply all corrections from the Corrections Required section. If the user requests selective application, apply only the approved subset.
2. For each applied correction, re-read the edited section plus 5 lines before and after to verify correct application.
3. Run mechanical verification (dimensions 1-7, 10, 12, 13 from 4b) on the applied corrections only.

#### 4f. Re-present with applied status

After applying corrections, update the report:

- Mark each applied correction as APPLIED
- Update the executive summary verdict if corrections changed the outcome (FAIL with all critical corrections applied becomes ADVISORY or PASS)
- List any corrections that were not applied and why

---

## Adaptive Protocol Scaling

Not every documentation change needs the full pipeline. Scale the protocol based on change complexity:

| Change type    | Example                                            | Protocol                                                                                                                                                                                                                  |
| -------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mechanical     | Fix a typo, update a version number                | Skip Phase 1 explorers. Main agent verifies the single fact, writes the change, runs Critic 2 only (factual spot-check).                                                                                                  |
| Section edit   | Rewrite one section for clarity                    | Full Phase 1 (all 4 explorers). Full Phase 2-3. Phase 4 if direct invocation.                                                                                                                                             |
| Major rewrite  | Restructure entire document, create new document   | Full Phase 1 with extended exploration (researcher delegation for deep analysis). Full Phase 2-3 with 2 revision loops. Phase 4 if direct invocation.                                                                     |
| Audit (full)   | "review this document", "validate installation.md" | Full Phase 1 (all 4 explorers, full-document scope). Phase 2 produces Audit Report. Phase 3 uses audit-mode critics (full-document scope + Critic 5). Phase 4 presents report and applies approved corrections.           |
| Audit (scoped) | "check the Uninstall section for accuracy"         | Same as full audit, but explorers and critics focus on the specified section plus scope-adjacent sections. The Audit Report covers only the scoped sections, with a note about out-of-scope areas not being investigated. |

**Classification heuristic (write/modify):** Count the number of sections affected. 1 section = section edit. 3+ sections or structural changes = major rewrite. Single-line changes with no analysis needed = mechanical.

**Classification heuristic (audit):** If the user specifies a section, use scoped audit. Otherwise, use full audit. Audit mode is selected by the Operation Mode Classification step — it is never a fallback from write/modify.

When called by the planner or executor, the caller specifies the change type. When invoked directly, the skill classifies based on the user's request.

---

## Integration with Planner

The planner's documentation recipe (in `SKILL-recipes.md`) delegates to this skill at two points:

### Delegation point 1: Exploration (Phase 1)

The planner reads this skill's `SKILL.md` and `SKILL-dimensions.md`, then runs Phase 1 (spawn 4 explorers in parallel). Explorer findings feed the planner's Exploration Report — specifically the DOCUMENT PROFILE, FACTUAL ACCURACY, COMPLETENESS, CONSISTENCY, CROSS-REFERENCE MAP, WRITING QUALITY BASELINE, AUDIENCE CLASSIFICATION, PARALLEL SECTION ANALYSIS, SCOPE-ADJACENT FINDINGS, STALE MARKERS, UNCERTAIN CLAIMS, INFORMATION PLACEMENT, CROSS-DOCUMENTATION TERM RIPPLE, and MIRROR DOCUMENT ANALYSIS sections.

### Delegation point 2: Writing + Review (Phases 2-3)

After the user approves the Exploration Report (planner's A.5 checkpoint), the planner runs Phases 2-3. The reviewed target text becomes the Change Specification in the task file. The planner wraps it in the task file template (Steps, Files table, Writing Standards, Cross-Reference Map, acceptance criteria).

### What the planner still owns

Task structure (Steps, Files table, Architecture Notes), documentation recipe selection, scope expansion tiers (A.4c), user checkpoints (A.5), worktree management (section 0), merge (section 6), mechanical review scoring (C.5 checks A-I).

---

## Integration with Executor

The executor's documentation mode (`3-doc` and `4-doc`) delegates to this skill at one point:

### Delegation point: Post-edit verification (Phase 3)

After applying the Change Specification edits (`3-doc`), the executor reads this skill's `SKILL.md` and `SKILL-dimensions.md`, then runs Phase 3 (spawn 3-4 critics in parallel). This is a SECOND adversarial review pass — different from the one during planning, with fresh critics and no anchoring.

The executor processes critic outputs per `3d` (evaluate critic outputs) and runs its own mechanical verification (`4-doc-c` dimensions 1-12). The skill's Phase 3 replaces the executor's previous `4-doc-a` subagent spawning — same quality, single source of truth.

### What the executor still owns

Applying edits (`3-doc`), mechanical verification dimensions (`4-doc-c`), first-pass quality tracking (`4-doc-d`), progress updates (`5b`), commit and merge (`5c`, `6`).

---

## Auto-Mode Resilience — Matching or Exceeding Opus

The documentation-writer skill is designed so that auto-mode (cheaper model) produces documentation that reads as if Opus wrote it. This section documents how.

### Structural advantages over a single Opus pass

| Opus advantage        | Pipeline countermeasure                                     | Why pipeline matches or exceeds                                                                       |
| --------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Deep analysis         | 4 focused explorers each go deep in one dimension           | 4 agents x medium depth > 1 agent x deep. Opus cannot read 4 areas simultaneously.                    |
| Tone calibration      | Explicit tone profile from Explorer 3 feeds the writer      | Writer follows rules instead of calibrating by feel. Rules are reproducible; feel is not.             |
| Self-correction       | Adversarial review by 3-4 fresh critics with zero sunk cost | Stronger than self-correction. Critics have no anchoring bias from the writing process.               |
| Factual accuracy      | Double-blind verification (Explorer 1 + Critic 2)           | Two independent passes catch more errors than one careful pass. Disagreement triggers investigation.  |
| Cross-doc consistency | Dedicated explorer (2) and critic (3) for consistency       | Full-document and cross-document scans are systematic, not opportunistic.                             |
| Reader empathy        | Reader simulation agent with zero project knowledge         | A fresh agent literally cannot assume knowledge. Opus has to pretend it does not know things it does. |
| Nuanced synthesis     | Structured synthesis from pre-organized explorer findings   | Template ensures no connection is missed. Synthesis receives organized evidence, not raw files.       |

### Failure-mode recovery (built into the protocol)

| Failure mode         | Detection                                          | Recovery                                                       |
| -------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| Shallow exploration  | Fewer than 1 evidence citation per finding         | Re-spawn explorer with more specific prompt (1e)               |
| Hallucinated claims  | Critic 2 finds NOT FOUND for Explorer 1's ACCURATE | Double-blind reconciliation resolves (3e)                      |
| Agreeable critic     | Critic reports zero issues on substantial document | Re-spawn with strengthened adversarial mandate (3c)            |
| Anchoring bias       | Writer anchors on first explorer's framing         | Critics do NOT see explorer findings — they start fresh (3b)   |
| Missing coverage     | Gap check reveals uninvestigated area              | Spawn gap-fill explorer (1d)                                   |
| Flat writing         | Critic 1 reports monotonous sentences              | Backward feedback loop revises target text (3f)                |
| Factual disagreement | Explorer 1 and Critic 2 disagree on a claim        | Explicit reconciliation protocol with source file re-read (3e) |

### Quality gates (enforced before output)

**All modes:**

1. Every finding has at least 1 evidence citation (file:line or grep result)
2. Factual re-verification (Critic 2) found zero NOT FOUND or CONTRADICTED claims
3. Editorial review (Critic 1) has zero unresolved issues
4. Cross-doc consistency (Critic 3) has zero DIVERGENT terms
5. Reader simulation (Critic 4) has zero "undefined term" or "dead end" findings (user-facing only)
6. All applicable mechanical dimensions pass (Phase 4, or caller's own verification)
7. Double-blind reconciliation (3e) has zero unresolved discrepancies

**Audit mode only:**

8. Audit coverage — every `##` section in the target document has at least one explorer finding. Sections with zero findings indicate the audit skipped them — re-investigate before finalizing the report.
9. Audit completeness critic (Critic 5) found zero MISSED_SECTION or WRONG_CLASSIFICATION issues, or those issues were resolved by updating the Audit Report.

---

## Conventions

- The documentation-writer skill is the single source of truth for documentation quality protocols
- Explorer and critic prompt templates live in `SKILL-dimensions.md` — always read them before spawning subagents
- Writing standards live in `SKILL-standards.md` — always read them before writing target text
- Editorial content policies live in `SKILL-policies.md` — always read them before writing target text or evaluating content decisions
- The skill never modifies source code — only `.md` documentation files (Cardinal Rule 7). For normal docs, resolve mismatches by changing documentation to match code. For prescriptive docs (project-plan, implementation-spec, architecture, security), stop on any incongruence and ask the user how to proceed
- When called by the planner or executor, the skill follows the caller's worktree and file path conventions
- Maximum subagent budget per invocation: write/modify = 4 explorers + 1 gap-fill + 4 critics + 1 re-spawn = 10; audit = 4 explorers + 1 gap-fill + 5 critics + 1 re-spawn = 11 (Critic 5 adds one). If the document requires more investigation, split into multiple skill invocations
- The skill can delegate to the `aic-researcher` skill when factual investigation requires deep codebase analysis (3+ UNCERTAIN claims)
