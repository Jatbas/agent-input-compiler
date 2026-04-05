# Phase 1: Parallel Tracks (Track A + Track B)

**Goal:** Launch Track A and Track B simultaneously. Each track manages its own sub-agents and produces an independent artifact.

## Pre-read inputs (one parallel batch before spawning any agents)

- The full target document
- All `.md` files in `documentation/` plus `README.md` and `CONTRIBUTING.md` at repo root
- `../aic-documentation-writer/SKILL-dimensions.md` (explorer prompt templates)
- `../aic-documentation-writer/SKILL-standards.md` (writing standards)
- `../aic-documentation-writer/SKILL-policies.md` (editorial content policies)
- `../shared/SKILL-investigation.md` (runtime evidence checklist)

## Launch Track A and Track B simultaneously (MANDATORY)

Make 2 subagent calls in the same message. Do NOT wait for Track A before launching Track B.

### Track A — Writing Track (`generalPurpose` subagent)

**Prompt to pass:**

You are the Writing Track for a documentation update. Run a two-explorer investigation and produce a draft Change Specification.

Target document: [TARGET_DOCUMENT_PATH]
Sibling documents: [SIBLING_DOCUMENT_PATHS]

**Step A1 — Launch Explorer 1 and Explorer 4 in parallel:**

Explorer 1 (Factual accuracy): Use the Explorer 1 prompt template from `../aic-documentation-writer/SKILL-dimensions.md`. For every technical claim in the target document — interface names, type names, file paths, ADR references, component descriptions, commands — grep the codebase to verify. Inject the Runtime Evidence Checklist from `../shared/SKILL-investigation.md` into your investigation. Return structured findings: `[claim] — [source file:line] — ACCURATE / INACCURATE / NOT FOUND / UNCERTAIN`. Minimum 1 file:line citation per finding.

Explorer 4 (Completeness + gaps): Use the Explorer 4 prompt template from `../aic-documentation-writer/SKILL-dimensions.md`. Compare document coverage against codebase reality. Build the cross-reference map. Identify undocumented components with importance ratings (critical / nice-to-have). Return: gap inventory, cross-reference map, completeness assessment.

**Step A2 — After both explorers return, write the Change Specification:**

- Every sentence in the Change Specification must be traceable to an Explorer 1 or Explorer 4 finding with evidence citation (file:line or grep result)
- Apply writing standards from `../aic-documentation-writer/SKILL-standards.md`
- Apply editorial policies from `../aic-documentation-writer/SKILL-policies.md`
- Cardinal Rule 5 (Deduplicate): before writing any new section, glob `documentation/` and root-level `.md` files to check whether a dedicated document already covers the topic; write only the delta if one exists
- Cardinal Rule 7: if the target document is prescriptive (implementation-spec, architecture, security) and code and doc disagree, STOP and report the incongruence rather than writing

**Output from Track A:** Complete Change Specification with an evidence trail (every sentence cites a source).

---

### Track B — Verification Track (`generalPurpose` subagent)

**CRITICAL:** Track B does NOT receive Track A's draft. Do not pass Track A's output to this subagent. Track B operates independently to preserve double-blind verification.

**Prompt to pass:**

You are the Verification Track for a documentation update. Run a two-explorer investigation and produce an independent verification report. You do not have access to the draft being produced by another track — this is intentional.

Target document: [TARGET_DOCUMENT_PATH]
Sibling documents: [SIBLING_DOCUMENT_PATHS]

**Step B1 — Launch Explorer 2 and Explorer 3 in parallel:**

Explorer 2 (Structure + consistency): Use the Explorer 2 prompt template from `../aic-documentation-writer/SKILL-dimensions.md`. Parallel section analysis: identify sections describing the same concept for different targets, compare heading structure, content parity, information density. Mirror document detection: find structural siblings in `documentation/` and root-level files. Cross-documentation term ripple: grep all sibling docs for terms being modified. ToC-body structure match. Stale marker detection: grep for GAP, TODO, FIXME, stale phase references. Return: structural findings, term divergences, stale markers — each with file:line evidence.

Explorer 3 (Audience + writing quality): Use the Explorer 3 prompt template from `../aic-documentation-writer/SKILL-dimensions.md`. Audience classification (user-facing guide, developer reference, mixed). Information placement review: flag subsections where detail level does not match audience. Writing quality baseline: passive voice frequency, sentence length variance, paragraph cohesion, heading hierarchy. Tone/voice analysis. Return: audience type, quality baseline metrics, tone profile — each with document-location evidence.

**Step B2 — Produce the Verification Report:**

1. Factual claim checklist: list every claim that MUST be verified in any draft (with source file:line for each)
2. Structural requirements: sections that must exist, cross-references required, term consistency rules
3. Quality requirements: audience level to match, tone to maintain, passive voice threshold
4. Stale markers: list each with file:line, describe what update is needed

**Output from Track B:** Verification Report with 4 numbered sections as above. Every requirement must have a file:line or document-location citation.

---

## Collect and validate track outputs

After Track A and Track B return:

1. Track A output check: scan the Change Specification for any sentence without an evidence citation — flag as unverified
2. Track B output check: scan the Verification Report for any requirement without a file:line or document-location citation — flag as unverified
3. Contradiction detection: for each Track B structural requirement, check whether Track A's draft satisfies it; flag any gap for Phase 2 reconciliation

---

Phase complete. Read `SKILL-phase-2-team.md` and execute it immediately.
