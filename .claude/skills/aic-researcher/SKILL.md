---
name: aic-researcher
description: Evidence-backed research via multi-agent protocols; writes documentation/research/ for standalone answers or task-planner input.
---

# Researcher

## Purpose

Produce evidence-backed research through multi-agent investigation: parallel exploration, adversarial review, and structured synthesis. The protocol compensates for individual model reasoning limits through structured parallelism — achieving depth and coverage that a single agent pass cannot.

The deliverable is a **research document** saved to `documentation/research/`. This document can be used standalone (answers a question) or as input to the `aic-task-planner` skill (informs task planning).

**Announce at start:** "Using the researcher skill."

## Editors

- **Cursor:** Attach the skill with `@` or invoke via `/`. Every "Spawn N agents" instruction means N calls to the **Task tool** with the specified `subagent_type` and `model`. You MUST use the Task tool — never do the work inline.
- **Claude Code:** Invoke with `/aic-researcher`. Every "Spawn N agents" instruction means N parallel subagent launches. You MUST spawn separate agents — never do the work inline.

## Cardinal Rules

**Violating the letter of these rules is violating the spirit.** Reframing, reinterpreting, or finding loopholes in these rules is not cleverness — it is the exact failure mode they exist to prevent.

### 1. Mandatory Subagent Dispatch

**You MUST use the Task tool to spawn subagents — NEVER perform investigation inline.** §3 = 2-4 Task tool calls. §5 = 1-2 Task tool calls. If the Task tool is unavailable, tell the user and stop. If you find yourself writing "Explorer N findings:" without a Task tool call, stop and spawn.

### 2. Evidence Over Claims

**Every finding must cite at least one concrete source.** A file path with line number, a URL, or a grep result. No exceptions. If you cannot cite a source, the finding does not exist — move it to Open Questions. This single rule prevents the most common subagent failure: plausible-sounding hallucination.

## Autonomous Execution

Run §1 through §6 as a single continuous flow. Do NOT pause between sections to report status, explain what you will do next, or ask for confirmation. Completing one section means immediately starting the next — not sending a message and waiting.

**This skill has NO mid-process user gates.** The entire pipeline — classify, frame, investigate, synthesize, adversarial review, final synthesis — runs without pausing. Present results only at §6e after the research document is saved.

**The ONLY conditions that stop execution:**

- The Task tool is unavailable (Cardinal Rule 1 — tell the user and stop)
- A blocked diagnostic that cannot be resolved by re-spawning

**Anti-pattern:** Do not pause between sections to report status.

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

## Phase Dispatch

After §1 classification, read and execute the appropriate phase files in order. Each phase file is a sibling of this file (same directory). Read each one just before executing it — do NOT skip ahead.

**Factual lookup (§1 classification):** No phase files needed — answer directly in chat. Done.

**All other classifications (codebase analysis, gap/improvement, technology evaluation, documentation analysis):**

1. Read `SKILL-phase-2-frame.md` → execute §2 framing + investigation plan
2. Read `SKILL-phase-3-investigate.md` → execute §3 parallel investigation
3. Read `SKILL-phase-4-synthesize.md` → execute §4 synthesis + §5 adversarial review (continuous)
4. Read `SKILL-phase-6-finalize.md` → execute §6 final synthesis + save document

**Skip §5 adversarial review:** Only for codebase analysis when ALL findings have High confidence and 2+ explorers converged. For all other classifications, §5 is mandatory (it's in the same phase file as §4 to enforce this).

**Reference:** Read `SKILL-protocols.md` for classification-specific protocols (referenced in §2d).

**CRITICAL:** You must NOT skip to §6 without completing §3-§4. The research document template is in `SKILL-phase-6-finalize.md` — you cannot access it until you have explorer findings and synthesis.

---

## Quality Gates (enforced before document is finalized)

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

## Critical Reminders

- Never skip subagent dispatch — always use the Task tool (Cardinal Rule 1). Minimum 2 explorers.
- Every finding requires a file:line or URL — no exceptions (Cardinal Rule 2).
- Never skip adversarial review because findings agree — agreement without challenge proves nothing.
- Agreeable critics (zero challenges) must be re-spawned with strengthened mandate.
- Never skip the gap check — it catches tunnel vision.
- Factual lookup = 1-2 files only. If 3+ files needed, re-classify upward.

**Rationalization traps — if you catch yourself thinking these, stop:**

| Rationalization                                                 | Why it is wrong                                                                                          |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| "I already know the answer from context"                        | You have anchoring bias. Subagents do not. Spawn them.                                                   |
| "The research is good enough without second-order implications" | First-order findings are fact reports. Second-order implications are what make research strategic.       |
| "I do not need to verify the critic's challenges"               | Invalid challenges must be explicitly rejected with reasoning. Silently ignoring them is not evaluation. |

## Conventions

- Research documents live in `documentation/research/` with date-prefixed filenames
- Status values: `Complete`, `Superseded` (if a newer research replaces it)
- Evidence citations use `file:line` format for code, URLs for web sources
- Findings are ordered by confidence (High first), then by relevance to the question
- The research skill is read-only — it never modifies source files, only produces documents
- For detailed per-classification protocols, read `SKILL-protocols.md` (sibling file)
