---
name: aic-documentation-writer
description: Multi-agent documentation pipeline—exploration, Change Specifications, adversarial review, and double-blind factual checks.
---

# Documentation Writer

## Purpose

Produce high-quality documentation through a multi-agent pipeline: parallel deep analysis, synthesis-driven writing, adversarial review, and backward-feedback revision.

The deliverable depends on the operation mode:

- **Write / Modify** — a **Change Specification** (when called by the planner) with fully written target text, or **direct edits** to documentation files (when called by the executor or user).
- **Audit** — a **Structured Audit Report** that inventories every factual claim, structural finding, writing-quality observation, and completeness gap with evidence — plus embedded Change Specifications for issues that need correction.

The same multi-agent machinery (4 explorers, 3-5 critics, double-blind verification) runs in every mode. Quality is equal whether the skill is writing, modifying, or reviewing.

**Announce at start:** "Using the documentation-writer skill."

## Editors

- **Cursor:** Attach the skill with `@` or invoke via `/`. Every "Spawn N agents" instruction means N calls to the **Task tool** with the specified `subagent_type` and `model`. You MUST use the Task tool — never do the work inline.
- **Claude Code:** Invoke with `/aic-documentation-writer`. Every "Spawn N agents" instruction means N parallel subagent launches. You MUST spawn separate agents — never do the work inline.

## Cardinal Rules

**Violating the letter of these rules is violating the spirit.** Reframing, reinterpreting, or finding loopholes in these rules is not cleverness — it is the exact failure mode they exist to prevent.

### 0. Mandatory Subagent Dispatch

**You MUST use the Task tool to spawn subagents where specified — NEVER perform explorer or critic work inline.** Phase 1 = 4 Task tool calls. Phase 3 = 3-5 Task tool calls. If the Task tool is unavailable, tell the user and stop.

### 1. Evidence Over Claims

Every finding must cite at least one concrete source: a file path with line number, a grep result, or a URL. If you cannot cite a source, the finding does not exist — move it to Open Questions. This prevents the most common subagent failure: plausible-sounding hallucination.

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

**When documentation and code disagree, three regimes apply.** See `SKILL-policies.md §Document regime classification` for the authoritative definition and all regime-specific rules. Summary:

**Planning documents** (`documentation/project-plan.md`): Carry intent, sequencing, and future targets. Phase names (`Phase 0`, `Phase 1+`, `Phase 2`) are structural content — do not treat them as stale. The `Temporal robustness` rule (no phase references) does not apply here. When code has diverged from what the plan says: STOP and ask — the plan may be describing a future target.

**Prescriptive documents** — current implementation contract (docs are source of truth):

- `documentation/implementation-spec.md`
- `documentation/architecture.md`
- `documentation/security.md`

For prescriptive documents, if an incongruence is detected between the codebase and the documentation, STOP — regardless of whether it looks like a code bug, an intentional deviation, or an ambiguous mismatch. Do not change the documentation. Do not change the code. Report the incongruency to the user (cite both the document location and the code location) and ask how to proceed:

1. Update the documentation to match the code (the code is intentionally different)
2. Fix the bug in the code (the document is correct; user or another agent handles the fix)
3. Fix the bug in the code first, then update the documentation

Only after the user has chosen may the skill proceed — and only by changing documentation (options 1 or 3 after a separate bugfix). If the user chose option 2, stop and hand off.

**Normal documents** (guides, READMEs, best-practices, installation docs): Always change the documentation to match the code. The code is the source of truth. Even if the code appears to have a bug, the documentation-writer documents reality — what the code actually does — not what it should do. If a code bug is suspected, note it as a follow-up item but still update the documentation to match the codebase.

## Autonomous Execution

Run all phases (1 through 4) as a single continuous flow. Do NOT pause between phases to report status, explain what you will do next, or ask for confirmation. Completing one phase means immediately starting the next — not sending a message and waiting.

**Legitimate user gates (the ONLY points where you stop and wait):**

- Prescriptive document incongruence (Cardinal Rule 7 — code vs doc mismatch in project-plan, implementation-spec, architecture, security)
- Audit mode Phase 4e: after presenting the Structured Audit Report, wait for user to approve corrections before applying them

**Everything else runs without pausing.** Exploration, synthesis, adversarial review, and mechanical verification all run as one continuous flow. Present results at Phase 4c (write/modify) or Phase 4d (audit) after all work is complete.

**Anti-pattern:** Do not pause between phases to report status.

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

## Phase Dispatch

After classifying the operation mode and determining entry point routing, read and execute the appropriate phase files in order. Each phase file is a sibling of this file (same directory). Read each one just before executing it — do NOT skip ahead.

**Full pipeline (direct invocation — write/modify or audit):**

1. Read `SKILL-phase-1-analyze.md` → execute Phase 1 (4 parallel explorers)
2. Read `SKILL-phase-2-write.md` → execute Phase 2 (synthesis + draft)
3. Read `SKILL-phase-3-review.md` → execute Phase 3 (3-5 parallel critics)
4. Read `SKILL-phase-4-verify.md` → execute Phase 4 (apply + verify)

**Planner delegation (Phases 1-3 only):**

1. Read `SKILL-phase-1-analyze.md` → execute Phase 1
2. Read `SKILL-phase-2-write.md` → execute Phase 2
3. Read `SKILL-phase-3-review.md` → execute Phase 3

**Executor delegation (Phase 3 only):**

1. Read `SKILL-phase-3-review.md` → execute Phase 3

**Reference files (read before spawning subagents):**

- `SKILL-dimensions.md` — explorer and critic prompt templates
- `SKILL-standards.md` — writing standards and quality gates
- `SKILL-policies.md` — editorial content policies

**CRITICAL:** You must NOT skip Phase 1 exploration. The target text in Phase 2 depends on explorer findings. Writing without evidence produces hallucinated documentation.

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

## Quality Gates (enforced before output)

**All modes:**

1. Every finding has at least 1 evidence citation (file:line or grep result)
2. Factual re-verification (Critic 2) found zero NOT FOUND or CONTRADICTED claims
3. Editorial review (Critic 1) has zero unresolved issues
4. Cross-doc consistency (Critic 3) has zero DIVERGENT terms
5. Reader simulation (Critic 4) has zero "undefined term" or "dead end" findings (user-facing only)
6. All applicable mechanical dimensions pass (Phase 4, or caller's own verification)
7. Double-blind reconciliation (3e) has zero unresolved discrepancies

**Audit mode only:**

8. Every `##` section has at least one explorer finding — re-investigate sections with zero.
9. Critic 5 found zero MISSED_SECTION or WRONG_CLASSIFICATION issues, or those were resolved.

---

## Critical Reminders

- Never skip subagent dispatch — always use the Task tool for explorers and critics (Cardinal Rule 0).
- Every claim needs a file:line citation — "obviously true" is where hallucination hides (Cardinal Rule 1).
- Never self-review your own writing — critics must be independent agents (Cardinal Rule 2).
- Zero-issue critic reports on substantial documents require re-spawn with strengthened mandate.
- Every sentence in target text must trace to an explorer finding (Cardinal Rule 4).
- Glob `documentation/` for existing coverage before writing gap-fill content (Cardinal Rule 5).

## Common Rationalizations — STOP

| Thought                                                           | Reality                                                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| "I can write this section myself without explorers"               | Single-agent writing anchors on your own assumptions. Explorers find what you miss. Cardinal Rule 0.    |
| "This section is straightforward, no exploration needed"          | Straightforward sections are where unchecked assumptions cause the most factual errors.                 |
| "I can be my own critic"                                          | Producer-critic separation IS the quality mechanism. Self-review is anchored. Cardinal Rule 2.          |
| "The explorers found nothing interesting"                         | Check for tunnel vision. Did they search the right files? Spawn a gap-fill explorer.                    |
| "All critics agree — the writing is fine"                         | Zero-issue reports from critics violate the anti-agreement rule. Re-spawn with strengthened mandate.    |
| "This claim is obviously true, no verification needed"            | Every factual claim needs a file:line citation. Cardinal Rule 1.                                        |
| "The double-blind check is overkill for this document"            | Double-blind factual verification is non-negotiable. Cardinal Rule 3.                                   |
| "I will skip the deduplication check — this is new content"       | Dedicated documents for the same topic may already exist. Glob first, then write. Cardinal Rule 5.      |
| "I will just do a quick inline edit instead of the full pipeline" | The full pipeline is what produces quality beyond single-model. Shortcuts produce single-model quality. |
| "The target text is close enough to what the Change Spec says"    | Every sentence must be traceable to explorer findings. "Close enough" = unverified. Cardinal Rule 4.    |

## Failure-Mode Recovery

| Failure mode         | Detection                                          | Recovery                                 |
| -------------------- | -------------------------------------------------- | ---------------------------------------- |
| Shallow exploration  | < 1 citation per finding                           | Re-spawn explorer (1e)                   |
| Hallucinated claims  | Critic 2 finds NOT FOUND for Explorer 1's ACCURATE | Double-blind reconciliation (3e)         |
| Agreeable critic     | Zero issues on substantial doc                     | Re-spawn with strengthened mandate (3c)  |
| Anchoring bias       | Writer anchors on first explorer                   | Critics don't see explorer findings (3b) |
| Missing coverage     | Gap check reveals uninvestigated area              | Gap-fill explorer (1d)                   |
| Flat writing         | Critic 1 reports monotonous sentences              | Backward feedback loop (3f)              |
| Factual disagreement | Explorer 1 and Critic 2 disagree                   | Reconciliation protocol (3e)             |

## Conventions

- The documentation-writer skill is the single source of truth for documentation quality protocols
- Explorer and critic prompt templates live in `SKILL-dimensions.md` — always read them before spawning subagents
- Writing standards live in `SKILL-standards.md` — always read them before writing target text
- Editorial content policies live in `SKILL-policies.md` — always read them before writing target text or evaluating content decisions
- The skill never modifies source code — only `.md` documentation files (Cardinal Rule 7). For normal docs, resolve mismatches by changing documentation to match code. For prescriptive docs (project-plan, implementation-spec, architecture, security), stop on any incongruence and ask the user how to proceed
- When called by the planner or executor, the skill follows the caller's worktree and file path conventions
- Maximum subagent budget per invocation: write/modify = 4 explorers + 1 gap-fill + 4 critics + 1 re-spawn = 10; audit = 4 explorers + 1 gap-fill + 5 critics + 1 re-spawn = 11 (Critic 5 adds one). If the document requires more investigation, split into multiple skill invocations
- The skill can delegate to the `aic-researcher` skill when factual investigation requires deep codebase analysis (3+ UNCERTAIN claims)
