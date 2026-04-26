# Phase 1: Deep Analysis (4 Parallel Explorers)

**Goal:** Gather every fact needed to write accurate, consistent documentation. Four specialized explorers investigate in parallel, each focused on one dimension. This replaces a single agent attempting all 12 exploration items from the planner's documentation recipe.

### 1a. Classify scope, exposure, and audit depth

Before spawning explorers, decide whether this is write/modify mode, targeted audit mode, or broad audit mode.

- **Targeted write/modify:** one or more named target documents or sections.
- **Targeted audit:** one or more named target documents, with no requested edit yet.
- **Broad audit:** the user asks to audit documentation without naming a target.

For each target or candidate, classify:

| Dimension   | Values                                                       | How to decide                                                                                                                             |
| ----------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Regime      | planning / prescriptive / public / normal / internal working | Use `SKILL-policies.md` §Document regime classification                                                                                   |
| Exposure    | published / tracked-internal / ignored-internal              | Check package metadata, inbound public links, `git ls-files <path>`, and `git check-ignore --no-index <path>`                             |
| Audit depth | deep / scoped / triage                                       | Deep for public and prescriptive docs; scoped for normal developer references; triage for internal working docs unless directly requested |

For broad audit mode, build the candidate inventory from `README.md`, `CONTRIBUTING.md`, root markdown files, and `documentation/**/*.md`. Classify all candidates, then deep-audit public and prescriptive documents first. Normal developer references receive scoped consistency checks keyed to the deep-audited terms. Internal working docs (`documentation/tasks/**`, `documentation/research/**`, `documentation/notes/**`) are advisory context only unless the user explicitly names them.

### 1b. Pre-read inputs

Before spawning explorers, read in one parallel batch:

- The full target document
- Sibling documents selected by audit depth: direct markdown links, inbound public entrypoints, mirror documents, and grep hits for key terms. Do not pre-read every markdown file for internal working docs; use grep first, then read only files with relevant hits.
- `SKILL-dimensions.md` (explorer prompt templates)
- `SKILL-standards.md` (writing standards)
- `SKILL-policies.md` (editorial content policies)
- `../shared/SKILL-investigation.md` (runtime evidence checklist and codebase investigation depth — inject relevant content into Explorer 1 and Critic 2 prompts for runtime behavior claims)

### 1c. Spawn 4 explorers in parallel (MANDATORY — HARD RULE 1)

**You MUST make 4 Task tool calls here.** Build each explorer's prompt from the templates in `SKILL-dimensions.md`. Each explorer receives: the target document path, sibling document paths, and its specific investigation mandate. Do NOT skip this step or attempt to perform the exploration yourself.

**Explorer 1 — Factual accuracy** (`explore` subagent, `fast` model):

Read the target document. For every technical claim — interface names, type names, file paths, ADR references, component descriptions, architecture claims, commands, package names — grep the codebase to verify. In deep audit mode, cross-reference the ENTIRE document. In scoped write/modify mode, cover the edited sections plus surrounding context. In triage mode for internal working docs, verify only claims being edited or used as evidence. Return structured findings: `[claim] — [source file:line] — ACCURATE / INACCURATE / NOT FOUND / UNCERTAIN`.

If 3+ claims are UNCERTAIN, escalate: delegate to the `aic-researcher` skill for a focused factual investigation before proceeding.

**Explorer 2 — Structure + consistency** (`explore` subagent, `fast` model):

Parallel section analysis: identify sections describing the same concept for different targets, compare heading structure, content parity, information density. Mirror document detection: find structural siblings in the exposure-aware sibling set, plus root-level files (`README.md`, `CONTRIBUTING.md`) when public entrypoints are relevant. Cross-documentation term ripple: grep sibling docs for terms being modified. ToC-body structure match. Stale marker detection: grep for GAP, TODO, FIXME, stale phase heading references (`Phase (?:[A-Z]{1,2}|[0-9]+(?:\.[0-9]+)?)\b` — Dimension 9). Treat stale markers in internal working docs as advisory unless the user requested cleanup. Return: structural findings with heading-by-heading comparisons, term divergences, stale markers.

**Explorer 3 — Audience + writing quality baseline** (`generalPurpose` subagent, `fast` model):

Audience classification (user-facing guide, developer reference, mixed, internal working document). Information placement review: flag subsections where detail level does not match audience. Writing quality baseline: passive voice frequency, sentence length variance, paragraph cohesion, heading hierarchy, formatting consistency. Tone/voice analysis: formal/informal, active/passive, technical level. For internal working docs, distinguish factual ambiguity from harmless journal shorthand. Return: audience type, exposure classification, audit depth, mismatches found, quality baseline metrics, tone profile.

**Explorer 4 — Completeness + gaps** (`explore` subagent, `fast` model):

Compare document coverage against codebase reality: glob for files/components/interfaces that should be documented, compare against what the document covers. In broad audit mode, rank gaps by public/prescriptive risk before style gaps. Build the cross-reference map: which documents reference this one, which does this one reference. Identify undocumented components/concepts with importance ratings (critical / nice-to-have). Return: gap inventory, cross-reference map, completeness assessment, and recommended audit depth changes if the initial classification was wrong.

### 1d. Collect and merge explorer findings

**Handoff accounting (before processing).** Enumerate each explorer's output before analyzing content using this template:

- "Explorer 1: [N] findings, [M] with citations. Format: [structured/prose/mixed]."
- "Explorer 2: [N] findings, [M] with citations. Format: [structured/prose/mixed]."
- "Explorer 3: [N] findings, [M] with citations. Format: [structured/prose/mixed]."
- "Explorer 4: [N] findings, [M] with citations. Format: [structured/prose/mixed]."
- "Cross-agent overlap: [N] findings appear in 2+ explorers."

If any explorer returned 0 findings, investigate whether the explorer ran correctly before proceeding.

Read all 4 explorer outputs. For each finding:

- Verify the citation format (must have file:line, grep result, or URL)
- Note which explorer produced it
- Flag findings with no evidence citation — candidates for removal
- Identify convergence (multiple explorers found the same thing — strong evidence)
- Identify contradictions (explorers disagree — flag for investigation)

**Post-spawn validation.** For each explorer output, check: (1) findings use the required evidence format, (2) at least 1 citation per finding (citation floor), (3) output addresses the assigned dimension, not a different one. If any explorer fails 2+ of these checks, re-spawn it once with a more specific prompt. Maximum 1 re-spawn per explorer.

**Convergence detection.** After merging, check whether all explorers returned suspiciously similar top findings — each explorer's top 3 findings overlap significantly with the others, with no unique perspectives. This suggests explorers searched the same obvious areas rather than their assigned dimensions. If detected, re-spawn the weakest explorer with a narrower scope targeting the areas its dimension should uniquely cover. Maximum 1 convergence re-spawn per phase.

### 1e. Gap check

Ask: "What aspects of the document did NO explorer investigate?" If important gaps exist, spawn one additional `explore` subagent for the uncovered area. Maximum 1 gap-fill explorer.

### 1f. Evidence density check

Count evidence citations across all findings. If fewer than 1 citation per finding on average, the investigation was too shallow. Re-spawn the weakest explorer with a more specific prompt.

---

Phase complete. Read `SKILL-phase-2-write.md` and execute it immediately.
