# Team Phase: Parallel Tracks + Synthesis

**Goal:** Launch Track A (codebase investigation) and Track B (adversarial challenge) simultaneously after §2 framing completes. Synthesize their outputs into the research document body.

This phase replaces §3 Investigate + §4 Synthesize + §5 Adversarial Review from the original.

## Pre-spawn setup

Before launching tracks, extract from the §2 framing output:

- Hypothesis list (3-5 hypotheses) — passed to both tracks
- Investigation scope (what to search) — passed to Track A only
- Classification type — determines whether Track B spawns a web researcher

Read `../aic-researcher/SKILL-protocols.md` for classification-specific protocols and extract the Track A explorer instructions for the current classification.

Read `../shared/SKILL-investigation.md` and extract the Runtime Evidence Checklist section — inject it verbatim into Track A's Explorer A1 prompt.

## Launch Track A and Track B simultaneously (MANDATORY)

Make 2 subagent calls in the same message.

### Track A — Investigation Track (`generalPurpose` subagent)

**Prompt to pass:**

You are the Investigation Track for a research task.

Classification: [CLASSIFICATION]
Question: [RESEARCH_QUESTION]
Hypotheses to investigate: [HYPOTHESIS_LIST]

[INJECT: Runtime Evidence Checklist from SKILL-investigation.md verbatim here]

**Step A1 — Launch Explorer A1 and Explorer A2 in parallel:**

Explorer A1 (Primary codebase analysis): Apply the classification-specific protocol from `../aic-researcher/SKILL-protocols.md` for classification [CLASSIFICATION]. Search the codebase systematically for evidence related to each hypothesis. Require minimum 1 file:line citation per finding. Return findings as a table: Hypothesis | Evidence (file:line) | Confidence (High/Medium/Low) | Summary.

Explorer A2 (Complementary angle): Focus on what Explorer A1 is least likely to cover: edge cases, error paths, alternative implementations, recent changes (`git log --oneline -20`). Require minimum 1 file:line citation per finding. Return in same table format as A1.

**Step A2 — After both explorers return, merge findings:**

- Deduplicate convergent findings (same finding from 2 explorers → upgrade confidence to High)
- Flag contradictions between explorers with a CONTRADICTION label
- Apply citation floor: findings without at least 1 file:line citation → move to Open Questions with reason "unverified"

**Output:** Merged findings table with confidence ratings, citations, and a list of any contradictions or Open Questions identified during merging.

---

### Track B — Adversarial Track (`generalPurpose` subagent)

**CRITICAL:** Track B receives ONLY the framing hypotheses — NOT Track A's findings. Do not pass Track A's output to this subagent.

**Prompt to pass:**

You are the Adversarial Track for a research task. Your job is to attack the research framing hypotheses before any investigation results come in. You do not have access to Track A's findings — this is intentional.

Classification: [CLASSIFICATION]
Question: [RESEARCH_QUESTION]
Hypotheses to challenge: [HYPOTHESIS_LIST]

For each hypothesis, perform all four checks:

1. Disconfirming evidence: search the codebase (or web for technology-evaluation classification) for the strongest evidence AGAINST the hypothesis. Cite file:line or URL.
2. Tunnel-vision risk: what are the 2 most likely areas Track A's codebase explorers will miss given this framing? Name the specific directories or concepts.
3. Counter-hypothesis: propose one alternative explanation for the same evidence the hypothesis predicts.
4. For technology-evaluation classification only: spawn 1 web researcher to find external evidence challenging the framing (use WebSearch and WebFetch; require minimum 1 URL per finding).

**Output:** Challenge report with 4 sections per hypothesis (Disconfirming evidence, Tunnel-vision risks, Counter-hypothesis, External evidence). Every claim must have a file:line or URL citation.

---

## Collect track outputs

After Track A and Track B return:

For each Track B tunnel-vision risk: scan Track A's findings — did Track A find evidence in the named area? If not, note as an unaddressed blind spot in the synthesis.

For each Track B counter-hypothesis: scan Track A's findings for evidence that confirms or refutes it. If Track A has no relevant evidence: add the counter-hypothesis to Open Questions.

## Synthesis (§4-§5 combined)

The orchestrator synthesizes across both track outputs. No additional subagents needed.

Structure the research document body using four categories:

**1. Confirmed findings:** Track A evidence + Track B raised no challenge against this finding (or the challenge was refuted by Track A evidence). Confidence from Track A applies.

**2. Contested findings:** Track A has evidence + Track B raised a valid challenge that Track A's evidence does not directly refute. Label each as CONTESTED. Downgrade confidence by one level (High → Medium, Medium → Low). Include both the finding and the challenge in the document.

**3. Track B unique insights:** counter-hypotheses and blind-spot warnings from Track B that Track A did not directly address. Include as observations, not conclusions. Confidence: Low unless the challenge itself has strong citations.

**4. Open Questions:** unaddressed blind spots (Track B identified; neither track resolved) + Track A findings without citations + Track B challenges without citations.

Apply quality gates before finalizing:

- Every finding in categories 1-3: at least 1 citation
- CONTESTED findings explicitly labeled with both sides
- Open Questions section non-empty for non-factual-lookup questions
- No more than 60% of findings in categories 1-3 rated High confidence
- If Track B found zero disconfirming evidence across all hypotheses: note as "Track B found no disconfirmation — all hypotheses unchallenged; treat High-confidence findings with caution"

---

Phase complete. Read `../aic-researcher/SKILL-phase-6-finalize.md` and execute it immediately.
