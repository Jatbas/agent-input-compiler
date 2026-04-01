# Phase 1: Deep Analysis (4 Parallel Explorers)

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

**Handoff accounting (before processing).** Enumerate each explorer's output before analyzing content: Explorer 1: N findings, M with citations. Explorer 2: N findings, M with citations. Explorer 3: N findings, M with citations. Explorer 4: N findings, M with citations. If any explorer returned 0 findings, investigate whether the explorer ran correctly before proceeding.

Read all 4 explorer outputs. For each finding:

- Verify the citation format (must have file:line, grep result, or URL)
- Note which explorer produced it
- Flag findings with no evidence citation — candidates for removal
- Identify convergence (multiple explorers found the same thing — strong evidence)
- Identify contradictions (explorers disagree — flag for investigation)

**Post-spawn validation.** For each explorer output, check: (1) findings use the required evidence format, (2) at least 1 citation per finding (citation floor), (3) output addresses the assigned dimension, not a different one. If any explorer fails 2+ of these checks, re-spawn it once with a more specific prompt. Maximum 1 re-spawn per explorer.

**Convergence detection.** After merging, check whether all explorers returned suspiciously similar top findings — each explorer's top 3 findings overlap significantly with the others, with no unique perspectives. This suggests explorers searched the same obvious areas rather than their assigned dimensions. If detected, re-spawn the weakest explorer with a narrower scope targeting the areas its dimension should uniquely cover. Maximum 1 convergence re-spawn per phase.

### 1d. Gap check

Ask: "What aspects of the document did NO explorer investigate?" If important gaps exist, spawn one additional `explore` subagent for the uncovered area. Maximum 1 gap-fill explorer.

### 1e. Evidence density check

Count evidence citations across all findings. If fewer than 1 citation per finding on average, the investigation was too shallow. Re-spawn the weakest explorer with a more specific prompt.

---

Phase complete. Read `SKILL-phase-2-write.md` and execute it immediately.
