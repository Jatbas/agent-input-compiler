# Phase 4: Synthesize + Adversarial Review

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

Write the draft research document using the template (see Research Document Template in `SKILL-phase-6-finalize.md`). At this stage:

- Include ALL findings (even low-confidence ones — the critic will help trim)
- Note convergence and contradictions in the Analysis section
- After drafting the Analysis section, verify it connects findings to each other. If each finding is discussed independently without cross-references, re-draft with an explicit relation-mapping pass: for each finding, write one sentence about how it relates to at least one other finding.
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

**Goal:** A fresh agent with zero prior commitment challenges the draft findings.

**When to skip:** For codebase analysis only — if ALL findings in §4 have High confidence and at least 2 explorers converged on each finding, the adversarial review can be skipped. For all other classifications (gap/improvement, technology evaluation, documentation analysis), adversarial review is MANDATORY.

### 5a. Spawn the critic (MANDATORY — Cardinal Rule 1)

**You MUST make a Task tool call here — never critique your own synthesis.** Spawn a `generalPurpose` subagent with `fast` model. The critic's prompt must include:

1. **Role:** "You are an independent critic. You have NO prior context about this investigation. Your only job is to find flaws, challenge assumptions, and propose alternatives. You are not helpful — you are adversarial. The investigators may have been shallow or optimistic. Verify independently — read the actual code/files, do not accept their claims at face value."
2. **Input:** The original question + the draft synthesis (from §4c) + the evidence citations
3. **NOT included:** The hypotheses, the investigation plan, or the explorer prompts. The critic must not be anchored by the investigation's framing.
4. **Tasks:**
   - For each finding: attempt to disprove it. Search the codebase for counter-evidence. If you cannot disprove it, **state exactly what you searched for** (grep patterns, files read, directories checked) and why disproof was not possible. A finding marked "Unchallenged" without a search log will be treated as unevaluated.
   - Re-read every cited source (file:line) to verify the explorer's characterization is accurate. Flag any citation where the source says something different from what the finding claims.
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

Phase complete. Read `SKILL-phase-6-finalize.md` and execute it immediately.
