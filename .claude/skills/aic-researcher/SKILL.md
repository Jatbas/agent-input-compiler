---
name: aic-researcher
description: Evidence-backed research via multi-agent protocols; writes documentation/research/ for standalone answers or task-planner input.
---

# Researcher

## Purpose

Produce Opus-quality research through multi-agent investigation protocols. The skill compensates for individual model reasoning limits by using parallel exploration, adversarial review, and structured synthesis — achieving depth and coverage that matches or exceeds a single Opus pass at lower cost.

The deliverable is a **research document** saved to `documentation/research/`. This document can be used standalone (answers a question) or as input to the `aic-task-planner` skill (informs task planning).

**Announce at start:** "Using the researcher skill."

## Editors

- **Cursor:** Attach the skill with `@` or invoke via `/`. Every "Spawn N agents" instruction means N calls to the **Task tool** with the specified `subagent_type` and `model`. You MUST use the Task tool — never do the work inline.
- **Claude Code:** Invoke with `/aic-researcher`. Every "Spawn N agents" instruction means N parallel subagent launches. You MUST spawn separate agents — never do the work inline.

## Cardinal Rules

**Violating the letter of these rules is violating the spirit.** Reframing, reinterpreting, or finding loopholes in these rules is not cleverness — it is the exact failure mode they exist to prevent.

### 1. Mandatory Subagent Dispatch

**This skill uses multi-agent parallelism. You MUST use the Task tool to spawn subagents where specified — NEVER perform investigation work in the main conversation.** §3 says "Spawn 2-4 explorers" — you MUST make 2-4 Task tool calls. §5 says "Spawn 1-2 critics" — you MUST make those Task tool calls. Single-agent investigation misses things that parallel independent agents catch. If the Task tool is unavailable, tell the user and stop.

If you find yourself writing "Explorer N findings:" without having used the Task tool, stop — you are doing the work inline. This is the single most common auto-mode failure in this skill.

### 2. Evidence Over Claims

**Every finding must cite at least one concrete source.** A file path with line number, a URL, or a grep result. No exceptions. If you cannot cite a source, the finding does not exist — move it to Open Questions. This single rule prevents the most common auto-mode failure: plausible-sounding hallucination.

## Autonomous Execution

Run §1 through §6 as a single continuous flow. Do NOT pause between sections to report status, explain what you will do next, or ask for confirmation. Completing one section means immediately starting the next — not sending a message and waiting.

**This skill has NO mid-process user gates.** The entire pipeline — classify, frame, investigate, synthesize, adversarial review, final synthesis — runs without pausing. Present results only at §6e after the research document is saved.

**The ONLY conditions that stop execution:**

- The Task tool is unavailable (Cardinal Rule 1 — tell the user and stop)
- A blocked diagnostic that cannot be resolved by re-spawning

**Anti-pattern:** Sending a message like "Classification complete, now I'll frame the investigation..." and waiting. Run the full pipeline and present the finished research document.

## When to Use

- User says "research", "investigate", "analyze", "look into", "how does X work", "what's wrong with X"
- User asks a question about the codebase that requires reading multiple files
- User wants to evaluate a technology, library, or approach
- User asks for documentation analysis (gaps, inconsistencies, accuracy)
- The `aic-task-planner` skill auto-delegates here when it detects a research-heavy request (see Integration with Planner)
- Any question where the answer requires investigation, not just recall

## Inputs

Read these reference files when the question involves the AIC codebase:

1. `documentation/project-plan.md` — architecture, ADRs, conventions
2. `documentation/implementation-spec.md` — detailed component specs
3. `documentation/tasks/progress/aic-progress.md` — what is done, what is next (main workspace only — gitignored)
4. `documentation/security.md` — security constraints
5. `.cursor/rules/AIC-architect.mdc` — active architectural rules
6. `../shared/SKILL-investigation.md` — runtime evidence checklist and codebase investigation depth (include in explorer prompts)

For technology evaluations, also use `WebSearch` and `WebFetch` tools.

For documentation analysis, read ALL files in `documentation/`.

## Process Overview

| Step                  | Deliverable                                            | Typical duration   |
| --------------------- | ------------------------------------------------------ | ------------------ |
| §1 Classify           | Question classification + protocol selection           | Seconds            |
| §2 Frame              | Hypotheses + investigation plan + explorer assignments | 1-2 min            |
| §3 Investigate        | Explorer findings with evidence                        | 2-5 min (parallel) |
| §4 Synthesize         | Draft synthesis with ranked findings                   | 1-2 min            |
| §5 Adversarial Review | Critic challenges + finding strength ratings           | 1-3 min            |
| §6 Final Synthesis    | Research document                                      | 1-2 min            |

Not every question needs all steps — see Adaptive Protocol Scaling.

---

## §1. Classify the Question

Before any investigation, classify the user's question into one of five types. The classification determines which protocol runs and how many resources are spent.

**Classification decision tree (evaluate in order, stop at first match):**

1. Can the question be answered by reading 1-2 specific files or running 1 grep? → **Factual lookup**
2. Does the question ask how something works, or to trace a flow through the codebase? → **Codebase analysis**
3. Does the question ask what's wrong, what could be improved, or to find gaps/problems? → **Gap/improvement analysis**
4. Does the question ask to evaluate a technology, compare options, or assess fit? → **Technology evaluation**
5. Does the question ask to analyze documentation quality, accuracy, or consistency? → **Documentation analysis**

**Tiebreaker (rules 2 and 3):** If the question matches both rule 2 ("how does X work") AND contains evaluative language ("what's wrong", "what could be improved", "where are the gaps", "is it correct", "how can we improve"), classify as **gap/improvement analysis**. Gap/improvement runs mandatory adversarial review (§5); codebase analysis may skip it — the tiebreaker ensures the stronger protocol runs when intent is ambiguous.

**Announce the classification:** "Classification: [type]. [One sentence explaining why.]"

| Classification           | Protocol depth                                                  | Subagents                      | Output                    |
| ------------------------ | --------------------------------------------------------------- | ------------------------------ | ------------------------- |
| Factual lookup           | §1 only (inline answer)                                         | 0                              | Chat answer — no document |
| Codebase analysis        | §1-§2-§3-§4 (skip §5 if findings converge with strong evidence) | 2-3 explorers                  | Research document         |
| Gap/improvement analysis | All §1-§6                                                       | 3-4 explorers + 1 critic       | Research document         |
| Technology evaluation    | All §1-§6                                                       | 3 explorers (1 web) + 1 critic | Research document         |
| Documentation analysis   | All §1-§6                                                       | 3-4 explorers + 1 critic       | Research document         |

**Factual lookup shortcut:** If the answer requires at most 1-2 specific files or 1 grep, answer directly in chat using those tools. No document, no subagents. Cite the source. Done. If mid-investigation you find that more than 2 files are needed, stop and re-classify.

For all other classifications, proceed to §2.

---

## §2. Frame the Investigation

**Goal:** Before reading any code, reason about what the answer might be and design a systematic investigation. This prevents tunnel vision — the most common auto-mode failure.

### 2a. Restate the question

Write a precise, unambiguous restatement. If the original question is vague ("how can we improve X?"), narrow it: "What are the specific weaknesses in X's current implementation, and what concrete changes would address each one?"

### 2b. Generate hypotheses (gap/improvement and technology evaluation only)

Generate 3-5 hypotheses BEFORE reading any code. Each hypothesis is a possible answer to the question.

**Hypothesis generation heuristics:**

For gap/improvement analysis:

- "The problem might be in [layer]" — one hypothesis per plausible layer
- "The problem might be caused by [pattern]" — one hypothesis per suspect pattern (performance, architecture, missing feature, wrong abstraction)
- "Improvement X might work because [reason]" — one hypothesis per approach

For technology evaluation:

- "Technology X is the best fit because [reason]"
- "Technology Y is better despite being less popular because [reason]"
- "Neither X nor Y — the real solution is [alternative approach]"

**Write each hypothesis as a falsifiable claim.** Not "X might be slow" but "X's token counting is O(n^2) due to [suspected reason], causing latency above [threshold] for large files."

### 2c. Design the investigation plan

For each hypothesis (or each dimension for codebase/documentation analysis), define:

1. **What to investigate** — specific files, directories, patterns
2. **What evidence would confirm** — concrete observations that would make the hypothesis more likely
3. **What evidence would disconfirm** — concrete observations that would make the hypothesis less likely
4. **Assigned explorer** — which subagent handles this

**Explorer assignment rules:**

- Each explorer gets a focused, non-overlapping investigation area
- Maximum 4 explorers (tool limit for parallel subagents)
- Each explorer's prompt includes: the specific hypothesis/dimension, what to search for, what evidence to collect, and the evidence format to return
- Explorers do NOT see each other's assignments (prevents anchoring)

### 2d. Classification-specific framing

Read the `SKILL-protocols.md` sibling file for the detailed protocol matching this question's classification. It contains investigation dimensions, explorer assignments, and evidence collection patterns specific to each type.

---

## §3. Investigate (Parallel Subagents)

**Goal:** Execute the investigation plan from §2 using parallel subagents. Each explorer investigates its assigned area independently.

### 3a. Spawn explorers (MANDATORY — Cardinal Rule 1)

**You MUST make 2-4 Task tool calls here.** Do NOT perform the investigation yourself. Spawn 2-4 `explore` or `generalPurpose` subagents in parallel (use `fast` model). Each explorer's prompt must include:

1. **Role:** "You are an investigator. Your job is to gather evidence about [specific area]. Report only what you find with citations — never speculate."
2. **Target:** The specific hypothesis, dimension, or area to investigate
3. **Search strategy:** What files to read, what patterns to grep, what to look for
4. **Evidence format:** Return findings as a structured table — not free-form prose. Each finding must be a row with columns: Finding title | Evidence (file:line or URL) | Confidence (High/Medium/Low) | Surprise (yes/no + what). This forced format ensures programmatic validation by the parent agent.
5. **Disconfirmation mandate:** "Actively look for evidence AGAINST the hypothesis, not just evidence for it. Report disconfirming evidence with the same rigor."
6. **Escalation:** "It is always OK to stop and say 'this is too complex for my assigned scope.' Bad work with fabricated evidence is worse than partial work with honest gaps. Report what you found and what you could not determine. You will not be penalized for incomplete coverage — you will be penalized for fabricated evidence."

For technology evaluation: one explorer uses `WebSearch` and `WebFetch` for external research (official docs, benchmarks, comparisons). The prompt must specify: "Use official documentation and primary sources. Avoid forum posts and blog articles unless no better source exists."

**Runtime evidence mandate:** When the research question involves runtime behavior (hooks, database contents, deployed files, external system payloads, bootstrap flows), at least one explorer must be a `shell` subagent (or `generalPurpose` with shell access) tasked with gathering actual runtime evidence. Read `../shared/SKILL-investigation.md` and include the **Runtime Evidence Checklist** in this explorer's prompt. This explorer's findings take precedence over documentation-based findings when they conflict.

**Codebase investigation depth:** When the investigation touches the AIC codebase (classifications: codebase analysis, gap/improvement analysis, documentation analysis with code cross-checks), explorer prompts MUST include the **Codebase Investigation Depth** requirements from `../shared/SKILL-investigation.md`. These are read-only — explorers read, query, and trace, but never modify files. These depth requirements do NOT activate for technology evaluations that only involve external technologies (no AIC codebase code).

### 3b. Collect explorer results

**Handoff accounting (before processing).** Enumerate each explorer's output before analyzing content: Explorer 1: N findings, M with citations, confidence distribution (H/M/L). Explorer 2: ... If any explorer returned 0 findings, investigate whether the explorer ran correctly before proceeding.

Read each explorer's output. For each finding:

- Verify the citation format (must have file:line or URL)
- Note which explorer produced it
- Flag any finding with no evidence citation — these are candidates for removal

**Post-spawn validation.** For each explorer output, check: (1) findings use the required structured table format, (2) at least 1 citation per finding (citation floor), (3) output addresses the assigned hypothesis/dimension, not a different one. If any explorer fails 2+ of these checks, re-spawn it once with a more specific prompt. Maximum 1 re-spawn per explorer.

**Convergence detection.** After collecting, check whether all explorers returned suspiciously similar top findings — each explorer's top findings overlap significantly with the others, with no unique perspectives. This suggests explorers searched the same obvious areas rather than their assigned targets. If detected, re-spawn the weakest explorer with a narrower scope. Maximum 1 convergence re-spawn.

---

## §4. Synthesize

**Goal:** Merge findings from all explorers into a coherent draft, identifying patterns, contradictions, and gaps.

### 4a. Merge findings

Organize all findings from all explorers. Group by:

- **Convergence:** Did multiple explorers independently find the same thing? If yes, this is strong evidence — note which explorers converged.
- **Contradiction:** Did explorers find conflicting evidence? If yes, note both sides — do not resolve prematurely.
- **Unique:** Findings from only one explorer. These need the critic's attention most.

### 4b. Identify gaps

Ask: "What aspects of the question did NO explorer investigate?" List them. If gaps exist and they are important to the answer, spawn one additional explorer for the uncovered area before proceeding. This is a **sequential spawn** — wait for the result before proceeding to §4c draft synthesis. Add its findings to the merge.

### 4c. Draft synthesis

Write the draft research document using the template (see Research Document Template below). At this stage:

- Include ALL findings (even low-confidence ones — the critic will help trim)
- Note convergence and contradictions in the Analysis section
- Leave the Adversarial Status field as "Pending review" for all findings
- Write the Executive Summary as a draft — it will be refined after adversarial review

### 4d. Evidence density check

Count evidence citations across all findings. If fewer than 1 citation per finding on average, the investigation was too shallow. Go back to §3 and re-spawn the weakest explorer with a more specific prompt.

### 4e. Strategic implications pass — REQUIRED for technology evaluation and gap/improvement (skip for all other classifications)

For each finding, ask: **"What does this mean for AIC beyond the obvious first-order conclusion?"** Generate at least one second-order implication per finding. A second-order implication connects the finding to a project decision, timeline, or design choice that isn't directly stated in the evidence.

**Examples of first-order vs. second-order reasoning:**

- Finding: "MCP is moving toward stateless transport." First-order: "Doesn't affect AIC's stdio transport." Second-order: "MCP's cookie-like session mechanism could influence AIC's Phase 1 session tracking design — aligning early avoids rework."
- Finding: "Enterprise WG doesn't exist yet." First-order: "Track it." Second-order: "AIC's Phase 1 OSS release positions it to contribute requirements to the WG from day one, shaping the spec rather than reacting to it."

**Process:** After writing the draft synthesis (§4c), re-read each finding and write one sentence starting with "This also means..." or "The non-obvious consequence is..." If no second-order implication exists after genuine effort, note "First-order only — no downstream project implications identified." Include the strongest implications in the Analysis section. This is what separates a fact-reporting exercise from strategic research.

---

## §5. Adversarial Review

**Goal:** A fresh agent with zero prior commitment challenges the draft findings. This is the quality mechanism that most directly compensates for auto-mode's tendency to accept its own conclusions.

**When to skip:** For codebase analysis only — if ALL findings in §4 have High confidence and at least 2 explorers converged on each finding, the adversarial review can be skipped. For all other classifications (gap/improvement, technology evaluation, documentation analysis), adversarial review is MANDATORY.

### 5a. Spawn the critic (MANDATORY — Cardinal Rule 1)

**You MUST make a Task tool call here.** Do NOT critique your own synthesis — that defeats the purpose of adversarial review. Spawn a `generalPurpose` subagent with `fast` model. The critic's prompt must include:

1. **Role:** "You are an independent critic. You have NO prior context about this investigation. Your only job is to find flaws, challenge assumptions, and propose alternatives. You are not helpful — you are adversarial. The investigators may have been shallow or optimistic. Verify independently — read the actual code/files, do not accept their claims at face value."
2. **Input:** The original question + the draft synthesis (from §4c) + the evidence citations
3. **NOT included:** The hypotheses, the investigation plan, or the explorer prompts. The critic must not be anchored by the investigation's framing.
4. **Tasks:**
   - For each finding: attempt to disprove it. Search the codebase for counter-evidence. If you cannot disprove it, **state exactly what you searched for** (grep patterns, files read, directories checked) and why disproof was not possible. A finding marked "Unchallenged" without a search log will be treated as unevaluated.
   - Identify unstated assumptions in the analysis.
   - Propose at least one alternative explanation for the evidence presented.
   - Rate each finding: Strong (multiple independent evidence, survived challenge) / Moderate (single clear evidence, no counter-evidence found) / Weak (inferred, absence-based, or counter-evidence exists)
   - Flag any finding that relies on absence of evidence ("I didn't find X" ≠ "X doesn't exist")
5. **Anti-agreement instruction:** "If you agree with all findings without challenge, your review will be rejected and you will be re-spawned with a stronger adversarial mandate. A genuine review challenges at least some findings."

### 5b. Evaluate critic output

Read the critic's challenges. For each:

- **Valid challenge with evidence:** Incorporate it. Downgrade the finding's confidence, add a caveat, or remove the finding.
- **Valid challenge without evidence but with sound reasoning:** Add the alternative explanation as a caveat in the finding.
- **Invalid challenge (misread evidence, wrong file, logical error):** Reject it with explanation. Keep the finding unchanged.

**Critic quality check:** If the critic marked ALL findings as "Strong" or agreed with everything, re-spawn with the strengthened prompt: "Your previous review was too agreeable. For each finding, describe the strongest possible counter-argument. If you genuinely cannot find a counter-argument after exhaustive search, explain exactly what you searched for (grep patterns, files read, areas checked)."

---

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
2. **Adversarial coverage:** The critic challenged at least some findings. If all are "Unchallenged" → re-run §5 with stronger mandate.
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

---

## Auto-Mode Resilience — Matching or Exceeding Opus

The research skill is designed so that auto-mode (cheaper model) produces results matching or exceeding a single Opus pass. This section documents how.

**Structural advantages over a single Opus pass:**

| Opus advantage            | Protocol countermeasure                                                | Why protocol matches or exceeds                                                                   |
| ------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Deep reasoning            | 3-4 focused explorers each go deep in one area                         | 4 agents x medium depth > 1 agent x deep. Opus cannot read 4 areas simultaneously.                |
| Alternative consideration | Hypothesis-driven framing: generate 3-5 hypotheses BEFORE reading code | Structurally prevents convergence. Opus considers alternatives internally but may still converge. |
| Self-correction           | Adversarial review by fresh agent with zero sunk cost                  | Stronger than self-correction. A separate critic has zero anchoring bias.                         |
| Nuanced synthesis         | Structured synthesis phase merging pre-organized findings              | Template ensures no connection is missed. Synthesis receives organized data, not raw files.       |
| Honest uncertainty        | Evidence requirements: must cite file:line or URL. Absence = Weak.     | Structurally prevents hallucination. Impossible to assert without evidence.                       |
| Comprehensive coverage    | Parallel exploration with assigned, non-overlapping targets            | Coverage guaranteed by assignment. Opus decides what to read and may miss areas.                  |
| Context utilization       | Each subagent gets focused, short-context task                         | Eliminates the long-context problem. No single agent holds everything.                            |

**Failure-mode recovery (built into the protocol):**

| Failure mode           | Detection                                              | Recovery                                                |
| ---------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| Shallow exploration    | Fewer than 1 evidence citation per finding             | Re-spawn explorer with more specific prompt             |
| Hallucinated citations | Critic re-reads every cited source                     | Downgrade or remove finding; re-investigate if critical |
| Agreeable critic       | All findings marked "Unchallenged"                     | Re-spawn with strengthened adversarial mandate          |
| Flat synthesis         | Analysis mentions each finding independently           | Re-do synthesis with explicit relation-mapping prompt   |
| Missing coverage       | Gap check after synthesis reveals uninvestigated areas | Spawn additional explorer for uncovered area            |

**Mandatory quality gates (enforced before document is finalized):**

1. Every finding has at least 1 evidence citation
2. Critic challenged at least some findings (not all "Unchallenged")
3. Open Questions section is non-empty (for non-factual-lookup questions)
4. No more than 60% of findings rated "High confidence" (for non-factual-lookup)
5. Cross-explorer convergence automatically upgrades finding confidence

---

## Integration with Planner

The research skill integrates with the `aic-task-planner` in two modes:

### Mode 1: Explicit research input

The user runs research first, then tells the planner to use it:

- "Plan tasks based on `documentation/research/2026-03-15-doc-analysis.md`"
- "Plan using this research"

The planner reads the research document in its §1 pre-read batch and uses findings to inform design decisions.

### Mode 2: Auto-delegation from planner

The planner's §0b Intent Classification detects that the user's request needs research and auto-delegates to this skill. The planner runs the FULL research protocol (all phases, same quality gates) and saves the research document. Then it asks the user whether to proceed with planning based on the findings.

**The guarantee:** Whether the user invokes the research skill directly or the planner auto-delegates, the SAME protocol runs. Same explorers, same critic, same quality gates. The output quality is identical regardless of entry point. The user never needs to worry about choosing the right skill.

### How the planner references research findings

When the planner has a research document (from either mode):

- The exploration report can cite research findings as pre-verified evidence (with a `Source: research document` annotation)
- The planner MUST still verify factual claims against the current codebase (code may have changed since the research was conducted)
- Each research recommendation that maps to a code or documentation change becomes a candidate task
- The planner does NOT blindly convert recommendations into tasks — it applies its own ranking (§1) and exploration (Pass 1) to validate that each recommendation is the right next step

---

## Common Rationalizations — STOP

If you catch yourself thinking any of these, you are rationalizing. Stop and follow the process.

| Thought                                                         | Reality                                                                                                  |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| "I can investigate this myself without subagents"               | Single-agent investigation misses what parallel independent agents catch. Cardinal Rule 1.               |
| "One explorer is enough for this"                               | Even simple questions benefit from 2+ perspectives. Minimum is 2 explorers.                              |
| "I already know the answer from context"                        | You have anchoring bias. Subagents do not. Spawn them.                                                   |
| "The findings all agree, so skip adversarial review"            | Agreement without challenge proves nothing. The critic exists to find what you missed.                   |
| "The critic agrees with everything — good enough"               | A fully agreeable critic failed its job. Re-spawn with strengthened adversarial mandate.                 |
| "This evidence is obvious, no citation needed"                  | Every finding requires a file:line or URL. No exceptions. Cardinal Rule 2.                               |
| "This is just a factual lookup"                                 | Only if 1-2 files answer it. If you need 3+ files, re-classify upward.                                   |
| "I will skip the gap check, the explorers covered everything"   | The gap check catches tunnel vision — the most common auto-mode failure. Run it.                         |
| "The research is good enough without second-order implications" | First-order findings are fact reports. Second-order implications are what make research strategic.       |
| "I do not need to verify the critic's challenges"               | Invalid challenges must be explicitly rejected with reasoning. Silently ignoring them is not evaluation. |

## Conventions

- Research documents live in `documentation/research/` with date-prefixed filenames
- Status values: `Complete`, `Superseded` (if a newer research replaces it)
- Evidence citations use `file:line` format for code, URLs for web sources
- Findings are ordered by confidence (High first), then by relevance to the question
- The research skill is read-only — it never modifies source files, only produces documents
- For detailed per-classification protocols, read `SKILL-protocols.md` (sibling file)
