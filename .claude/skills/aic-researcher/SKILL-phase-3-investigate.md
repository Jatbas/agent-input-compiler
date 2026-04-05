# Phase 3: Investigate

## §3. Investigate (Parallel Subagents)

**Goal:** Execute the investigation plan from §2 using parallel subagents. Each explorer investigates its assigned area independently.

### 3a. Spawn explorers (MANDATORY — Cardinal Rule 1)

**You MUST make 2-4 Task tool calls here.** Do NOT perform the investigation yourself. Spawn 2-4 `explore` or `generalPurpose` subagents in parallel (use `fast` model). Each explorer's prompt must include:

1. **Role:** "You are an investigator. Your job is to gather evidence about [specific area]. Report only what you find with citations — never speculate."
2. **Target:** The specific hypothesis, dimension, or area to investigate
3. **Search strategy:** What files to read, what patterns to grep, what to look for
4. **Evidence format:** Return findings as a structured table — not free-form prose. Each finding must be a row with columns: Finding title | Evidence (file:line or URL) | Confidence: High (multiple independent evidence) / Medium (single clear evidence) / Low (inferred or absence-based) | Surprise (yes/no + what — surprises catch faulty assumptions). This forced format ensures programmatic validation by the parent agent.
5. **Disconfirmation mandate:** "Actively look for evidence AGAINST the hypothesis, not just evidence for it. Report disconfirming evidence with the same rigor."
6. **Escalation:** "It is always OK to stop and say 'this is too complex for my assigned scope.' Bad work with fabricated evidence is worse than partial work with honest gaps. Report what you found and what you could not determine. You will not be penalized for incomplete coverage — you will be penalized for fabricated evidence."

For technology evaluation: one explorer uses `WebSearch` and `WebFetch` for external research (official docs, benchmarks, comparisons). The prompt must specify: "Use official documentation and primary sources. Avoid forum posts and blog articles unless no better source exists."

**Runtime evidence mandate:** When the research question involves runtime behavior (hooks, database contents, deployed files, external system payloads, bootstrap flows), at least one explorer must be a `shell` subagent (or `generalPurpose` with shell access) tasked with gathering actual runtime evidence. Read `../shared/SKILL-investigation.md` and include the **Runtime Evidence Checklist** in this explorer's prompt. This explorer's findings take precedence over documentation-based findings when they conflict.

**Codebase investigation depth:** When the investigation touches the AIC codebase (classifications: codebase analysis, gap/improvement analysis, documentation analysis with code cross-checks), explorer prompts MUST include the **Codebase Investigation Depth** requirements from `../shared/SKILL-investigation.md`. These are read-only — explorers read, query, and trace, but never modify files. These depth requirements do NOT activate for technology evaluations that only involve external technologies (no AIC codebase code).

**Framing challenger (concurrent with explorers):** Spawn one additional `fast` subagent in the same parallel batch as the explorers. This agent receives ONLY the §2 hypotheses — not the investigation plan, explorer assignments, or any findings. Its prompt:

> "You are a framing challenger. You received hypotheses that an investigation team will explore. Your job is NOT to investigate — it is to attack the framing itself. For each hypothesis: (1) identify the unstated assumption, (2) propose a counter-hypothesis that could be true, (3) name a blind spot — what would the investigators miss if they only tested the stated hypothesis? Return a structured table: Hypothesis | Unstated assumption | Counter-hypothesis | Blind spot."

The framing challenger's output is NOT merged into explorer findings. It is passed to the §5 critic as additional input — the critic uses it to verify whether the synthesis addressed or ignored the challenger's counter-hypotheses and blind spots.

### 3b. Collect explorer results

**Handoff accounting (before processing).** Enumerate each explorer's output before analyzing content using this template:

- "Explorer 1: [N] findings, [M] with citations, confidence: [H/M/L counts]. Format: [table/prose/mixed]."
- "Explorer 2: [N] findings, [M] with citations, confidence: [H/M/L counts]. Format: [table/prose/mixed]."
- "Framing challenger: [N] counter-hypotheses, [M] blind spots." (if spawned)
- "Cross-agent overlap: [N] findings appear in 2+ explorers."

If any explorer returned 0 findings, investigate whether the explorer ran correctly before proceeding.

Read each explorer's output. For each finding:

- Verify the citation format (must have file:line or URL)
- Note which explorer produced it
- Flag any finding with no evidence citation — these are candidates for removal

**Post-spawn validation.** For each explorer output, check: (1) findings use the required structured table format, (2) at least 1 citation per finding (citation floor), (3) output addresses the assigned hypothesis/dimension, not a different one. If any explorer fails 2+ of these checks, re-spawn it once with a more specific prompt. Maximum 1 re-spawn per explorer.

**Convergence detection.** After collecting, check whether all explorers returned suspiciously similar top findings — each explorer's top findings overlap significantly with the others, with no unique perspectives. This suggests explorers searched the same obvious areas rather than their assigned targets. If detected, re-spawn the weakest explorer with a narrower scope. Maximum 1 convergence re-spawn.

---

Phase complete. Read `SKILL-phase-4-synthesize.md` and execute it immediately.
